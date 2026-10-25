const { _electron: electron } = await import('playwright');
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import electronPath from 'electron';
import { mp3Fixture } from '../tests/helpers.mjs';

const dataDir = await mkdtemp(join(tmpdir(), 'dj-copilot-desktop-'));
const env = { ...process.env, DJ_COPILOT_DATA_DIR: dataDir, DJ_COPILOT_DEV: '0' };
delete env.ELECTRON_RUN_AS_NODE;
const probe = spawnSync(electronPath, ['--version'], { encoding: 'utf8', timeout: 10000, env });
if (probe.status !== 0)
  throw new Error(`Electron no pudo iniciar: ${probe.stderr || probe.stdout || probe.error}`);
await mkdir('artifacts', { recursive: true });
const music = join(dataDir, 'música de prueba');
await mkdir(music);
await writeFile(join(music, 'Canción prueba.mp3'), mp3Fixture('Canción de prueba'));
const app = await electron.launch({
  args: ['scripts/desktop-entry.mjs'],
  env,
  chromiumSandbox: true,
  timeout: 30000,
});
const errors = [];
try {
  const page = await app.firstWindow();
  // IPC is asynchronous. Poll its resolved snapshots in Node; a Promise itself
  // is truthy and must not be used as a waitForFunction predicate.
  const waitForState = async (predicate, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const current = await page.evaluate(() => window.copilot.snapshot());
      if (predicate(current)) return current;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('El estado esperado de la aplicación no llegó a tiempo.');
  };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('heading', { name: 'Tu cabina, en control.' }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.getByRole('button', { name: 'Iniciar demo de 3 temas' }).click();
  await page.getByRole('button', { name: 'Preparar siguiente', exact: true }).click();
  await page.getByText('Preparado · pausado', { exact: true }).waitFor();
  let state = await page.evaluate(() => window.copilot.snapshot());
  assert.equal(state.connection.decks[1].playing, false);
  assert.equal(state.connection.decks[1].trackId, 'demo-orgullosa');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/cabina.png', fullPage: true });
  await page.getByRole('switch', { name: 'Preparación automática' }).click();
  await page.getByRole('button', { name: 'Simular cambio de deck' }).click();
  state = await waitForState(
    (s) => s.connection.decks[0].trackId === 'demo-kilates' && !s.engine.pending,
  );
  assert.equal(state.connection.decks[0].trackId, 'demo-kilates');
  assert.equal(state.connection.decks[0].playing, false);
  assert.equal(state.connection.decks[1].playing, true);
  // Exercise the native import IPC while deterministically choosing our test folder.
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, music);
  await page.getByRole('button', { name: 'Importar música', exact: true }).click();
  await waitForState((s) => !s.importing && s.tracks.some((t) => t.title === 'Canción de prueba'));
  await page
    .getByRole('button', { name: /Biblioteca/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Editar Canción de prueba', exact: true }).click();
  await page.getByLabel('Punto CUE · segundos').fill('1.25');
  await page.getByRole('button', { name: 'Guardar preparación' }).click();
  await waitForState(
    (s) => s.tracks.find((t) => t.title === 'Canción de prueba')?.cueSeconds === 1.25,
  );
  await page.getByRole('button', { name: 'Agregar Canción de prueba a playlist' }).click();
  await page.getByLabel('Buscar canciones').fill('Canción de prueba');
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.screenshot({ path: 'artifacts/biblioteca.png', fullPage: true });
  await page.getByRole('button', { name: 'Conexión', exact: true }).click();
  await page.getByRole('button', { name: /Mixxx por MIDI/ }).click();
  state = await waitForState(
    (s) => s.connection.mode === 'midi' && s.connection.decks.every((d) => d.canAssociate),
  );
  console.log(`Contrato MIDI con controles de prueba: ${state.connection.message}`);
  await page.getByRole('button', { name: 'Cabina', exact: true }).click();
  assert.equal(
    await page.getByRole('switch', { name: 'Preparación automática' }).isDisabled(),
    true,
  );
  await page.screenshot({ path: 'artifacts/monitor-midi.png', fullPage: true });
  await page.getByRole('button', { name: 'Asociar canción al Deck 1' }).click();
  const realTrack = state.tracks.find((t) => !t.isDemo);
  await page.getByLabel('Buscar archivo importado').fill('Canción de prueba');
  await page.getByLabel('Canción de la biblioteca').selectOption(realTrack.id);
  assert.equal(
    await page.getByRole('button', { name: 'Guardar asociación manual' }).isDisabled(),
    true,
  );
  await page.getByLabel(/Comprobé en Mixxx/).check();
  await page.screenshot({ path: 'artifacts/asociacion-manual.png', fullPage: true });
  await page.getByRole('button', { name: 'Guardar asociación manual' }).click();
  await waitForState((s) => s.connection.decks[0].identity.status === 'manual');
  await page.getByText('Identidad seleccionada manualmente', { exact: true }).waitFor();
  state = await page.evaluate(() => window.copilot.snapshot());
  assert.equal(state.history.filter((h) => h.mode === 'midi').length, 0);
  assert.equal(state.connection.decks[0].identity.path, realTrack.path);
  await page.getByRole('button', { name: 'Registrar reproducción manual', exact: true }).click();
  await waitForState((s) => s.history.filter((h) => h.identity_source === 'manual').length === 1);
  await page.screenshot({ path: 'artifacts/deck-asociado.png', fullPage: true });
  // A replacement with identical numerical values invalidates an open dialog.
  await page.getByRole('button', { name: 'Asociar canción al Deck 1' }).click();
  await app.evaluate(() => {
    const { source, monitor } = globalThis.djFixture;
    source.load(1);
    source.flush(monitor);
  });
  await page.getByText('El deck o la conexión cambió.', { exact: false }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Guardar asociación manual' }).isDisabled(),
    true,
  );
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  await waitForState((s) => s.connection.decks[0].canAssociate);
  await page.getByRole('button', { name: 'Asociar canción al Deck 1' }).click();
  await page.getByLabel('Canción de la biblioteca').selectOption(realTrack.id);
  await page.getByLabel(/Comprobé en Mixxx/).check();
  await page.getByRole('button', { name: 'Guardar asociación manual' }).click();
  await waitForState((s) => s.connection.decks[0].identity.status === 'manual');
  await app.evaluate(() => {
    globalThis.djFixture.paused = true;
  });
  await waitForState(
    (s) => !s.connection.connected && s.connection.decks[0].identity.status === 'unknown',
  );
  await app.evaluate(() => {
    globalThis.djFixture.paused = false;
  });
  await waitForState((s) => s.connection.connected && s.connection.decks[0].canAssociate);
  state = await page.evaluate(() => window.copilot.snapshot());
  assert.equal(state.connection.decks[0].identity.status, 'unknown');
  assert.equal(state.history.filter((h) => h.mode === 'midi').length, 1);
  assert.deepEqual(errors, []);
  console.log(
    'OK: Electron aislado, simulador, importación sintética, CUE, búsqueda, asociación manual v2, historial explícito, cambio de carga, caducidad y recuperación. No es prueba física de Mixxx.',
  );
  console.log(
    'Capturas: artifacts/cabina.png, artifacts/biblioteca.png, artifacts/monitor-midi.png',
  );
  console.log(`Datos aislados de prueba: ${dataDir}`);
} finally {
  await app.close();
}
