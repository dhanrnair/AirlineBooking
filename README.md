# Skyline Air: Airline Booking Portal

Demo airline site: search flights, pick seats on a seat map, book with a confirmation code, look up a booking, and manage your bookings once signed in. Booking and cancelling require an account.
React 18 + Vite, Express 5, Neon Postgres, **one Node process on one port**. No real payments.

## Run

```bash
cp .env.example .env     # then set DATABASE_URL (Neon console → Connect)
npm install
npm run db:setup         # tables + airports + 60 days of flights; safe to repeat
npm run dev              # http://localhost:3000  (PORT=3100 npm run dev to change)
npm run build && npm start   # production
```

Re-run `npm run db:setup` periodically: it adds new days of flights and never touches existing flights or bookings.

## API

| Route | Purpose |
|---|---|
| `GET /api/health` | DB-backed health check |
| `GET /api/airports` | Airport list |
| `GET /api/flights?from=JFK&to=LAX&date=YYYY-MM-DD` | Search (date = day at the origin airport) |
| `GET /api/flights/:id` | Flight + taken seats |
| `/api/auth/*` | Better Auth (sign up/in/out, session) |
| `POST /api/bookings` (sign-in required) | `{flightId, seats:[{seat,passengerName}], contact:{name,email}}` |
| `POST /api/bookings/lookup` | `{code, email}` |
| `GET /api/my/bookings` (sign-in required) | Your bookings |
| `POST /api/my/bookings/cancel` (sign-in required) | `{code}` |

## Known gaps

No payments, no staff/admin side, no email verification or password reset, no emails sent, no rate limiting on lookups, one cabin layout (20 rows A–F) for every flight.
