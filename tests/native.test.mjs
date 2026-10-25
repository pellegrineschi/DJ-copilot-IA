import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeAdapter } from '../adapters/native/adapter.mjs';
import { NATIVE_BUILD, validateNativeState } from '../adapters/native/protocol.mjs';
import { LibraryDatabase } from '../backend/database.mjs';
import { CopilotApplication } from '../backend/application.mjs';
import { SimulatorAdapter } from '../adapters/simulator.mjs';
import { canRecordAutomatically } from '../core/identity.mjs';

// Wire fixtures ONLY: no test in this file runs Mixxx or confirms a real MP3.
const session = '12345678-1234-1234-1234-123456789abc';
export function nativeDecks() {
  return [1, 2].map((id) => ({
    id,
    available: true,
    revision: 1,
    loaded: id === 1,
    playing: id === 1,
    loading: false,
    path: id === 1 ? '/music/a.mp3' : null,
    title: id === 1 ? 'Título nativo de prueba' : '',
    artist: 'Artista',
    bpm: 96,
    originalBpm: 98,
    duration: 180,
    positionSeconds: 20,
    tempoRatio: 1,
    cueSeconds: 12,
  }));
}
function rig(
  t,
  { provider = 'mixxx-2.5.6', resolveTrack, clock = () => Date.now(), requestTimeout = 2500 } = {},
) {
  const adapter = new NativeAdapter({ start: false, clock, resolveTrack, requestTimeout });
  t.after(() => adapter.close());
  adapter.helloId = 'hello';
  adapter.receive({
    type: 'reply',
    id: 'hello',
    ok: true,
    code: 'HELLO',
    session,
    value: { provider, build: NATIVE_BUILD, protocol: 1, capabilities: { loadByPath: true } },
  });
  const state = (sequence = 1, decks = nativeDecks()) => ({
    type: 'state',
    session,
    sequence,
    sentAt: clock(),
    decks,
    authorizedDeck: 0,
    authorizedUntil: 0,
  });
  return { adapter, state };
}

test('identidad confirmada solo con mensaje nativo válido; vinculación exacta y capacidades cerradas', async (t) => {
  const { adapter, state } = rig(t, {
    resolveTrack: async (path) => (path === '/music/a.mp3' ? { id: 'library-a' } : null),
  });
  adapter.receive(state());
  await new Promise((resolve) => setImmediate(resolve));
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.decks[0].identity.status, 'confirmed');
  assert.equal(snapshot.decks[0].identity.path, '/music/a.mp3');
  assert.equal(snapshot.decks[0].trackId, 'library-a');
  assert.equal(snapshot.decks[0].locked, true);
  assert.equal(snapshot.decks[1].identity.status, 'unknown');
  assert.equal(snapshot.capabilities.loadByPath, false); // Ignores claimed server capability.
  assert.equal(snapshot.capabilities.tempo, false);
  assert.equal(canRecordAutomatically(snapshot, snapshot.decks[0]), true);
  await assert.rejects(adapter.prepare(), /atómica/);
});

test('cliente de producción rechaza el ejecutable fixture y no fabrica identidad', (t) => {
  const { adapter } = rig(t, { provider: 'fixture-only' });
  assert.equal(adapter.snapshot().connected, false);
  assert.match(adapter.snapshot().message, /Fuente nativa/);
  assert.equal(adapter.snapshot().decks[0].identity.status, 'unknown');
});

test('autenticación sin primer estado vence y no deja una conexión aparente', async (t) => {
  const { adapter } = rig(t, { requestTimeout: 15 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(adapter.session, null);
  assert.equal(adapter.snapshot().connected, false);
  assert.match(adapter.snapshot().message, /no entregó un estado/);
});

test('contrato nativo rechaza campos inválidos, repetidos, antiguos, futuros y otra sesión', () => {
  const now = Date.now();
  const state = {
    type: 'state',
    session,
    sequence: 1,
    sentAt: now,
    decks: nativeDecks(),
    authorizedDeck: 0,
    authorizedUntil: 0,
  };
  assert.equal(validateNativeState(state, session, 0, now), true);
  for (const patch of [
    { sequence: 0 },
    { sequence: 1.5 },
    { session: 'otra' },
    { sentAt: now - 2001 },
    { sentAt: now + 251 },
    { authorizedDeck: 3 },
    { authorizedUntil: '100' },
    { decks: [] },
  ])
    assert.equal(validateNativeState({ ...state, ...patch }, session, 0, now), false);
  for (const patch of [
    { id: 2 },
    { revision: -1 },
    { path: '/music/../a.mp3' },
    { path: 'relative.mp3' },
    { loading: true },
    { playing: 'true' },
    { bpm: Infinity },
    { duration: 90000 },
    { cueSeconds: 181 },
    { title: {} },
  ]) {
    const altered = structuredClone(state);
    Object.assign(altered.decks[0], patch);
    assert.equal(validateNativeState(altered, session, 0, now), false, JSON.stringify(patch));
  }
  assert.equal(validateNativeState(state, session, 1, now), false);
});

test('una carga nueva y un resultado de biblioteca tardío no restauran la identidad anterior', async (t) => {
  let resolveOld;
  const { adapter, state } = rig(t, {
    resolveTrack: () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  });
  adapter.receive(state());
  const next = nativeDecks();
  Object.assign(next[0], { revision: 2, path: null, loading: true });
  adapter.receive(state(2, next));
  resolveOld({ id: 'old' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(adapter.snapshot().decks[0].identity.status, 'unknown');
  assert.equal(adapter.snapshot().decks[0].trackId, null);
  assert.equal(adapter.snapshot().decks[1].id, 2);
});

test('vencimiento, error y cancelación limpian identidad y no reenvían operaciones', async (t) => {
  let now = Date.now();
  const { adapter, state } = rig(t, { clock: () => now });
  adapter.receive(state());
  const writes = [];
  adapter.socket = {
    write: (text) => writes.push(JSON.parse(text)),
    removeAllListeners() {},
    destroy() {},
  };
  const pending = adapter.request('inspect', { path: '/music/a.mp3' });
  adapter.cancelPending();
  await assert.rejects(pending, /cancelada/);
  assert.equal(adapter.pending.size, 0);
  assert.equal(adapter.snapshot().decks[0].identity.status, 'unknown');
  now += 3000;
  adapter.tick();
  assert.equal(writes.length, 1);
  await assert.rejects(adapter.request('inspect'), /Sin conexión/);
});

test('ausencia de respuesta produce timeout, cierre y rechazo de ACK tardío', async (t) => {
  const { adapter, state } = rig(t);
  adapter.requestTimeout = 15;
  adapter.receive(state());
  let sent;
  adapter.socket = {
    write: (text) => {
      sent = JSON.parse(text);
    },
    removeAllListeners() {},
    destroy() {},
  };
  await assert.rejects(adapter.request('inspect'), /Timeout/);
  adapter.receive({ type: 'reply', id: sent.id, session, ok: true, value: { prepared: true } });
  assert.equal(adapter.snapshot().connected, false);
  assert.equal(adapter.snapshot().lastCheck, null);
});

test('historial real compartido entre MIDI y nativo conserva separación de simulación', (t) => {
  const db = new LibraryDatabase(':memory:');
  t.after(() => db.close());
  const track = db.addTrack({ title: 'Tema', path: '/music/a.mp3', hash: 'hash' });
  assert.equal(db.getTrackByPath(track.path).id, track.id);
  assert.equal(db.recordPlay('s', track.id, 'midi', { source: 'manual' }), true);
  assert.equal(db.recordPlay('s', track.id, 'native', { source: 'confirmed' }), false);
  assert.equal(db.played('s', 'native').has(track.id), true);
  assert.equal(db.played('s', 'simulation').size, 0);
  assert.equal(db.recordPlay('s', track.id, 'simulation'), true);
  assert.equal(db.history().length, 2);
});

test('aplicación conserva modos anteriores y bloquea automático/preparación nativa', async (t) => {
  const native = new NativeAdapter({ start: false });
  const app = new CopilotApplication({
    adapterFactory: (mode) => (mode === 'native' ? native : new SimulatorAdapter({ clock: false })),
  });
  t.after(() => app.close());
  await app.command('mode', { mode: 'native' });
  await assert.rejects(app.command('auto', { enabled: true }), /atómica/);
  await assert.rejects(app.command('prepare'), /Sin estado/);
  await app.command('cancelPreparation');
  await app.command('mode', { mode: 'simulation' });
  assert.equal(app.snapshot().connection.mode, 'simulation');
  assert.equal(app.engine.auto, false);
});
