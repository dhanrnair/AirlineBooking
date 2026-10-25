// The ONLY place the browser talks to the server.
async function request(path, options) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.fields = body.fields; // per-field validation messages from the server
    throw err;
  }
  return body;
}

const post = (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) });

export const getAirports = () => request('/airports');

export const searchFlights = ({ from, to, date }) =>
  request(`/flights?${new URLSearchParams({ from, to, date })}`);

export const getFlight = (id) =>
  request(`/flights/${encodeURIComponent(id)}`).catch((err) => {
    if (err.status === 404) return null;
    throw err;
  });

// Only ids, seat labels and names are sent: the server computes every price.
export const createBooking = (data) => post('/bookings', data);
export const lookupBooking = (code, email) => post('/bookings/lookup', { code, email });

// Signed-in users only (session cookie identifies the account).
export const listMyBookings = () => request('/my/bookings');
export const cancelMyBooking = (code) => post('/my/bookings/cancel', { code });
