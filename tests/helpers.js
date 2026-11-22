import { randomUUID } from 'node:crypto';
import { test as base } from '@playwright/test';

export const BASE_URL = 'http://localhost:3100'; // keep in sync with playwright.config.js
export const PASSWORD = 'Test-pass-123';
export const uniqueEmail = () => `qa-${randomUUID().slice(0, 8)}@example.test`;
export const contact = (email = uniqueEmail()) => ({ name: 'QA Tester', email });

// Better Auth rate-limits sign-up/sign-in (about 3 per 10s) in production mode, so wait and retry on 429.
// Sign up through the API; the request context keeps the session cookie.
export async function signUp(request, email = uniqueEmail(), name = 'QA Tester') {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request.post('/api/auth/sign-up/email', { data: { name, email, password: PASSWORD } });
    if (res.ok()) return email;
    if (res.status() !== 429) throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
    const wait = Number(res.headers()['x-retry-after']) || 10;
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
  }
  throw new Error('sign-up still rate-limited after retries');
}

// `authed`: one signed-in API context (with .email) shared by every test in the run.
export const test = base.extend({
  authed: [async ({ playwright }, use) => {
    // Worker fixtures can't use the test-scoped baseURL fixture, so use the shared constant.
    const ctx = await playwright.request.newContext({ baseURL: BASE_URL });
    ctx.email = await signUp(ctx);
    await use(ctx);
    await ctx.dispose();
  }, { scope: 'worker' }],
});

const isoDate = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// First upcoming flight on a route (dates are generated relative to today, so never hardcode them).
export async function findFlight(request, from = 'JFK', to = 'LAX') {
  for (let d = 2; d <= 10; d++) {
    const res = await request.get(`/api/flights?from=${from}&to=${to}&date=${isoDate(d)}`);
    const flights = await res.json();
    if (flights.length) return flights[0];
  }
  throw new Error(`No upcoming ${from}-${to} flight found; run npm run db:setup`);
}

export const getFlight = async (request, id) => (await request.get(`/api/flights/${id}`)).json();

// n free seats, taken from the back of the cabin (Economy). `business: true` takes rows 1-3 instead.
export async function freeSeats(request, flightId, n = 1, { business = false } = {}) {
  const { takenSeats } = await getFlight(request, flightId);
  const rows = business ? [1, 2, 3] : Array.from({ length: 17 }, (_, i) => 20 - i);
  const all = rows.flatMap((r) => ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => `${r}${l}`));
  const free = all.filter((s) => !takenSeats.includes(s));
  if (free.length < n) throw new Error('Not enough free seats for this test');
  return free.slice(0, n);
}

export const passengers = (seats) => seats.map((seat, i) => ({ seat, passengerName: `Passenger ${i + 1}` }));

export async function book(request, flightId, seats, email) {
  return request.post('/api/bookings', { data: { flightId, seats: passengers(seats), contact: contact(email) } });
}

export const cancel = (request, code) => request.post('/api/my/bookings/cancel', { data: { code } });
