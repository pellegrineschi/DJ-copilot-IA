import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibraryDatabase } from '../backend/database.mjs';
import { importFolder, hashFile, exportM3U } from '../backend/library.mjs';
import { mp3Fixture } from './helpers.mjs';

test('importa MP3 recursivamente, conserva bytes, detecta duplicados y reporta corruptos', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dj-copilot-import-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const music = join(dir, 'música');
  await mkdir(join(music, 'sub'), { recursive: true });
  const path = join(music, 'prueba.mp3');
  const content = mp3Fixture('Tema con acento á');
  await writeFile(path, content);
  await writeFile(join(music, 'sub', 'copia.MP3'), content);
  await writeFile(join(music, 'corrupto.mp3'), 'no es un MP3');
  await symlink(music, join(music, 'ciclo')); // No recursion through symlinks.
  const before = await hashFile(path);
  const db = new LibraryDatabase(join(dir, 'library.sqlite'));
  t.after(() => db.close());
  const report = await importFolder(music, db);
  assert.equal(report.imported, 1);
  assert.equal(report.duplicates, 1);
  assert.equal(report.failed, 1);
  assert.equal(report.scanned, 3);
  const track = db.tracks()[0];
  assert.equal(track.title, 'Tema con acento á');
  assert.equal(track.bpm, 96);
  assert.equal(track.bpmSource, 'tag ID3');
  assert.equal(track.cueSeconds, null);
  assert.ok(track.duration > 4);
  db.updateTrack(track.id, { cueSeconds: 1.25, bpm: 98, favorite: true });
  assert.equal(await hashFile(path), before);
  assert.deepEqual(await readFile(path), content);
  const second = await importFolder(music, db);
  assert.equal(second.imported, 0);
  assert.equal(second.duplicates, 2);
});

test('SQLite conserva playlist, preferencias, CUE e historial al reabrir', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dj-copilot-db-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'db.sqlite');
  let db = new LibraryDatabase(path);
  const one = db.addTrack({
    title: 'Uno',
    artist: 'A',
    duration: 180,
    hash: 'uno',
    path: '/a.mp3',
  });
  const two = db.addTrack({
    title: 'Dos',
    artist: 'B',
    duration: 190,
    hash: 'dos',
    path: '/b.mp3',
  });
  db.updateTrack(one.id, { cueSeconds: 0, favorite: true });
  db.setQueue('default', [two.id, one.id]);
  db.recordPlay('session', one.id, 'simulation');
  db.recordPlay('session', one.id, 'simulation');
  db.setSetting('safeMode', false);
  db.close();
  db = new LibraryDatabase(path);
  t.after(() => db.close());
  assert.deepEqual(
    db.queue('default').map((t) => t.id),
    [two.id, one.id],
  );
  assert.equal(db.getTrack(one.id).cueSeconds, 0);
  assert.equal(db.getTrack(one.id).favorite, true);
  assert.equal(db.history().length, 1);
  assert.equal(db.getSetting('safeMode', true), false);
  assert.equal(db.addTrack({ title: 'Duplicada', hash: 'uno' }), null);
});

test('rechaza CUE, BPM y playlists inválidos sin perder la anterior', (t) => {
  const db = new LibraryDatabase(':memory:');
  t.after(() => db.close());
  const track = db.addTrack({ title: 'Tema', duration: 100 });
  db.setQueue('default', [track.id]);
  for (const cueSeconds of [-1, 100, 101, NaN, Infinity, '12'])
    assert.throws(() => db.updateTrack(track.id, { cueSeconds }));
  assert.throws(() => db.updateTrack(track.id, { bpm: -2 }));
  assert.throws(() => db.setQueue('default', [track.id, 'ausente']));
  assert.throws(() => db.setQueue('default', [track.id, track.id]));
  assert.equal(db.queue('default').length, 1);
});

test('exportación M3U UTF-8 excluye demos y neutraliza metadatos con saltos', () => {
  const tracks = [
    { title: 'Tema\n#EXTINF:10,intruso', artist: 'Ártista', duration: 120, path: '/música/01.mp3' },
    { title: 'Demo', isDemo: true },
  ];
  const result = exportM3U(tracks);
  assert.equal(result.split('\n').length, 4);
  assert.match(result, /\/música\/01.mp3/);
  assert.doesNotMatch(result, /Demo/);
  assert.throws(() => exportM3U([{ title: 'Demo', isDemo: true }]));
  assert.throws(() => exportM3U([{ title: 'T', path: '/a\nb.mp3' }]));
});
