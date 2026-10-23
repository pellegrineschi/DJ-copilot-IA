export function recommend(track, active, { maxTempoPercent = 4 } = {}) {
  if (!track) return null;
  const original = track.bpm;
  const reference = active?.bpm;
  const delta = original && reference ? original - reference : null;
  const ratio = original && reference ? reference / original : 1;
  const percent = (ratio - 1) * 100;
  const canMatch = Boolean(original && reference && Math.abs(percent) <= maxTempoPercent);
  const cueKnown = track.cueSeconds !== null;
  let technique = 'Escucha previa';
  let explanation =
    'Faltan BPM o un punto de entrada verificado. Escuchá el tema en auriculares y guardá un CUE antes de preparar.';
  if (cueKnown && original && reference) {
    technique = canMatch ? 'Transición progresiva · a evaluar' : 'Corte al golpe · a evaluar';
    explanation = canMatch
      ? 'El tempo entra en el margen configurado. Comprobá fraseo, voces y tonalidad en auriculares antes de una mezcla progresiva.'
      : 'La diferencia supera el margen de tempo. Conservamos la velocidad original: buscá un cierre de frase y ensayá un corte al golpe.';
  }
  return {
    track,
    delta,
    tempoPercent: canMatch ? percent : 0,
    tempoRatio: canMatch ? ratio : 1,
    canMatch,
    cueKnown,
    technique,
    explanation,
    cueLabel: cueKnown ? `CUE guardado · ${track.cueSeconds.toFixed(1)} s` : 'Sin CUE guardado',
    warning: !cueKnown
      ? 'Sin punto de entrada verificado.'
      : !original || !reference
        ? 'BPM desconocido: sin ajuste de tempo.'
        : !canMatch
          ? 'Tempo original: ajuste fuera del límite.'
          : null,
  };
}

export function estimateSet({ hours = 4, songSeconds = 120, overlapSeconds = 14 }) {
  if (
    ![hours, songSeconds, overlapSeconds].every(Number.isFinite) ||
    hours <= 0 ||
    hours > 24 ||
    songSeconds < 30 ||
    songSeconds > 1800 ||
    overlapSeconds < 0 ||
    overlapSeconds >= songSeconds
  ) {
    throw new Error('Revisá la duración del set y el solapamiento de las transiciones.');
  }
  const totalSeconds = hours * 3600;
  const songs = Math.max(
    1,
    Math.ceil((totalSeconds - overlapSeconds) / (songSeconds - overlapSeconds)),
  );
  return { songs, totalSeconds, hours, songSeconds, overlapSeconds };
}
