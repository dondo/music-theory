/* "Find the chord": the difficulty ladder and the question picker. Pure functions, no DOM.
 *
 * Two independent dials, both counted from 1:
 *   keys   - how many keys are in play (C, D, G, A, F first, then D♭, B♭, E♭ ...; their relative minors in minor)
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
    major: [0, 2, 7, 9, 5, 1, 10, 3, 4, 8, 11, 6],     // C D G A F, then D♭ B♭ E♭, then E A♭ B F♯/G♭
    minor: [9, 11, 4, 6, 2, 10, 7, 0, 1, 5, 8, 3]      // the same keys' relatives: A B E F♯ D, B♭ G C, C♯ F G♯ D♯/E♭
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

  // ---- missed chords come up more often (the same scheme as the key-signature flashcards) ----
  // One weight per chord in a key ("major|0|4|7" = V7 in C major); 1 for a chord never missed.
  var W_KEY = 'music-theory-ftc-weights-v1';
  var MISS_BUMP = 2, HIT_DECAY = 1, W_MIN = 1, W_MAX = 16;
  function weightKey(mode, q) { return mode + '|' + q.pc + '|' + q.deg + '|' + q.type; }
  function weightOf(w, mode, q) { var x = w && w[weightKey(mode, q)]; return typeof x === 'number' && isFinite(x) ? Math.min(W_MAX, Math.max(W_MIN, x)) : W_MIN; }
  function miss(w, mode, q) { w[weightKey(mode, q)] = Math.min(W_MAX, weightOf(w, mode, q) + MISS_BUMP); }
  function hit(w, mode, q) {                              // answered right first time: ease off, and forget a chord back at 1
    var k = weightKey(mode, q), v = Math.max(W_MIN, weightOf(w, mode, q) - HIT_DECAY);
    if (v <= W_MIN) delete w[k]; else w[k] = v;
  }
  function storage() { try { return (typeof window !== 'undefined' && window.localStorage) || null; } catch (e) { return null; } }
  function loadWeights(st) {
    st = st === undefined ? storage() : st;
    try {
      var o = JSON.parse(st && st.getItem(W_KEY));
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        var w = {};
        Object.keys(o).forEach(function (k) { if (typeof o[k] === 'number' && isFinite(o[k]) && o[k] > W_MIN && o[k] <= W_MAX) w[k] = o[k]; });
        return w;
      }
    } catch (e) { /* defaults */ }
    return {};
  }
  function saveWeights(w, st) {
    st = st === undefined ? storage() : st;
    try { if (st) st.setItem(W_KEY, JSON.stringify(w)); } catch (e) { /* not persisted */ }
  }
  function resetWeights(w) { Object.keys(w).forEach(function (k) { delete w[k]; }); }

  // one question: a key (pc) and a chord, never the same pair as `avoid` (when there is any choice);
  // `weight(q)` (optional, >= 1) makes the chords you have missed more likely
  // `rng` returns [0, 1); `avoid` is { pc, deg, type } or null
  // `fresh(q)` (optional) marks the new challenge of the level; `how` is 'only' (just those) or 'boost' (those weigh FRESH_BOOST times more)
  function pick(mode, pop, keysLevel, chordsLevel, rng, avoid, weight, fresh, how) {
    var ks = keys(mode, keysLevel), cs = chords(mode, pop, chordsLevel);
    var all = [];
    ks.forEach(function (pc) { cs.forEach(function (ch) { all.push({ pc: pc, deg: ch.deg, type: ch.type }); }); });
    var pool = all.filter(function (q) {
      return !(avoid && q.pc === avoid.pc && q.deg === avoid.deg && q.type === avoid.type);
    });
    if (!pool.length) pool = all;
    if (!weight && !(fresh && how)) return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    var ws = pool.map(function (q) {
      var w = weight ? Math.max(0, weight(q)) : 1;
      if (fresh && how) { if (fresh(q)) w *= how === 'boost' ? FRESH_BOOST : 1; else if (how === 'only') w = 0; }
      return w;
    }), total = ws.reduce(function (a, b) { return a + b; }, 0);
    if (total <= 0) return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    var x = rng() * total;
    for (var i = 0; i < pool.length; i++) { x -= ws[i]; if (x < 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  // ---- the newest challenge of a level (a new key, or a new group of chords) ----
  // It is asked about often at first, and in every run of FRESH_WINDOW questions at least FRESH_MIN are about it.
  var FRESH_WINDOW = 5, FRESH_MIN = 2, FRESH_BOOST = 4;
  // `last`: the dial raised most recently, 'keys' | 'chords' | null (nothing new). Returns a predicate or null.
  function freshTest(mode, pop, keysLevel, chordsLevel, last) {
    if (last === 'keys') {
      var pc = keys(mode, keysLevel).slice(-1)[0];
      return keysLevel > 1 ? function (q) { return q.pc === pc; } : null;
    }
    if (last === 'chords') {
      var g = groups(mode, pop), grp = g[Math.min(g.length, Math.max(1, chordsLevel)) - 1];
      return chordsLevel > 1 ? function (q) { return grp.some(function (c) { return c.deg === q.deg && c.type === q.type; }); } : null;
    }
    return null;
  }
  // t = { asked, fresh } for the current run: 'only' when the run needs every question left to reach the minimum, else 'boost'
  function freshPlan(t) {
    var remaining = FRESH_WINDOW - t.asked, need = FRESH_MIN - t.fresh;
    return need > 0 && remaining <= need ? 'only' : 'boost';
  }
  function freshRecord(t, wasFresh) {
    t.asked++;
    if (wasFresh) t.fresh++;
    if (t.asked >= FRESH_WINDOW) { t.asked = 0; t.fresh = 0; }
  }
  // Which inversion to show: always root position in Pop; in Jazz root position about 40% of the time,
  // the rest shared out equally among the inversions (0 = root position). `notes` = notes in the chord.
  function pickInversion(notes, jazz, rng) {
    if (!jazz || notes < 2) return 0;
    if (rng() < 0.4) return 0;
    return 1 + Math.min(notes - 2, Math.floor(rng() * (notes - 1)));
  }

  // Levelling up by itself: after STREAK first-try answers in a row the next dial goes up one, keys and
  // chords taking turns (keys first). Returns the new { keys, chords, next } or null when nothing can rise.
  var STREAK = 10;                      // (the app drops this to 5 in the local copy, for testing)
  // The order the new things are introduced in: which dial gets something new at each event.
  // Four more keys (C already; D G A F), then the vi ii chords, then three more keys (D♭ B♭ E♭), then the sevenths,
  // then two keys (E A♭), then iii and vii°, then two keys (B F♯/G♭), then their sevenths; after that only chords are left.
  var PLAN = ['keys', 'keys', 'keys', 'keys', 'chords', 'keys', 'keys', 'keys', 'chords', 'keys', 'keys', 'chords', 'keys', 'keys', 'chords'];
  // The ladder of levels, one { keys, chords } per level (level 1 first). A new thing doesn't just stack on the old:
  //  - a NEW CHORD GROUP sends the keys back to C and D, which then come back one at a time up to the keys already known;
  //  - a NEW KEY, once chords beyond I IV V are known (chords level 2+), sends the chords back to I IV V,
  //    which then come back one group at a time up to the chords already known.
  var ladders = {};
  function ladder(mode, pop) {
    mode = mode === 'minor' ? 'minor' : 'major';
    var id = mode + (pop ? '|pop' : '|jazz');
    if (ladders[id]) return ladders[id];
    var maxC = maxChords(mode, pop), kHi = 1, cHi = 1, out = [{ keys: 1, chords: 1 }];
    for (var ev = 0; ; ev++) {
      var d = PLAN[ev] || 'chords';
      if (d === 'keys' && kHi >= maxKeys()) d = 'chords';
      else if (d === 'chords' && cHi >= maxC) d = 'keys';
      if (d === 'keys' ? kHi >= maxKeys() : cHi >= maxC) break;
      var i;
      if (d === 'keys') {
        kHi++;
        if (cHi >= 2) for (i = 1; i <= cHi; i++) out.push({ keys: kHi, chords: i });
        else out.push({ keys: kHi, chords: cHi });
      } else {
        cHi++;
        for (i = Math.min(2, kHi); i <= kHi; i++) out.push({ keys: i, chords: cHi });
      }
    }
    return (ladders[id] = out);
  }
  // where (keys, chords) sits on the ladder (the nearest step when it is not on it, e.g. a level saved by an older version)
  function indexOf(mode, pop, k, c) {
    var L = ladder(mode, pop), best = 0, bd = Infinity;
    for (var i = 0; i < L.length; i++) {
      var dist = Math.abs(L[i].keys - k) + Math.abs(L[i].chords - c);
      if (dist < bd) { bd = dist; best = i; if (!dist) break; }
    }
    return best;
  }
  // which dial a step moved: 'keys' when the keys went up, else 'chords'
  function stepDial(L, i) { return L[i].keys > L[i - 1].keys ? 'keys' : 'chords'; }
  function levelNumber(mode, pop, keysLevel, chordsLevel) { return indexOf(mode, pop, keysLevel, chordsLevel) + 1; }
  function levelCount(mode, pop) { return ladder(mode, pop).length; }
  // the keys and chords levels that make up overall level n (1 = one key, the first chord group)
  function levelAt(mode, pop, n) {
    var L = ladder(mode, pop), l = L[clamp(n, 1, L.length) - 1];
    return { keys: l.keys, chords: l.chords };
  }
  // the dial the next level moves (or null at the top)
  function planDial(mode, pop, keysLevel, chordsLevel) {
    var L = ladder(mode, pop), i = indexOf(mode, pop, keysLevel, chordsLevel);
    return i + 1 < L.length ? stepDial(L, i + 1) : null;
  }
  // the dial whose move led to this level (null at level 1)
  function lastDial(mode, pop, keysLevel, chordsLevel) {
    var L = ladder(mode, pop), i = indexOf(mode, pop, keysLevel, chordsLevel);
    return i > 0 ? stepDial(L, i) : null;
  }
  function levelUp(mode, pop, keysLevel, chordsLevel) {
    var L = ladder(mode, pop), i = indexOf(mode, pop, keysLevel, chordsLevel);
    if (i + 1 >= L.length) return null;
    return { keys: L[i + 1].keys, chords: L[i + 1].chords, next: i + 2 < L.length ? stepDial(L, i + 2) : stepDial(L, i + 1) };
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
           clamp: clamp, keys: keys, chords: chords, pick: pick, levelUp: levelUp, levelAt: levelAt, planDial: planDial, lastDial: lastDial, identify: identify,
           weightKey: weightKey, weightOf: weightOf, miss: miss, hit: hit, loadWeights: loadWeights, saveWeights: saveWeights, resetWeights: resetWeights,
           pickInversion: pickInversion, freshTest: freshTest, freshPlan: freshPlan, freshRecord: freshRecord,
           levelNumber: levelNumber, levelCount: levelCount, FRESH_WINDOW: FRESH_WINDOW, FRESH_MIN: FRESH_MIN };
});
