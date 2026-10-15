/* Left-hand chord fingering. Pure functions, no DOM.
 *
 * Each chord is voiced as one inversion (plus an octave choice) inside the keys that are on screen,
 * and the voicings for a whole progression are chosen together so the hand moves as little as
 * possible from chord to chord (and from the last chord back round to the first, since the
 * progression cycles). Chords of five or more notes (9th, 11th, 13th) are cut down to four tones:
 * root, third, seventh and the top extension.
 *
 * Positions are semitones above the key's tonic (the root key of the keyboard).
 */
var Fingering = (function () {
  'use strict';

  var MAX_SPAN = 9;                       // widest comfortable left-hand stretch, in semitones
  var PATTERN = { 1: [1], 2: [5, 1], 3: [5, 3, 1], 4: [5, 3, 2, 1] };   // lowest note first; 5 = little finger, 1 = thumb
  var ORDINALS = ['root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion', '5th inversion', '6th inversion'];

  function mod12(x) { return ((x % 12) + 12) % 12; }

  // which tones of a chord with n notes the left hand plays (indices into the chord's note list)
  function keep(n) {
    if (n <= 4) { var all = []; for (var i = 0; i < n; i++) all.push(i); return all; }
    return [0, 1, 3, n - 1];
  }

  // every way to place the chord's tones inside [lo, hi] (one note per tone), as sorted note lists
  function voicings(offsets, lo, hi) {
    var idxs = keep(offsets.length);
    var options = idxs.map(function (idx) {
      var pc = mod12(offsets[idx]);
      var list = [];
      for (var o = pc + 12 * Math.ceil((lo - pc) / 12); o <= hi; o += 12) list.push({ o: o, idx: idx });
      return list;
    });
    var out = [];
    (function build(i, acc) {
      if (i === options.length) { out.push(acc.slice().sort(function (a, b) { return a.o - b.o; })); return; }
      options[i].forEach(function (n) { acc.push(n); build(i + 1, acc); acc.pop(); });
    })(0, []);
    function span(v) { return v[v.length - 1].o - v[0].o; }
    var snug = out.filter(function (v) { return span(v) <= MAX_SPAN; });
    return snug.length ? snug : out;
  }

  function span(v) { return v[v.length - 1].o - v[0].o; }
  function mean(v) { var s = 0; v.forEach(function (n) { s += n.o; }); return s / v.length; }

  // cost of playing this voicing on its own: a tight hand, and a mild preference for root position
  function own(v) { return 0.35 * span(v) + 0.15 * v[0].idx; }

  // cost of moving the hand from voicing a to voicing b: how far the hand shifts, less credit for shared notes
  function move(a, b) {
    var common = 0;
    a.forEach(function (x) { b.forEach(function (y) { if (x.o === y.o) common++; }); });
    return Math.abs(mean(a) - mean(b)) + 0.5 * Math.abs(a[0].o - b[0].o) + 0.5 * Math.abs(a[a.length - 1].o - b[b.length - 1].o) - 1.5 * common;
  }

  // chords: array of semitone-offset arrays (from the tonic, chord root first). Returns, per chord,
  // { notes: [{ o, idx, finger }], inversion: idx of the lowest note, name }.
  function plan(chords, lo, hi) {
    var cands = chords.map(function (offs) { return voicings(offs, lo, hi); });
    var n = chords.length;
    if (!n) return [];
    var best = null;
    cands[0].forEach(function (first, fi) {            // the progression cycles: try every start and close the loop
      var cost = cands[0].map(function (v, i) { return i === fi ? own(v) : Infinity; });
      var back = [cost.map(function () { return -1; })];
      for (var k = 1; k < n; k++) {
        var next = [];
        var from = [];
        cands[k].forEach(function (v) {
          var m = Infinity, arg = -1;
          cands[k - 1].forEach(function (u, ui) {
            var c = cost[ui] + move(u, v);
            if (c < m) { m = c; arg = ui; }
          });
          next.push(m + own(v));
          from.push(arg);
        });
        cost = next;
        back.push(from);
      }
      cost.forEach(function (c, li) {
        var total = c + (n > 1 ? move(cands[n - 1][li], first) : 0);
        if (!best || total < best.total - 1e-9) {
          var pick = new Array(n);
          var cur = li;
          for (var k2 = n - 1; k2 >= 0; k2--) { pick[k2] = cur; cur = back[k2][cur]; }
          best = { total: total, pick: pick };
        }
      });
    });
    return best.pick.map(function (vi, k) {
      var v = cands[k][vi];
      var fingers = PATTERN[v.length] || [5, 4, 3, 2, 1];
      return {
        notes: v.map(function (nt, i) { return { o: nt.o, idx: nt.idx, finger: fingers[i] }; }),
        inversion: v[0].idx,
        name: ORDINALS[v[0].idx] || (v[0].idx + 'th inversion')
      };
    });
  }

  // Move one voicing up (steps > 0) or down by whole inversions: the lowest note goes up an octave to the top,
  // or the highest comes down to the bottom. Returns null if a note would leave [lo, hi].
  function shift(notes, steps, lo, hi) {
    var v = notes.map(function (n) { return { o: n.o, idx: n.idx }; }).sort(function (a, b) { return a.o - b.o; });
    var k;
    for (k = 0; k < steps; k++) { var low = v.shift(); low.o += 12; v.push(low); }
    for (k = 0; k > steps; k--) { var high = v.pop(); high.o -= 12; v.unshift(high); }
    v.sort(function (a, b) { return a.o - b.o; });
    if (v[0].o < lo || v[v.length - 1].o > hi) return null;
    var fingers = PATTERN[v.length] || [5, 4, 3, 2, 1];
    return {
      notes: v.map(function (nt, i) { return { o: nt.o, idx: nt.idx, finger: fingers[i] }; }),
      inversion: v[0].idx,
      name: ORDINALS[v[0].idx] || (v[0].idx + 'th inversion')
    };
  }

  var api = { plan: plan, shift: shift, voicings: voicings, keep: keep, MAX_SPAN: MAX_SPAN };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  return api;
})();
