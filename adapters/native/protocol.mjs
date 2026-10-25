import { isAbsolute, normalize } from 'node:path';

export const NATIVE_PROTOCOL = 1;
export const NATIVE_BUILD = 'copilot-2.5.6-observer-1';
export const NATIVE_LIMIT = 65536;
export const NATIVE_AGE = 2000;
export const NATIVE_BLOCK =
  'Carga nativa deshabilitada: falta una carga atómica cancelable dentro de Mixxx. Este prototipo solo identifica y comprueba archivos/decks.';
const number = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
const text = (value, limit) =>
  typeof value === 'string' && value.length <= limit && !value.includes('\0');
export function validateNativeState(message, session, previousSequence, now = Date.now()) {
  if (
    !message ||
    message.type !== 'state' ||
    message.session !== session ||
    !Number.isSafeInteger(message.sequence) ||
    message.sequence <= previousSequence ||
    !Number.isSafeInteger(message.sentAt) ||
    now - message.sentAt > NATIVE_AGE ||
    message.sentAt - now > 250 ||
    ![0, 1, 2].includes(message.authorizedDeck) ||
    !Number.isSafeInteger(message.authorizedUntil) ||
    !Array.isArray(message.decks) ||
    message.decks.length !== 2
  )
    return false;
  return message.decks.every(
    (deck, index) =>
      deck &&
      deck.id === index + 1 &&
      ['available', 'loaded', 'playing', 'loading'].every(
        (key) => typeof deck[key] === 'boolean',
      ) &&
      Number.isSafeInteger(deck.revision) &&
      deck.revision >= 0 &&
      text(deck.title, 1000) &&
      text(deck.artist, 1000) &&
      (deck.path === null ||
        (text(deck.path, 4096) && isAbsolute(deck.path) && normalize(deck.path) === deck.path)) &&
      (!deck.playing || deck.loaded) &&
      (!deck.path || (deck.loaded && !deck.loading)) &&
      (deck.bpm === null || number(deck.bpm, 0, 1000)) &&
      (deck.originalBpm === null || number(deck.originalBpm, 0, 1000)) &&
      (deck.duration === null || number(deck.duration, 0, 86400)) &&
      number(deck.positionSeconds, -86400, 86400) &&
      number(deck.tempoRatio, 0, 16) &&
      (deck.cueSeconds === null ||
        (number(deck.cueSeconds, 0, 86400) && deck.duration && deck.cueSeconds < deck.duration)),
  );
}
