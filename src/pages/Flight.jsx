import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../services/auth';
import { Link, useNavigate, useParams } from 'react-router-dom';
import FlightSummary from '../components/FlightSummary';
import {
  BUSINESS_ROWS, MAX_PASSENGERS, SEAT_LETTERS, SEAT_ROWS,
  formatPrice, roundMoney, seatClass, seatPrice, validateBooking,
} from '../../shared/rules';
import { createBooking, getFlight } from '../services/api';

export default function Flight() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [flight, setFlight] = useState(undefined); // undefined = loading, null = not found
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState([]);      // seat labels, in click order
  const [names, setNames] = useState({});            // seat -> passenger name
  const [contact, setContact] = useState({ name: '', email: '' });
  const { data: session, isPending: sessionPending } = useSession();
  // Prefill contact once from the signed-in account (user edits are kept).
  useEffect(() => {
    if (session) setContact((c) => ({ name: c.name || session.user.name, email: c.email || session.user.email }));
  }, [session]);
  const [fields, setFields] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    () => getFlight(id).then(setFlight).catch((err) => setLoadError(err.message)),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  if (loadError) return <p className="error">Could not load flight: {loadError}</p>;
  if (flight === undefined) return <p>Loading…</p>;
  if (flight === null) return <p>Flight not found. <Link to="/">Search again</Link></p>;

  const taken = new Set(flight.takenSeats);
  const total = roundMoney(selected.reduce((sum, s) => sum + seatPrice(flight.basePrice, s), 0));

  function toggle(seat) {
    if (taken.has(seat)) return;
    setSelected((cur) => {
      if (cur.includes(seat)) return cur.filter((s) => s !== seat);
      return cur.length >= MAX_PASSENGERS ? cur : [...cur, seat];
    });
  }

  async function submit(e) {
    e.preventDefault();
    const seats = selected.map((seat) => ({ seat, passengerName: names[seat] ?? '' }));
    const errs = validateBooking({ contact, seats });
    setFields(errs);
    setSubmitError('');
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      const booking = await createBooking({ flightId: flight.id, seats, contact });
      navigate('/my-bookings', { state: { booked: booking.code } });
    } catch (err) {
      setFields(err.fields || {});
      setSubmitError(err.message);
      if (err.status === 409) {
        // Someone else got there first: refresh the map and drop seats that are no longer free.
        const fresh = await getFlight(id).catch(() => null);
        if (fresh) {
          setFlight(fresh);
          setSelected((cur) => cur.filter((s) => !fresh.takenSeats.includes(s)));
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <p><Link to="/">← Back to search</Link></p>
      <div className="card"><FlightSummary flight={flight} /></div>

      <div className="cart">
        <section>
          <h2>Choose your seats</h2>
          <p className="muted small">
            Rows 1–{BUSINESS_ROWS} Business ({formatPrice(seatPrice(flight.basePrice, '1A'))}), other rows Economy ({formatPrice(flight.basePrice)}). Up to {MAX_PASSENGERS} seats.
          </p>
          <div className="legend small">
            <span className="seat sample">&nbsp;</span> Free
            <span className="seat sample selected">&nbsp;</span> Selected
            <span className="seat sample taken">&nbsp;</span> Taken
          </div>
          <div className="seatmap">
            {Array.from({ length: SEAT_ROWS }, (_, i) => i + 1).map((row) => (
              <div key={row} className={'seat-row' + (row <= BUSINESS_ROWS ? ' business' : '')}>
                <span className="row-num muted small">{row}</span>
                {SEAT_LETTERS.map((letter, idx) => {
                  const seat = `${row}${letter}`;
                  const cls = taken.has(seat) ? 'taken' : selected.includes(seat) ? 'selected' : '';
                  return (
                    <span key={seat} className={idx === 3 ? 'aisle-wrap' : ''}>
                      <button type="button" className={`seat ${cls}`} disabled={taken.has(seat)}
                        aria-label={`Seat ${seat} ${seatClass(seat)}`} aria-pressed={selected.includes(seat)}
                        onClick={() => toggle(seat)}>{letter}</button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <form className="summary" onSubmit={submit} noValidate>
          <h2>Passengers</h2>
          {selected.length === 0 && <p className="muted">Pick a seat to begin.</p>}
          {fields.seats && <p className="error">{fields.seats}</p>}
          {selected.map((seat, i) => (
            <label key={seat} className="field">
              <span>Seat {seat} · {seatClass(seat)} · {formatPrice(seatPrice(flight.basePrice, seat))}</span>
              <input value={names[seat] ?? ''} placeholder="Passenger full name"
                onChange={(e) => setNames({ ...names, [seat]: e.target.value })} />
              {fields[`passenger${i}`] && <span className="error small">{fields[`passenger${i}`]}</span>}
            </label>
          ))}
          <h2>Contact</h2>
          <label className="field"><span>Your name</span>
            <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            {fields.name && <span className="error small">{fields.name}</span>}
          </label>
          <label className="field"><span>Email</span>
            <input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            {fields.email && <span className="error small">{fields.email}</span>}
          </label>
          <div className="summary-row total"><span>Total</span><span>{formatPrice(total)}</span></div>
          {submitError && <p className="error">{submitError}</p>}
          {session || sessionPending ? (
            <button type="submit" className="block-btn" disabled={submitting || sessionPending || selected.length === 0}>
              {submitting ? 'Booking…' : 'Confirm booking (demo)'}
            </button>
          ) : (
            <>
              <Link to="/signin" state={{ from: `/flights/${id}` }} className="button block-btn">Sign in to book</Link>
              <p className="muted small">You need an account to book. <Link to="/signup" state={{ from: `/flights/${id}` }}>Create one</Link></p>
            </>
          )}
          <p className="muted small">The final price is calculated by the server. No payment is taken.</p>
        </form>
      </div>
    </>
  );
}
