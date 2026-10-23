import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const checks = [
  ['Node.js 24+', Number(process.versions.node.split('.')[0]) >= 24, process.version],
  ['SQLite integrado', Boolean(DatabaseSync), 'node:sqlite'],
  [
    'Mixxx instalado',
    spawnSync('dpkg-query', ['-W', '-f=${Version}', 'mixxx']).status === 0,
    spawnSync('dpkg-query', ['-W', '-f=${Version}', 'mixxx'], {
      encoding: 'utf8',
    }).stdout?.trim() || 'No detectado',
  ],
  [
    'Python 3',
    spawnSync('python3', ['--version']).status === 0,
    'Puente ALSA sin dependencias pip',
  ],
  ['ALSA sequencer', existsSync('/dev/snd/seq'), '/dev/snd/seq'],
  ['Interfaz compilada', existsSync('dist/index.html'), 'npm run build'],
];
for (const [name, ok, detail] of checks)
  console.log(`${ok ? 'OK' : 'PENDIENTE'}  ${name}: ${detail}`);
console.log(
  '\nEl monitor MIDI requiere ALSA y activar el mapeo separado en Mixxx. La simulación funciona sin MIDI.',
);
if (!checks[0][1] || !checks[1][1]) process.exitCode = 1;
