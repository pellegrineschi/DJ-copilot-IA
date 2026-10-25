// Isolated Electron test entry, never used by npm start/dev. Exercise the
// production window/IPC/backend without creating a second real ALSA port.
import { MidiMonitorAdapter } from '../adapters/midi/adapter.mjs';
import { mappingFixture } from '../tests/midi-fixture.mjs';

MidiMonitorAdapter.prototype.start = function () {
  const monitor = this;
  const source = mappingFixture();
  source.values[0].play = 1;
  source.flush(monitor);
  const fixture = { paused: false, source, monitor };
  globalThis.djFixture = fixture; // Accessible only from the test's main process.
  const timer = setInterval(() => {
    if (fixture.paused) return;
    source.mapping.tick();
    source.flush(monitor);
  }, 500);
  const close = monitor.close.bind(monitor);
  monitor.close = () => {
    clearInterval(timer);
    close();
  };
};

await import('../electron/main.mjs');
