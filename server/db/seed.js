// Seed data. setup-db inserts with ON CONFLICT DO NOTHING, so editing a row
// here does NOT update a row that already exists in the database.
export const airports = [
  { code: 'JFK', city: 'New York', name: 'John F. Kennedy International', timezone: 'America/New_York' },
  { code: 'BOS', city: 'Boston', name: 'Logan International', timezone: 'America/New_York' },
  { code: 'MIA', city: 'Miami', name: 'Miami International', timezone: 'America/New_York' },
  { code: 'ORD', city: 'Chicago', name: "O'Hare International", timezone: 'America/Chicago' },
  { code: 'DEN', city: 'Denver', name: 'Denver International', timezone: 'America/Denver' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', timezone: 'America/Los_Angeles' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco International', timezone: 'America/Los_Angeles' },
  { code: 'SEA', city: 'Seattle', name: 'Seattle-Tacoma International', timezone: 'America/Los_Angeles' },
];

// Each route flies in both directions, at each local departure time, every day.
// durationMin is elapsed flight time; basePrice is the economy fare in USD.
export const routes = [
  { a: 'JFK', b: 'LAX', durationMin: 375, basePrice: 289, times: ['07:30', '13:45', '19:00'] },
  { a: 'JFK', b: 'SFO', durationMin: 385, basePrice: 305, times: ['08:15', '17:30'] },
  { a: 'JFK', b: 'MIA', durationMin: 190, basePrice: 149, times: ['06:45', '12:20', '18:10'] },
  { a: 'BOS', b: 'ORD', durationMin: 170, basePrice: 135, times: ['09:00', '15:30'] },
  { a: 'ORD', b: 'DEN', durationMin: 150, basePrice: 119, times: ['08:40', '16:05'] },
  { a: 'ORD', b: 'LAX', durationMin: 250, basePrice: 219, times: ['10:10', '18:45'] },
  { a: 'DEN', b: 'SEA', durationMin: 175, basePrice: 159, times: ['11:00'] },
  { a: 'SFO', b: 'SEA', durationMin: 125, basePrice: 99, times: ['07:20', '14:40', '20:15'] },
  { a: 'LAX', b: 'SEA', durationMin: 170, basePrice: 129, times: ['09:30', '17:00'] },
  { a: 'MIA', b: 'ORD', durationMin: 190, basePrice: 169, times: ['12:00'] },
];

// Flights are generated for the next DAYS_AHEAD days. Re-running db:setup later
// adds the new days and leaves existing flights (and their bookings) untouched.
export const DAYS_AHEAD = 60;

// Flat list of { flightNo, origin, destination, time, durationMin, basePrice }.
export function flightTemplates() {
  const out = [];
  routes.forEach((r, i) => {
    [[r.a, r.b], [r.b, r.a]].forEach(([origin, destination], dir) => {
      r.times.forEach((time, t) => {
        out.push({
          flightNo: `SK${100 + i * 10 + dir * 5 + t}`,
          origin, destination, time,
          durationMin: r.durationMin, basePrice: r.basePrice,
        });
      });
    });
  });
  return out;
}
