import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import FlightSummary from '../components/FlightSummary';
import { localDateString } from '../format';
import { formatPrice } from '../../shared/rules';
import { getAirports, searchFlights } from '../services/api';

// Every page that fetches data handles three states: loading, error, loaded.
export default function Home() {
  const [params, setParams] = useSearchParams();
  const [airports, setAirports] = useState([]);
  const [airportError, setAirportError] = useState('');
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');
  const [date, setDate] = useState(params.get('date') || localDateString(1));
  const [formError, setFormError] = useState('');

  const [flights, setFlights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAirports().then(setAirports).catch((err) => setAirportError(err.message));
  }, []);

  const q = { from: params.get('from'), to: params.get('to'), date: params.get('date') };
  useEffect(() => {
    if (!q.from || !q.to || !q.date) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    searchFlights(q)
      .then((r) => !cancelled && setFlights(r))
      .catch((err) => !cancelled && (setError(err.message), setFlights(null)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [q.from, q.to, q.date]);

  function submit(e) {
    e.preventDefault();
    if (!from || !to) return setFormError('Choose an origin and a destination');
    if (from === to) return setFormError('Origin and destination must be different');
    if (!date) return setFormError('Choose a date');
    setFormError('');
    setParams({ from, to, date });
  }

  if (airportError) return <p className="error">Could not load airports: {airportError}</p>;

  return (
    <>
      <h1>Where to?</h1>
      <form className="search card" onSubmit={submit}>
        <label className="field"><span>From</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Select airport</option>
            {airports.map((a) => <option key={a.code} value={a.code}>{a.city} ({a.code})</option>)}
          </select>
        </label>
        <label className="field"><span>To</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Select airport</option>
            {airports.map((a) => <option key={a.code} value={a.code}>{a.city} ({a.code})</option>)}
          </select>
        </label>
        <label className="field"><span>Date</span>
          <input type="date" value={date} min={localDateString(0)} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="submit" disabled={!airports.length}>Search</button>
      </form>
      {formError && <p className="error">{formError}</p>}

      {loading && <p>Searching…</p>}
      {error && <p className="error">Could not search flights: {error}</p>}
      {!loading && !error && flights && flights.length === 0 && (
        <p className="muted">No flights found for that route and date. Try another day.</p>
      )}
      {!loading && flights?.map((f) => (
        <div key={f.id} className="card flight-row">
          <FlightSummary flight={f} />
          <div className="flight-action">
            <div className="muted small">from</div>
            <div className="price">{formatPrice(f.basePrice)}</div>
            {f.seatsLeft > 0
              ? <Link className="button" to={`/flights/${encodeURIComponent(f.id)}`}>Select seats</Link>
              : <span className="error">Sold out</span>}
            {f.seatsLeft > 0 && f.seatsLeft <= 10 && <div className="small error">Only {f.seatsLeft} left</div>}
          </div>
        </div>
      ))}
    </>
  );
}
