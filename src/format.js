export const time = (seconds) =>
  seconds == null || !Number.isFinite(seconds)
    ? '—:—'
    : `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
export const bpm = (n) => (n ? n.toFixed(1) : '—');
