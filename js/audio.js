// Chord sound: plain, soft tones (a triangle and a sine per note), one voice per note, no piano
// imitation. The engine keeps a set of sounding notes; setNotes() moves to a new set, letting notes
// the two chords share keep ringing while the others cross-fade over a moment.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.ChordAudio = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FADE = 0.10;               // seconds: cross-fade between chords
  var ATTACK = 0.04;
  var RELEASE = 0.15;
  var VOICE_GAIN = 0.3;

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // the tonic's MIDI note: G3..F#4 for the twelve keys, so the chords sit in the range laptop speakers reproduce well
  function tonicMidi(rootPc) { return 55 + ((((rootPc % 12) + 12) % 12) + 5) % 12; }

  // split old and new note sets into the notes to keep, stop and start
  function diff(oldNotes, newNotes) {
    return {
      keep: newNotes.filter(function (n) { return oldNotes.indexOf(n) >= 0; }),
      stop: oldNotes.filter(function (n) { return newNotes.indexOf(n) < 0; }),
      start: newNotes.filter(function (n) { return oldNotes.indexOf(n) < 0; })
    };
  }

  function Engine(makeContext) {
    var ctx = null, master = null;
    var voices = {};             // midi -> { gain, oscs }
    var current = [];
    var unlocked = false;
    var onRunning = null;

    function ensure() {
      if (ctx) return ctx;
      ctx = makeContext();
      if (!ctx) return null;
      master = ctx.createGain();
      master.gain.value = 0.9;
      var comp = ctx.createDynamicsCompressor ? ctx.createDynamicsCompressor() : null;
      if (comp) { master.connect(comp); comp.connect(ctx.destination); } else master.connect(ctx.destination);
      return ctx;
    }

    function startVoice(m, fade) {
      var t = ctx.currentTime;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(VOICE_GAIN, t + (fade ? FADE : ATTACK));
      g.connect(master);
      var oscs = [['triangle', 1, 0], ['sine', 2, 0]].map(function (spec, i) {
        var o = ctx.createOscillator();
        o.type = spec[0];
        o.frequency.value = midiToFreq(m) * (i === 0 ? 1 : 1);
        if (o.detune) o.detune.value = i === 0 ? -3 : 3;       // older Safari has no detune
        var og = ctx.createGain();
        og.gain.value = i === 0 ? 0.7 : 0.45;
        o.connect(og); og.connect(g);
        o.start(t);
        return o;
      });
      voices[m] = { gain: g, oscs: oscs };
    }

    function stopVoice(m, dur) {
      var v = voices[m];
      if (!v) return;
      delete voices[m];
      var t = ctx.currentTime;
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + dur);
      v.oscs.forEach(function (o) { try { o.stop(t + dur + 0.05); } catch (e) { /* already stopped */ } });
    }

    return {
      // notes: array of MIDI numbers (empty = silence). `cross` cross-fades instead of a plain attack.
      setNotes: function (notes, cross) {
        if (!notes.length && !current.length) return;
        if (!ensure()) return;
        if (ctx.state !== 'running' && ctx.resume) this.resume();
        var d = diff(current, notes);
        d.stop.forEach(function (m) { stopVoice(m, cross && notes.length ? FADE : RELEASE); });
        d.start.forEach(function (m) { startVoice(m, !!cross && current.length > 0); });
        current = notes.slice();
      },
      notes: function () { return current.slice(); },
      // resume a suspended context; when it starts running, the voices that were scheduled while it was
      // suspended are rebuilt so they start from the beginning of the sound, not mid-ramp
      resume: function () {
        if (!ctx || !ctx.resume) return;
        var p = ctx.resume();
        if (p && p.then) p.then(function () {
          if (typeof onRunning === 'function') onRunning();
        }, function () { /* needs a user gesture; the next one retries */ });
      },
      onRunning: function (fn) { onRunning = fn; },
      running: function () { return !!ctx && ctx.state === 'running'; },
      unlock: function () {
        try {
          if (!ensure()) return;
          if (ctx.state !== 'running') this.resume();
          if (!unlocked) {
            var b = ctx.createBuffer(1, 1, 22050);
            var src = ctx.createBufferSource();
            src.buffer = b;
            src.connect(ctx.destination);
            src.start(0);
            unlocked = true;
          }
        } catch (e) { if (typeof console !== 'undefined') console.warn('audio unlock failed', e); }
      }
    };
  }

  function browserContext() {
    var AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    return AC ? new AC() : null;
  }

  return { midiToFreq: midiToFreq, tonicMidi: tonicMidi, diff: diff, Engine: Engine, engine: new Engine(browserContext) };
});
