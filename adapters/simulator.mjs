import { EventEmitter } from 'node:events';
import { access } from 'node:fs/promises';
import { SafetyError } from '../core/engine.mjs';

export const emptyDeck = (id) => ({
  id,
  trackId: null,
  title: null,
  artist: null,
  loaded: false,
  playing: false,
  originalBpm: null,
  bpm: null,
  positionSeconds: 0,
  duration: null,
  cueSeconds: null,
  locked: true,
  owner: null,
  revision: 0,
  tempoRatio: 1,
});

export class SimulatorAdapter extends EventEmitter {
  constructor({ delayMs = 250, clock = true } = {}) {
    super();
    this.delayMs = delayMs;
    this.decks = [emptyDeck(1), emptyDeck(2)];
    this.closed = false;
    this.lastTick = Date.now();
    if (clock) this.timer = setInterval(() => this.advance(), 500);
  }
  snapshot() {
    return {
      mode: 'simulation',
      connected: !this.closed,
      receivedAt: Date.now(),
      capabilities: {
        telemetry: true,
        trackIdentity: true,
        loadByPath: true,
        tempo: true,
        cue: true,
      },
      message: 'Simulación · sin audio ni control de Mixxx',
      decks: structuredClone(this.decks),
    };
  }
  getDeck(id) {
    const deck = this.decks.find((d) => d.id === id);
    if (!deck) throw new Error('Deck inválido.');
    return deck;
  }
  publish() {
    this.emit('state', this.snapshot());
  }
  advance() {
    const now = Date.now();
    const elapsed = Math.min(2, (now - this.lastTick) / 1000);
    this.lastTick = now;
    for (const deck of this.decks) {
      if (!deck.playing) continue;
      deck.positionSeconds += elapsed * deck.tempoRatio;
      if (deck.duration && deck.positionSeconds >= deck.duration) {
        deck.positionSeconds = deck.duration;
        deck.playing = false;
        deck.revision++;
      }
    }
    this.publish();
  }
  lock(id, locked) {
    if (typeof locked !== 'boolean') throw new Error('Reserva inválida.');
    const d = this.getDeck(id);
    d.locked = locked;
    d.revision++;
    this.publish();
  }
  loadManual(id, track) {
    const d = this.getDeck(id);
    if (d.playing) throw new SafetyError('No se puede reemplazar un deck que está reproduciendo.');
    Object.assign(d, emptyDeck(id), {
      revision: d.revision + 1,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      loaded: true,
      originalBpm: track.bpm,
      bpm: track.bpm,
      duration: track.duration,
      cueSeconds: track.cueSeconds,
      positionSeconds: track.cueSeconds ?? 0,
      owner: 'manual',
      locked: true,
    });
    this.publish();
  }
  setPlaying(id, playing) {
    const d = this.getDeck(id);
    if (!d.loaded) throw new Error('Primero cargá una canción en el simulador.');
    if (typeof playing !== 'boolean') throw new Error('Estado inválido.');
    d.playing = playing;
    d.revision++;
    this.publish();
  }
  release(id) {
    const d = this.getDeck(id);
    if (d.playing) throw new SafetyError('No se puede vaciar un deck activo.');
    Object.assign(d, emptyDeck(id), { revision: d.revision + 1, locked: false });
    this.publish();
  }
  transition() {
    const from = this.decks.filter((d) => d.playing);
    const to = this.decks.find((d) => !d.playing && d.loaded);
    if (from.length !== 1 || !to)
      throw new Error('Prepará el otro deck antes de simular el cambio.');
    from[0].playing = false;
    from[0].revision++;
    to.playing = true;
    to.revision++;
    this.publish();
  }
  validate(request) {
    const source = this.getDeck(request.sourceId);
    const target = this.getDeck(request.targetId);
    if (this.closed || request.isCancelled())
      throw new SafetyError('La operación fue desactivada.', 'CANCELLED');
    if (
      !source.playing ||
      source.revision !== request.sourceRevision ||
      target.playing ||
      target.locked ||
      target.revision !== request.targetRevision
    ) {
      throw new SafetyError(
        'El estado del deck cambió durante la preparación. No se aplicó ningún cambio.',
        'CONFLICT',
      );
    }
    return target;
  }
  async prepare(request) {
    this.validate(request);
    if (request.track.path) await access(request.track.path);
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const d = this.validate(request);
    const t = request.track;
    if (
      request.cueSeconds !== null &&
      (!t.duration || request.cueSeconds < 0 || request.cueSeconds >= t.duration)
    )
      throw new SafetyError('El CUE está fuera de la duración del tema.');
    Object.assign(d, {
      trackId: t.id,
      title: t.title,
      artist: t.artist,
      loaded: true,
      playing: false,
      originalBpm: t.bpm,
      bpm: t.bpm ? t.bpm * request.tempoRatio : null,
      tempoRatio: request.tempoRatio,
      duration: t.duration,
      positionSeconds: request.cueSeconds ?? 0,
      cueSeconds: request.cueSeconds,
      owner: 'copilot',
      revision: d.revision + 1,
    });
    this.publish();
    return structuredClone(d);
  }
  close() {
    this.closed = true;
    clearInterval(this.timer);
    this.removeAllListeners();
  }
}
