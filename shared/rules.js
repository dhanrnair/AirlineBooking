// Rules used by BOTH the browser and the server so they always agree.
// Keep this file free of Node-only and browser-only APIs.
export const formatPrice = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export const roundMoney = (n) => Math.round(n * 100) / 100;

// Aircraft layout: rows 1..SEAT_ROWS, seats A-F, first BUSINESS_ROWS rows are Business.
export const MAX_PASSENGERS = 6;
export const SEAT_ROWS = 20;
export const SEAT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const BUSINESS_ROWS = 3;
export const SEAT_CAPACITY = SEAT_ROWS * SEAT_LETTERS.length;
const BUSINESS_MULTIPLIER = 2.5;

export function isValidSeat(seat) {
  const m = /^(\d{1,2})([A-F])$/.exec(seat ?? '');
  return !!m && Number(m[1]) >= 1 && Number(m[1]) <= SEAT_ROWS;
}

export const seatClass = (seat) => (parseInt(seat, 10) <= BUSINESS_ROWS ? 'Business' : 'Economy');

// Price of one seat given the flight's base (economy) fare.
export const seatPrice = (basePrice, seat) =>
  roundMoney(seatClass(seat) === 'Business' ? basePrice * BUSINESS_MULTIPLIER : basePrice);

// Returns { field: 'message' } for every invalid field; {} when valid.
export function validateContact(c = {}) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const e = {};
  if (!str(c.name)) e.name = 'Name is required';
  if (!/^\S+@\S+\.\S+$/.test(str(c.email))) e.email = 'Enter a valid email';
  return e;
}

// booking = { contact: {name, email}, seats: [{ seat, passengerName }] }
// Field keys: name, email, seats (general), passenger0, passenger1, ...
export function validateBooking(b = {}) {
  const e = validateContact(b.contact);
  const seats = b.seats;
  if (!Array.isArray(seats) || seats.length === 0) {
    e.seats = 'Select at least one seat';
    return e;
  }
  if (seats.length > MAX_PASSENGERS) e.seats = `You can book at most ${MAX_PASSENGERS} seats at a time`;
  const seen = new Set();
  seats.forEach((s, i) => {
    if (!isValidSeat(s?.seat)) e.seats = `Invalid seat "${s?.seat}"`;
    else if (seen.has(s.seat)) e.seats = `Seat ${s.seat} was selected twice`;
    seen.add(s?.seat);
    if (typeof s?.passengerName !== 'string' || !s.passengerName.trim()) {
      e[`passenger${i}`] = 'Passenger name is required';
    }
  });
  return e;
}
