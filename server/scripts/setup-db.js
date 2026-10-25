// Creates tables and seeds missing rows. Safe to run more than once.
import { readFile } from 'node:fs/promises';
import { pool, withTransaction } from '../db.js';
import { airports, flightTemplates, DAYS_AHEAD } from '../db/seed.js';

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');

await withTransaction(async (db) => {
  await db.query(schema);
  console.log('Tables ready');

  for (const [position, a] of airports.entries()) {
    await db.query(
      `INSERT INTO airports (code, name, city, timezone, position)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO NOTHING`,
      [a.code, a.name, a.city, a.timezone, position]
    );
  }
  console.log(`Seeded ${airports.length} airports (existing rows left unchanged)`);

  // One statement per flight template covers all days. Departure time is local to the origin airport.
  const before = (await db.query('SELECT count(*)::int AS n FROM flights')).rows[0].n;
  for (const f of flightTemplates()) {
    await db.query(
      `INSERT INTO flights (id, flight_no, origin, destination, departs_at, arrives_at, base_price)
       SELECT $1::text || '-' || to_char(x.day, 'YYYY-MM-DD'), $1::text, $2::text, $3::text,
              x.ts, x.ts + make_interval(mins => $5::int), $6::numeric
       FROM (
         SELECT d::date AS day, (d::date + $4::time) AT TIME ZONE ap.timezone AS ts
         FROM generate_series(current_date::timestamp, (current_date + $7::int)::timestamp, interval '1 day') AS d,
              (SELECT timezone FROM airports WHERE code = $2::text) AS ap
       ) AS x
       ON CONFLICT (id) DO NOTHING`,
      [f.flightNo, f.origin, f.destination, f.time, f.durationMin, f.basePrice, DAYS_AHEAD - 1]
    );
  }
  const after = (await db.query('SELECT count(*)::int AS n FROM flights')).rows[0].n;
  console.log(`Flights: ${after} total (${after - before} added)`);
});

await pool.end();
console.log('Database setup complete');
