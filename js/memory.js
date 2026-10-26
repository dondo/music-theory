/* Flashcard memory model for the study cards (Keys, Find the signature, Play the note, Find the note).
   The same model Find the Chord uses (js/findchord.js), over any set of string-keyed items: each item has a
   half-life h (its recall halves every h ms), R = 2^(-elapsed / h) is the chance you still remember it, and an
   item is drawn in proportion to EPS + (1 - R)^GAMMA, so the time since you last saw it is built into the odds.
   A first-try answer moves h by correctness and speed; a miss shrinks it. Items are independent, so a note in the
   upper octave is tracked apart from the same note an octave down. Pure functions plus optional persistence. */
var Memory = (function () {
  'use strict';

  var H0 = 3 * 60000, H_MIN = 2 * 60000, H_MAX = 60 * 86400000, EPS = 0.05, GAMMA = 1.5;
  var LEARN_N = 3, LEARN_U = 0.5, LEARN_GAP = 2;      // answered fewer than 3 times: still being learned, at least 50% "forgotten" unless asked in the last 2 answers
  var RELEARN = 6, RELEARN_U = 0.8;                  // after a miss: at least 80% "forgotten" for the next 6 answers
  var TREF_DEFAULT = 3000, TREF_MIN = 1200, TREF_N = 100, TREF_NEED = 8, TIME_MAX = 20000, Q_NO_TIME = 0.7;

  function create() { return { p: {}, seq: 0, tm: {} }; }       // p: item -> { h, t, n, l, rs, ls }; tm: speed class -> the last correct first-try times
  function recallOf(m, now) { return m ? Math.pow(2, -Math.max(0, now - m.t) / m.h) : 0; }       // never seen: 0
  function recall(mem, key, now) { return recallOf(mem.p[key], now); }
  function weight(mem, key, now) {
    var m = mem.p[key], u = 1 - recallOf(m, now);
    if (m && mem.seq - m.rs <= RELEARN) u = Math.max(u, RELEARN_U);
    else if (m && m.n < LEARN_N && mem.seq - m.ls > LEARN_GAP) u = Math.max(u, LEARN_U);
    return EPS + Math.pow(u, GAMMA);
  }
  // one of `keys`, in proportion to its weight; `skip(key)` (optional) rules items out (when anything is left); `rng` returns [0, 1)
  function pick(mem, keys, skip, rng, now) {
    var pool = skip ? keys.filter(function (k) { return !skip(k); }) : keys;
    if (!pool.length) pool = keys;
    var ws = pool.map(function (k) { return weight(mem, k, now); }), total = ws.reduce(function (a, b) { return a + b; }, 0), x = rng() * total;
    for (var i = 0; i < pool.length; i++) { x -= ws[i]; if (x < 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  function tRef(mem, cls) {                                      // the bar for "fast": your 20th-percentile correct time in this class
    var a = mem.tm[cls];
    if (!a || a.length < TREF_NEED) return TREF_DEFAULT;
    var b = a.slice().sort(function (x, y) { return x - y; });
    return Math.max(TREF_MIN, b[Math.floor(0.2 * (b.length - 1))]);
  }
  function grade(t, ref) { var r = t / ref; return 1 - 0.5 * Math.max(0, Math.min(1, Math.log(r / 0.8) / Math.log(3.125))); }
  // a first-try answer (`tMs` null when the time can't be trusted); returns what was predicted and what changed
  function answer(mem, key, cls, correct, tMs, now) {
    var m = mem.p[key];
    var out = { R: m ? recallOf(m, now) : null, hBefore: m ? m.h : null, dt: m ? now - m.t : null, q: 0, cls: cls };
    var timed = correct && tMs != null && tMs >= 0 && tMs <= TIME_MAX;
    if (!m) m = { h: H0, t: now, n: 0, l: 0, rs: -99, ls: -99 };
    if (!correct) { m.h = Math.max(H_MIN, 0.35 * m.h); m.l++; m.rs = mem.seq; out.q = 0; }
    else {
      out.q = timed ? grade(tMs, tRef(mem, cls)) : Q_NO_TIME;
      var R = out.R == null ? 0 : out.R, dt = out.dt == null ? 0 : out.dt;
      m.h = Math.min(H_MAX, Math.max(m.h * (1 + 1.5 * out.q * (1.5 - R)), 0.8 * out.q * dt));
    }
    if (timed) { var a = mem.tm[cls] || (mem.tm[cls] = []); a.push(tMs); if (a.length > TREF_N) a.shift(); }
    m.n++; m.t = now; m.ls = mem.seq; mem.p[key] = m; mem.seq++;
    out.hAfter = m.h;
    return out;
  }

  function storage() { try { return (typeof window !== 'undefined' && window.localStorage) || null; } catch (e) { return null; } }
  function load(storeKey, st) {
    st = st === undefined ? storage() : st;
    var mem = create();
    try {
      var o = JSON.parse(st && st.getItem(storeKey));
      if (o && typeof o === 'object') {
        if (Number.isInteger(o.seq) && o.seq >= 0) mem.seq = o.seq;
        Object.keys(o.p || {}).forEach(function (k) {
          var m = o.p[k];
          if (m && isFinite(m.h) && isFinite(m.t) && m.h >= H_MIN && m.h <= H_MAX) mem.p[k] = { h: m.h, t: m.t, n: m.n | 0, l: m.l | 0, rs: Number.isInteger(m.rs) ? m.rs : -99, ls: Number.isInteger(m.ls) ? m.ls : -99 };
        });
        Object.keys(o.tm || {}).forEach(function (c) { if (Array.isArray(o.tm[c])) mem.tm[c] = o.tm[c].filter(function (x) { return isFinite(x) && x > 0 && x <= TIME_MAX; }).slice(-TREF_N); });
      }
    } catch (e) { /* defaults */ }
    return mem;
  }
  function save(storeKey, mem, st) { st = st === undefined ? storage() : st; try { if (st) st.setItem(storeKey, JSON.stringify(mem)); } catch (e) { /* not persisted */ } }
  function reset(mem) { mem.p = {}; mem.seq = 0; mem.tm = {}; }

  var api = {
    H0: H0, H_MIN: H_MIN, H_MAX: H_MAX, EPS: EPS, GAMMA: GAMMA, TREF_DEFAULT: TREF_DEFAULT,
    create: create, recall: recall, weight: weight, pick: pick, tRef: tRef, grade: grade, answer: answer, load: load, save: save, reset: reset
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  return api;
})();
