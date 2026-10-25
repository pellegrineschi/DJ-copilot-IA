import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { decodeTelemetry, PACKET_LENGTH } from '../adapters/midi/protocol.mjs';
import { MidiMonitorAdapter } from '../adapters/midi/adapter.mjs';
import { PreparationEngine } from '../core/engine.mjs';

function runMapping() {
  const packets = [],
    calls = [];
  const context = {
    engine: {
      getValue: (_group, key) =>
        ({
          track_loaded: 1,
          play: 1,
          duration: 180,
          track_samples: 15876000,
          cue_point: 1058400,
          bpm: 96,
          file_bpm: 98,
          rate: -0.20408163265,
          rateRange: 0.1,
          rate_dir: 1,
          playposition: 0.5,
        })[key] ?? 0,
      isScratching: () => false,
      beginTimer: (interval, callback) => {
        calls.push(['timer', interval]);
        return 9;
      },
      stopTimer: (id) => calls.push(['stop', id]),
      setValue: () => {
        throw new Error('El monitor no puede modificar Mixxx.');
      },
    },
    midi: { sendSysexMsg: (bytes) => packets.push(Array.from(bytes)) },
  };
  runInNewContext(
    readFileSync(new URL('../mixxx/DJ-Copilot-IA-scripts.js', import.meta.url), 'utf8'),
    context,
  );
  context.DJCopilotIA.init();
  return { ...context, packets, calls };
}

test('el script real de Mixxx y el decodificador comparten contrato; solo lecturas', () => {
  const mapping = runMapping();
  assert.equal(mapping.packets.length, 2);
  assert.equal(mapping.packets[0].length, PACKET_LENGTH);
  const deck = decodeTelemetry(mapping.packets[0]);
  assert.equal(deck.id, 1);
  assert.equal(deck.bpm, 96);
  assert.equal(deck.originalBpm, 98);
  assert.equal(deck.duration, 180);
  assert.equal(deck.positionSeconds, 90);
  assert.equal(deck.cueSeconds, 12);
  assert.equal(deck.playing, true);
  assert.equal(deck.locked, true);
  assert.equal(deck.trackId, null);
  assert.equal(decodeTelemetry(mapping.packets[1]).id, 2);
  mapping.DJCopilotIA.shutdown();
  assert.deepEqual(mapping.calls, [
    ['timer', 500],
    ['stop', 9],
  ]);
});

test('descarta SysEx incompleto, otra firma, versión y checksum corruptos', () => {
  const { packets } = runMapping();
  assert.equal(decodeTelemetry([]), null);
  for (const index of [0, 1, 2, 6, 10, 14, 24, 38, 39]) {
    const packet = [...packets[0]];
    packet[index] ^= 1;
    assert.equal(decodeTelemetry(packet), null, `No descartó byte ${index}`);
  }
  assert.equal(decodeTelemetry([...packets[0], 0]), null);
});

test('no anuncia conexión hasta recibir AMBOS decks y caduca a los 2 segundos', (t) => {
  const monitor = new MidiMonitorAdapter({ startBridge: false });
  t.after(() => monitor.close());
  const { packets } = runMapping();
  assert.equal(monitor.snapshot().connected, false);
  monitor.receive(packets[0]);
  assert.equal(monitor.snapshot().connected, false);
  monitor.receive(packets[1]);
  assert.equal(monitor.snapshot().connected, true);
  assert.equal(monitor.snapshot().capabilities.loadByPath, false);
  monitor.received[0] = Date.now() - 2500;
  assert.equal(monitor.snapshot().connected, false);
});

test('los paquetes idénticos no renuevan la fecha de recepción', (t) => {
  const monitor = new MidiMonitorAdapter({ startBridge: false });
  t.after(() => monitor.close());
  const { packets } = runMapping();
  const now = Date.now();
  monitor.receive(packets[0], now);
  assert.equal(monitor.receive(packets[0], now + 500), false);
  assert.equal(monitor.receive(packets[0], now + 3000), false);
  assert.equal(monitor.received[0], now);
});

test('MIDI no puede preparar ni activar automatización aunque esté conectado', async (t) => {
  const monitor = new MidiMonitorAdapter({ startBridge: false });
  t.after(() => monitor.close());
  const { packets } = runMapping();
  packets.forEach((p) => monitor.receive(p));
  const engine = new PreparationEngine({
    adapter: monitor,
    getQueue: () => [],
    getPlayed: () => new Set(),
    log: () => {},
  });
  assert.throws(() => engine.setAuto(true), /solo lectura/);
  await assert.rejects(engine.prepare(), /no disponible/);
  await assert.rejects(monitor.prepare(), /solo lectura/);
});

test('el mapeo v1 mantiene números y declara identidad desconocida sin habilitar asociación', (t) => {
  const monitor = new MidiMonitorAdapter({ startBridge: false });
  t.after(() => monitor.close());
  const { packets } = runMapping();
  packets.forEach((packet) => monitor.receive(packet));
  const state = monitor.snapshot();
  assert.equal(state.connected, true);
  assert.equal(state.decks[0].bpm, 96);
  assert.equal(state.decks[0].identity.status, 'unknown');
  assert.equal(state.decks[0].canAssociate, false);
  assert.equal(state.capabilities.manualIdentity, false);
  assert.match(state.decks[0].associationReason, /Mapeo v1/);
});
