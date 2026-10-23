/* global engine, midi */
// Mixxx 2.5+ legacy controller API. Intentionally no engine.setValue calls.
// Install as a SEPARATE virtual MIDI controller; leave DDJ-200 unchanged.
var DJCopilotIA = {};
DJCopilotIA.sequence = 0;
DJCopilotIA.timer = null;
DJCopilotIA.pack = function (bytes, number, width) {
  var n = Math.max(
    0,
    Math.min(Math.pow(2, 7 * width) - 1, Math.round(isFinite(number) ? number : 0)),
  );
  for (var i = 0; i < width; i++) {
    bytes.push(n % 128);
    n = Math.floor(n / 128);
  }
};
DJCopilotIA.sendDeck = function (id) {
  var group = '[Channel' + id + ']';
  var loaded = engine.getValue(group, 'track_loaded') > 0;
  var playing = engine.getValue(group, 'play') > 0;
  var duration = engine.getValue(group, 'duration');
  var samples = engine.getValue(group, 'track_samples');
  var cue = engine.getValue(group, 'cue_point');
  var hasCue = loaded && samples > 0 && cue >= 0 && cue < samples;
  var ratio =
    1 +
    engine.getValue(group, 'rate') *
      engine.getValue(group, 'rateRange') *
      engine.getValue(group, 'rate_dir');
  var flags =
    (loaded ? 1 : 0) + (playing ? 2 : 0) + (hasCue ? 4 : 0) + (engine.isScratching(id) ? 8 : 0);
  var bytes = [0xf0, 0x7d, 0x44, 0x4a, 0x43, 0x49, 1, id, flags];
  DJCopilotIA.pack(bytes, DJCopilotIA.sequence, 2);
  DJCopilotIA.pack(bytes, engine.getValue(group, 'bpm') * 100, 3);
  DJCopilotIA.pack(bytes, engine.getValue(group, 'file_bpm') * 100, 3);
  DJCopilotIA.pack(bytes, duration * 1000, 4);
  DJCopilotIA.pack(
    bytes,
    Math.max(0, Math.min(1, engine.getValue(group, 'playposition'))) * duration * 1000,
    4,
  );
  DJCopilotIA.pack(bytes, hasCue ? (cue / samples) * duration * 1000 : 0, 4);
  DJCopilotIA.pack(bytes, ratio * 10000, 3);
  for (var i = 0; i < 6; i++) bytes.push(0);
  var checksum = 0;
  for (var j = 1; j < bytes.length; j++) checksum += bytes[j];
  bytes.push(checksum % 128, 0xf7);
  midi.sendSysexMsg(bytes, bytes.length);
};
DJCopilotIA.tick = function () {
  DJCopilotIA.sequence = (DJCopilotIA.sequence + 1) % 16384;
  DJCopilotIA.sendDeck(1);
  DJCopilotIA.sendDeck(2);
};
DJCopilotIA.init = function () {
  DJCopilotIA.tick();
  DJCopilotIA.timer = engine.beginTimer(500, DJCopilotIA.tick);
};
DJCopilotIA.shutdown = function () {
  if (DJCopilotIA.timer !== null) engine.stopTimer(DJCopilotIA.timer);
  DJCopilotIA.timer = null;
};
