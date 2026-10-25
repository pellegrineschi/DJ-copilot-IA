// Executes the shipped mapping, not a second implementation of its protocol.
// Only a control/API fixture: this does NOT validate Mixxx or physical MIDI.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

export function mappingFixture({ clock = () => Date.now(), connectionAvailable = true } = {}) {
  const packets = [],
    callbacks = [],
    connections = [];
  const values = [1, 2].map(() => ({
    track_loaded: 1,
    play: 0,
    duration: 180,
    track_samples: 15876000,
    cue_point: 1058400,
    bpm: 96,
    file_bpm: 98,
    rate: 0,
    rateRange: 0.1,
    rate_dir: 1,
    playposition: 0.5,
  }));
  let session = 0;
  const math = Object.create(Math);
  math.random = () => 0.1 + ++session / 1000;
  const context = {
    Date: { now: clock },
    Math: math,
    engine: {
      getValue: (group, key) => values[Number(group.match(/Channel(\d)/)[1]) - 1][key] ?? 0,
      isScratching: () => false,
      makeConnection: (group, key, callback) => {
        if (!connectionAvailable) throw new Error('No connection');
        if (key !== 'track_loaded') throw new Error('Unexpected control');
        const index = Number(group.match(/Channel(\d)/)[1]) - 1;
        callbacks[index] = callback;
        const connection = {
          isConnected: true,
          disconnect() {
            this.isConnected = false;
          },
        };
        connections[index] = connection;
        return connection;
      },
      beginTimer: () => 9,
      stopTimer: () => {},
      setValue: () => {
        throw new Error('No writes to Mixxx allowed');
      },
      setParameter: () => {
        throw new Error('No writes to Mixxx allowed');
      },
    },
    midi: {
      sendSysexMsg: (bytes, length) => {
        if (length !== bytes.length) throw new Error('Wrong packet length');
        packets.push(Array.from(bytes));
      },
    },
  };
  runInNewContext(
    readFileSync(new URL('../mixxx/DJ-Copilot-IA-v2-scripts.js', import.meta.url), 'utf8'),
    context,
  );
  const mapping = context.DJCopilotIAv2;
  mapping.init();
  return {
    mapping,
    packets,
    values,
    connections,
    load(id, patch = {}) {
      Object.assign(values[id - 1], patch);
      callbacks[id - 1]?.(values[id - 1].track_loaded);
    },
    flush(monitor) {
      return packets.splice(0).map((p) => monitor.receive(p));
    },
  };
}
