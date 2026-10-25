import { formatDate, formatDuration, formatTime } from '../format';

export default function FlightSummary({ flight }) {
  return (
    <div className="route">
      <div>
        <div className="big">{formatTime(flight.departsAt, flight.originTz)}</div>
        <div>{flight.origin} <span className="muted">{flight.originCity}</span></div>
      </div>
      <div className="route-mid muted small">
        <div>{formatDuration(flight.departsAt, flight.arrivesAt)}</div>
        <div className="route-line" />
        <div>{flight.flightNo}</div>
      </div>
      <div>
        <div className="big">{formatTime(flight.arrivesAt, flight.destinationTz)}</div>
        <div>{flight.destination} <span className="muted">{flight.destinationCity}</span></div>
      </div>
      <div className="muted small route-date">{formatDate(flight.departsAt, flight.originTz)}</div>
    </div>
  );
}
