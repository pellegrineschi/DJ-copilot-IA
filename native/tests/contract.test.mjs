import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
  chmod,
  stat,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { NativeAdapter } from '../../adapters/native/adapter.mjs';

const decks = () =>
  [1, 2].map((id) => ({
    id,
    available: true,
    revision: 1,
    loaded: id === 1,
    playing: id === 1,
    loading: false,
    path: id === 1 ? '/music/fixture.mp3' : null,
    title: 'Fixture',
    artist: 'Test',
    bpm: 96,
    originalBpm: 96,
    duration: 180,
    positionSeconds: 10,
    tempoRatio: 1,
    cueSeconds: 12,
  }));
const until = async (fn) => {
  const deadline = Date.now() + 5000;
  while (!(await fn())) {
    if (Date.now() > deadline) throw new Error('Timeout de prueba');
    await new Promise((r) => setTimeout(r, 20));
  }
};
async function rig(t) {
  const root = await mkdtemp(join(tmpdir(), 'dj-native-contract-'));
  const ipc = join(root, 'ipc'),
    music = join(root, 'music'),
    statePath = join(root, 'state.json');
  await mkdir(ipc, { mode: 0o700 });
  await mkdir(music);
  const path = join(music, 'canción.mp3');
  await writeFile(path, 'Fixture de validación de ruta: NO es audio');
  await writeFile(statePath, JSON.stringify(decks()));
  const child = spawn(process.env.DJ_COPILOT_NATIVE_FIXTURE, [ipc, music, statePath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => {
    diagnostics += chunk;
  });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('error', reject);
    child.once('exit', (code) =>
      reject(new Error(`Fixture C++ no inició (${code}): ${diagnostics}`)),
    );
  });
  const adapter = new NativeAdapter({ directory: ipc, allowFixture: true });
  t.after(async () => {
    adapter.close();
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    await rm(root, { recursive: true, force: true });
  });
  await until(() => adapter.snapshot().connected);
  return {
    adapter,
    child,
    ipc,
    path,
    music,
    root,
    async change(next) {
      await writeFile(statePath + '.tmp', JSON.stringify(next));
      await rename(statePath + '.tmp', statePath);
      await until(
        () =>
          adapter.raw.decks[0].revision === next[0].revision &&
          adapter.raw.decks[1].revision === next[1].revision,
      );
    },
  };
}

test('C++↔Node real por Unix socket privado: autenticación, lease y comprobación sin cargar', async (t) => {
  const r = await rig(t);
  assert.equal((await stat(join(r.ipc, 'token'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(r.ipc, 'bridge.sock'))).mode & 0o077, 0);
  assert.equal(r.adapter.snapshot().fixture, true);
  assert.equal(r.adapter.snapshot().decks[0].identity.status, 'unknown');
  assert.equal(r.adapter.snapshot().capabilities.loadByPath, false);
  await r.adapter.authorize(2, false);
  await until(() => r.adapter.snapshot().decks[1].nativeAuthorized);
  const result = await r.adapter.inspect({ path: r.path });
  assert.equal(result.path, r.path);
  assert.equal(result.loaded, false);
  assert.equal(result.prepared, false);
  assert.equal(r.adapter.snapshot().decks[0].playing, true);
  assert.equal(r.adapter.snapshot().decks[1].loaded, false);
});

test('el servidor C++ rechaza carga, play, EQ y comandos arbitrarios incluso autenticado', async (t) => {
  const r = await rig(t);
  for (const command of ['prepare', 'load', 'tempo', 'cue'])
    await assert.rejects(r.adapter.request(command, { path: r.path }), {
      code: 'ATOMIC_LOAD_UNAVAILABLE',
    });
  for (const command of ['play', 'stop', 'eq', 'crossfader', 'system', 'AutoDJ'])
    await assert.rejects(r.adapter.request(command), { code: 'UNKNOWN_COMMAND' });
  assert.equal(r.adapter.snapshot().decks[0].playing, true);
});

test('servidor nativo valida reserva, ambas revisiones y el deck ocupado', async (t) => {
  const r = await rig(t);
  await assert.rejects(r.adapter.authorize(1, true), { code: 'OCCUPIED' });
  const next = decks();
  Object.assign(next[1], { revision: 2, loaded: true, path: '/music/manual.mp3' });
  await r.change(next);
  await assert.rejects(r.adapter.authorize(2, false), { code: 'OCCUPIED' });
  await r.adapter.authorize(2, true);
  await until(() => r.adapter.snapshot().decks[1].nativeAuthorized);
  const prior = r.adapter.context();
  next[0].revision++;
  next[0].bpm = 100;
  await r.change(next);
  await assert.rejects(r.adapter.request('inspect', { ...prior, deckId: 2, path: r.path }), {
    code: 'CONFLICT',
  });
  assert.equal(r.adapter.snapshot().decks[1].loaded, true);
});

test('permiso vence a los 10 s sin carga y ambos decks activos impiden autorizar', async (t) => {
  const r = await rig(t);
  await r.adapter.authorize(2, false);
  await until(() => r.adapter.snapshot().decks[1].nativeAuthorized);
  const context = r.adapter.context();
  await new Promise((resolve) => setTimeout(resolve, 10250));
  await assert.rejects(r.adapter.request('inspect', { ...context, deckId: 2, path: r.path }), {
    code: 'CONFLICT',
  });
  assert.equal(r.adapter.snapshot().decks[1].nativeAuthorized, false);
  const next = decks();
  Object.assign(next[1], { revision: 2, loaded: true, playing: true, path: '/music/active.mp3' });
  await r.change(next);
  await assert.rejects(r.adapter.authorize(2, true), { code: 'OCCUPIED' });
});

test('rutas ausentes, fuera de raíz y symlinks se rechazan sin ejecutar comandos', async (t) => {
  const r = await rig(t);
  const outside = join(r.root, 'outside.mp3');
  await writeFile(outside, 'test');
  const link = join(r.music, 'link.mp3');
  await symlink(r.path, link);
  for (const path of [join(r.music, 'ausente.mp3'), outside, link, '/music/../test.mp3']) {
    await r.adapter.authorize(2, false);
    await until(() => r.adapter.snapshot().decks[1].nativeAuthorized);
    await assert.rejects(r.adapter.inspect({ path }), { code: 'INVALID_PATH' });
    await until(() => !r.adapter.snapshot().decks[1].nativeAuthorized);
  }
});

test('cancelar y reconectar revocan permisos; no hay cola ni reutilización de sesión', async (t) => {
  const r = await rig(t);
  await r.adapter.authorize(2, false);
  await until(() => r.adapter.snapshot().decks[1].nativeAuthorized);
  const oldSession = r.adapter.session;
  await r.adapter.reserve();
  await until(() => !r.adapter.snapshot().decks[1].nativeAuthorized);
  r.adapter.close();
  const replacement = new NativeAdapter({ directory: r.ipc, allowFixture: true });
  t.after(() => replacement.close());
  await until(() => replacement.snapshot().connected);
  assert.notEqual(replacement.session, oldSession);
  assert.equal(replacement.snapshot().decks[1].nativeAuthorized, false);
  await assert.rejects(replacement.inspect({ path: r.path }), /Autorizá/);
});

test('identificador duplicado y credencial errónea reciben rechazo', async (t) => {
  const r = await rig(t);
  r.adapter.close();
  const token = await readFile(join(r.ipc, 'token'), 'utf8');
  const socket = createConnection(join(r.ipc, 'bridge.sock'));
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  const replies = [];
  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      replies.push(JSON.parse(buffer.slice(0, i)));
      buffer = buffer.slice(i + 1);
    }
  });
  socket.write(JSON.stringify({ id: 'auth', type: 'hello', protocol: 1, token }) + '\n');
  await until(() => replies.some((r) => r.code === 'HELLO'));
  const session = replies.find((r) => r.code === 'HELLO').session;
  const request = {
    id: 'same-operation',
    type: 'request',
    session,
    command: 'authorize',
    payload: { deckId: 2, revisions: [1, 1], replace: false },
  };
  socket.write(JSON.stringify(request) + '\n' + JSON.stringify(request) + '\n');
  await until(() => replies.some((r) => r.code === 'DUPLICATE'));
  socket.destroy();
  await new Promise((r) => setTimeout(r, 30));
  const invalid = createConnection(join(r.ipc, 'bridge.sock'));
  t.after(() => invalid.destroy());
  await once(invalid, 'connect');
  const closed = once(invalid, 'close');
  invalid.write(JSON.stringify({ id: 'bad', type: 'hello', protocol: 1, token: 'wrong' }) + '\n');
  await closed;
});

test('cliente se niega a usar directorio o token con permisos inseguros', async (t) => {
  const r = await rig(t);
  r.adapter.close();
  await chmod(join(r.ipc, 'token'), 0o644);
  const client = new NativeAdapter({ directory: r.ipc, allowFixture: true });
  t.after(() => client.close());
  await until(() => /Permisos/.test(client.snapshot().message));
  assert.equal(client.snapshot().connected, false);
  await chmod(r.ipc, 0o755);
  const client2 = new NativeAdapter({ directory: r.ipc, allowFixture: true });
  t.after(() => client2.close());
  await until(() => /directorio/.test(client2.snapshot().message));
  assert.equal(client2.snapshot().connected, false);
});
