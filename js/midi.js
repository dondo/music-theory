// A digital piano as an input (Web MIDI): the keys pressed on it answer the Study questions that ask for a key or a chord.
// Desktop Chrome / Edge / Firefox (after a permission prompt) and Android Chrome over USB; Safari and every iOS browser have no Web MIDI.
//
//   Midi.supported            true when this browser has navigator.requestMIDIAccess
//   Midi.connect()            ask for access, listen on every MIDI input (new ones are picked up when plugged in); a promise
//   Midi.disconnect()         stop listening
//   Midi.onPlay(fn)           fn({ notes: [midi numbers, lowest first], seq: [{ n, t }] }) after a press: the keys that went down within CHORD_MS of each other
//                             (seq: the same keys in the order they went down, t in ms, for telling a roll or an arpeggio from a chord)
//   Midi.onStatus(fn)         fn({ state: 'off'|'connecting'|'on'|'none'|'denied'|'unsupported', inputs: [names] }) whenever that changes
//   Midi.status()             the same object, now
//   Midi.simulate(notes)      (testing) play these notes as if the piano had
//
// Only note-on counts (velocity 0 is a note-off, as the MIDI spec has it); the pedal, pitch bend and the rest are ignored.
// Fingers never land at exactly the same instant, so a press is closed CHORD_MS after its latest note (but never more than CHORD_MAX_MS after
// its first) and everything that went down by then is one chord. (A fixed window from the first note split big chords in two.)
(function (root) {
  'use strict';
  var CHORD_MS = 120, CHORD_MAX_MS = 400;
  var access = null, listening = false, inputs = [], playCb = [], statusCb = [], state = 'off';
  var pending = null, seq = null, timer = null, firstAt = 0;

  function supported() { return !!(root.navigator && typeof root.navigator.requestMIDIAccess === 'function'); }
  function status() { return { state: state, inputs: inputs.map(function (i) { return i.name || 'MIDI input'; }) }; }
  function setState(s) { state = s; statusCb.forEach(function (fn) { try { fn(status()); } catch (e) { /* a listener's problem */ } }); }

  function flush() {
    timer = null; firstAt = 0;
    var notes = pending, sq = seq; pending = null; seq = null;
    if (!notes || !notes.length) return;
    notes.sort(function (a, b) { return a - b; });
    playCb.forEach(function (fn) { try { fn({ notes: notes, seq: sq || [] }); } catch (e) { if (root.console) root.console.error(e); } });
  }
  function noteOn(n, ts) {
    var now = Date.now(), t = ts != null ? ts : (root.performance && root.performance.now ? root.performance.now() : now);
    if (!pending) { pending = []; seq = []; }
    if (pending.indexOf(n) < 0) { pending.push(n); seq.push({ n: n, t: t }); }
    if (!timer) firstAt = now; else root.clearTimeout(timer);
    timer = root.setTimeout(flush, Math.max(0, Math.min(CHORD_MS, firstAt + CHORD_MAX_MS - now)));
  }
  function onMessage(ev) {
    var d = ev.data;
    if (!d || d.length < 3) return;
    if ((d[0] & 0xf0) === 0x90 && d[2] > 0) noteOn(d[1], ev.timeStamp);
  }

  function refresh() {
    if (!access) return;
    inputs = [];
    access.inputs.forEach(function (inp) {
      if (inp.state === 'disconnected') return;
      inp.onmidimessage = listening ? onMessage : null;
      inputs.push(inp);
    });
    setState(!listening ? 'off' : inputs.length ? 'on' : 'none');
  }

  function connect() {
    if (!supported()) { setState('unsupported'); return Promise.resolve(status()); }
    listening = true;
    setState('connecting');
    return root.navigator.requestMIDIAccess().then(function (a) {
      access = a;
      a.onstatechange = refresh;                      // (plugging the piano in or out)
      refresh();
      return status();
    }, function () {
      listening = false; inputs = [];
      setState('denied');
      return status();
    });
  }
  function disconnect() {
    listening = false;
    if (access) { access.inputs.forEach(function (inp) { inp.onmidimessage = null; }); }
    inputs = [];
    pending = null; if (timer) { root.clearTimeout(timer); timer = null; }
    setState('off');
  }

  var api = {
    supported: supported, connect: connect, disconnect: disconnect, status: status,
    onPlay: function (fn) { playCb.push(fn); },
    onStatus: function (fn) { statusCb.push(fn); },
    simulate: function (notes, gapMs) {          // (gapMs: pretend the keys went down that far apart)
      var t0 = root.performance && root.performance.now ? root.performance.now() : Date.now();
      notes.forEach(function (n, i) { noteOn(n, t0 + i * (gapMs || 0)); });
    },
    CHORD_MS: CHORD_MS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Midi = api;
}(typeof window !== 'undefined' ? window : globalThis));
