import { CopilotApplication } from '../backend/application.mjs';
import { SimulatorAdapter } from '../adapters/simulator.mjs';

export async function rig(t, { delayMs = 5 } = {}) {
  const app = new CopilotApplication({
    adapterFactory: () => new SimulatorAdapter({ delayMs, clock: false }),
  });
  t.after(() => app.close());
  await app.command('demo');
  return app;
}

export async function until(fn, timeout = 2000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('Se agotó el tiempo de espera.');
    await new Promise((r) => setTimeout(r, 10));
  }
}

// Small synthetic MPEG frame stream for metadata/import tests. No copyrighted audio.
export function mp3Fixture(title = 'Prueba local') {
  const synchsafe = (n) => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
  const frames = [
    ['TIT2', title],
    ['TPE1', 'Artista de prueba'],
    ['TBPM', '96'],
    ['TCON', 'Cumbia'],
  ].map(([key, value]) => {
    const content = Buffer.concat([Buffer.from([3]), Buffer.from(value)]);
    return Buffer.concat([
      Buffer.from(key),
      synchsafe(content.length),
      Buffer.from([0, 0]),
      content,
    ]);
  });
  const tag = Buffer.concat(frames);
  const audio = [];
  for (let i = 0; i < 200; i++) {
    const frame = Buffer.alloc(417);
    frame.set([0xff, 0xfb, 0x90, 0x00]);
    audio.push(frame);
  }
  return Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33, 4, 0, 0]),
    synchsafe(tag.length),
    tag,
    ...audio,
  ]);
}
