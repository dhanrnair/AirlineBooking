// All database queries live here. Cast numeric/decimal columns with ::float8
// so they arrive in JavaScript as numbers, not strings.
import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from './db.js';
import { SEAT_CAPACITY, roundMoney, seatPrice } from '../shared/rules.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

export async function ping() {
  await pool.query('SELECT 1');
}

export async function listAirports() {
  const { rows } = await pool.query('SELECT code, city, name, timezone FROM airports ORDER BY position, code');
  return rows;
}

const FLIGHT_SELECT = `
  SELECT f.id, f.flight_no AS "flightNo", f.origin, f.destination,
         f.departs_at AS "departsAt", f.arrives_at AS "arrivesAt", f.base_price::float8 AS "basePrice",
         o.city AS "originCity", o.timezone AS "originTz",
         d.city AS "destinationCity", d.timezone AS "destinationTz",
         ($1::int - (SELECT count(*) FROM passengers p WHERE p.flight_id = f.id AND p.status = 'confirmed'))::int AS "seatsLeft"
  FROM flights f
  JOIN airports o ON o.code = f.origin
  JOIN airports d ON d.code = f.destination`;

// date is the calendar day in the ORIGIN airport's timezone. Departed flights are hidden.
export async function searchFlights({ from, to, date }) {
  const { rows } = await pool.query(
    `${FLIGHT_SELECT}
     WHERE f.origin = $2 AND f.destination = $3
       AND (f.departs_at AT TIME ZONE o.timezone)::date = $4::date
       AND f.departs_at > now()
     ORDER BY f.departs_at`,
    [SEAT_CAPACITY, from, to, date]
  );
  return rows;
}

export async function getFlight(id) {
  const { rows } = await pool.query(`${FLIGHT_SELECT} WHERE f.id = $2`, [SEAT_CAPACITY, id]);
  if (!rows[0]) return null;
  const taken = await pool.query(
    "SELECT seat FROM passengers WHERE flight_id = $1 AND status = 'confirmed' ORDER BY seat",
    [id]
  );
  return { ...rows[0], takenSeats: taken.rows.map((r) => r.seat) };
}

async function loadBooking(db, code) {
  const { rows } = await db.query(
    `SELECT b.id AS code, b.status, b.contact_name AS "contactName", b.email, b.total::float8 AS total,
            b.created_at AS "createdAt", f.id AS "flightId", f.flight_no AS "flightNo",
            f.origin, f.destination, f.departs_at AS "departsAt", f.arrives_at AS "arrivesAt",
            o.city AS "originCity", o.timezone AS "originTz",
            d.city AS "destinationCity", d.timezone AS "destinationTz"
     FROM bookings b
     JOIN flights f ON f.id = b.flight_id
     JOIN airports o ON o.code = f.origin
     JOIN airports d ON d.code = f.destination
     WHERE b.id = $1`,
    [code]
  );
  if (!rows[0]) return null;
  const { rows: passengers } = await db.query(
    'SELECT seat, name, price::float8 AS price, status FROM passengers WHERE booking_id = $1 ORDER BY id',
    [code]
  );
  return { ...rows[0], passengers };
}

// seats: [{ seat, passengerName }] (already validated). Prices come from the DB, never the client.
export async function createBooking({ flightId, seats, contact, userId }) {
  return withTransaction(async (db) => {
    // Lock the flight row: bookings for one flight are serialised, so the seat check below is race-free.
    // The partial unique index on passengers is the backstop.
    const { rows } = await db.query(
      'SELECT base_price::float8 AS "basePrice", departs_at > now() AS upcoming FROM flights WHERE id = $1 FOR UPDATE',
      [flightId]
    );
    const flight = rows[0];
    if (!flight) throw httpError(404, 'Flight not found');
    if (!flight.upcoming) throw httpError(400, 'This flight has already departed');

    const wanted = seats.map((s) => s.seat);
    const { rows: taken } = await db.query(
      "SELECT seat FROM passengers WHERE flight_id = $1 AND seat = ANY($2) AND status = 'confirmed' ORDER BY seat",
      [flightId, wanted]
    );
    if (taken.length) {
      throw httpError(409, `Seat ${taken.map((t) => t.seat).join(', ')} was just taken. Please choose another.`);
    }

    const lines = seats.map((s) => ({ ...s, price: seatPrice(flight.basePrice, s.seat) }));
    const total = roundMoney(lines.reduce((sum, l) => sum + l.price, 0));
    const code = 'BK-' + randomUUID().slice(0, 8).toUpperCase();

    await db.query(
      'INSERT INTO bookings (id, flight_id, contact_name, email, total, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [code, flightId, contact.name.trim(), contact.email.trim().toLowerCase(), total, userId]
    );
    try {
      for (const l of lines) {
        await db.query(
          'INSERT INTO passengers (booking_id, flight_id, seat, name, price) VALUES ($1, $2, $3, $4, $5)',
          [code, flightId, l.seat, l.passengerName.trim(), l.price]
        );
      }
    } catch (err) {
      if (err.code === '23505') throw httpError(409, 'A seat was just taken. Please choose another.');
      throw err;
    }
    return loadBooking(db, code);
  });
}

const NOT_FOUND = 'No booking found for that confirmation code and email';

// Returns null when the code does not exist OR the email does not match (same answer, no enumeration).
export async function findBooking(code, email) {
  const booking = await loadBooking(pool, code);
  if (!booking || booking.email !== email.trim().toLowerCase()) return null;
  return booking;
}

// Only the account that made the booking can cancel it (wrong owner = same 404 as unknown code).
export async function cancelBooking(code, userId) {
  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT b.status, f.departs_at > now() AS upcoming
       FROM bookings b JOIN flights f ON f.id = b.flight_id
       WHERE b.id = $1 AND b.user_id = $2 FOR UPDATE OF b`,
      [code, userId]
    );
    if (!rows[0]) throw httpError(404, NOT_FOUND);
    if (rows[0].status === 'cancelled') throw httpError(409, 'This booking is already cancelled');
    if (!rows[0].upcoming) throw httpError(400, 'This flight has already departed and cannot be cancelled');
    await db.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [code]);
    await db.query("UPDATE passengers SET status = 'cancelled' WHERE booking_id = $1", [code]);
    return loadBooking(db, code);
  });
}

// Bookings of a signed-in user, soonest flight first. Only ever called with the session's own user id.
export async function listUserBookings(userId) {
  const { rows } = await pool.query('SELECT id FROM bookings WHERE user_id = $1', [userId]);
  const bookings = await Promise.all(rows.map((r) => loadBooking(pool, r.id)));
  return bookings.sort((a, b) => new Date(a.departsAt) - new Date(b.departsAt));
}

export { NOT_FOUND };
