/* Flashcard weights: keys you miss come up more often. Pure functions plus optional
   persistence to localStorage (silently skipped where storage isn't available). */
var Weights = (function () {
  'use strict';

  var STORAGE_KEY = 'keysig-flashcard-weights-v1';
  var MISS_BUMP = 2;      // added to a key's weight for every wrong answer
  var HIT_DECAY = 1;      // taken off when it is later answered right first time
  var MIN = 1;
  var MAX = 16;           // a much-missed key is ~16x as likely as a fresh one, not unbounded

  function ones() {
    var a = [];
    for (var i = 0; i < 12; i++) a.push(MIN);
    return a;
  }

  function fresh() { return { major: ones(), minor: ones() }; }

  function valid(list) {
    if (!Array.isArray(list) || list.length !== 12) return false;
    return list.every(function (n) { return typeof n === 'number' && isFinite(n) && n >= MIN && n <= MAX; });
  }

  function getStorage() {
    try { return (typeof window !== 'undefined' && window.localStorage) || null; } catch (e) { return null; }
  }

  function load(storage) {
    storage = storage === undefined ? getStorage() : storage;
    try {
      var raw = storage && storage.getItem(STORAGE_KEY);
      if (raw) {
        var w = JSON.parse(raw);
        if (w && valid(w.major) && valid(w.minor)) return { major: w.major, minor: w.minor };
      }
    } catch (e) { /* fall through to defaults */ }
    return fresh();
  }

  function save(w, storage) {
    storage = storage === undefined ? getStorage() : storage;
    try { if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(w)); } catch (e) { /* not persisted */ }
  }

  function miss(w, mode, pc) { w[mode][pc] = Math.min(MAX, w[mode][pc] + MISS_BUMP); }
  function hit(w, mode, pc) { w[mode][pc] = Math.max(MIN, w[mode][pc] - HIT_DECAY); }

  function reset(w) {
    w.major = ones();
    w.minor = ones();
  }

  // Weighted random pitch class, never `avoid` (so the same card isn't dealt twice in a row).
  function pick(list, rng, avoid) {
    var total = 0;
    var i;
    for (i = 0; i < 12; i++) if (i !== avoid) total += list[i];
    var x = rng() * total;
    for (i = 0; i < 12; i++) {
      if (i === avoid) continue;
      x -= list[i];
      if (x < 0) return i;
    }
    return avoid === 11 ? 10 : 11;        // floating-point edge: fall back to the last candidate
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY, MISS_BUMP: MISS_BUMP, HIT_DECAY: HIT_DECAY, MIN: MIN, MAX: MAX,
    fresh: fresh, load: load, save: save, miss: miss, hit: hit, reset: reset, pick: pick
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  return api;
})();
