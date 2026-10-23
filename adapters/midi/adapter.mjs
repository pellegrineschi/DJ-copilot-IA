import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { emptyDeck } from '../simulator.mjs';
import { decodeTelemetry } from './protocol.mjs';

export class MidiMonitorAdapter extends EventEmitter {
  constructor({ startBridge = true } = {}) {
    super();
    this.decks = [emptyDeck(1), emptyDeck(2)];
    this.received = [0, 0];
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
        if (event.type === 'ready')
          this.message = `Puerto ALSA ${event.address} listo. Activá el mapeo en Mixxx.`;
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
    this.emit('state', this.snapshot());
  }
  receive(bytes, now = Date.now()) {
    const d = decodeTelemetry(bytes);
    if (!d) return false;
    const previous = this.decks[d.id - 1];
    // Identical repeated packets never renew freshness.
    if (previous.sequence === d.sequence) return false;
    this.decks[d.id - 1] = { ...d, revision: previous.revision + 1 };
    this.received[d.id - 1] = now;
    this.message = 'Telemetría MIDI real · solo lectura';
    this.emit('state', this.snapshot());
    return true;
  }
  snapshot() {
    const receivedAt = Math.min(...this.received);
    const connected = !this.closed && this.received.every((t) => t > 0 && Date.now() - t <= 2000);
    return {
      mode: 'midi',
      connected,
      receivedAt,
      capabilities: {
        telemetry: true,
        trackIdentity: false,
        loadByPath: false,
        tempo: false,
        cue: false,
      },
      message:
        !connected && receivedAt
          ? 'Telemetría vencida. Reconectá el puente y comprobá el mapeo.'
          : this.message,
      decks: structuredClone(this.decks),
    };
  }
  async prepare() {
    throw new Error(
      'El adaptador MIDI v1 es de solo lectura. No admite preparación ni comandos de reproducción.',
    );
  }
  close() {
    this.closed = true;
    clearInterval(this.timer);
    this.reader?.close();
    this.child?.kill();
    this.removeAllListeners();
  }
}
