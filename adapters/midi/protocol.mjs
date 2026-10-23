// SysEx, educational/non-commercial manufacturer 0x7d; little-endian 7-bit integers.
// The receiver accepts only our exact signature, schema and checksum.
export const SIGNATURE = [0xf0, 0x7d, 0x44, 0x4a, 0x43, 0x49, 1];
export const PACKET_LENGTH = 40;
function read7(bytes, offset, width) {
  let n = 0;
  for (let i = 0; i < width; i++) n += bytes[offset + i] * 2 ** (i * 7);
  return n;
}
export function decodeTelemetry(bytes) {
  if (
    !Array.isArray(bytes) ||
    bytes.length !== PACKET_LENGTH ||
    bytes.at(-1) !== 0xf7 ||
    SIGNATURE.some((n, i) => bytes[i] !== n)
  )
    return null;
  if (bytes.slice(1, -1).some((n) => !Number.isInteger(n) || n < 0 || n > 127)) return null;
  if (bytes.slice(1, -2).reduce((s, n) => s + n, 0) % 128 !== bytes.at(-2)) return null;
  const id = bytes[7],
    flags = bytes[8];
  if (![1, 2].includes(id) || flags > 15) return null;
  const loaded = Boolean(flags & 1),
    playing = Boolean(flags & 2);
  const bpm = read7(bytes, 11, 3) / 100;
  const originalBpm = read7(bytes, 14, 3) / 100;
  const duration = read7(bytes, 17, 4) / 1000;
  const positionSeconds = read7(bytes, 21, 4) / 1000;
  const cue = read7(bytes, 25, 4) / 1000;
  const tempoRatio = read7(bytes, 29, 3) / 10000;
  // Reserved fields (32..37) must be zero in schema v1.
  if (
    bytes.slice(32, 38).some(Boolean) ||
    bpm > 1000 ||
    originalBpm > 1000 ||
    duration > 86400 ||
    positionSeconds > duration + 1 ||
    (playing && !loaded)
  )
    return null;
  return {
    id,
    loaded,
    playing,
    bpm: loaded && bpm > 0 ? bpm : null,
    originalBpm: loaded && originalBpm > 0 ? originalBpm : null,
    duration: loaded && duration > 0 ? duration : null,
    positionSeconds: loaded ? positionSeconds : 0,
    cueSeconds: loaded && flags & 4 && cue < duration ? cue : null,
    tempoRatio: tempoRatio > 0 ? tempoRatio : null,
    sequence: read7(bytes, 9, 2),
    scratching: Boolean(flags & 8),
    locked: true,
    owner: 'manual',
    trackId: null,
    title: loaded ? 'Título no disponible por MIDI' : null,
    artist: loaded ? 'Consultá el deck en Mixxx' : null,
  };
}
