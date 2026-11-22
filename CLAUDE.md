# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Skyline Air: demo airline booking portal (React 18 + Vite, Express 5, Neon Postgres, Better Auth). One Node process serves `/api` and the React app on one port; keep it a single deployable (`vite.config.js` exists only for the React plugin/build).

## Commands

```bash
npm run dev        # Express + Vite middleware (HMR) on http://localhost:3000; PORT=3100 to change
npm run build      # Vite build into dist/
npm start          # production: Express serves /api and dist/
npm run db:setup   # create tables, seed airports, add missing flight days (idempotent, never touches existing rows)
```

No linter is configured. Node 22+ is required (scripts use `node --env-file-if-exists=.env`); if `node` isn't found, `export PATH=~/.local/node/bin:$PATH`.

Required env (`.env`, git-ignored, see `.env.example`): `DATABASE_URL` (Neon; `server/db.js` exits without it) and `BETTER_AUTH_SECRET` (`server/auth.js` exits without it; `openssl rand -base64 32`). Optional `BETTER_AUTH_URL` (public origin, set in production). When appending to `.env`, ensure the file ends with a newline first.

## Tests

```bash
npm test                                    # unit (with coverage), then Playwright
npm run test:unit                           # Vitest: tests/unit, coverage of shared/rules.js
npm run test:e2e                            # Playwright: tests/api (HTTP) + tests/e2e (browser), headless
npx playwright test --headed                # visible browser
npx vitest run -t "seatPrice"               # one unit test by name
npx playwright test tests/api -g "double-booked"   # one Playwright test by title
npm run test:report                         # open reports/playwright-html
```

Reports (HTML, JUnit XML, coverage) go to `reports/` (git-ignored).

- Playwright builds the app and starts the **production** build itself on port **3100**, so nothing needs to be running, but don't run `npm run dev` on 3100 meanwhile. Don't point the tests at the dev server: Vite's HMR socket clashes with a running dev server and reloads pages mid-test. `BASE_URL` in `tests/helpers.js` must match `playwright.config.js`.
- Tests hit the real Neon database from `.env`. Every test that books must cancel at the end (frees the seat). Flights are generated relative to today, so use `findFlight()` and `freeSeats()` from `tests/helpers.js`; never hardcode dates, flight ids or seats.
- Better Auth rate-limits sign-up/sign-in (~3 per 10s) in production mode. Use the worker-scoped `authed` fixture (one signed-in user per run); `signUp()` retries on 429. UI auth tests wait 11s for the window to reset. Run with one worker: tests share flights and seats.
- The From/To `<select>`s' accessible names include their option text, so `getByLabel('To')` is ambiguous; use the `airport(page, 'To')` locator in `tests/e2e/flights.spec.js`.
- Vitest is pinned to v3 because the app is on Vite 5 (Vitest 5 needs Vite 6+).

### CI

`.github/workflows/ci.yml` (GitHub Actions, job `test`) runs on push to `main`, on pull requests and on manual dispatch: `npm ci`, install Chromium, `npm run db:setup`, `npm test`. Reports are uploaded as the `test-reports` artifact (always) and `playwright-artifacts` (traces/videos, failures only). About 1.5 minutes.

- Needs repository secrets `DATABASE_URL` and `BETTER_AUTH_SECRET`. Secrets are write-only, so a missing one shows up as an empty `DATABASE_URL:` in the log and `db:setup` exits with "DATABASE_URL is not set". `DATABASE_URL` should be a dedicated Neon test branch: CI runs `db:setup` and books/cancels seats against it.
- A `concurrency` group serialises runs, because they all share one database's flights and seats.
- `gh` is installed at `~/.local/gh/bin` (not on this session's PATH; use the full path). Useful: `gh run list`, `gh run watch <id> --exit-status`, `gh run view <id> --log-failed`, `gh run rerun <id> --failed`, `gh secret set NAME` (pipe the value on stdin, don't put it on the command line).

## Architecture

- `server/index.js` mounts Better Auth at `/api/auth/{*splat}` **before** the `/api` router (which applies `express.json()`); reversing this makes auth requests hang. Then Vite middleware (dev) or `dist/` + SPA fallback `/{*splat}` (prod, Express 5 syntax).
- `server/api.js`: routes and validation. Errors with `.status` return their message; anything else is logged as a generic 500. Express 5 forwards async rejections, so no try/catch. Keep `GET /api/health` (queries the DB).
- `server/repo.js`: **all SQL**. Neon `Pool` (WebSocket, not the HTTP driver) in `server/db.js` with `withTransaction`, because bookings need interactive transactions. Cast numerics `::float8`.
- `shared/rules.js` is imported by both browser and server (validation, seat layout, pricing); keep it free of Node/browser-only APIs.
- `src/services/api.js` is the only browser→API code (surfaces `err.status` and per-field `err.fields`); `src/services/auth.js` is the Better Auth React client.

### Booking and seats
- `createBooking` locks the flight row `FOR UPDATE`, checks taken seats, then inserts. Backstop: partial unique index `passengers_seat_uniq (flight_id, seat) WHERE status='confirmed'` (23505 → 409). Cancelling flips status, which frees the seat.
- Prices are computed only on the server (`seatPrice`; Business rows 1-3 = 2.5× base). The client sends flight id, seats and names only.
- Flights are generated in SQL by `server/scripts/setup-db.js` from `server/db/seed.js` templates; departure times are local to the origin airport (`AT TIME ZONE`), and search `date` is the origin-local calendar day.

### Auth and privacy
- Better Auth (email + password, no verification or reset) stores sessions in Neon. Its tables (`user`, `session`, `account`, `verification`, camelCase quoted columns) are in `schema.sql`, not created by the Better Auth CLI.
- Every transaction (create/cancel booking) requires sign-in: routes call `requireUser(req)` and take the user id from the session, never the client. `cancelBooking(code, userId)` is owner-scoped; a wrong owner gets the same 404 as an unknown code. Search and the read-only `POST /api/bookings/lookup` (code + email, POST so email stays out of URLs) stay public.
- The only listing endpoint is `GET /api/my/bookings`, scoped to the session user. No other endpoint lists bookings. Guest bookings from before auth have `bookings.user_id` NULL and can't be cancelled.
- Client: signed-out users see "Sign in to book" on the flight page; `Account.jsx` returns them via `location.state.from`. A successful booking navigates to `/my-bookings`.

### Schema changes
No migration tool. Editing a `CREATE TABLE` does nothing to an existing database; append `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` to `server/db/schema.sql` (it runs on every `db:setup`).

### Deploy
`render.yaml` is a Render Blueprint (one web service, health check `/api/health`). The build runs `npm ci --include=dev && npm run db:setup && npm run build` (`--include=dev` because Render sets `NODE_ENV=production` and Vite is a devDependency). `DATABASE_URL` and `BETTER_AUTH_URL` are entered in the Render dashboard; `BETTER_AUTH_SECRET` is generated by Render.

`Dockerfile` is an alternative, portable image (multi-stage, `npm ci`, runs `node server/index.js` on 3000). It is not used by Render and does not run `db:setup`, so run that separately against the target database.

Live at https://skyline-air.onrender.com (free plan: sleeps when idle, first request is slow). `BETTER_AUTH_URL` must equal that origin exactly or sign-in breaks. `db:setup` runs in every build against the production `DATABASE_URL`, so schema changes go live on deploy.

### Git remote
`origin` is `git@github-dhanrnair:dhanrnair/AirlineBooking.git`. `github-dhanrnair` is a host alias in `~/.ssh/config` using `~/.ssh/id_ed25519_dhanrnair`; the default key belongs to a different GitHub account and is denied on this repo. There is no TTY (even via `!`), so HTTPS password/token prompts fail; push over SSH only.
