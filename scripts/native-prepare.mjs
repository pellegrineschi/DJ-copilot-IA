// Apply the reviewed observer patch only to a separate, clean, pinned checkout.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, copyFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const expected = '3ebac449e7e5fe2a0186596657696e87ce8b0e56';
const source = process.argv[2] ? await realpath(resolve(process.argv[2])) : null;
if (!source || source === root || source === '/usr' || source.startsWith('/usr/'))
  throw new Error('Uso: node scripts/native-prepare.mjs /ruta/a/checkout-aislado-mixxx-2.5.6');
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
if (git('rev-parse', '--show-toplevel') !== source || git('rev-parse', 'HEAD') !== expected)
  throw new Error(`Se requiere un checkout separado exactamente en ${expected}.`);
if (git('status', '--porcelain'))
  throw new Error('El checkout tiene cambios; se rechaza sobrescribirlos.');
const cmakePath = join(source, 'CMakeLists.txt');
const playerPath = join(source, 'src/mixer/playermanager.cpp');
const cmake = await readFile(cmakePath, 'utf8');
const players = await readFile(playerPath, 'utf8');
const anchor = '    m_cloneTimer.start();\n}';
if (!cmake.includes('  src/mixer/playermanager.cpp\n') || !players.includes(anchor))
  throw new Error('Las anclas no coinciden con el código revisado. No se aplicó el parche.');
await mkdir(join(source, 'src/copilot'));
for (const file of ['bridge_server.h', 'bridge_server.cpp'])
  await copyFile(join(root, 'native', file), join(source, 'src/copilot', file));
for (const file of ['copilot_bridge.h', 'copilot_bridge.cpp'])
  await copyFile(join(root, 'native/mixxx', file), join(source, 'src/copilot', file));
await writeFile(
  cmakePath,
  cmake.replace(
    '  src/mixer/playermanager.cpp\n',
    '  src/mixer/playermanager.cpp\n  src/copilot/bridge_server.cpp\n  src/copilot/copilot_bridge.cpp\n',
  ),
);
await writeFile(
  playerPath,
  players
    .replace(
      '#include "mixer/playermanager.h"',
      '#include "mixer/playermanager.h"\n#include "copilot/copilot_bridge.h"',
    )
    .replace(anchor, '    m_cloneTimer.start();\n    startCopilotBridge(this);\n}'),
);
console.log(
  `Parche de observación aplicado en ${source}. Sin carga automática. La instalación estable no se modificó.`,
);
