import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import FlightSummary from '../components/FlightSummary';
import { formatPrice } from '../../shared/rules';
import { cancelMyBooking, listMyBookings } from '../services/api';
import { useSession } from '../services/auth';

export default function MyBookings() {
  const { data: session, isPending } = useSession();
  const booked = useLocation().state?.booked; // set right after a successful booking
  const [bookings, setBookings] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(''); // code awaiting cancel confirmation
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    listMyBookings().then(setBookings).catch((err) => { setError(err.message); setBookings([]); });
  }, [session]);

  async function cancel(code) {
    setBusy(true);
    setError('');
    try {
      const updated = await cancelMyBooking(code);
      setBookings((list) => list.map((b) => (b.code === code ? updated : b)));
      setConfirming('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (isPending) return <p className="muted">Loading…</p>;
  if (!session) return <Navigate to="/signin" state={{ from: '/my-bookings' }} replace />;

  return (
    <>
      {booked && (
        <div className="card success">
          <h2>Booking confirmed 🎉</h2>
          <p>Your confirmation code is <strong>{booked}</strong>.</p>
        </div>
      )}
      <h1>My bookings</h1>
      {error && <p className="error">{error}</p>}
      {bookings === null && <p className="muted">Loading…</p>}
      {bookings?.length === 0 && !error && (
        <p className="muted">No bookings on this account yet. <Link to="/">Search flights</Link></p>
      )}
      {bookings?.map((b) => (
        <div className="card" key={b.code}>
          <div className="order-head">
            <h2>{b.code}</h2>
            <span className="muted">{b.status === 'cancelled' ? 'Cancelled' : 'Confirmed'}</span>
            <strong>{formatPrice(b.total)}</strong>
          </div>
          <FlightSummary flight={b} />
          <ul>
            {b.passengers.map((p) => (
              <li key={p.seat}>{p.name} · seat {p.seat} · {formatPrice(p.price)}</li>
            ))}
          </ul>
          {b.status === 'confirmed' && new Date(b.departsAt) > new Date() && (confirming === b.code ? (
            <p>Cancel this booking and release all seats?{' '}
              <button type="button" onClick={() => cancel(b.code)} disabled={busy}>Yes, cancel it</button>{' '}
              <button type="button" className="button secondary" onClick={() => setConfirming('')}>Keep it</button>
            </p>
          ) : (
            <p><button type="button" className="button secondary" onClick={() => setConfirming(b.code)}>Cancel booking</button></p>
          ))}
        </div>
      ))}
    </>
  );
}
