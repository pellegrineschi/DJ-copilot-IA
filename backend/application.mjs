import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { LibraryDatabase } from './database.mjs';
import { importFolder, hashFile } from './library.mjs';
import { demoTracks } from './demo.mjs';
import { SimulatorAdapter } from '../adapters/simulator.mjs';
import { MidiMonitorAdapter } from '../adapters/midi/adapter.mjs';
import { PreparationEngine } from '../core/engine.mjs';
import { estimateSet } from '../core/recommendations.mjs';
import { canRecordAutomatically } from '../core/identity.mjs';

export class CopilotApplication extends EventEmitter {
  constructor({ databasePath, adapterFactory } = {}) {
    super();
    this.db = new LibraryDatabase(databasePath || ':memory:');
    this.adapterFactory =
      adapterFactory ||
      ((mode) => (mode === 'simulation' ? new SimulatorAdapter() : new MidiMonitorAdapter()));
    this.playlistId = this.db.getSetting('playlistId', 'default');
    if (!this.db.playlists().some((p) => p.id === this.playlistId)) this.playlistId = 'default';
    this.sessionId = this.db.getSetting('sessionId', randomUUID());
    this.db.setSetting('sessionId', this.sessionId);
    this.plan = this.db.getSetting('plan', { hours: 4, songSeconds: 120, overlapSeconds: 14 });
    this.importing = false;
    this.importProgress = null;
    this.closed = false;
    this.installAdapter('simulation'); // Always start with automation OFF and no live control.
    this.log('info', 'Sesión abierta en simulación. La preparación automática está desactivada.');
  }

  installAdapter(mode) {
    this.engine?.cancel();
    this.adapter?.close();
    this.adapter = this.adapterFactory(mode);
    this.engine = new PreparationEngine({
      adapter: this.adapter,
      getQueue: () =>
        this.db.queue(this.playlistId).filter((t) => mode === 'simulation' || !t.isDemo),
      getPlayed: () => this.db.played(this.sessionId, mode),
      log: (level, text) => this.log(level, text),
      onChange: () => this.notify(),
    });
    this.engine.safeMode = this.db.getSetting('safeMode', true);
    this.engine.maxTempoPercent = this.db.getSetting('maxTempoPercent', 4);
    let lastMidiMessage = null;
    this.adapter.on('state', (state) => {
      if (state.mode === 'midi' && state.message !== lastMidiMessage) {
        lastMidiMessage = state.message;
        this.log('info', `MIDI: ${state.message}`);
      }
      let changed = false;
      // A manual association is an assertion by the DJ, never automatic confirmation.
      const played = this.db.played(this.sessionId, state.mode);
      for (const deck of state.decks) {
        if (canRecordAutomatically(state, deck) && !played.has(deck.trackId)) {
          changed =
            this.db.recordPlay(this.sessionId, deck.trackId, state.mode, {
              source: state.mode === 'simulation' ? 'simulation' : 'confirmed',
              deckId: deck.id,
            }) || changed;
        }
      }
      if (!state.connected && this.engine.auto) {
        this.engine.cancel();
        this.log('error', 'Conexión perdida: automatización desactivada.');
      }
      this.notify(changed);
      void this.engine.tick();
    });
  }

  log(level, message) {
    if (this.closed) return;
    this.db.log(level, message);
    this.notify(true);
  }
  notify(full = false) {
    if (this.closed) return;
    this.dirty = this.dirty || full;
    if (this.notificationScheduled) return;
    this.notificationScheduled = true;
    queueMicrotask(() => {
      this.notificationScheduled = false;
      if (this.closed) return;
      const state = this.snapshot(!this.dirty);
      this.dirty = false;
      this.emit('state', state);
    });
  }
  snapshot(liveOnly = false) {
    const mode = this.adapter.snapshot().mode;
    const state = {
      connection: this.adapter.snapshot(),
      engine: {
        auto: this.engine.auto,
        safeMode: this.engine.safeMode,
        pending: this.engine.pending,
        maxTempoPercent: this.engine.maxTempoPercent,
      },
      recommendation: this.engine.selection(),
      importProgress: this.importProgress,
      importing: this.importing,
      sessionId: this.sessionId,
    };
    if (!liveOnly)
      Object.assign(state, {
        tracks: this.db.tracks({ includeDemo: mode === 'simulation' }),
        queue: this.db.queue(this.playlistId).filter((t) => mode === 'simulation' || !t.isDemo),
        playlists: this.db.playlists(),
        playlistId: this.playlistId,
        playedIds: [...this.db.played(this.sessionId, mode)],
        history: this.db.history(),
        events: this.db.events(),
        plan: estimateSet(this.plan),
      });
    return state;
  }

  simulation() {
    if (this.adapter.snapshot().mode !== 'simulation')
      throw new Error('Esta acción solo está disponible en el simulador.');
  }
  async import(directory) {
    if (this.importing) throw new Error('Ya se está importando una carpeta.');
    this.importing = true;
    this.importProgress = { scanned: 0, imported: 0, duplicates: 0, failed: 0 };
    this.notify();
    try {
      const report = await importFolder(directory, this.db, (progress) => {
        this.importProgress = progress;
        this.notify();
      });
      this.importProgress = report;
      this.log(
        'success',
        `Importación: ${report.imported} nuevas, ${report.duplicates} duplicadas y ${report.failed} con errores.`,
      );
      return report;
    } finally {
      this.importing = false;
      this.notify(true);
    }
  }

  async command(action, payload = {}) {
    if (
      typeof action !== 'string' ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    )
      throw new Error('Comando inválido.');
    switch (action) {
      case 'mode': {
        if (!['simulation', 'midi'].includes(payload.mode)) throw new Error('Modo inválido.');
        if (this.engine.pending)
          throw new Error('Esperá a que finalice la preparación antes de cambiar de modo.');
        this.installAdapter(payload.mode);
        this.log(
          'info',
          payload.mode === 'midi'
            ? 'Monitor MIDI seleccionado. No envía comandos a Mixxx.'
            : 'Simulador seleccionado. No reproduce audio.',
        );
        break;
      }
      case 'auto':
        this.engine.setAuto(payload.enabled);
        void this.engine.tick();
        break;
      case 'safeMode': {
        if (typeof payload.enabled !== 'boolean') throw new Error('Modo seguro inválido.');
        this.engine.cancel();
        this.engine.safeMode = payload.enabled;
        this.db.setSetting('safeMode', payload.enabled);
        this.log(
          'info',
          payload.enabled
            ? 'Modo seguro: exige CUE guardado.'
            : 'CUE opcional. Las protecciones de los decks siguen activas.',
        );
        break;
      }
      case 'tempoLimit': {
        if (!Number.isFinite(payload.percent) || payload.percent < 1 || payload.percent > 8)
          throw new Error('El límite debe estar entre 1 y 8 %.');
        this.engine.cancel();
        this.engine.maxTempoPercent = payload.percent;
        this.db.setSetting('maxTempoPercent', payload.percent);
        break;
      }
      case 'prepare':
        return this.engine.prepare();
      case 'skip':
        this.engine.skip();
        break;
      case 'restoreSkipped':
        this.engine.skipped.clear();
        break;
      case 'track.update': {
        this.engine.cancel();
        const track = this.db.updateTrack(payload.id, payload.patch || {});
        this.adapter.updateLinkedTrack?.(track);
        break;
      }
      case 'identity.associate': {
        const adapter = this.adapter;
        if (adapter.snapshot().mode !== 'midi' || !adapter.assertAssociationContext)
          throw new Error('La asociación corresponde a decks reales con mapeo v2.');
        adapter.assertAssociationContext(payload.deckId, payload.token);
        if (payload.checkedInMixxx !== true)
          throw new Error('Comprobá en Mixxx que elegiste el archivo correcto.');
        const track =
          typeof payload.trackId === 'string' ? this.db.getTrack(payload.trackId) : null;
        if (!track || track.isDemo || !track.path || !track.hash)
          throw new Error('Elegí un MP3 real importado en la biblioteca.');
        let hash;
        try {
          hash = await hashFile(track.path);
        } catch {
          throw new Error(
            'El archivo de la biblioteca ya no está disponible. Revisá su ubicación.',
          );
        }
        if (hash !== track.hash)
          throw new Error(
            'El archivo cambió desde la importación. Volvé a importarlo desde una ubicación nueva.',
          );
        if (this.closed || this.adapter !== adapter)
          throw new Error('La conexión cambió durante la asociación. Volvé a comprobar el deck.');
        // Recheck after disk I/O: a load, timeout or another dialog revokes the token.
        adapter.associate(payload.deckId, this.db.getTrack(track.id), payload.token);
        this.log(
          'info',
          `Deck ${payload.deckId}: asociación manual con ${track.artist} — ${track.title}. La ruta no fue confirmada por Mixxx.`,
        );
        break;
      }
      case 'identity.clear': {
        if (this.adapter.snapshot().mode !== 'midi')
          throw new Error('Acción exclusiva del monitor MIDI.');
        this.adapter.clearAssociation(payload.deckId, payload.token);
        this.log('info', `Deck ${payload.deckId}: asociación manual eliminada.`);
        break;
      }
      case 'identity.record': {
        if (this.adapter.snapshot().mode !== 'midi')
          throw new Error('Acción exclusiva del monitor MIDI.');
        const deck = this.adapter.assertAssociationContext(payload.deckId, payload.token);
        if (!deck.playing || deck.identity.status !== 'manual' || !deck.trackId)
          throw new Error(
            'Solo podés registrar un deck reproduciendo con asociación manual vigente.',
          );
        const added = this.db.recordPlay(this.sessionId, deck.trackId, 'midi', {
          source: 'manual',
          deckId: deck.id,
          loadToken: `${deck.bridgeSession}:${deck.loadGeneration}`,
        });
        if (added)
          this.log('info', `Reproducción declarada manualmente: ${deck.artist} — ${deck.title}.`);
        break;
      }
      case 'queue.set':
        this.engine.cancel();
        this.db.setQueue(this.playlistId, payload.ids);
        break;
      case 'queue.add': {
        this.engine.cancel();
        const ids = this.db.queue(this.playlistId).map((t) => t.id);
        if (!ids.includes(payload.id)) this.db.setQueue(this.playlistId, [...ids, payload.id]);
        break;
      }
      case 'playlist.create': {
        this.engine.cancel();
        this.playlistId = this.db.createPlaylist(payload.name);
        this.db.setSetting('playlistId', this.playlistId);
        this.engine.skipped.clear();
        break;
      }
      case 'playlist.select': {
        this.db.assertPlaylist(payload.id);
        this.engine.cancel();
        this.playlistId = payload.id;
        this.db.setSetting('playlistId', this.playlistId);
        this.engine.skipped.clear();
        break;
      }
      case 'selectNext': {
        const track = this.db.getTrack(payload.id);
        if (!track || (track.isDemo && this.adapter.snapshot().mode !== 'simulation'))
          throw new Error('Tema no disponible.');
        if (this.db.played(this.sessionId, this.adapter.snapshot().mode).has(track.id))
          throw new Error('Este tema ya sonó en la sesión. Creá una sesión nueva para repetirlo.');
        this.engine.cancel();
        this.engine.skipped.delete(track.id);
        const ids = this.db
          .queue(this.playlistId)
          .map((t) => t.id)
          .filter((id) => id !== track.id);
        this.db.setQueue(this.playlistId, [track.id, ...ids]);
        break;
      }
      case 'plan':
        this.plan = estimateSet(payload);
        this.db.setSetting('plan', this.plan);
        break;
      case 'session.new': {
        if (this.adapter.snapshot().decks.some((d) => d.playing) || this.engine.pending)
          throw new Error('Detené el simulador o terminá la sesión en Mixxx antes de crear otra.');
        this.engine.cancel();
        this.sessionId = randomUUID();
        this.db.setSetting('sessionId', this.sessionId);
        this.engine.skipped.clear();
        this.log('info', 'Nueva sesión. El historial anterior se conserva.');
        break;
      }
      case 'sim.load': {
        this.simulation();
        this.engine.cancel();
        const track = this.db.getTrack(payload.trackId);
        if (!track) throw new Error('Canción no encontrada.');
        if (track.path) await access(track.path);
        this.adapter.loadManual(payload.deckId, track);
        break;
      }
      case 'sim.play':
        this.simulation();
        this.adapter.setPlaying(payload.deckId, payload.playing);
        break;
      case 'sim.lock':
        this.simulation();
        this.adapter.lock(payload.deckId, payload.locked);
        break;
      case 'sim.release':
        this.simulation();
        this.adapter.release(payload.deckId);
        break;
      case 'sim.transition':
        this.simulation();
        this.adapter.transition();
        break;
      case 'demo': {
        this.simulation();
        if (this.adapter.snapshot().decks.some((d) => d.playing) || this.engine.pending)
          throw new Error('Detené el simulador antes de iniciar el escenario de prueba.');
        this.engine.cancel();
        this.engine.skipped.clear();
        demoTracks.forEach((t) => this.db.addTrack(t));
        let id = this.db.getSetting('demoPlaylist', null);
        if (!id) {
          id = this.db.createPlaylist('Escenario de prueba · 3 temas');
          this.db.setSetting('demoPlaylist', id);
        }
        this.db.setQueue(
          id,
          demoTracks.map((t) => t.id),
        );
        this.playlistId = id;
        this.db.setSetting('playlistId', id);
        this.sessionId = randomUUID();
        this.db.setSetting('sessionId', this.sessionId);
        this.adapter.loadManual(1, this.db.getTrack(demoTracks[0].id));
        this.adapter.decks[0].owner = 'copilot';
        this.adapter.lock(1, false);
        this.adapter.release(2);
        this.adapter.setPlaying(1, true);
        this.log(
          'info',
          'DEMO: nombres del escenario solicitado; BPM, duración y CUE ficticios. No hay MP3 ni audio.',
        );
        break;
      }
      default:
        throw new Error('Acción no admitida.');
    }
    this.notify(true);
    return { ok: true };
  }
  close() {
    this.closed = true;
    this.engine.cancel();
    this.adapter.close();
    this.db.close();
  }
}
