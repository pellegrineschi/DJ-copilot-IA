import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, realpath, stat, readdir, readlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const [binaryArg, musicArg, resourcesArg] = process.argv.slice(2);
if (!binaryArg || !musicArg || !resourcesArg)
  throw new Error('Uso: node scripts/native-launch.mjs /build/mixxx /carpeta-musica /checkout/res');
for (const name of await readdir('/proc')) {
  if (!/^\d+$/.test(name)) continue;
  let executable;
  try {
    executable = await readlink(`/proc/${name}/exe`);
  } catch {
    continue;
  }
  if (/\/mixxx(?: \(deleted\))?$/.test(executable))
    throw new Error(
      'Ya hay un Mixxx abierto. Cerralo manualmente antes de iniciar la variante aislada; no se detendrá ningún proceso automáticamente.',
    );
}
const binary = await realpath(resolve(binaryArg));
if (binary === '/usr/bin/mixxx' || binary.startsWith('/usr/') || binary.startsWith('/opt/lampp/'))
  throw new Error('Indicá el binario de la variante aislada en tu checkout de desarrollo.');
const music = await realpath(resolve(musicArg));
const resources = await realpath(resolve(resourcesArg));
if (!(await stat(music)).isDirectory() || !(await stat(resources)).isDirectory())
  throw new Error('Música y recursos deben ser directorios.');
const profile = join(homedir(), '.local/share/dj-copilot/mixxx-2.5.6-prototype');
await mkdir(profile, { recursive: true, mode: 0o700 });
const directory = await mkdtemp(join(tmpdir(), 'dj-native-'));
console.log('Perfil de desarrollo:', profile);
console.log('Sesión IPC privada:', directory);
console.log(`En otra terminal del proyecto: DJ_COPILOT_NATIVE_DIR=${directory} npm start`);
console.log(
  'Cerrá Mixxx estable antes de abrir esta variante para evitar competir por audio/controladores. Carga automática deshabilitada.',
);
const child = spawn(binary, ['--settings-path', profile, '--resource-path', resources], {
  stdio: 'inherit',
  env: { ...process.env, DJ_COPILOT_NATIVE_DIR: directory, DJ_COPILOT_MUSIC_ROOT: music },
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
