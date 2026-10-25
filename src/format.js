// Times are always shown in the airport's own timezone, not the browser's.
export const formatTime = (iso, tz) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso));

export const formatDate = (iso, tz) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: tz })
    .format(new Date(iso));

export function formatDuration(departsAt, arrivesAt) {
  const mins = Math.round((new Date(arrivesAt) - new Date(departsAt)) / 60000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

// YYYY-MM-DD in the browser's local calendar (default/min for the date picker only; the server decides validity).
export function localDateString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
