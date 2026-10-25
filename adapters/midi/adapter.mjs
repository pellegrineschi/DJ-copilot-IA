import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { emptyDeck } from '../simulator.mjs';
import { decodeTelemetry, TELEMETRY_MAX_AGE_MS } from './protocol.mjs';
import { manualIdentity, unknownIdentity } from '../../core/identity.mjs';

export class MidiMonitorAdapter extends EventEmitter {
  constructor({ startBridge = true, clock = () => Date.now() } = {}) {
    super();
    this.clock = clock;
    this.decks = [emptyDeck(1), emptyDeck(2)];
    this.received = [0, 0];
    this.identities = [unknownIdentity(), unknownIdentity()];
    this.tokens = [randomUUID(), randomUUID()];
    this.settledSince = [0, 0];
    this.samples = [0, 0];
    this.expired = [true, true];
    this.bridgeSession = null;
    this.retiredSessions = new Set();
    this.message = 'Esperando el puerto ALSA y el mapeo DJ Copilot IA.';
    this.closed = false;
    if (startBridge) this.start();
    this.timer = setInterval(() => this.emit('state', this.snapshot()), 500);
  }
  start() {
    this.child = spawn(
      'python3',
      ['-u', fileURLToPath(new URL('./alsa_bridge.py', import.meta.url))],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.reader = createInterface({ input: this.child.stdout });
    this.reader.on('line', (line) => {
      if (line.length > 20000 || this.closed) return;
      try {
        const event = JSON.parse(line);
        if (event.type === 'midi') this.receive(event.bytes);
        if (event.type === 'ready') {
          this.message = `Puerto ALSA ${event.address} listo. Activá el mapeo en Mixxx.`;
          this.emit('state', this.snapshot());
        }
        if (event.type === 'error') this.fail(event.message);
      } catch {
        /* Untrusted or incomplete serial input is discarded. */
      }
    });
    this.child.stderr.on('data', () => {}); // Detailed ALSA failure is reported as structured JSON.
    this.child.on('error', (error) => this.fail(`No se pudo iniciar el puente: ${error.message}`));
    this.child.on('exit', (code) => {
      if (!this.closed && !this.failure)
        this.fail(`Puente ALSA detenido (${code ?? 'señal'}). Revisá /dev/snd/seq y reconectá.`);
    });
  }
  fail(message) {
    this.failure = true;
    this.received = [0, 0];
    this.message = message;
    this.invalidateAll('Se perdió la conexión. Volvé a comprobar la canción en Mixxx.');
    this.emit('state', this.snapshot());
  }
  invalidate(index, reason) {
    this.identities[index] = unknownIdentity(reason);
    this.tokens[index] = randomUUID();
  }
  invalidateAll(reason) {
    for (let i = 0; i < 2; i++) {
      this.invalidate(i, reason);
      this.expired[i] = true;
      this.samples[i] = 0;
      this.settledSince[i] = 0;
    }
  }
  expire(now) {
    for (let i = 0; i < 2; i++) {
      if (
        !this.expired[i] &&
        (now - this.received[i] > TELEMETRY_MAX_AGE_MS || now < this.received[i])
      ) {
        this.invalidate(i, 'Telemetría vencida. La asociación anterior fue descartada.');
        this.expired[i] = true;
        this.samples[i] = 0;
      }
    }
  }
  receive(bytes, now = this.clock()) {
    if (this.closed || this.failure) return false;
    const d = decodeTelemetry(bytes);
    if (!d) return false;
    this.expire(now);
    if (d.protocolVersion === 2) {
      // Both processes run on this Ubuntu host. Reject delayed/replayed data,
      // including packets that arrive after a temporary disconnection.
      if (now - d.sentAt > TELEMETRY_MAX_AGE_MS || d.sentAt - now > 250) return false;
      if (this.retiredSessions.has(d.bridgeSession)) return false;
      if (this.bridgeSession !== d.bridgeSession) {
        if (this.bridgeSession !== null) this.retiredSessions.add(this.bridgeSession);
        this.bridgeSession = d.bridgeSession;
        this.invalidateAll('El mapeo se inició o reinició. Comprobá la identidad del tema.');
        this.received = [0, 0];
        this.decks = [emptyDeck(1), emptyDeck(2)];
      }
    } else if (this.bridgeSession !== null) {
      this.retiredSessions.add(this.bridgeSession);
      this.bridgeSession = null;
      this.invalidateAll('Mapeo v1: solo telemetría. Activá el mapeo v2 para asociar canciones.');
      this.received = [0, 0];
      this.decks = [emptyDeck(1), emptyDeck(2)];
    }
    // Bound memory even across repeated manual restarts.
    if (this.retiredSessions.size > 128)
      this.retiredSessions.delete(this.retiredSessions.values().next().value);
    const index = d.id - 1;
    const previous = this.decks[index];
    if (d.protocolVersion === 2 && previous.protocolVersion === 2) {
      if (
        d.sequence <= previous.sequence ||
        d.loadGeneration < previous.loadGeneration ||
        d.sentAt < previous.sentAt
      )
        return false;
    } else if (previous.protocolVersion === 1) {
      const delta = (d.sequence - previous.sequence + 16384) % 16384;
      if (!delta || (delta >= 8192 && !this.expired[index])) return false;
    }
    const changed =
      this.expired[index] ||
      previous.protocolVersion !== d.protocolVersion ||
      previous.loadGeneration !== d.loadGeneration ||
      previous.loaded !== d.loaded ||
      previous.loadEvents !== d.loadEvents;
    if (changed) {
      this.invalidate(
        index,
        d.loaded ? 'Se detectó una nueva carga. Volvé a asociar el tema.' : 'El deck se vació.',
      );
      this.settledSince[index] = now;
      this.samples[index] = 0;
    }
    this.samples[index]++;
    this.expired[index] = false;
    this.decks[index] = { ...d, revision: previous.revision + 1 };
    // A delayed packet must not gain a fresh two-second lifetime on arrival.
    this.received[index] = d.protocolVersion === 2 ? Math.min(now, d.sentAt) : now;
    this.message = `Telemetría MIDI v${d.protocolVersion} real · solo lectura`;
    this.emit('state', this.snapshot());
    return true;
  }
  snapshot() {
    const now = this.clock();
    this.expire(now);
    const receivedAt = Math.min(...this.received);
    const fresh = this.received.map(
      (t) => !this.closed && !this.failure && t > 0 && now >= t && now - t <= TELEMETRY_MAX_AGE_MS,
    );
    const connected = fresh.every(Boolean);
    const loadEvents = this.decks.every(
      (d) => d.protocolVersion === 2 && d.loadEvents && d.bridgeSession === this.bridgeSession,
    );
    const decks = this.decks.map((d, i) => {
      const canAssociate =
        connected &&
        loadEvents &&
        d.loaded &&
        this.samples[i] >= 2 &&
        now - this.settledSince[i] >= 500;
      let associationReason = this.identities[i].reason;
      if (!fresh[i]) associationReason = 'Sin datos recientes de este deck.';
      else if (d.protocolVersion !== 2)
        associationReason = 'Mapeo v1: activá el mapeo v2 para asociar canciones.';
      else if (!loadEvents) associationReason = 'Esperando eventos de carga v2 de ambos decks.';
      else if (!d.loaded) associationReason = 'Primero cargá una canción en Mixxx.';
      else if (!canAssociate) associationReason = 'Esperando a que se estabilice la carga.';
      const identity = fresh[i] ? this.identities[i] : unknownIdentity(associationReason);
      return {
        ...d,
        fresh: fresh[i],
        identity,
        canAssociate,
        associationReason,
        identityToken: canAssociate ? this.tokens[i] : null,
        trackId: identity.trackId,
        title:
          identity.status === 'manual' ? identity.title : d.loaded ? 'Identidad desconocida' : null,
        artist:
          identity.status === 'manual'
            ? identity.artist
            : d.loaded
              ? 'Consultá la canción en Mixxx'
              : null,
      };
    });
    return {
      mode: 'midi',
      connected,
      receivedAt,
      capabilities: {
        telemetry: true,
        trackIdentity: false,
        manualIdentity: loadEvents,
        loadEvents,
        loadByPath: false,
        tempo: false,
        cue: false,
      },
      message:
        !connected && receivedAt
          ? 'Telemetría vencida. Reconectá el puente y comprobá el mapeo.'
          : this.message,
      automationReason:
        'Carga real deshabilitada: no hay una interfaz verificada de carga por ruta con confirmación de archivo.',
      decks: structuredClone(decks),
    };
  }
  assertAssociationContext(id, expectedToken) {
    const state = this.snapshot();
    const deck = state.decks.find((d) => d.id === id);
    if (!deck || !deck.canAssociate || !expectedToken || deck.identityToken !== expectedToken) {
      throw new Error(
        'El deck cambió o no tiene eventos de carga recientes. Volvé a abrir la asociación y comprobar el tema.',
      );
    }
    return deck;
  }
  associate(id, track, expectedToken) {
    const deck = this.assertAssociationContext(id, expectedToken);
    this.identities[id - 1] = manualIdentity(track, deck.loadGeneration, this.clock());
    this.tokens[id - 1] = randomUUID(); // Also cancels competing or stale dialogs.
    this.emit('state', this.snapshot());
  }
  clearAssociation(id, expectedToken) {
    this.assertAssociationContext(id, expectedToken);
    this.invalidate(id - 1, 'Asociación quitada por vos. La identidad vuelve a ser desconocida.');
    this.emit('state', this.snapshot());
  }
  updateLinkedTrack(track) {
    this.identities = this.identities.map((identity) =>
      identity.status === 'manual' && identity.trackId === track.id
        ? { ...identity, title: track.title, artist: track.artist }
        : identity,
    );
  }
  async prepare() {
    throw new Error(
      'El adaptador MIDI es de solo lectura. Asociar una canción no habilita cargas ni comandos de reproducción.',
    );
  }
  close() {
    this.closed = true;
    this.invalidateAll('Conexión cerrada.');
    clearInterval(this.timer);
    this.reader?.close();
    this.child?.kill();
    this.removeAllListeners();
  }
}
