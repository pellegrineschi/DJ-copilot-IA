// Requires an already-running experimental Mixxx, never starts or controls audio.
// This test uses the production Electron entry point and the real native adapter.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron } from 'playwright';
import { NativeAdapter } from '../adapters/native/adapter.mjs';

const directory = process.argv[2];
const seconds = Number(process.argv[3] ?? 30);
if (!directory || !Number.isInteger(seconds) || seconds < 5 || seconds > 300)
  throw new Error('Uso: npm run test:native:live -- /tmp/dj-native-XXXXXX [segundos: 5..300]');
const output = 'artifacts/native-3.1';
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), seconds, status: 'running', checks: [] };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (read, predicate, timeout = 10000) => {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    value = await read();
    if (predicate(value)) return value;
    await delay(50);
  }
  throw new Error(
    `Estado esperado no recibido: ${value?.connection?.message ?? value?.message ?? 'sin datos'}`,
  );
};
const native = new NativeAdapter({ directory: resolve(directory) });
let app;
try {
  const first = await until(
    () => native.snapshot(),
    (s) => s.connected,
  );
  assert.equal(first.provider, 'mixxx-2.5.6');
  assert.equal(first.fixture, false);
  assert.equal(first.decks.length, 2);
  report.first = first;
  report.checks.push('Proveedor Mixxx experimental real, autenticado, dos decks disponibles');
  for (const command of ['load', 'prepare', 'tempo', 'cue'])
    await assert.rejects(native.request(command), { code: 'ATOMIC_LOAD_UNAVAILABLE' });
  for (const command of ['play', 'stop', 'eq', 'crossfader', 'AutoDJ', 'system'])
    await assert.rejects(native.request(command), { code: 'UNKNOWN_COMMAND' });
  report.checks.push('El servidor real rechaza escrituras y comandos arbitrarios');
  const initialSequence = native.sequence;
  const deadline = Date.now() + seconds * 1000;
  let samples = 0;
  console.log(`Observando ${seconds} s de telemetría real. No se cargan ni reproducen canciones.`);
  while (Date.now() < deadline) {
    const s = native.snapshot();
    assert.equal(s.connected, true, s.message);
    assert.equal(s.session, first.session);
    assert.equal(s.capabilities.loadByPath, false);
    assert.equal(s.capabilities.tempo, false);
    assert.equal(s.capabilities.cue, false);
    assert.ok(s.decks.every((d) => d.fresh));
    samples++;
    await delay(250);
  }
  assert.ok(native.sequence - initialSequence >= seconds * 2, 'Frecuencia de estado insuficiente');
  report.telemetry = {
    samples,
    messages: native.sequence - initialSequence,
    last: native.snapshot(),
  };
  report.checks.push('Telemetría continua y fresca durante el intervalo observado');
  // Drop only this client's socket. Mixxx and its audio engine keep running.
  native.socket.destroy();
  await until(
    () => native.snapshot(),
    (s) => !s.connected && !s.session,
  );
  assert.ok(native.snapshot().decks.every((d) => d.identity.status === 'unknown'));
  await native.connect();
  const recovered = await until(
    () => native.snapshot(),
    (s) => s.connected,
  );
  assert.notEqual(recovered.session, first.session);
  assert.ok(recovered.decks.every((d) => !d.nativeAuthorized));
  report.checks.push(
    'Pérdida de socket limpia identidad; reconexión explícita usa sesión nueva sin permisos',
  );
  native.close();

  const dataDir = await mkdtemp(join(tmpdir(), 'dj-copilot-live-'));
  const env = {
    ...process.env,
    DJ_COPILOT_NATIVE_DIR: resolve(directory),
    DJ_COPILOT_DATA_DIR: dataDir,
    DJ_COPILOT_DEV: '0',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: ['electron/main.mjs'],
    env,
    chromiumSandbox: true,
    timeout: 30000,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Conexión', exact: true }).click();
  await page.getByRole('button', { name: /Mixxx nativo · prototipo/ }).click();
  const read = () => page.evaluate(() => window.copilot.snapshot());
  const connected = await until(
    read,
    (s) => s.connection.mode === 'native' && s.connection.connected,
  );
  assert.equal(connected.connection.provider, 'mixxx-2.5.6');
  assert.equal(connected.connection.fixture, false);
  await page.getByRole('button', { name: 'Cabina', exact: true }).click();
  assert.equal(
    await page.getByRole('switch', { name: 'Preparación automática' }).isDisabled(),
    true,
  );
  for (const [action, payload] of [
    ['auto', { enabled: true }],
    ['prepare', {}],
  ]) {
    const error = await page.evaluate(
      async ({ action, payload }) => {
        try {
          await window.copilot.command(action, payload);
          return null;
        } catch (error) {
          return error.message;
        }
      },
      { action, payload },
    );
    assert.match(error, /atómica/);
  }
  await page.getByRole('button', { name: 'Conexión', exact: true }).click();
  await page.getByRole('button', { name: 'Reiniciar puente', exact: true }).click();
  const restarted = await until(
    read,
    (s) => s.connection.connected && s.connection.session !== connected.connection.session,
  );
  assert.equal(restarted.engine.auto, false);
  await page.getByRole('button', { name: 'Cabina', exact: true }).click();
  await page.screenshot({ path: join(output, 'mixxx-real-electron.png'), fullPage: true });
  assert.deepEqual(errors, []);
  report.electron = { dataDir, connection: restarted.connection };
  report.checks.push(
    'Electron de producción conectado, interfaz nativa, preparación bloqueada y sesión renovada',
  );
  report.status = 'passed';
  console.log(
    'OK: IPC con Mixxx real y Electron. La comparación de metadatos/archivo cargado y la DDJ-200 requieren la guía de prueba humana.',
  );
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  process.exitCode = 1;
  console.error(error);
} finally {
  native.close();
  if (app) await app.close();
  report.endedAt = new Date().toISOString();
  await writeFile(join(output, 'live-report.json'), JSON.stringify(report, null, 2));
}
