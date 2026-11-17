export const MAX_SAMPLES = 300000;
export function readAxes(event, mode) {
  const a = mode === 'linear' ? event.acceleration : event.accelerationIncludingGravity;
  return a && [a.x, a.y, a.z].every(Number.isFinite) ? [a.x, a.y, a.z] : null;
}
export function csvBlob(samples, startTime, mode) {
  const rows = ['timestamp_utc,elapsed_s,x_m_s2,y_m_s2,z_m_s2,includes_gravity\r\n'];
  for (const [ms, x, y, z] of samples) {
    rows.push(`${new Date(startTime + ms).toISOString()},${(ms / 1000).toFixed(6)},${x},${y},${z},${mode === 'gravity'}\r\n`);
  }
  return new Blob(rows, { type: 'text/csv;charset=utf-8' });
}
export function csvName(value) {
  const name = value.trim().replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^\.+/, '').replace(/\.csv$/i, '');
  return `${name || 'accelerometer'}.csv`;
}
