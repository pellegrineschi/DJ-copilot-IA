// Provenance is independent of transport connectivity and numerical telemetry.
// "confirmed" is reserved for a future verified automatic source; no MIDI v1/v2
// message or renderer command in this version can grant that status.
export function unknownIdentity(reason = 'Asociá una canción después de comprobarla en Mixxx.') {
  return { status: 'unknown', source: null, trackId: null, path: null, hash: null, reason };
}

export function manualIdentity(track, loadGeneration, selectedAt) {
  if (!track || track.isDemo || !track.path || !track.hash || !track.id) {
    throw new Error(
      'Elegí un archivo real importado; las canciones DEMO no se pueden asociar a Mixxx.',
    );
  }
  return {
    status: 'manual',
    source: 'user',
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    path: track.path,
    hash: track.hash,
    loadGeneration,
    selectedAt,
    reason: 'Seleccionada por vos. Mixxx no confirmó el archivo ni su ruta.',
  };
}

export function canRecordAutomatically(connection, deck) {
  if (!connection.connected || !deck.playing || !deck.trackId) return false;
  if (connection.mode === 'simulation') return true;
  return Boolean(
    connection.capabilities.trackIdentity && deck.fresh && deck.identity?.status === 'confirmed',
  );
}
