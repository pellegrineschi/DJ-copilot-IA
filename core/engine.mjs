import { recommend } from './recommendations.mjs';

export class SafetyError extends Error {
  constructor(message, code = 'UNSAFE') {
    super(message);
    this.code = code;
  }
}

// Adapter contract: snapshot(), prepare(request), on('state'), close().
// A command contains revisions of BOTH decks; adapters must check them at commit.
export class PreparationEngine {
  constructor({ adapter, getQueue, getPlayed, log, onChange = () => {} }) {
    Object.assign(this, { adapter, getQueue, getPlayed, log, onChange });
    this.auto = false;
    this.safeMode = true;
    this.maxTempoPercent = 4;
    this.pending = false;
    this.generation = 0;
    this.skipped = new Set();
    this.lastAutoError = '';
  }

  cancel() {
    this.generation++;
    this.auto = false;
    this.onChange();
  }
  setAuto(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Estado de automatización inválido.');
    if (enabled && !this.adapter.snapshot().capabilities.loadByPath) {
      throw new SafetyError(
        'El puente MIDI de esta versión es de solo lectura. La preparación automática está disponible en simulación.',
        'UNSUPPORTED',
      );
    }
    this.generation++;
    this.auto = enabled;
    this.lastAutoError = '';
    this.onChange();
  }

  selection() {
    const state = this.adapter.snapshot();
    const active = state.decks.filter((d) => d.playing);
    const occupied = new Set(state.decks.filter((d) => d.loaded).map((d) => d.trackId));
    const played = this.getPlayed();
    const next = this.getQueue().find(
      (t) => !played.has(t.id) && !occupied.has(t.id) && !this.skipped.has(t.id),
    );
    return recommend(next, active.length === 1 ? active[0] : null, this);
  }

  skip() {
    const next = this.selection();
    if (next) this.skipped.add(next.track.id);
    this.generation++;
    this.onChange();
  }

  context() {
    const state = this.adapter.snapshot();
    if (!state.connected || Date.now() - state.receivedAt > 2000)
      throw new SafetyError(
        'Sin estado reciente de los decks. Reconectá antes de preparar.',
        'STALE',
      );
    if (!state.capabilities.loadByPath)
      throw new SafetyError(
        'Carga por archivo no disponible en el puente MIDI. Exportá la playlist y cargá el tema manualmente en Mixxx.',
        'UNSUPPORTED',
      );
    const active = state.decks.filter((d) => d.playing);
    if (active.length !== 1)
      throw new SafetyError(
        active.length
          ? 'Ambos decks están reproduciendo. Esperando a que termine la transición.'
          : 'Necesitamos exactamente un deck reproduciendo como referencia.',
        'AMBIGUOUS',
      );
    const source = active[0];
    const target = state.decks.find((d) => d.id !== source.id);
    if (!target || target.playing || target.locked)
      throw new SafetyError(
        'El otro deck está reservado. Liberalo cuando hayas terminado de prepararlo manualmente.',
        'LOCKED',
      );
    if (target.loaded && (target.owner !== 'copilot' || !this.getPlayed().has(target.trackId))) {
      throw new SafetyError(
        'El otro deck ya tiene un tema preparado o cargado manualmente.',
        'OCCUPIED',
      );
    }
    return { source, target };
  }

  async prepare() {
    if (this.pending) throw new SafetyError('Ya hay una preparación en curso.', 'BUSY');
    const { source, target } = this.context();
    const next = this.selection();
    if (!next) throw new SafetyError('No quedan canciones pendientes en la playlist.', 'EMPTY');
    if (this.safeMode && !next.cueKnown)
      throw new SafetyError(
        'Guardá un CUE verificado para este tema. El modo seguro no inventa puntos de entrada.',
        'NO_CUE',
      );
    const generation = this.generation;
    this.pending = true;
    this.onChange();
    this.log('info', `Preparando «${next.track.title}» en Deck ${target.id}.`);
    try {
      const result = await this.adapter.prepare({
        track: next.track,
        sourceId: source.id,
        targetId: target.id,
        sourceRevision: source.revision,
        targetRevision: target.revision,
        tempoRatio: next.tempoRatio,
        cueSeconds: next.track.cueSeconds,
        isCancelled: () => this.generation !== generation,
      });
      this.log(
        'success',
        `Deck ${target.id} preparado y pausado. ${next.warning || 'Vos decidís cuándo mezclar.'}`,
      );
      this.lastAutoError = '';
      return result;
    } catch (error) {
      this.log('error', `Preparación cancelada: ${error.message}`);
      throw error;
    } finally {
      this.pending = false;
      this.onChange();
    }
  }

  async tick() {
    if (!this.auto || this.pending) return;
    try {
      await this.prepare();
    } catch (error) {
      if (error.code === 'STALE') this.cancel();
      if (error.message !== this.lastAutoError) {
        this.log('info', error.message);
        this.lastAutoError = error.message;
      }
    }
  }
}
