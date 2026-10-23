import test from 'node:test';
import assert from 'node:assert/strict';
import { rig, until } from './helpers.mjs';
import { recommend, estimateSet } from '../core/recommendations.mjs';

test('escenario de 3 temas: prepara en pausa, conserva el activo y evita repeticiones', async (t) => {
  const app = await rig(t);
  const source = app.adapter.snapshot().decks[0];
  await app.command('prepare');
  let [one, two] = app.adapter.snapshot().decks;
  assert.deepEqual(one, source);
  assert.equal(two.trackId, 'demo-orgullosa');
  assert.equal(two.playing, false);
  assert.equal(two.bpm, 96);
  assert.equal(two.positionSeconds, 12);
  await app.command('sim.transition');
  await app.command('prepare');
  [one, two] = app.adapter.snapshot().decks;
  assert.equal(one.trackId, 'demo-kilates');
  assert.equal(one.playing, false);
  assert.equal(two.playing, true);
  assert.equal(one.positionSeconds, 8);
  assert.deepEqual(new Set(app.snapshot().playedIds), new Set(['demo-original', 'demo-orgullosa']));
  await app.command('sim.transition');
  await assert.rejects(app.command('prepare'), /No quedan canciones/);
});

test('ambos decks reproduciendo bloquean toda preparación', async (t) => {
  const app = await rig(t);
  await app.command('prepare');
  app.adapter.setPlaying(2, true);
  const before = app.adapter.snapshot().decks;
  await assert.rejects(app.command('prepare'), /Ambos decks/);
  assert.deepEqual(app.adapter.snapshot().decks, before);
});

test('ningún deck reproduciendo no se interpreta como un deck libre seguro', async (t) => {
  const app = await rig(t);
  app.adapter.setPlaying(1, false);
  await assert.rejects(app.command('prepare'), /exactamente un deck/);
});

test('deck reservado no se toca', async (t) => {
  const app = await rig(t);
  app.adapter.lock(2, true);
  await assert.rejects(app.command('prepare'), /reservado/);
  assert.equal(app.adapter.decks[1].loaded, false);
});

test('un tema cargado manualmente permanece protegido aunque se libere la reserva', async (t) => {
  const app = await rig(t);
  app.adapter.loadManual(2, app.db.getTrack('demo-kilates'));
  app.adapter.lock(2, false);
  await assert.rejects(app.command('prepare'), /cargado manualmente/);
  assert.equal(app.adapter.decks[1].trackId, 'demo-kilates');
});

test('una recomendación ya preparada no se reemplaza por otra', async (t) => {
  const app = await rig(t);
  await app.command('prepare');
  await assert.rejects(app.command('prepare'), /ya tiene un tema preparado/);
  assert.equal(app.adapter.decks[1].trackId, 'demo-orgullosa');
});

test('una reserva manual durante la carga cancela antes de modificar el deck', async (t) => {
  const app = await rig(t, { delayMs: 30 });
  const pending = app.command('prepare');
  app.adapter.lock(2, true);
  await assert.rejects(pending, /estado del deck cambió/);
  assert.equal(app.adapter.decks[1].loaded, false);
  assert.equal(app.engine.pending, false);
});

test('reanudar el deck destino durante la preparación lo protege', async (t) => {
  const app = await rig(t, { delayMs: 30 });
  await app.command('prepare');
  await app.command('sim.transition');
  const pending = app.command('prepare');
  app.adapter.setPlaying(1, true);
  await assert.rejects(pending, /estado del deck cambió/);
  assert.equal(app.adapter.decks[0].trackId, 'demo-original');
  assert.equal(app.adapter.decks[0].playing, true);
});

test('cambiar el deck de referencia durante la carga invalida la transacción', async (t) => {
  const app = await rig(t, { delayMs: 30 });
  const pending = app.command('prepare');
  app.adapter.setPlaying(1, false);
  await assert.rejects(pending, /estado del deck cambió/);
  assert.equal(app.adapter.decks[1].loaded, false);
});

test('desactivar automatización cancela una preparación pendiente', async (t) => {
  const app = await rig(t, { delayMs: 30 });
  const pending = app.command('prepare');
  await app.command('auto', { enabled: false });
  await assert.rejects(pending, /desactivada/);
  assert.equal(app.adapter.decks[1].loaded, false);
});

test('doble clic genera una sola carga', async (t) => {
  const app = await rig(t, { delayMs: 30 });
  const pending = app.command('prepare');
  await assert.rejects(app.command('prepare'), /en curso/);
  await pending;
  assert.equal(app.adapter.decks[1].trackId, 'demo-orgullosa');
});

test('saltar durante una preparación cancela la recomendación anterior', async (t) => {
  const app = await rig(t, { delayMs: 30 });
  const pending = app.command('prepare');
  await app.command('skip');
  await assert.rejects(pending, /desactivada/);
  assert.equal(app.adapter.decks[1].loaded, false);
  assert.equal(app.engine.selection().track.id, 'demo-kilates');
});

test('archivo desaparecido genera error sin ocupar el destino', async (t) => {
  const app = await rig(t);
  const track = app.db.addTrack({
    title: 'No existe',
    path: '/tmp/dj-copilot-inexistente/ausente.mp3',
    duration: 100,
    bpm: 96,
    cueSeconds: 1,
  });
  await app.command('selectNext', { id: track.id });
  await assert.rejects(app.command('prepare'), /ENOENT/);
  assert.equal(app.adapter.decks[1].loaded, false);
  assert.equal(app.engine.pending, false);
});

test('modo seguro exige CUE y no lo deduce de BPM similares', async (t) => {
  const app = await rig(t);
  app.db.updateTrack('demo-orgullosa', { cueSeconds: null });
  await assert.rejects(app.command('prepare'), /CUE verificado/);
  assert.equal(app.adapter.decks[1].loaded, false);
});

test('CUE opcional permite inicio de archivo sin inventar un CUE', async (t) => {
  const app = await rig(t);
  app.db.updateTrack('demo-orgullosa', { cueSeconds: null });
  await app.command('safeMode', { enabled: false });
  await app.command('prepare');
  const deck = app.adapter.decks[1];
  assert.equal(deck.cueSeconds, null);
  assert.equal(deck.positionSeconds, 0);
  assert.equal(deck.playing, false);
});

test('fuera del margen de tempo conserva BPM originales', async (t) => {
  const app = await rig(t);
  app.db.updateTrack('demo-orgullosa', { bpm: 125 });
  assert.equal(app.engine.selection().canMatch, false);
  await app.command('prepare');
  assert.equal(app.adapter.decks[1].bpm, 125);
});

test('BPM desconocidos no se inventan', () => {
  const result = recommend({ bpm: null, cueSeconds: 0 }, { bpm: 96 });
  assert.equal(result.tempoRatio, 1);
  assert.equal(result.delta, null);
  assert.equal(result.canMatch, false);
});

test('el motor rechaza telemetría vencida', async (t) => {
  const app = await rig(t);
  const original = app.adapter.snapshot.bind(app.adapter);
  app.adapter.snapshot = () => ({ ...original(), receivedAt: Date.now() - 3000 });
  await assert.rejects(app.command('prepare'), /Sin estado reciente/);
});

test('automático espera la transición manual y prepara el siguiente en el deck liberado', async (t) => {
  const app = await rig(t);
  await app.command('auto', { enabled: true });
  await until(() => !app.engine.pending && app.adapter.decks[1].loaded);
  assert.equal(app.adapter.decks[1].playing, false);
  await app.command('sim.transition');
  await until(() => !app.engine.pending && app.adapter.decks[0].trackId === 'demo-kilates');
  assert.equal(app.adapter.decks[0].playing, false);
  assert.equal(app.adapter.decks[1].trackId, 'demo-orgullosa');
});

test('puede recuperarse de una cancelación sin quedar ocupado', async (t) => {
  const app = await rig(t);
  const pending = app.command('prepare');
  app.adapter.lock(2, true);
  await assert.rejects(pending);
  app.adapter.lock(2, false);
  await app.command('prepare');
  assert.equal(app.engine.pending, false);
  assert.equal(app.adapter.decks[1].trackId, 'demo-orgullosa');
});

test('una edición de playlist cancela la automatización, mantiene historial y permite elegir siguiente', async (t) => {
  const app = await rig(t);
  await app.command('skip');
  assert.equal(app.engine.selection().track.id, 'demo-kilates');
  await app.command('selectNext', { id: 'demo-orgullosa' });
  assert.equal(app.engine.selection().track.id, 'demo-orgullosa');
  await assert.rejects(app.command('selectNext', { id: 'demo-original' }), /ya sonó/);
});

test('estimación transparente para cuatro horas', () => {
  assert.equal(estimateSet({ hours: 4, songSeconds: 120, overlapSeconds: 14 }).songs, 136);
  assert.equal(estimateSet({ hours: 4, songSeconds: 120, overlapSeconds: 10 }).songs, 131);
  assert.equal(estimateSet({ hours: 4, songSeconds: 120, overlapSeconds: 30 }).songs, 160);
  assert.throws(() => estimateSet({ hours: 4, songSeconds: 120, overlapSeconds: 120 }));
  assert.throws(() => estimateSet({ hours: NaN }));
});
