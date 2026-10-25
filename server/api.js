import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';
import { validateBooking } from '../shared/rules.js';
import {
  NOT_FOUND, cancelBooking, createBooking, findBooking,
  getFlight, listAirports, listUserBookings, ping, searchFlights,
} from './repo.js';

const router = express.Router();
router.use(express.json());

const bad = (message, fields) => Object.assign(new Error(message), { status: 400, fields });
const str = (v) => (typeof v === 'string' ? v.trim() : '');

const getSession = (req) => auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

async function requireUser(req) {
  const session = await getSession(req);
  if (!session) throw Object.assign(new Error('Please sign in'), { status: 401 });
  return session.user;
}

// Express 5 forwards rejected async handlers to the error handler below: no try/catch needed.
router.get('/health', async (req, res) => {
  await ping();
  res.json({ ok: true });
});

router.get('/airports', async (req, res) => {
  res.json(await listAirports());
});

router.get('/flights', async (req, res) => {
  const from = str(req.query.from).toUpperCase();
  const to = str(req.query.to).toUpperCase();
  const date = str(req.query.date);
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw bad('Choose an origin and a destination');
  if (from === to) throw bad('Origin and destination must be different');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw bad('Choose a valid date');
  res.json(await searchFlights({ from, to, date }));
});

router.get('/flights/:id', async (req, res) => {
  const flight = await getFlight(req.params.id);
  if (!flight) return res.status(404).json({ error: 'Flight not found' });
  res.json(flight);
});

// Every transaction (book, cancel) requires a signed-in user; read-only search stays public.
router.post('/bookings', async (req, res) => {
  const user = await requireUser(req);
  const { flightId, seats, contact } = req.body ?? {};
  if (!str(flightId)) throw bad('Flight is required');
  const fields = validateBooking({ seats, contact });
  if (Object.keys(fields).length) throw bad('Please fix the highlighted fields', fields);
  // Only ids, seat labels and names are taken from the client: prices are computed in the repo.
  const clean = seats.map((s) => ({ seat: s.seat, passengerName: s.passengerName }));
  res.status(201).json(await createBooking({ flightId: str(flightId), seats: clean, contact, userId: user.id }));
});

// POST (not GET) so the email never appears in URLs or logs.
router.post('/bookings/lookup', async (req, res) => {
  const code = str(req.body?.code).toUpperCase();
  const email = str(req.body?.email);
  if (!code || !email) throw bad('Enter your confirmation code and email');
  const booking = await findBooking(code, email);
  if (!booking) return res.status(404).json({ error: NOT_FOUND });
  res.json(booking);
});

// Signed-in users see only their own bookings (user id comes from the session, never the client).
router.get('/my/bookings', async (req, res) => {
  const user = await requireUser(req);
  res.json(await listUserBookings(user.id));
});

router.post('/my/bookings/cancel', async (req, res) => {
  const user = await requireUser(req);
  const code = str(req.body?.code).toUpperCase();
  if (!code) throw bad('Booking code is required');
  res.json(await cancelBooking(code, user.id));
});

router.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Errors with a .status are intentional and their message is shown to users.
// Anything else is logged and returned as a generic 500 (never leak internals).
router.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (!err.status) console.error(err);
  const body = { error: err.status ? err.message : 'Something went wrong' };
  if (err.status && err.fields) body.fields = err.fields;
  res.status(err.status || 500).json(body);
});

export default router;
