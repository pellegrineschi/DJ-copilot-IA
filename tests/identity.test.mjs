import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { CopilotApplication } from '../backend/application.mjs';
import { LibraryDatabase } from '../backend/database.mjs';
import { SimulatorAdapter } from '../adapters/simulator.mjs';
import { MidiMonitorAdapter } from '../adapters/midi/adapter.mjs';
import { decodeTelemetry, V2_PACKET_LENGTH } from '../adapters/midi/protocol.mjs';
import { canRecordAutomatically } from '../core/identity.mjs';
import { mappingFixture } from './midi-fixture.mjs';
import { mp3Fixture } from './helpers.mjs';

const track = {
  id: 'uuid-a',
  path: '/music/a.mp3',
  hash: 'sha-a',
  title: 'Canción A',
  artist: 'Artista A',
};
function rig(t, options = {}) {
  let now = Date.now() - 500;
  const monitor = new MidiMonitorAdapter({ startBridge: false, clock: () => now });
  t.after(() => monitor.close());
  const source = mappingFixture({ clock: () => now, ...options });
  source.flush(monitor);
  const advance = (ms = 500) => {
    now += ms;
    source.mapping.tick();
    source.flush(monitor);
  };
  advance();
  const deck = (id = 1) => monitor.snapshot().decks[id - 1];
  const associate = (id = 1, song = track) => monitor.associate(id, song, deck(id).identityToken);
  return {
    monitor,
    source,
    advance,
    deck,
    associate,
    clock: () => now,
    elapse: (ms) => {
      now += ms;
    },
  };
}

test('mapeo v2 real: ambas cargas, conexión, telemetría y procedencia manual sin comandos', (t) => {
  const r = rig(t);
  assert.equal(r.monitor.snapshot().connected, true);
  assert.equal(r.deck().canAssociate, true);
  assert.equal(r.deck().identity.status, 'unknown');
  r.associate();
  const d = r.deck();
  assert.equal(d.identity.status, 'manual');
  assert.equal(d.identity.path, track.path);
  assert.equal(d.trackId, track.id);
  assert.equal(d.title, track.title);
  assert.equal(d.bpm, 96);
  assert.equal(d.duration, 180);
  assert.equal(d.locked, true);
  assert.equal(d.owner, 'manual');
  assert.equal(r.deck(2).identity.status, 'unknown');
  assert.equal(r.monitor.snapshot().capabilities.loadByPath, false);
  assert.equal(r.monitor.snapshot().capabilities.trackIdentity, false);
});

test('cada evento 1→1 invalida la identidad aunque BPM, duración y posición sean idénticos', (t) => {
  const r = rig(t);
  r.associate();
  r.associate(2, { ...track, id: 'uuid-b', hash: 'sha-b' });
  const old = r.deck(),
    otherToken = r.deck(2).identityToken;
  r.source.load(1);
  r.source.flush(r.monitor);
  const next = r.deck();
  assert.equal(next.bpm, old.bpm);
  assert.equal(next.duration, old.duration);
  assert.equal(next.identity.status, 'unknown');
  assert.equal(next.trackId, null);
  assert.equal(next.canAssociate, false);
  assert.equal(r.deck(2).identityToken, otherToken);
  assert.equal(r.deck(2).identity.status, 'manual');
  assert.throws(() => r.monitor.associate(1, track, old.identityToken), /deck cambió/);
  r.advance();
  r.associate();
  assert.equal(r.deck().identity.loadGeneration, 2);
});

test('seek, pausa, tempo y reproducción conservan asociación; eject la descarta', (t) => {
  const r = rig(t);
  r.associate();
  const token = r.deck().identityToken;
  Object.assign(r.source.values[0], { play: 1, bpm: 102, playposition: 0.75 });
  r.advance();
  assert.equal(r.deck().identityToken, token);
  assert.equal(r.deck().playing, true);
  r.source.values[0].play = 0;
  r.advance();
  assert.equal(r.deck().identity.status, 'manual');
  r.source.load(1, { track_loaded: 0 });
  r.source.flush(r.monitor);
  assert.equal(r.deck().identity.status, 'unknown');
  assert.equal(r.deck().loaded, false);
  assert.equal(r.deck().canAssociate, false);
});

test('desconexión, datos antiguos y reinicio requieren nueva asociación', (t) => {
  const r = rig(t);
  r.associate();
  const token = r.deck().identityToken;
  r.source.mapping.tick();
  const stale = r.source.packets.splice(0);
  r.elapse(2100);
  assert.equal(r.monitor.snapshot().connected, false);
  assert.equal(r.deck().identity.status, 'unknown');
  assert.equal(r.monitor.receive(stale[0]), false);
  r.advance();
  assert.equal(r.deck().canAssociate, false);
  r.advance();
  assert.equal(r.deck().canAssociate, true);
  assert.throws(() => r.monitor.associate(1, track, token), /deck cambió/);
  r.associate();
  const oldBoot = r.deck().bridgeSession;
  r.source.mapping.init();
  r.source.flush(r.monitor);
  assert.notEqual(r.deck().bridgeSession, oldBoot);
  assert.equal(r.deck().identity.status, 'unknown');
  assert.equal(r.monitor.receive(stale[0]), false);
});

test('duplicados, mensajes fuera de orden, parciales, corruptos y fechas futuras no renuevan datos', (t) => {
  const r = rig(t);
  r.source.mapping.tick();
  const packets = r.source.packets.splice(0);
  assert.equal(packets[0].length, V2_PACKET_LENGTH);
  assert.equal(r.monitor.receive(packets[0]), true);
  const received = r.monitor.received[0];
  r.elapse(100);
  assert.equal(r.monitor.receive(packets[0]), false);
  assert.equal(r.monitor.receive(packets[0].slice(0, -1)), false);
  for (const index of [0, 6, 7, 8, 32, 39, 43, 49, 53, 54]) {
    const corrupt = [...packets[0]];
    corrupt[index] ^= 1;
    assert.equal(decodeTelemetry(corrupt), null);
  }
  r.source.mapping.tick();
  const newer = r.source.packets.splice(0);
  r.monitor.receive(newer[0]);
  assert.equal(r.monitor.receive(packets[0]), false);
  assert.equal(r.monitor.received[0], received + 100);
  const future = mappingFixture({ clock: () => r.clock() + 1000 });
  assert.equal(r.monitor.receive(future.packets[0]), false);
});

test('un paquete demorado caduca desde su emisión, no recibe dos segundos extra al llegar', (t) => {
  const r = rig(t);
  r.associate();
  r.source.mapping.tick();
  const packets = r.source.packets.splice(0);
  r.elapse(1800);
  assert.equal(r.monitor.receive(packets[0]), true);
  assert.equal(r.monitor.receive(packets[1]), true);
  assert.equal(r.monitor.snapshot().connected, true);
  r.elapse(250);
  assert.equal(r.monitor.snapshot().connected, false);
  assert.equal(r.deck().identity.status, 'unknown');
});

test('pérdida de un evento MIDI se recupera por la generación en el siguiente latido', (t) => {
  const r = rig(t);
  r.associate();
  r.source.load(1);
  r.source.packets.length = 0; // Drop the event packet, not the generation.
  r.advance();
  assert.equal(r.deck().identity.status, 'unknown');
  assert.equal(r.deck().loadGeneration, 2);
});

test('sin conexión track_loaded o con un solo deck no permite asociar; puede recuperarse', (t) => {
  const r = rig(t, { connectionAvailable: false });
  assert.equal(r.monitor.snapshot().connected, true);
  assert.equal(r.deck().canAssociate, false);
  assert.throws(() => r.associate(), /deck cambió/);
  const good = mappingFixture({ clock: r.clock });
  good.mapping.session += 1;
  good.packets.length = 0;
  good.mapping.tick();
  r.monitor.receive(good.packets.shift());
  assert.equal(r.monitor.snapshot().connected, false);
  assert.equal(r.deck().canAssociate, false);
  good.flush(r.monitor);
  r.elapse(500);
  good.mapping.tick();
  good.flush(r.monitor);
  assert.equal(r.deck().canAssociate, true);
});

test('pérdida del seguimiento invalida asociación; fallo del puente no acepta más paquetes', (t) => {
  const r = rig(t);
  r.associate();
  r.source.connections[0].disconnect();
  r.advance();
  assert.equal(r.deck().identity.status, 'unknown');
  assert.equal(r.deck().canAssociate, false);
  r.monitor.fail('Prueba de error ALSA');
  r.source.mapping.tick();
  assert.equal(r.monitor.receive(r.source.packets[0]), false);
  assert.equal(r.monitor.snapshot().connected, false);
  const replacement = new MidiMonitorAdapter({ startBridge: false, clock: r.clock });
  t.after(() => replacement.close());
  r.source.mapping.init();
  r.source.flush(replacement);
  assert.equal(replacement.snapshot().connected, true);
  assert.equal(replacement.snapshot().decks[0].identity.status, 'unknown');
});

test('asociación no genera confirmación automática ni admite DEMO; los tokens son de un solo uso', (t) => {
  const r = rig(t);
  assert.throws(() => r.associate(1, { ...track, isDemo: true }), /DEMO/);
  const token = r.deck().identityToken;
  r.associate();
  assert.throws(() => r.monitor.associate(1, track, token), /deck cambió/);
  const state = r.monitor.snapshot();
  assert.equal(canRecordAutomatically(state, { ...r.deck(), playing: true }), false);
  assert.equal(
    canRecordAutomatically(
      { ...state, capabilities: { trackIdentity: true } },
      { ...r.deck(), playing: true, identity: { status: 'confirmed' } },
    ),
    true,
  );
  r.monitor.clearAssociation(1, r.deck().identityToken);
  assert.equal(r.deck().trackId, null);
});

async function applicationRig(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dj-identity-'));
  const file = join(dir, 'real-import-fixture.mp3');
  await writeFile(file, mp3Fixture('Archivo importado de prueba'));
  const r = rig(t);
  const app = new CopilotApplication({
    adapterFactory: (mode) =>
      mode === 'midi' ? r.monitor : new SimulatorAdapter({ clock: false }),
  });
  t.after(async () => {
    app.close();
    await rm(dir, { recursive: true, force: true });
  });
  await app.import(dir);
  const song = app.db.tracks()[0];
  await app.command('mode', { mode: 'midi' });
  const payload = () => ({
    deckId: 1,
    token: r.deck().identityToken,
    trackId: song.id,
    checkedInMixxx: true,
  });
  return { ...r, app, song, file, payload };
}

test('biblioteca→deck: lectura del archivo, metadatos actualizados, sin historial automático ni control real', async (t) => {
  const r = await applicationRig(t);
  r.app.db.recordPlay(r.app.sessionId, r.song.id, 'simulation');
  assert.equal(r.app.snapshot().playedIds.length, 0);
  r.source.values[0].play = 1;
  r.advance();
  await r.app.command('identity.associate', r.payload());
  assert.equal(r.deck().trackId, r.song.id);
  assert.equal(r.app.db.history().length, 1);
  await r.app.command('track.update', { id: r.song.id, patch: { title: 'Título corregido' } });
  assert.equal(r.deck().title, 'Título corregido');
  await assert.rejects(r.app.command('auto', { enabled: true }), /solo lectura/);
  await assert.rejects(r.app.command('prepare'), /no disponible/);
  assert.equal(r.deck().playing, true);
  const expiredToken = r.deck().identityToken;
  r.source.values[0].play = 0;
  r.advance();
  await assert.rejects(r.app.command('identity.record', r.payload()), /reproduciendo/);
  r.source.values[0].play = 1;
  r.advance();
  for (let i = 0; i < 3; i++) await r.app.command('identity.record', r.payload());
  assert.equal(r.app.db.history().length, 2);
  assert.equal(r.app.db.history()[0].identity_source, 'manual');
  assert.equal(r.app.db.history()[0].deck_id, 1);
  assert.deepEqual(r.app.snapshot().playedIds, [r.song.id]);
  await r.app.command('identity.associate', {
    ...r.payload(),
    deckId: 2,
    token: r.deck(2).identityToken,
  });
  r.source.values[1].play = 1;
  r.advance();
  await r.app.command('identity.record', { deckId: 2, token: r.deck(2).identityToken });
  assert.equal(r.app.db.history().length, 2);
  await r.app.command('identity.clear', r.payload());
  assert.equal(r.deck().trackId, null);
  await assert.rejects(
    r.app.command('identity.record', { deckId: 1, token: expiredToken }),
    /deck cambió/,
  );
  await assert.rejects(r.app.command('identity.record', r.payload()), /asociación manual/);
});

test('rechaza falta de comprobación, archivo ausente/modificado y asociación que cambia durante lectura', async (t) => {
  const r = await applicationRig(t);
  await assert.rejects(
    r.app.command('identity.associate', { ...r.payload(), checkedInMixxx: false }),
    /Comprobá/,
  );
  await assert.rejects(
    r.app.command('identity.associate', { ...r.payload(), trackId: 'ausente' }),
    /MP3 real/,
  );
  const pending = r.app.command('identity.associate', r.payload());
  r.source.load(1);
  r.source.flush(r.monitor);
  await assert.rejects(pending, /deck cambió/);
  r.advance();
  await writeFile(r.file, 'archivo cambiado');
  await assert.rejects(r.app.command('identity.associate', r.payload()), /archivo cambió/);
  await rm(r.file);
  await assert.rejects(r.app.command('identity.associate', r.payload()), /no está disponible/);
  assert.equal(r.deck().identity.status, 'unknown');
});

test('cambiar de modo durante la verificación cancela la asociación y no persiste identidades', async (t) => {
  const r = await applicationRig(t);
  const pending = r.app.command('identity.associate', r.payload());
  await r.app.command('mode', { mode: 'simulation' });
  await assert.rejects(pending, /conexión cambió/);
  assert.equal(r.monitor.identities[0].status, 'unknown');
  assert.equal(r.app.db.getSetting('identity', null), null);
});

test('migración v1 de historial conserva datos y permite registros separados por modo sin duplicados', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dj-history-migration-'));
  const path = join(dir, 'library.sqlite');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE tracks (id TEXT PRIMARY KEY, path TEXT UNIQUE, hash TEXT UNIQUE, title TEXT NOT NULL, artist TEXT NOT NULL,
    genre TEXT DEFAULT '', bpm REAL, duration REAL, cue_seconds REAL, cue_source TEXT, bpm_source TEXT, favorite INTEGER DEFAULT 0, is_demo INTEGER DEFAULT 0);
    INSERT INTO tracks (id,title,artist) VALUES ('song','Título','Artista');
    CREATE TABLE history (id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, track_id TEXT NOT NULL REFERENCES tracks(id), played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, mode TEXT NOT NULL, UNIQUE(session_id,track_id));
    INSERT INTO history VALUES (7,'session','song','2026-10-01 10:00:00','simulation');`);
  old.close();
  let db = new LibraryDatabase(path);
  assert.equal(db.history()[0].id, 7);
  assert.equal(db.history()[0].played_at, '2026-10-01 10:00:00');
  assert.equal(db.history()[0].identity_source, 'simulation');
  assert.equal(db.played('session', 'midi').size, 0);
  db.recordPlay('session', 'song', 'midi', { source: 'manual', deckId: 2 });
  db.recordPlay('session', 'song', 'midi', { source: 'manual', deckId: 1 });
  assert.equal(db.history().length, 2);
  db.close();
  db = new LibraryDatabase(path);
  t.after(() => db.close());
  assert.equal(db.history().length, 2);
  assert.equal(db.getTrack('song').title, 'Título');
});
