// Build/run the native transport contract, never launch Mixxx or access audio/MIDI.
import { spawnSync } from 'node:child_process';
import { mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'dj-native-test-build-'));
const headers = process.env.DJ_COPILOT_QT_HEADERS || '/usr/include/x86_64-linux-gnu/qt6';
try {
  await access(join(headers, 'QtCore/QCoreApplication'));
} catch {
  throw new Error(
    'Faltan headers Qt 6. Instalá qt6-base-dev o indicá DJ_COPILOT_QT_HEADERS. Ver docs/NATIVO.md.',
  );
}
const binary = join(directory, 'copilot-native-fixture');
const run = (cmd, args, env = process.env) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run('g++', [
  '-std=c++17',
  '-Wall',
  '-Wextra',
  '-Werror',
  '-fPIC',
  '-I',
  'native',
  '-I',
  headers,
  '-I',
  join(headers, 'QtCore'),
  '-I',
  join(headers, 'QtNetwork'),
  'native/bridge_server.cpp',
  'native/tests/fixture.cpp',
  '/usr/lib/x86_64-linux-gnu/libQt6Core.so.6',
  '/usr/lib/x86_64-linux-gnu/libQt6Network.so.6',
  '-o',
  binary,
]);
run(process.execPath, ['--test', 'native/tests/contract.test.mjs'], {
  ...process.env,
  DJ_COPILOT_NATIVE_FIXTURE: binary,
});
