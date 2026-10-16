/* "Find the chord": the difficulty ladder and the question picker. Pure functions, no DOM.
 *
 * Two independent dials, both counted from 1:
 *   keys   - how many keys are in play (most common first: C, G, F, D, B♭ ... ; A, E, D, B, G ... in minor)
 *   chords - how many chord groups are in play (I IV V V7 first, then vi ii, then the sevenths ...)
 * A chord is { deg: 0..6, type } exactly as the chord selector uses it.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.FindChord = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // pitch classes, most familiar key first
  var KEY_ORDER = {
    major: [0, 7, 5, 2, 10, 9, 3, 4, 8, 11, 1, 6],     // C G F D B♭ A E♭ E A♭ B D♭ F♯/G♭
    minor: [9, 4, 2, 11, 7, 6, 0, 1, 5, 8, 10, 3]      // A E D B G F♯ C C♯ F G♯ B♭ D♯/E♭
  };

  function c(deg, type) { return { deg: deg, type: type || 'triad' }; }

  // the hand-picked first groups: [degrees, type] pairs; each inner array is one level
  var START = {
    major: [
      [c(0), c(3), c(4), c(4, '7')],                       // I IV V V7
      [c(5), c(1)],                                        // vi ii
      [c(0, '7'), c(3, '7'), c(1, '7'), c(5, '7')],        // the sevenths of those
      [c(2), c(6)],                                        // iii vii°
      [c(2, '7'), c(6, '7')]
    ],
    minor: [
      [c(0), c(3), c(4), c(5)],                            // i iv v VI
      [c(6), c(2)],                                        // VII III
      [c(0, '7'), c(3, '7'), c(4, '7'), c(5, '7')],
      [c(6, '7'), c(2, '7')],
      [c(1), c(1, '7')]                                    // ii° and its seventh
    ]
  };
  // after that, one type at a time (most common first), the principal degrees before the rest
  var LATER_TYPES = ['sus4', 'sus2', 'add9', '9', '11', '13'];
  var PRINCIPAL = { major: [0, 4, 3], minor: [0, 3, 4] };
  var ALL_DEGS = { major: [0, 4, 3, 5, 1, 2, 6], minor: [0, 3, 4, 5, 6, 2, 1] };
  var POP_HIDDEN = ['11', '13'];

  function groups(mode, pop) {
    mode = mode === 'minor' ? 'minor' : 'major';
    var out = START[mode].map(function (g) { return g.slice(); });
    LATER_TYPES.forEach(function (t) {
      if (pop && POP_HIDDEN.indexOf(t) >= 0) return;
      var first = PRINCIPAL[mode].map(function (d) { return c(d, t); });
      var rest = ALL_DEGS[mode].filter(function (d) { return PRINCIPAL[mode].indexOf(d) < 0; }).map(function (d) { return c(d, t); });
      out.push(first, rest);
    });
    return out;
  }

  function maxKeys() { return 12; }
  function maxChords(mode, pop) { return groups(mode, pop).length; }
  function clamp(n, lo, hi) { n = Math.round(Number(n)); if (!isFinite(n)) n = lo; return Math.max(lo, Math.min(hi, n)); }

  // the key pitch classes in play at this keys level
  function keys(mode, n) {
    return KEY_ORDER[mode === 'minor' ? 'minor' : 'major'].slice(0, clamp(n, 1, 12));
  }
  // the chords in play at this chords level (all groups up to and including it)
  function chords(mode, pop, n) {
    var g = groups(mode, pop), top = clamp(n, 1, g.length), out = [];
    for (var i = 0; i < top; i++) out = out.concat(g[i]);
    return out;
  }

  // one question: a key (pc) and a chord, never the same pair as `avoid` (when there is any choice)
  // `rng` returns [0, 1); `avoid` is { pc, deg, type } or null
  function pick(mode, pop, keysLevel, chordsLevel, rng, avoid) {
    var ks = keys(mode, keysLevel), cs = chords(mode, pop, chordsLevel);
    var all = [];
    ks.forEach(function (pc) { cs.forEach(function (ch) { all.push({ pc: pc, deg: ch.deg, type: ch.type }); }); });
    var pool = all.filter(function (q) {
      return !(avoid && q.pc === avoid.pc && q.deg === avoid.deg && q.type === avoid.type);
    });
    if (!pool.length) pool = all;
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  }

  // Levelling up by itself: after STREAK first-try answers in a row the next dial goes up one, keys and
  // chords taking turns (keys first). Returns the new { keys, chords, next } or null when nothing can rise.
  var STREAK = 5;
  function levelUp(mode, pop, keysLevel, chordsLevel, nextDial) {
    var dials = nextDial === 'chords' ? ['chords', 'keys'] : ['keys', 'chords'];
    for (var i = 0; i < 2; i++) {
      if (dials[i] === 'keys' && keysLevel < maxKeys()) return { keys: keysLevel + 1, chords: chordsLevel, next: 'chords' };
      if (dials[i] === 'chords' && chordsLevel < maxChords(mode, pop)) return { keys: keysLevel, chords: chordsLevel + 1, next: 'keys' };
    }
    return null;
  }

  // "Find a chord": which of the key's chords is exactly the notes picked on the keyboard?
  // `cands`: [{ deg, type, pcs: [absolute pitch classes], rootPc, rank }] (lower rank = more common);
  // `picked`: absolute key numbers (semitones), any octave. The picked pitch classes must equal a chord's;
  // when several chords share them (C sus2 / G sus4 are both C D G) the one rooted on the lowest key wins,
  // then the more common type. Returns the candidate or null.
  function identify(cands, picked) {
    if (!picked || !picked.length) return null;
    var pcs = {}, bass = Infinity, n = 0;
    picked.forEach(function (s) {
      var pc = ((s % 12) + 12) % 12;
      if (!pcs[pc]) { pcs[pc] = true; n++; }
      if (s < bass) bass = s;
    });
    var bassPc = ((bass % 12) + 12) % 12;
    var hits = cands.filter(function (c) {
      if (c.pcs.length !== n) return false;
      return c.pcs.every(function (pc) { return pcs[((pc % 12) + 12) % 12]; });
    });
    if (!hits.length) return null;
    hits.sort(function (a, b) {
      var ra = a.rootPc === bassPc ? 0 : 1, rb = b.rootPc === bassPc ? 0 : 1;
      return (ra - rb) || (a.rank - b.rank);
    });
    return hits[0];
  }

  return { KEY_ORDER: KEY_ORDER, STREAK: STREAK, groups: groups, maxKeys: maxKeys, maxChords: maxChords,
           clamp: clamp, keys: keys, chords: chords, pick: pick, levelUp: levelUp, identify: identify };
});
