import { useState } from 'react';
import { Link } from 'react-router-dom';
import FlightSummary from '../components/FlightSummary';
import { formatPrice } from '../../shared/rules';
import { lookupBooking } from '../services/api';

export default function Manage() {
  const [booking, setBooking] = useState(null);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function find(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      setBooking(await lookupBooking(code, email));
    } catch (err) {
      setBooking(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Manage booking</h1>
      <form className="search card" onSubmit={find}>
        <label className="field"><span>Confirmation code</span>
          <input value={code} placeholder="BK-XXXXXXXX" onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="field"><span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Looking…' : 'Find booking'}</button>
      </form>
      {error && <p className="error">{error}</p>}

      {booking && (
        <div className="card">
          <div className="order-head">
            <h2>{booking.code}</h2>
            <span className="muted">{booking.status === 'cancelled' ? 'Cancelled' : 'Confirmed'}</span>
            <strong>{formatPrice(booking.total)}</strong>
          </div>
          <FlightSummary flight={booking} />
          <ul>
            {booking.passengers.map((p) => (
              <li key={p.seat}>{p.name} · seat {p.seat} · {formatPrice(p.price)}</li>
            ))}
          </ul>
          {booking.status === 'confirmed' && (
            <p className="muted small">To cancel, <Link to="/my-bookings">sign in and open My bookings</Link>.</p>
          )}
        </div>
      )}
    </>
  );
}
