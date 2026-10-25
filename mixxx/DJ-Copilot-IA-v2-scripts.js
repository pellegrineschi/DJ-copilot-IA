/* global engine, midi */
// Separate, read-only preset for Mixxx 2.5.6. The v1 preset is kept unchanged.
// EngineBuffer::slotTrackLoaded forceSet(1) emits on EVERY completed load,
// including 1 -> 1. Never deduplicate those callbacks by value or by BPM/duration.
// https://github.com/mixxxdj/mixxx/blob/2.5.6/src/engine/enginebuffer.cpp
var DJCopilotIAv2 = {};
DJCopilotIAv2.connections = [];
DJCopilotIAv2.timer = null;
DJCopilotIAv2.generations = [1, 1];
DJCopilotIAv2.sequences = [0, 0];
DJCopilotIAv2.newSession = function () {
  // Nonce, not an identity of the audio file and not cryptographic authentication.
  DJCopilotIAv2.session = 1 + Math.floor(Math.random() * (Math.pow(2, 49) - 1));
  DJCopilotIAv2.sequences = [0, 0];
};
DJCopilotIAv2.pack = function (bytes, number, width) {
  var n = Math.max(
    0,
    Math.min(Math.pow(2, 7 * width) - 1, Math.round(isFinite(number) ? number : 0)),
  );
  for (var i = 0; i < width; i++) {
    bytes.push(n % 128);
    n = Math.floor(n / 128);
  }
};
DJCopilotIAv2.sendDeck = function (id) {
  var index = id - 1;
  if (DJCopilotIAv2.sequences[index] >= 268435454) DJCopilotIAv2.newSession();
  var sequence = ++DJCopilotIAv2.sequences[index];
  var group = '[Channel' + id + ']';
  var loaded = engine.getValue(group, 'track_loaded') > 0;
  var playing = engine.getValue(group, 'play') > 0;
  var duration = engine.getValue(group, 'duration');
  var samples = engine.getValue(group, 'track_samples');
  var cue = engine.getValue(group, 'cue_point');
  var hasCue = loaded && samples > 0 && cue >= 0 && cue < samples;
  var connection = DJCopilotIAv2.connections[index];
  var tracking = !!connection && connection.isConnected === true;
  var flags =
    (loaded ? 1 : 0) +
    (playing ? 2 : 0) +
    (hasCue ? 4 : 0) +
    (engine.isScratching(id) ? 8 : 0) +
    (tracking ? 16 : 0);
  var bytes = [0xf0, 0x7d, 0x44, 0x4a, 0x43, 0x49, 2, id, flags];
  DJCopilotIAv2.pack(bytes, sequence % 16384, 2);
  DJCopilotIAv2.pack(bytes, engine.getValue(group, 'bpm') * 100, 3);
  DJCopilotIAv2.pack(bytes, engine.getValue(group, 'file_bpm') * 100, 3);
  DJCopilotIAv2.pack(bytes, duration * 1000, 4);
  DJCopilotIAv2.pack(
    bytes,
    Math.max(0, Math.min(1, engine.getValue(group, 'playposition'))) * duration * 1000,
    4,
  );
  DJCopilotIAv2.pack(bytes, hasCue ? (cue / samples) * duration * 1000 : 0, 4);
  var ratio =
    1 +
    engine.getValue(group, 'rate') *
      engine.getValue(group, 'rateRange') *
      engine.getValue(group, 'rate_dir');
  DJCopilotIAv2.pack(bytes, ratio * 10000, 3);
  DJCopilotIAv2.pack(bytes, DJCopilotIAv2.session, 7);
  DJCopilotIAv2.pack(bytes, DJCopilotIAv2.generations[index], 4);
  DJCopilotIAv2.pack(bytes, Date.now(), 6);
  DJCopilotIAv2.pack(bytes, sequence, 4);
  var checksum = 0;
  for (var j = 1; j < bytes.length; j++) checksum += bytes[j];
  bytes.push(checksum % 128, 0xf7);
  midi.sendSysexMsg(bytes, bytes.length);
};
DJCopilotIAv2.onLoad = function (id) {
  var index = id - 1;
  if (++DJCopilotIAv2.generations[index] >= 268435455) {
    DJCopilotIAv2.newSession();
    DJCopilotIAv2.generations = [1, 1];
  }
  DJCopilotIAv2.sendDeck(id); // Clear a stale manual association without waiting for the timer.
};
DJCopilotIAv2.tick = function () {
  DJCopilotIAv2.sendDeck(1);
  DJCopilotIAv2.sendDeck(2);
};
DJCopilotIAv2.init = function () {
  DJCopilotIAv2.shutdown();
  DJCopilotIAv2.newSession();
  DJCopilotIAv2.generations = [1, 1];
  for (var id = 1; id <= 2; id++) {
    (function (deckId) {
      // Buffered makeConnection preserves repeated forceSet events, unlike polling.
      try {
        DJCopilotIAv2.connections[deckId - 1] = engine.makeConnection(
          '[Channel' + deckId + ']',
          'track_loaded',
          function () {
            DJCopilotIAv2.onLoad(deckId);
          },
        );
      } catch (error) {
        // Telemetry remains available; the tracking flag stays off and association is disabled.
        DJCopilotIAv2.connections[deckId - 1] = null;
      }
    })(id);
  }
  DJCopilotIAv2.tick();
  DJCopilotIAv2.timer = engine.beginTimer(500, DJCopilotIAv2.tick);
};
DJCopilotIAv2.shutdown = function () {
  if (DJCopilotIAv2.timer !== null) engine.stopTimer(DJCopilotIAv2.timer);
  DJCopilotIAv2.timer = null;
  for (var i = 0; i < DJCopilotIAv2.connections.length; i++) {
    if (DJCopilotIAv2.connections[i]) DJCopilotIAv2.connections[i].disconnect();
  }
  DJCopilotIAv2.connections = [];
};
