-- Idempotent: safe to run on every `npm run db:setup`.
-- There is no migration tool. To change an existing table, append an
-- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` below; editing a CREATE
-- TABLE above does nothing to a database that already has the table.

CREATE TABLE IF NOT EXISTS airports (
  code     text PRIMARY KEY,
  city     text NOT NULL,
  name     text NOT NULL,
  timezone text NOT NULL,                   -- IANA zone, used to show local times
  position integer NOT NULL DEFAULT 0       -- display order
);

CREATE TABLE IF NOT EXISTS flights (
  id          text PRIMARY KEY,             -- e.g. SK101-2026-11-02
  flight_no   text NOT NULL,
  origin      text NOT NULL REFERENCES airports(code),
  destination text NOT NULL REFERENCES airports(code),
  departs_at  timestamptz NOT NULL,
  arrives_at  timestamptz NOT NULL,
  base_price  numeric(10,2) NOT NULL CHECK (base_price >= 0),   -- economy fare per seat
  CHECK (origin <> destination),
  CHECK (arrives_at > departs_at)
);
CREATE INDEX IF NOT EXISTS flights_search_idx ON flights (origin, destination, departs_at);

CREATE TABLE IF NOT EXISTS bookings (
  id           text PRIMARY KEY,            -- confirmation code, e.g. BK-3F9A21CC
  flight_id    text NOT NULL REFERENCES flights(id),
  contact_name text NOT NULL,
  email        text NOT NULL,               -- stored lowercased
  total        numeric(10,2) NOT NULL CHECK (total >= 0),   -- snapshot at booking time
  status       text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passengers (
  id         serial PRIMARY KEY,
  booking_id text NOT NULL REFERENCES bookings(id),
  flight_id  text NOT NULL REFERENCES flights(id),
  seat       text NOT NULL,
  name       text NOT NULL,
  price      numeric(10,2) NOT NULL CHECK (price >= 0),
  status     text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled'))
);
-- Partial: a cancelled seat becomes available again, a confirmed seat can never be sold twice.
CREATE UNIQUE INDEX IF NOT EXISTS passengers_seat_uniq
  ON passengers (flight_id, seat) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS passengers_booking_idx ON passengers (booking_id);

-- Better Auth tables (default names/columns for the email+password setup in server/auth.js).
CREATE TABLE IF NOT EXISTS "user" (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  email           text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image           text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS session (
  id          text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token       text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId"    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_idx ON session ("userId");
CREATE TABLE IF NOT EXISTS account (
  id                      text PRIMARY KEY,
  "accountId"             text NOT NULL,
  "providerId"            text NOT NULL,
  "userId"                text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope                   text,
  password                text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_user_idx ON account ("userId");
CREATE TABLE IF NOT EXISTS verification (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier);

-- Bookings made while signed in are linked to the account (guest bookings keep it NULL).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_id text REFERENCES "user"(id) ON DELETE SET NULL;
