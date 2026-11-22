import { expect } from '@playwright/test';
import {
  book, cancel, contact, findFlight, freeSeats, getFlight, passengers, signUp, test, uniqueEmail,
} from '../helpers.js';

test.describe('public endpoints', () => {
  test('health', async ({ request }) => {
    expect(await (await request.get('/api/health')).json()).toEqual({ ok: true });
  });

  test('airports', async ({ request }) => {
    const list = await (await request.get('/api/airports')).json();
    expect(list.length).toBeGreaterThan(1);
    expect(list[0]).toMatchObject({ code: expect.stringMatching(/^[A-Z]{3}$/), city: expect.any(String), timezone: expect.any(String) });
  });

  test('flight search returns priced flights for a route', async ({ request }) => {
    const f = await findFlight(request);
    expect(f).toMatchObject({ origin: 'JFK', destination: 'LAX', basePrice: expect.any(Number), seatsLeft: expect.any(Number) });
    expect(f.seatsLeft).toBeLessThanOrEqual(120);
  });

  test('flight detail lists taken seats', async ({ request }) => {
    const f = await findFlight(request);
    const detail = await getFlight(request, f.id);
    expect(detail.id).toBe(f.id);
    expect(Array.isArray(detail.takenSeats)).toBe(true);
  });

  test('unknown flight and unknown route are 404', async ({ request }) => {
    expect((await request.get('/api/flights/NOPE-2000-01-01')).status()).toBe(404);
    expect((await request.get('/api/nope')).status()).toBe(404);
  });

  test('search validation', async ({ request }) => {
    const bad = [
      '/api/flights?from=JFK&to=LAX', // no date
      '/api/flights?from=JFK&to=JFK&date=2030-01-01', // same airport
      '/api/flights?from=jfkk&to=LAX&date=2030-01-01', // bad code
      '/api/flights?from=JFK&to=LAX&date=not-a-date',
      '/api/flights?from=JFK&to=LAX&date=2030-13-45',
    ];
    for (const url of bad) expect((await request.get(url)).status(), url).toBe(400);
  });

  test('a day with no flights returns an empty list', async ({ request }) => {
    const res = await request.get('/api/flights?from=JFK&to=LAX&date=2000-01-01');
    expect(await res.json()).toEqual([]);
  });

  test('malformed JSON is a 400, not a 500', async ({ request }) => {
    const res = await request.post('/api/bookings/lookup', { headers: { 'content-type': 'application/json' }, data: '{bad' });
    expect(res.status()).toBe(400);
  });
});

test.describe('auth is required', () => {
  test('guest cannot book, list or cancel', async ({ request }) => {
    const f = await findFlight(request);
    const [seat] = await freeSeats(request, f.id);
    expect((await book(request, f.id, [seat])).status()).toBe(401);
    expect((await request.get('/api/my/bookings')).status()).toBe(401);
    expect((await cancel(request, 'BK-00000000')).status()).toBe(401);
  });
});

test.describe('booking', () => {
  test('server prices seats: Economy at base fare, Business at 2.5x', async ({ authed }) => {
    const f = await findFlight(authed);
    const [eco] = await freeSeats(authed, f.id);
    const [biz] = await freeSeats(authed, f.id, 1, { business: true });
    const res = await book(authed, f.id, [eco, biz]);
    expect(res.status()).toBe(201);
    const b = await res.json();
    expect(b.code).toMatch(/^BK-[0-9A-F]{8}$/);
    expect(b.status).toBe('confirmed');
    const price = Object.fromEntries(b.passengers.map((p) => [p.seat, p.price]));
    expect(price[eco]).toBe(f.basePrice);
    expect(price[biz]).toBeCloseTo(f.basePrice * 2.5, 2);
    expect(b.total).toBeCloseTo(f.basePrice * 3.5, 2);
    await cancel(authed, b.code);
  });

  test('client-supplied prices are ignored', async ({ authed }) => {
    const f = await findFlight(authed);
    const [seat] = await freeSeats(authed, f.id);
    const res = await authed.post('/api/bookings', {
      data: { flightId: f.id, total: 0.01, seats: [{ seat, passengerName: 'P', price: 0.01 }], contact: contact() },
    });
    const b = await res.json();
    expect(b.total).toBe(f.basePrice);
    await cancel(authed, b.code);
  });

  test('booking takes the seats and cancelling frees them', async ({ authed }) => {
    const f = await findFlight(authed);
    const seats = await freeSeats(authed, f.id, 2);
    const before = (await getFlight(authed, f.id)).seatsLeft;
    const b = await (await book(authed, f.id, seats)).json();
    const during = await getFlight(authed, f.id);
    expect(during.seatsLeft).toBe(before - 2);
    for (const s of seats) expect(during.takenSeats).toContain(s);

    const done = await cancel(authed, b.code);
    expect(done.ok()).toBe(true);
    expect((await done.json()).status).toBe('cancelled');
    const after = await getFlight(authed, f.id);
    expect(after.seatsLeft).toBe(before);
    for (const s of seats) expect(after.takenSeats).not.toContain(s);
  });

  test('a taken seat cannot be double-booked (409) and nothing is created', async ({ authed }) => {
    const f = await findFlight(authed);
    const [seat] = await freeSeats(authed, f.id);
    const first = await (await book(authed, f.id, [seat])).json();
    const [other] = (await freeSeats(authed, f.id, 2)).filter((s) => s !== seat);
    const clash = await book(authed, f.id, [other, seat]);
    expect(clash.status()).toBe(409);
    expect((await clash.json()).error).toMatch(new RegExp(seat));
    expect((await getFlight(authed, f.id)).takenSeats).not.toContain(other); // transaction rolled back
    await cancel(authed, first.code);
  });

  test('a cancelled seat can be booked again', async ({ authed }) => {
    const f = await findFlight(authed);
    const [seat] = await freeSeats(authed, f.id);
    const a = await (await book(authed, f.id, [seat])).json();
    await cancel(authed, a.code);
    const again = await book(authed, f.id, [seat]);
    expect(again.status()).toBe(201);
    await cancel(authed, (await again.json()).code);
  });

  test('cancelling twice is a 409', async ({ authed }) => {
    const f = await findFlight(authed);
    const [seat] = await freeSeats(authed, f.id);
    const b = await (await book(authed, f.id, [seat])).json();
    expect((await cancel(authed, b.code)).ok()).toBe(true);
    expect((await cancel(authed, b.code)).status()).toBe(409);
  });

  test('my/bookings contains my booking', async ({ authed }) => {
    const f = await findFlight(authed);
    const [seat] = await freeSeats(authed, f.id);
    const b = await (await book(authed, f.id, [seat])).json();
    const mine = await (await authed.get('/api/my/bookings')).json();
    expect(mine.map((x) => x.code)).toContain(b.code);
    await cancel(authed, b.code);
  });

  test('booking an unknown flight is 404', async ({ authed }) => {
    const res = await book(authed, 'NOPE-2000-01-01', ['20A']);
    expect(res.status()).toBe(404);
  });
});

test.describe('booking validation', () => {
  test('no seats', async ({ authed }) => {
    const f = await findFlight(authed);
    const res = await authed.post('/api/bookings', { data: { flightId: f.id, seats: [], contact: contact() } });
    expect(res.status()).toBe(400);
    expect((await res.json()).fields.seats).toBeTruthy();
  });

  test('missing flight id', async ({ authed }) => {
    const res = await authed.post('/api/bookings', { data: { seats: passengers(['20A']), contact: contact() } });
    expect(res.status()).toBe(400);
  });

  test('more than 6 seats', async ({ authed }) => {
    const f = await findFlight(authed);
    const seats = await freeSeats(authed, f.id, 7);
    const res = await book(authed, f.id, seats);
    expect(res.status()).toBe(400);
    expect((await res.json()).fields.seats).toMatch(/at most 6/);
  });

  test('exactly 6 seats is allowed', async ({ authed }) => {
    const f = await findFlight(authed);
    const seats = await freeSeats(authed, f.id, 6);
    const res = await book(authed, f.id, seats);
    expect(res.status()).toBe(201);
    await cancel(authed, (await res.json()).code);
  });

  for (const seat of ['0A', '21A', '1G', 'A1', '']) {
    test(`invalid seat ${JSON.stringify(seat)}`, async ({ authed }) => {
      const f = await findFlight(authed);
      const res = await book(authed, f.id, [seat]);
      expect(res.status()).toBe(400);
    });
  }

  test('duplicate seat in one request', async ({ authed }) => {
    const f = await findFlight(authed);
    const [seat] = await freeSeats(authed, f.id);
    const res = await book(authed, f.id, [seat, seat]);
    expect(res.status()).toBe(400);
    expect((await res.json()).fields.seats).toMatch(/twice/);
  });

  test('field errors for passenger and contact', async ({ authed }) => {
    const f = await findFlight(authed);
    const [seat] = await freeSeats(authed, f.id);
    const res = await authed.post('/api/bookings', {
      data: { flightId: f.id, seats: [{ seat, passengerName: ' ' }], contact: { name: '', email: 'bad' } },
    });
    expect(res.status()).toBe(400);
    expect(Object.keys((await res.json()).fields).sort()).toEqual(['email', 'name', 'passenger0']);
    expect((await getFlight(authed, f.id)).takenSeats).not.toContain(seat);
  });
});

test.describe('ownership and lookup', () => {
  test('another user gets the same 404 as an unknown code and cannot cancel', async ({ authed, playwright, baseURL }) => {
    const other = await playwright.request.newContext({ baseURL });
    await signUp(other);
    const f = await findFlight(authed);
    const [seat] = await freeSeats(authed, f.id);
    const b = await (await book(authed, f.id, [seat])).json();

    const wrong = await cancel(other, b.code);
    const unknown = await cancel(other, 'BK-00000000');
    expect(wrong.status()).toBe(404);
    expect(wrong.status()).toBe(unknown.status());
    expect(await wrong.json()).toEqual(await unknown.json());
    expect((await (await other.get('/api/my/bookings')).json()).map((x) => x.code)).not.toContain(b.code);
    expect((await getFlight(authed, f.id)).takenSeats).toContain(seat); // still booked

    expect((await cancel(authed, b.code)).ok()).toBe(true);
    await other.dispose();
  });

  test('lookup needs code and matching email; code is case-insensitive, email is normalised', async ({ authed }) => {
    const email = `Mixed.${uniqueEmail()}`;
    const f = await findFlight(authed);
    const [seat] = await freeSeats(authed, f.id);
    const b = await (await book(authed, f.id, [seat], email)).json();

    const hit = await authed.post('/api/bookings/lookup', { data: { code: b.code.toLowerCase(), email: email.toUpperCase() } });
    expect(hit.ok()).toBe(true);
    expect((await hit.json()).code).toBe(b.code);

    const miss = await authed.post('/api/bookings/lookup', { data: { code: b.code, email: uniqueEmail() } });
    const unknown = await authed.post('/api/bookings/lookup', { data: { code: 'BK-00000000', email } });
    expect(miss.status()).toBe(404);
    expect(await miss.json()).toEqual(await unknown.json()); // no enumeration
    expect((await authed.post('/api/bookings/lookup', { data: { code: '', email: '' } })).status()).toBe(400);
    await cancel(authed, b.code);
  });

  test('lookup is public (works for guests)', async ({ authed, playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL });
    const f = await findFlight(authed);
    const [seat] = await freeSeats(authed, f.id);
    const b = await (await book(authed, f.id, [seat], authed.email)).json();
    expect((await guest.post('/api/bookings/lookup', { data: { code: b.code, email: authed.email } })).ok()).toBe(true);
    await cancel(authed, b.code);
    await guest.dispose();
  });
});
