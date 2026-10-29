// Run: node tools/test_theory.js
// Checks the hand-entered key-signature table against independently spelled scales.
var assert = require('assert');
var T = require('../js/theory.js');
var R = require('../js/render.js');

var failures = 0;
function check(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

var LETTERS = T.LETTERS;

['major', 'minor'].forEach(function (mode) {
  for (var pc = 0; pc < 12; pc++) {
    T.specsFor(mode, pc).forEach(function (sp) {
      check(mode + ' ' + sp.name + ': signature matches spelled scale', function () {
        var sc = T.spellScale(sp.name, mode);
        assert.strictEqual(sc.rootPc, pc, 'root pitch class');
        // one of each letter, no double accidentals
        var letters = sc.names.map(function (n) { return n.charAt(0); }).sort().join('');
        assert.strictEqual(letters, 'ABCDEFG', 'each letter once: ' + sc.names.join(' '));
        sc.names.forEach(function (n) { assert.ok(n.length <= 2, 'double accidental in ' + n); });
        var sharps = sc.names.filter(function (n) { return n.indexOf(T.SHARP) > -1; }).length;
        var flats = sc.names.filter(function (n) { return n.indexOf(T.FLAT) > -1; }).length;
        if (sp.n === 0) {
          assert.strictEqual(sharps + flats, 0);
        } else if (sp.kind === 'sharp') {
          assert.strictEqual(flats, 0, 'no flats in a sharp key');
          assert.ok(sharps > 0);
        } else {
          assert.strictEqual(sharps, 0, 'no sharps in a flat key');
          assert.ok(flats > 0);
        }
        // the signature lists exactly the letters that carry accidentals in the scale
        var fromSig = T.signatureNotes(sp).sort().join(' ');
        var fromScale = sc.names.filter(function (n) { return n.length > 1; }).sort().join(' ');
        assert.strictEqual(fromSig, fromScale, 'sig ' + fromSig + ' vs scale ' + fromScale);
        assert.strictEqual(sp.n, sc.names.filter(function (n) { return n.length > 1; }).length);
      });
    });
  }
});

check('spot checks', function () {
  assert.strictEqual(T.spellScale('D', 'major').names.join(' '), 'D E F♯ G A B C♯');
  assert.strictEqual(T.spellScale('G♭', 'major').names.join(' '),
    'G♭ A♭ B♭ C♭ D♭ E♭ F');
  assert.strictEqual(T.spellScale('A', 'minor').names.join(' '), 'A B C D E F G');
  assert.strictEqual(T.spellScale('C♯', 'minor').names.join(' '),
    'C♯ D♯ E F♯ G♯ A B');
  assert.strictEqual(T.spellScale('E♭', 'minor').names.join(' '),
    'E♭ F G♭ A♭ B♭ C♭ D♭');
  assert.strictEqual(T.spellScale('D', 'major').third.name, 'F♯');
  assert.strictEqual(T.spellScale('D', 'minor').third.name, 'F');
  assert.strictEqual(T.spellScale('D', 'major').third.offset, 4);
  assert.strictEqual(T.spellScale('D', 'minor').third.offset, 3);
});

check('every pitch class has exactly one two-spelling key per mode', function () {
  ['major', 'minor'].forEach(function (mode) {
    var doubles = 0;
    for (var pc = 0; pc < 12; pc++) if (T.specsFor(mode, pc).length === 2) doubles++;
    assert.strictEqual(doubles, 1, mode);
  });
});

// ---- window geometry: always a full octave, root key leftmost ---------------
check('window holds the octave and never splits a black-key group', function () {
  for (var r = 0; r < 12; r++) {
    var g = R.windowGeom(r);
    assert.ok(g.width <= R.WIDTH - 2 * R.PAD + 0.001, 'root ' + r + ' fits: ' + g.width);
    assert.strictEqual(g.width % R.W, 0, 'root ' + r + ' window is whole white keys');
    // starts on C (pair start) or F (triple start)
    assert.strictEqual(g.startSemitone, r <= 4 ? 0 : 5, 'root ' + r + ' leftmost key');
    // holds the root and the octave above it (white keys or the black key's edges)
    assert.ok(g.right - g.left >= 7 * R.W, 'root ' + r + ' at least an octave wide');
    // ends after E or B: the number of white keys from the left is 10 (C..E) or 11 (F..B)
    var n = g.width / R.W;
    assert.ok(n === 10 || n === 11, 'root ' + r + ' shows ' + n + ' white keys');
  }
});

// ---- diatonic chords -----------------------------------------------------------
var Ch = require('../js/chords.js');
function chordRow(root, mode, type) {
  var row = [];
  for (var d = 0; d < 7; d++) row.push(Ch.chordInKey(root, mode, d, type).symbol);
  return row.join(' ');
}
function romanRow(root, mode, type) {
  var row = [];
  for (var d = 0; d < 7; d++) row.push(Ch.chordInKey(root, mode, d, type).roman);
  return row.join(' ');
}
check('chords: C major triads, sevenths and numerals', function () {
  assert.strictEqual(chordRow('C', 'major', 'triad'), 'C Dm Em F G Am Bdim');
  assert.strictEqual(romanRow('C', 'major', 'triad'), 'I ii iii IV V vi vii\u00B0');
  assert.strictEqual(chordRow('C', 'major', '7'), 'Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7\u266D5');
  assert.strictEqual(romanRow('C', 'major', '7'), 'Imaj7 ii7 iii7 IVmaj7 V7 vi7 vii\u00F87');
});
check('chords: A natural minor has the same chords with minor numerals', function () {
  assert.strictEqual(chordRow('A', 'minor', 'triad'), 'Am Bdim C Dm Em F G');
  assert.strictEqual(romanRow('A', 'minor', 'triad'), 'i ii\u00B0 III iv v VI VII');
  assert.strictEqual(romanRow('A', 'minor', '7'), 'i7 ii\u00F87 IIImaj7 iv7 v7 VImaj7 VII7');
});
check('chords: modes follow the degree (and the key for minor)', function () {
  var maj = [], min = [];
  for (var d = 0; d < 7; d++) { maj.push(Ch.modeName('major', d)); min.push(Ch.modeName('minor', d)); }
  assert.deepStrictEqual(maj, ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian']);
  assert.deepStrictEqual(min, ['Aeolian', 'Locrian', 'Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian']);
  assert.strictEqual(Ch.chordInKey('D', 'major', 1, 'triad').modeFull, 'E Dorian');
});
check('chords: extensions, suspensions and added tones', function () {
  assert.strictEqual(chordRow('C', 'major', 'sus2'), 'Csus2 Dsus2 Esus2 Fsus2 Gsus2 Asus2 Bsus2');
  assert.strictEqual(chordRow('C', 'major', 'sus4'), 'Csus4 Dsus4 Esus4 Fsus4 Gsus4 Asus4 Bsus4');
  assert.strictEqual(chordRow('C', 'major', '9'), 'Cmaj9 Dm9 Em7(\u266D9) Fmaj9 G9 Am9 Bm7\u266D5(\u266D9)');
  assert.strictEqual(chordRow('C', 'major', 'add9').split(' ')[0], 'Cadd9');
  assert.strictEqual(Ch.chordInKey('C', 'major', 3, '11').symbol, 'Fmaj11(\u266F11)');
  assert.strictEqual(Ch.chordInKey('C', 'major', 4, '13').symbol, 'G13');
});
check('chords: notes are spelled from the key (D major, G-flat major)', function () {
  assert.deepStrictEqual(Ch.chordInKey('D', 'major', 4, '7').notes, ['A', 'C\u266F', 'E', 'G']);
  assert.strictEqual(Ch.chordInKey('D', 'major', 4, '7').symbol, 'A7');
  assert.deepStrictEqual(Ch.chordInKey('G\u266D', 'major', 0, 'triad').notes, ['G\u266D', 'B\u266D', 'D\u266D']);
  assert.deepStrictEqual(Ch.chordInKey('C', 'major', 6, '7').intervalLabels, ['R', '\u266D3', '\u266D5', '\u266D7']);
});
check('chords: pitch classes and quality words', function () {
  var g7 = Ch.chordInKey('C', 'major', 4, '7');
  assert.deepStrictEqual(g7.pcOffsets, [7, 11, 2, 5]);
  assert.strictEqual(g7.description, 'dominant seventh');
  assert.strictEqual(Ch.chordInKey('C', 'major', 6, '7').description, 'half-diminished seventh');
  assert.strictEqual(Ch.chordInKey('C', 'major', 1, '9').description, 'minor ninth');
  assert.strictEqual(Ch.chordInKey('C', 'major', 6, 'triad').description, 'diminished triad');
});
check('chords: every key, degree and type produces a well-formed chord', function () {
  ['major', 'minor'].forEach(function (mode) {
    for (var pc = 0; pc < 12; pc++) {
      T.specsFor(mode, pc).forEach(function (sp) {
        for (var d = 0; d < 7; d++) {
          Ch.TYPES.forEach(function (ty) {
            var c = Ch.chordInKey(sp.name, mode, d, ty.id);
            assert.strictEqual(c.notes.length, ty.steps.length);
            assert.ok(c.symbol.indexOf('undefined') < 0 && c.roman && c.description);
            assert.strictEqual(c.pcOffsets.length, c.notes.length);
          });
        }
      });
    }
  });
});

// ---- flashcard memory (Keys, Find the signature, Play / Find the note) ---------
var Mem = require('../js/memory.js');
function seededRng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
check('memory: an unseen item is fully "forgotten"; recall halves every half-life; a miss shrinks it', function () {
  var mem = Mem.create(), now = 1e9;
  assert.strictEqual(Mem.recall(mem, 'play|0', now), 0);
  assert.ok(Math.abs(Mem.weight(mem, 'play|0', now) - (Mem.EPS + 1)) < 1e-9);
  Mem.answer(mem, 'play|0', 'play', true, 1000, now);
  var h = mem.p['play|0'].h;
  assert.ok(Math.abs(Mem.recall(mem, 'play|0', now + h) - 0.5) < 1e-9, 'half-life');
  Mem.answer(mem, 'play|0', 'play', false, null, now + 1000);
  assert.ok(mem.p['play|0'].h < h, 'a miss shortens it');
  assert.ok(mem.p['play|0'].h >= Mem.H_MIN);
});
check('memory: quick answers earn longer half-lives than slow ones; an untimed answer sits between', function () {
  var h = {};
  [['fast', 800], ['slow', 9000], ['none', null]].forEach(function (c) {
    var mem = Mem.create(); Mem.answer(mem, 'key|major|0', 'key', true, c[1], 5e8); h[c[0]] = mem.p['key|major|0'].h;
  });
  assert.ok(h.fast > h.none && h.none > h.slow, JSON.stringify(h));
});
check('memory: the upper octave missed, middle C known: the upper C comes up far more often', function () {
  var mem = Mem.create(), now = 2e9, i;
  for (i = 0; i < 4; i++) Mem.answer(mem, 'play|0', 'play', true, 1200, now + i * 1000);          // C4, always right
  for (i = 0; i < 4; i++) Mem.answer(mem, 'play|12', 'play', false, null, now + 5000 + i * 1000);  // C5, always wrong
  var keys = []; for (i = 0; i < 25; i++) keys.push('play|' + i);
  var rng = seededRng(99), counts = {}; keys.forEach(function (k) { counts[k] = 0; });
  for (i = 0; i < 6000; i++) counts[Mem.pick(mem, keys, null, rng, now + 60000)]++;
  assert.ok(counts['play|12'] > counts['play|0'] * 3, 'C5 ' + counts['play|12'] + ' vs C4 ' + counts['play|0']);
  assert.ok(counts['play|12'] > 0 && counts['play|0'] > 0, 'both still appear');
});
check('memory: the longer since an item was seen, the likelier it is; skip is honoured', function () {
  var mem = Mem.create(), now = 3e9, i;
  for (i = 0; i < 4; i++) { Mem.answer(mem, 'key|major|1', 'key', true, 1500, now + i); Mem.answer(mem, 'key|major|2', 'key', true, 1500, now + i); }
  mem.p['key|major|2'].t -= 5 * 86400000;                              // item 2 was last seen five days ago
  assert.ok(Mem.weight(mem, 'key|major|2', now + 60000) > 3 * Mem.weight(mem, 'key|major|1', now + 60000));
  var rng = seededRng(5), keys = ['key|major|1', 'key|major|2', 'key|major|3'];
  for (i = 0; i < 500; i++) assert.notStrictEqual(Mem.pick(mem, keys, function (k) { return k === 'key|major|2'; }, rng, now), 'key|major|2');
  assert.strictEqual(Mem.pick(mem, ['a'], function () { return true; }, rng, now), 'a', 'nothing left to skip to: the skip is dropped');
});
check('memory: persistence round-trips; corrupt data falls back; reset clears', function () {
  var store = { data: {}, getItem: function (k) { return k in this.data ? this.data[k] : null; },
                setItem: function (k, v) { this.data[k] = String(v); } };
  var mem = Mem.create();
  Mem.answer(mem, 'sig|minor|3', 'sig', true, 2000, 4e9);
  Mem.save('k', mem, store);
  assert.deepStrictEqual(Mem.load('k', store), mem);
  store.data.k = '{nope'; assert.deepStrictEqual(Mem.load('k', store), Mem.create());
  store.data.k = JSON.stringify({ seq: -3, p: { a: { h: 5, t: 1 }, b: 'x' }, tm: { c: ['q', 5] } });
  var back = Mem.load('k', store); assert.deepStrictEqual(back.p, {}); assert.deepStrictEqual(back.tm.c, [5]);
  assert.deepStrictEqual(Mem.load('k', null), Mem.create(), 'no storage at all is fine');
  Mem.reset(mem); assert.deepStrictEqual(mem, Mem.create());
  Mem.save('k', mem, { setItem: function () { throw new Error('quota'); } });       // must not throw
});

// ---- rendering sanity (no browser needed) ----------------------------------
function count(str, re) { return (str.match(re) || []).length; }

check('rendering: keys and boxes for every root/mode', function () {
  ['major', 'minor'].forEach(function (mode) {
    for (var r = 0; r < 12; r++) {
      var svg = R.render({ root: r, mode: mode, spell: 0, selected: true });
      var blackKeys = count(svg, /class="key key-black/g);
      var expectBlack = blackKeys;                      // geometry-dependent; just require some
      assert.ok(blackKeys >= 5, mode + ' root ' + r + ' black keys: ' + blackKeys);
      var whiteBoxes = 8;
      var ext = count(svg, /class="key key-white/g);
      assert.ok(ext >= 17 && ext <= 18, mode + ' root ' + r + ' white keys (two octaves): ' + ext);
      assert.strictEqual(count(svg, /<circle /g), 0, mode + ' root ' + r + ': no degree badges');
      // the octave has one third and one fifth; the extra keys may repeat the scale (2nd, 3rd...)
      assert.ok(count(svg, /class="[^"]*\bhl\b/g) >= 8, 'at least 8 highlighted keys');
      var sigs = 0;                                    // each signature appears once, above the leftmost octave
      for (var q = 0; q < 12; q++) sigs += T.specsFor(mode, q).length;
      assert.strictEqual(count(svg, /class="box"/g), sigs, mode + ' root ' + r + ': one box per signature');
      var seen = {};
      (svg.match(/class="box" data-pc="\d+" data-s="\d+" data-spell="\d"/g) || []).forEach(function (m) {
        assert.ok(!seen[m.replace(/data-s="\d+" /, '')], 'duplicate signature box');
        seen[m.replace(/data-s="\d+" /, '')] = 1;
      });
    }
  });
});

check('rendering: unselected landing state has no highlights', function () {
  var svg = R.render({ root: 0, mode: 'major', spell: 0, selected: false });
  assert.strictEqual(count(svg, /class="[^"]*\bhl\b/g), 0);
  assert.strictEqual(count(svg, /<circle /g), 0);
});

check('pentatonic and whole-tone scales', function () {
  var T = require('../js/theory.js');
  assert.deepStrictEqual(T.spellAlt('C', 'major', 'pentatonic').names, ['C', 'D', 'E', 'G', 'A']);
  assert.deepStrictEqual(T.spellAlt('A', 'minor', 'pentatonic').names, ['A', 'C', 'D', 'E', 'G']);
  assert.deepStrictEqual(T.spellAlt('E\u266D', 'major', 'pentatonic').names, ['E\u266D', 'F', 'G', 'B\u266D', 'C']);
  assert.deepStrictEqual(T.spellAlt('C', 'major', 'wholetone').names, ['C', 'D', 'E', 'F\u266F', 'G\u266F', 'A\u266F']);
  assert.deepStrictEqual(T.spellAlt('G\u266D', 'major', 'wholetone').names, ['G\u266D', 'A\u266D', 'B\u266D', 'C', 'D', 'E']);
  [['pentatonic', 5], ['wholetone', 6]].forEach(function (p) {
    for (var r = 0; r < 12; r++) {
      ['major', 'minor'].forEach(function (m) {
        var svg = R.render({ root: r, mode: m, spell: 0, selected: true, scaleKind: p[0] });
        var lit = count(svg, /class="key [^"]*\bhl\b/g);
        assert.ok(lit >= p[1] && lit <= 4 * p[1] + 3, p[0] + ' ' + m + ' ' + r + ' lit ' + lit);
      });
    }
  });
});

check('chords inside pentatonic and whole-tone scales', function () {
  var T = require('../js/theory.js'), C = require('../js/chords.js');
  function syms(root, mode, kind) {
    var sc = T.spellAlt(root, mode, kind), out = [];
    C.ALT_TYPES.forEach(function (t) {
      sc.offsets.forEach(function (o, i) { var c = C.chordInScale(sc, i, t.id); if (c) out.push(c.symbol); });
    });
    return out;
  }
  var cp = syms('C', 'major', 'pentatonic');
  ['C', 'Am', 'Csus2', 'Dsus4', 'C6', 'Cadd9', 'C6/9', 'Am7', 'D7sus4'].forEach(function (x) { assert.ok(cp.indexOf(x) >= 0, 'C pent has ' + x); });
  ['Dm', 'G', 'Em', 'Cmaj7'].forEach(function (x) { assert.ok(cp.indexOf(x) < 0, 'C pent lacks ' + x); });
  assert.ok(syms('C', 'minor', 'pentatonic').indexOf('Cm7') >= 0);
  var wt = syms('C', 'major', 'wholetone');
  assert.ok(wt.indexOf('Caug') >= 0 && wt.indexOf('C7\u266F5') >= 0 && wt.indexOf('C7\u266D5') >= 0);
  assert.ok(wt.indexOf('C') < 0 && wt.indexOf('Cm') < 0, 'no plain triads in the whole-tone scale');
  // every chord tone is in the scale, in every key
  for (var r = 0; r < 12; r++) ['pentatonic', 'wholetone'].forEach(function (k) {
    var spec = T.specsFor('major', r)[0], sc = T.spellAlt(spec.name, 'major', k);
    C.ALT_TYPES.forEach(function (t) { sc.offsets.forEach(function (o, i) {
      var c = C.chordInScale(sc, i, t.id);
      if (c) c.pcOffsets.forEach(function (p) { assert.ok(sc.offsets.indexOf(p) >= 0); });
    }); });
  });
});

check('mode descriptions and brightness order', function () {
  var C = require('../js/chords.js');
  C.MODE_NAMES.forEach(function (m) { assert.ok(C.MODE_INFO[m] && C.MODE_INFO[m].length > 40, m); });
  C.MODE_NAMES.forEach(function (m) { assert.ok(C.MODE_INFO[m].indexOf('The ' + m.toLowerCase() + ' scale is ') === 0, m); });
  assert.ok(C.chordInKey('C', 'major', 4, '7').modeInfo.indexOf('The mixolydian scale is major but relaxed and earthy.') === 0);
  assert.deepStrictEqual(C.BRIGHT_TO_DARK, ['Lydian', 'Ionian', 'Mixolydian', 'Dorian', 'Aeolian', 'Phrygian', 'Locrian']);
  var seen = [];
  for (var d = 0; d < 7; d++) { var c = C.chordInKey('C', 'major', d, 'triad'); seen.push(c.darkness); assert.ok(c.modeInfo); }
  assert.deepStrictEqual(seen.slice().sort(), [0, 1, 2, 3, 4, 5, 6]);
  assert.strictEqual(C.chordInKey('C', 'major', 3, 'triad').darkness, 0);     // IV = Lydian, brightest
  assert.strictEqual(C.chordInKey('C', 'major', 6, 'triad').darkness, 6);     // vii = Locrian, darkest
});

check('chord type descriptions', function () {
  var C = require('../js/chords.js');
  C.TYPES.forEach(function (t) { assert.ok(C.TYPE_INFO[t.id], t.id); });
  for (var d = 0; d < 7; d++) C.TYPES.forEach(function (t) {
    ['major', 'minor'].forEach(function (m) { assert.ok(C.chordInKey('C', m, d, t.id).typeInfo.length > 30); });
  });
  assert.ok(/Tense and expectant/.test(C.chordInKey('C', 'major', 3, 'sus4').typeInfo));
  assert.ok(/Dominant 7th/.test(C.chordInKey('C', 'major', 4, '7').typeInfo));
});

check('mode frequency ranking', function () {
  var C = require('../js/chords.js');
  assert.deepStrictEqual(C.COMMON_TO_RARE, ['Ionian', 'Aeolian', 'Mixolydian', 'Dorian', 'Lydian', 'Phrygian', 'Locrian']);
  assert.strictEqual(C.chordInKey('C', 'major', 0, 'triad').frequency, 0);   // Ionian: most common
  assert.strictEqual(C.chordInKey('C', 'major', 6, 'triad').frequency, 6);   // Locrian: rarest
});

check('chord type rankings', function () {
  var C = require('../js/chords.js');
  C.TYPES.forEach(function (t) { assert.ok(t.id in C.AMBIGUITY && t.id in C.TENSION, t.id); });
  assert.ok(C.AMBIGUITY.sus2 === C.AMBIGUITY.sus4 && C.AMBIGUITY.sus4 > C.AMBIGUITY['11'] && C.AMBIGUITY['11'] > C.AMBIGUITY.triad);
  assert.ok(C.TENSION.triad < C.TENSION.sus2 && C.TENSION.sus4 < C.TENSION['11'] && C.TENSION['11'] < C.TENSION['7']);
});

check('chord type frequency list', function () {
  var C = require('../js/chords.js');
  assert.deepStrictEqual(C.TYPE_COMMON_TO_RARE.slice().sort(), C.TYPES.map(function (t) { return t.id; }).sort());
});

check('ambiguity and tension sentence', function () {
  var C = require('../js/chords.js');
  for (var d = 0; d < 7; d++) C.TYPES.forEach(function (t) {
    ['major', 'minor'].forEach(function (m) {
      var c = C.chordInKey('C', m, d, t.id);
      assert.ok(/; the chord .*\.$/.test(c.feelInfo), t.id + ' ' + d + ': ' + c.feelInfo);
    });
  });
  assert.ok(/tritone/.test(C.chordInKey('C', 'major', 4, '7').feelInfo));          // G7: dominant
  assert.ok(/much lower tension/.test(C.chordInKey('C', 'major', 0, '7').feelInfo)); // Cmaj7
  assert.ok(/neither major nor minor/.test(C.chordInKey('C', 'major', 0, 'sus4').feelInfo));
  assert.strictEqual(C.chordInKey('C', 'major', 0, 'triad').feelInfo,
    'The 3rd establishes major or minor; the chord has little tension, feeling resolved and stable.');
});

check('tension ranks follow chord quality', function () {
  var C = require('../js/chords.js');
  assert.ok(C.chordInKey('C', 'major', 4, '7').tensionRank > C.chordInKey('C', 'major', 0, '7').tensionRank);   // G7 vs Cmaj7
  assert.ok(C.chordInKey('C', 'major', 4, '13').tensionRank > C.chordInKey('C', 'major', 1, '13').tensionRank);
  assert.ok(C.chordInKey('C', 'major', 1, '11').tensionRank < C.chordInKey('C', 'major', 4, '11').tensionRank);  // Dm11 vs G11
  assert.ok(C.chordInKey('C', 'major', 6, 'triad').tensionRank > C.chordInKey('C', 'major', 0, 'triad').tensionRank);
  assert.ok(/clearly states minor/.test(C.chordInKey('C', 'major', 1, '11').feelInfo));
});


// ---- left-hand fingering --------------------------------------------------------
var F = require('../js/fingering.js');
var CH = require('../js/chords.js');
function planFor(prog, mode, r) {
  var rg = R.windowRange(r);
  var chords = prog.map(function (p) { return CH.chordInKey('C', mode, p[0], p[1]).pcOffsets; });
  return { rg: rg, chords: chords, plan: F.plan(chords, rg.lo, rg.hi) };
}
check('window range always holds the root and its octave', function () {
  for (var r = 0; r < 12; r++) { var g = R.windowRange(r); assert.ok(g.lo <= 0 && g.hi >= 12, r + ': ' + JSON.stringify(g)); }
});
check('fingering: every voicing has the right pitch classes, sits in the window and spans <= 9', function () {
  [['major', [[0, 'triad'], [3, 'triad'], [4, '7'], [0, 'triad']]], ['minor', [[0, 'triad'], [5, 'triad'], [6, '7'], [0, '9']]]].forEach(function (c) {
    for (var r = 0; r < 12; r++) {
      var p = planFor(c[1], c[0], r);
      p.plan.forEach(function (v, i) {
        var want = F.keep(p.chords[i].length).map(function (ix) { return ((p.chords[i][ix] % 12) + 12) % 12; }).sort(function (a, b) { return a - b; });
        var got = v.notes.map(function (n) { return ((n.o % 12) + 12) % 12; }).sort(function (a, b) { return a - b; });
        assert.deepStrictEqual(got, want, 'pitch classes, key ' + r + ' chord ' + i);
        v.notes.forEach(function (n) { assert.ok(n.o >= p.rg.lo && n.o <= p.rg.hi, 'in window'); });
        assert.ok(v.notes[v.notes.length - 1].o - v.notes[0].o <= F.MAX_SPAN, 'span');
        assert.strictEqual(v.notes[0].finger, 5, 'little finger on the lowest note');
        assert.strictEqual(v.notes[v.notes.length - 1].finger, 1, 'thumb on the highest');
      });
    }
  });
});
check('fingering: I IV V7 I in C keeps the hand close (beats root position everywhere)', function () {
  var p = planFor([[0, 'triad'], [3, 'triad'], [4, '7'], [0, 'triad']], 'major', 0);
  function lowTop(v) { return [v.notes[0].o, v.notes[v.notes.length - 1].o]; }
  var shift = 0;
  for (var i = 0; i < p.plan.length; i++) {
    var a = lowTop(p.plan[i]), b = lowTop(p.plan[(i + 1) % p.plan.length]);
    shift += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  }
  assert.ok(shift <= 14, 'total end-note movement ' + shift);
  assert.ok(p.plan.some(function (v) { return v.inversion > 0; }), 'uses inversions');
});
check('fingering: 9th/11th/13th are cut to four tones (R 3 7 top); a lone chord prefers root position when it fits', function () {
  assert.deepStrictEqual(F.keep(5), [0, 1, 3, 4]);
  assert.deepStrictEqual(F.keep(7), [0, 1, 3, 6]);
  var p = planFor([[0, 'triad']], 'major', 0);
  assert.strictEqual(p.plan[0].inversion, 0);
});

// ---- sound ----------------------------------------------------------------------------
var A = require('../js/audio.js');
check('audio: A4 is 440 Hz and an octave doubles', function () {
  assert.ok(Math.abs(A.midiToFreq(69) - 440) < 1e-9);
  assert.ok(Math.abs(A.midiToFreq(81) - 880) < 1e-9);
});
check('audio: tonic notes sit between G3 and F#4', function () {
  assert.strictEqual(A.tonicMidi(7), 55);
  assert.strictEqual(A.tonicMidi(0), 60);
  assert.strictEqual(A.tonicMidi(6), 66);
  for (var pc = 0; pc < 12; pc++) assert.strictEqual(A.tonicMidi(pc) % 12, pc);
});
check('audio: diff keeps common tones and splits the rest', function () {
  var d = A.diff([48, 52, 55], [48, 53, 57]);
  assert.deepStrictEqual(d.keep, [48]);
  assert.deepStrictEqual(d.stop, [52, 55]);
  assert.deepStrictEqual(d.start, [53, 57]);
});
check('audio: the engine starts, cross-fades and silences voices (fake context)', function () {
  var made = 0;
  function node() { return { connect: function () {}, gain: { value: 0, setValueAtTime: function () {}, linearRampToValueAtTime: function () {}, cancelScheduledValues: function () {} },
                             frequency: {}, detune: {}, start: function () {}, stop: function () {} }; }
  var ctx = { currentTime: 0, state: 'running', destination: {}, createGain: node, createOscillator: function () { made++; return node(); }, createDynamicsCompressor: node };
  var e = new A.Engine(function () { return ctx; });
  e.setNotes([48, 52, 55]);
  assert.deepStrictEqual(e.notes(), [48, 52, 55]);
  assert.strictEqual(made, 6);                      // two oscillators per note
  e.setNotes([48, 53, 57], true);
  assert.strictEqual(made, 10);                     // only the two new notes start; 48 keeps ringing
  e.setNotes([]);
  assert.deepStrictEqual(e.notes(), []);
});

check('fingering: shift moves the lowest note up (or the highest down) by whole inversions', function () {
  var F = require('../js/fingering.js');
  var root = { notes: [{ o: 0, idx: 0 }, { o: 4, idx: 1 }, { o: 7, idx: 2 }] };      // C E G
  var up = F.shift(root.notes, 1, -2, 30);
  assert.deepStrictEqual(up.notes.map(function (n) { return n.o; }), [4, 7, 12]);
  assert.strictEqual(up.inversion, 1);
  assert.deepStrictEqual(up.notes.map(function (n) { return n.finger; }), [5, 3, 1]);
  var down = F.shift(root.notes, -1, -6, 30);
  assert.deepStrictEqual(down.notes.map(function (n) { return n.o; }), [-5, 0, 4]);
  assert.strictEqual(F.shift(root.notes, -1, -2, 30), null);                           // would fall off the keyboard
  assert.deepStrictEqual(F.shift(F.shift(root.notes, 3, -2, 30).notes, -3, -2, 30).notes.map(function (n) { return n.o; }), [0, 4, 7]);
});

check('progtext: parses a typed progression', function () {
  var P = require('../js/progtext.js');
  var r = P.parse('I - V - vi - IV | I - V - I');
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.chords.map(function (c) { return c.deg; }), [0, 4, 5, 3, 0, 4, 0]);
  assert.ok(r.chords.every(function (c) { return c.type === 'triad'; }));
  r = P.parse('ii7, V7 -> Imaj7 viio 1-4-5sus4 IV add9'.replace(' IV add9', ' IVadd9'));
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.chords, [{ deg: 1, type: '7' }, { deg: 4, type: '7' }, { deg: 0, type: '7' }, { deg: 6, type: 'triad' },
    { deg: 0, type: 'triad' }, { deg: 3, type: 'triad' }, { deg: 4, type: 'sus4' }, { deg: 3, type: 'add9' }]);
});

check('progtext: reports what it cannot read', function () {
  var P = require('../js/progtext.js');
  assert.strictEqual(P.parse('I - X - V').errors.length, 1);
  assert.strictEqual(P.parse('bVII').errors.length, 1);
  assert.strictEqual(P.parse('').errors.length, 1);
  assert.strictEqual(P.parse('I13', ['triad', '7']).errors.length, 1);
  assert.strictEqual(P.parse('Isus9').errors.length, 1);
});

// ---- Find the chord: the difficulty ladder ----
var FC = require('../js/findchord.js');
var COMBOS = [['major', true], ['major', false], ['minor', true], ['minor', false]];
check('find the chord: level 1 is C and G with I, IV, V (i, iv, v in minor)', function () {
  var romans = function (m, pop, n) { return FC.chords(m, pop, FC.levelAt(m, pop, n).chords).map(function (c) { return c.deg + c.type; }); };
  [true, false].forEach(function (pop) {
    assert.deepStrictEqual(FC.levelAt('major', pop, 1), { keys: 2, chords: 3, inv: pop ? 0 : 999 });
    assert.deepStrictEqual(FC.keys('major', pop, 2), [0, 7]);
    assert.deepStrictEqual(romans('major', pop, 1), ['0triad', '3triad', '4triad']);
    assert.deepStrictEqual(FC.keys('minor', pop, 2), [9, 4]);
    assert.deepStrictEqual(romans('minor', pop, 1), ['0triad', '3triad', '4triad']);
  });
});
check('find the chord: keys are all distinct; Pop and Jazz have their own key order', function () {
  COMBOS.forEach(function (c) {
    var all = FC.keys(c[0], c[1], 12);
    assert.strictEqual(all.length, 12);
    assert.strictEqual(new Set(all).size, 12);
  });
  assert.notDeepStrictEqual(FC.keys('major', true, 12), FC.keys('major', false, 12));
  assert.deepStrictEqual(FC.keys('major', false, 4), [0, 7, 10, 5]);        // Jazz: C G B♭ F
  assert.deepStrictEqual(FC.keys('major', true, 4), [0, 7, 2, 9]);          // Pop: C G D A
});
check('find the chord: Pop never offers 11ths or 13ths, Jazz does; no chord repeats', function () {
  ['major', 'minor'].forEach(function (m) {
    var pop = FC.chords(m, true, 99), jazz = FC.chords(m, false, 99);
    assert.ok(pop.every(function (c) { return c.type !== '11' && c.type !== '13'; }));
    assert.ok(jazz.some(function (c) { return c.type === '13'; }));
    [pop, jazz].forEach(function (l) { assert.strictEqual(new Set(l.map(function (c) { return c.deg + c.type; })).size, l.length); });
    assert.strictEqual(pop.length, 42);
    assert.strictEqual(jazz.length, 56);
  });
});
check('find the chord: pick stays inside the levels and avoids an immediate repeat', function () {
  var avoid = null;
  for (var i = 0; i < 200; i++) {
    var q = FC.pick('major', true, 2, 3, Math.random, avoid);
    assert.ok([0, 7].indexOf(q.pc) >= 0);
    assert.ok(FC.chords('major', true, 3).some(function (c) { return c.deg === q.deg && c.type === q.type; }));
    if (avoid) assert.ok(!(q.pc === avoid.pc && q.deg === avoid.deg && q.type === avoid.type));
    avoid = q;
  }
});
check('find the chord: the ladder is built of stages; every step puts a single key or chord in play', function () {
  COMBOS.forEach(function (c) {
    var L = FC.ladder(c[0], c[1]), tag = c[0] + (c[1] ? ' pop' : ' jazz');
    assert.ok(L.length > 80 && L.length < 200, tag + ' ' + L.length);
    assert.strictEqual(new Set(L.map(function (l) { return l.keys + '/' + l.chords + '/' + l.inv; })).size, L.length, tag + ': no level repeats');
    assert.deepStrictEqual([L[0].stage, L[0].step, L[0].kind], [1, 1, 'start']);
    assert.deepStrictEqual(L.slice(0, 3).map(function (l) { return [l.stage, l.step, l.keys, l.chords]; }), [[1, 1, 2, 3], [1, 2, 2, 4], [1, 3, 2, 5]], tag + ': stage 1 adds its next two chords one at a time');
    if (c[1]) assert.deepStrictEqual([L[3].add.dim, L[3].inv, L[2].inv], ['I', 5, 0], tag + ': Pop turns the first chords upside down in a step of its own');
    else assert.ok(L.every(function (l) { return l.add == null || l.add.dim !== 'I'; }), tag + ': Jazz has no inversions steps (inversions are in from the start)');
    var last = L[L.length - 1], total = FC.chords(c[0], c[1], 99).length;
    assert.deepStrictEqual([last.keys, last.chords], [12, total], tag + ': the top level has everything');
    for (var st = 2; ; st++) {
      var steps = L.filter(function (l) { return l.stage === st; });
      if (!steps.length) break;
      var f = steps[0], intro = FC.stageIntro(c[0], c[1], st), n = intro.kind === 'K' ? intro.keys.length : intro.chords.length;
      steps.forEach(function (l, i) { assert.strictEqual(l.step, i + 1); });
      if (f.kind === 'K') assert.strictEqual(f.chords, 3, tag + ' stage ' + st + ': the chords start again from I IV V');
      else assert.strictEqual(f.keys, 2, tag + ' stage ' + st + ': the keys start again from C and G');
      if (n > 2) {                                                 // the tail: a whole chord type in one stage, in one step
        assert.strictEqual(intro.kind, 'C');
        assert.strictEqual(new Set(intro.chords.map(function (x) { return x.type; })).size, 1, tag + ' stage ' + st + ' adds one type');
        assert.strictEqual(steps[0].add.to - steps[0].add.from, n);
      }
      steps.forEach(function (l, i) {
        var prev = i ? steps[i - 1] : null, dk = prev ? l.keys - prev.keys : 0, dc = prev ? l.chords - prev.chords : 0;
        if (l.add.dim === 'I') { assert.ok(prev && dk === 0 && dc === 0 && l.inv === l.chords, tag + ' stage ' + st + ': an inversions step changes only the inversions'); return; }
        if (prev) assert.ok((dk === 0) !== (dc === 0), tag + ' stage ' + st + ' step ' + l.step + ': one thing changes at a time');
        var big = Math.max(dk, dc);
        if (big > 1) assert.ok(big > 2, tag + ' stage ' + st + ' step ' + l.step + ': a jump is only ever a whole block');
        if (!l.add.back && n <= 2) assert.strictEqual(l.add.to - l.add.from, 1);
      });
      if (intro.kind === 'K') assert.strictEqual(steps.filter(function (l) { return !l.add.back; }).length, n, tag + ' stage ' + st + ': one step per new key');
    }
  });
  var m = FC.ladder('major', true).filter(function (l) { return l.stage === 2; });
  assert.deepStrictEqual(m.map(function (l) { return [l.keys, l.chords, l.inv]; }), [[2, 6, 5], [2, 7, 5], [2, 7, 7]], 'Pop major stage 2: V7, then iii, then both inverted');
  assert.deepStrictEqual(FC.stepAdds('major', true, 5).chords, [{ deg: 4, type: '7' }]);
});

check('find the chord: levelInfo / levelAt', function () {
  var i = FC.levelInfo('major', true, 5);
  assert.deepStrictEqual([i.stage, i.step], [2, 1]);
  assert.strictEqual(FC.stageSteps('major', true, 5), 3);
  assert.strictEqual(FC.mayInvert('major', true, FC.levelAt('major', true, 3), 0, 'triad'), false);
  assert.strictEqual(FC.mayInvert('major', true, FC.levelAt('major', true, 4), 0, 'triad'), true);
  assert.deepStrictEqual(FC.levelInfo('major', true, 0), FC.levelInfo('major', true, 1));          // clamped
  var n = FC.levelCount('major', true);
  assert.deepStrictEqual(FC.levelInfo('major', true, n + 5), FC.levelInfo('major', true, n));
  assert.strictEqual(FC.stageSteps('major', true, 1), 4);
  assert.deepStrictEqual(FC.levelAt('major', true, n), { keys: 12, chords: 42, inv: 42 });
});

// ---- Find a chord: identifying the picked notes ----
var CH = require('../js/chords.js');
function keyCands(root, mode) {
  var out = [], name = T.specsFor(mode, root)[0].name;
  for (var deg = 0; deg < 7; deg++) CH.TYPES.forEach(function (t) {
    var c = CH.chordInKey(name, mode, deg, t.id);
    out.push({ deg: deg, type: t.id, pcs: c.pcOffsets.map(function (o) { return (root + o) % 12; }), rootPc: (root + c.rootOffset) % 12,
               rank: CH.TYPE_COMMON_TO_RARE.indexOf(t.id) * 10 + deg });
  });
  return out;
}
check('find a chord: C E G in C major is the I triad, in any order or octave', function () {
  var c = keyCands(0, 'major');
  [[60, 64, 67], [67, 64, 60], [64, 67, 72], [48, 64, 79]].forEach(function (p) {
    var r = FC.identify(c, p); assert.ok(r && r.deg === 0 && r.type === 'triad', JSON.stringify(p));
  });
});
check('find a chord: adding the B makes it Cmaj7; G B D is the V triad', function () {
  var c = keyCands(0, 'major');
  var r = FC.identify(c, [60, 64, 67, 71]); assert.ok(r.deg === 0 && r.type === '7');
  r = FC.identify(c, [55, 59, 62]); assert.ok(r.deg === 4 && r.type === 'triad');
});
check('find a chord: two notes, or notes that name no chord in the key, find nothing', function () {
  var c = keyCands(0, 'major');
  assert.strictEqual(FC.identify(c, [60, 64]), null);
  assert.strictEqual(FC.identify(c, [61, 65, 68]), null);
  assert.strictEqual(FC.identify(c, []), null);
});
check('find a chord: C D G is Csus2 or Gsus4 depending on the lowest key', function () {
  var c = keyCands(0, 'major');
  var r = FC.identify(c, [60, 62, 67]); assert.ok(r.deg === 0 && r.type === 'sus2');
  r = FC.identify(c, [55, 60, 62]); assert.ok(r.deg === 4 && r.type === 'sus4');
});
check('find a chord: minor keys work too (A C E is i)', function () {
  var r = FC.identify(keyCands(9, 'minor'), [57, 60, 64]); assert.ok(r.deg === 0 && r.type === 'triad');
});

// ---- Find the chord: missed chords come up more often; Jazz mixes in inversions ----
check('find the chord weights: a fresh chord weighs 1, a miss adds 2 (max 16), a clean answer takes 1 off', function () {
  var w = {}, q = { pc: 0, deg: 4, type: '7' };
  assert.strictEqual(FC.weightOf(w, 'major', q), 1);
  FC.miss(w, 'major', q); assert.strictEqual(FC.weightOf(w, 'major', q), 3);
  FC.miss(w, 'major', q); assert.strictEqual(FC.weightOf(w, 'major', q), 5);
  FC.hit(w, 'major', q); assert.strictEqual(FC.weightOf(w, 'major', q), 4);
  for (var i = 0; i < 20; i++) FC.miss(w, 'major', q);
  assert.strictEqual(FC.weightOf(w, 'major', q), 16);
  for (i = 0; i < 20; i++) FC.hit(w, 'major', q);
  assert.strictEqual(FC.weightOf(w, 'major', q), 1); assert.deepStrictEqual(w, {});
  FC.miss(w, 'major', q); assert.strictEqual(FC.weightOf(w, 'minor', q), 1);            // minor is separate
  assert.strictEqual(FC.weightOf(w, 'major', { pc: 7, deg: 4, type: '7' }), 1);           // so is every key
});
check('find the chord weights: a missed chord is dealt more often, and never twice running', function () {
  var w = {}, target = { pc: 0, deg: 4, type: 'triad' };
  for (var i = 0; i < 6; i++) FC.miss(w, 'major', target);                                // weight 13
  var seq = 0, hits = 0, N = 4000;
  function rng() { seq = (seq * 1103515245 + 12345) % 2147483648; return seq / 2147483648; }
  for (i = 0; i < N; i++) {
    var q = FC.pick('major', true, 1, 3, rng, null, function (x) { return FC.weightOf(w, 'major', x); });
    if (q.pc === 0 && q.deg === 4 && q.type === 'triad') hits++;
  }
  assert.ok(hits / N > 0.5, 'G should dominate, got ' + hits / N);                       // 13 of (13 + 2 others)
  assert.notDeepStrictEqual(FC.pick('major', true, 1, 3, function () { return 0.99; }, target, function () { return 1; }), target);
  assert.ok(FC.pick('major', true, 1, 3, function () { return 0; }, null));                // the unweighted call still works
});
check('find the chord weights: saved, restored, cleaned of junk and reset', function () {
  var store = {}, st = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } };
  var w = {}; FC.miss(w, 'major', { pc: 0, deg: 1, type: 'triad' }); FC.saveWeights(w, st);
  assert.deepStrictEqual(FC.loadWeights(st), w);
  store['music-theory-ftc-weights-v1'] = JSON.stringify({ a: 3, b: 'x', c: 99, d: 1 });
  assert.deepStrictEqual(FC.loadWeights(st), { a: 3 });
  store['music-theory-ftc-weights-v1'] = '[1,2]'; assert.deepStrictEqual(FC.loadWeights(st), {});
  FC.resetWeights(w); assert.deepStrictEqual(w, {});
});
check('find the chord inversions: Pop is always root position; Jazz mixes every inversion in', function () {
  var seq = 7; function rng() { seq = (seq * 1103515245 + 12345) % 2147483648; return seq / 2147483648; }
  var seen = {}, i;
  for (i = 0; i < 300; i++) assert.strictEqual(FC.pickInversion(4, false, rng), 0);
  for (i = 0; i < 600; i++) { var v = FC.pickInversion(4, true, rng); assert.ok(v >= 0 && v <= 3); seen[v] = (seen[v] || 0) + 1; }
  assert.ok(seen[0] > 150 && seen[0] < 330, 'root about 40%: ' + seen[0]);
  assert.ok(seen[1] > 50 && seen[2] > 50 && seen[3] > 50, JSON.stringify(seen));
  for (i = 0; i < 100; i++) { var t = FC.pickInversion(3, true, rng); assert.ok(t >= 0 && t <= 2); }
  assert.strictEqual(FC.pickInversion(7, true, function () { return 0.999999; }), 6);
});


check('find the chord: each run of five questions has at least two about the stage\'s new challenge', function () {
  var FCx = FC, rngSeed = 7;
  function rnd() { rngSeed = (rngSeed * 16807) % 2147483647; return rngSeed / 2147483647; }
  COMBOS.forEach(function (cm) {
    var mode = cm[0], pop = cm[1], count = FCx.levelCount(mode, pop);
    for (var n = 2; n <= count; n += 5) {
      var l = FCx.levelInfo(mode, pop, n), fresh = FCx.freshTest(mode, pop, n), tr = { asked: 0, fresh: 0 };
      assert.ok(fresh, 'fresh predicate exists at level ' + n);
      for (var run = 0; run < 40; run++) {
        var hits = 0;
        for (var k = 0; k < 5; k++) {
          var q = FCx.pick(mode, pop, l.keys, l.chords, rnd, null, null, fresh, FCx.freshPlan(tr));
          var f = fresh(q); if (f) hits++;
          FCx.freshRecord(tr, f);
        }
        assert.ok(hits >= 2, mode + ' ' + (pop ? 'pop' : 'jazz') + ' level ' + n + ': only ' + hits + ' fresh in a run');
      }
    }
  });
  assert.strictEqual(FCx.freshTest('major', true, 1), null);                       // the starting stage has nothing new
});

check('find the chord: the new challenge is asked about often at the start of a stage', function () {
  var seed = 11; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var L = FC.ladder('major', true), n = 0;
  for (var i = 0; i < L.length; i++) if (L[i].kind === 'K' && L[i].keys >= 6 && L[i].step === 1) { n = i + 1; break; }
  var l = L[n - 1], fresh = FC.freshTest('major', true, n), hits = 0, N = 2000;
  for (var j = 0; j < N; j++) hits += fresh(FC.pick('major', true, l.keys, l.chords, rnd, null, null, fresh, 'boost')) ? 1 : 0;
  // one key of six would be ~17% unboosted; boosted it is clearly more
  assert.ok(hits / N > 0.3, 'boosted share ' + hits / N);
});

check('memory model: recall decays by half-life, misses shrink it, speed grades the gain', function () {
  var m = FC.newMem(), q = { pc: 0, deg: 0, type: 'triad' }, t0 = 1e12;
  assert.strictEqual(FC.pairRecall(m, 'major', q, t0), 0);                          // never seen: nothing remembered
  assert.ok(FC.memWeight(m, 'major', q, t0) > 1);
  var a = FC.memAnswer(m, 'major', q, true, 1500, 0, t0);
  assert.strictEqual(a.R, null);
  var h1 = m.p['major|0|0|triad'].h;
  assert.ok(h1 > 3 * 60000);
  assert.ok(Math.abs(FC.pairRecall(m, 'major', q, t0 + h1) - 0.5) < 1e-9);          // one half-life later: 50%
  assert.ok(FC.memWeight(m, 'major', q, t0 + 1000) < 0.1);                           // just answered: rarely asked
  var b = FC.memAnswer(m, 'major', q, false, null, 0, t0 + 1000);
  assert.ok(m.p['major|0|0|triad'].h < h1);
  assert.ok(FC.memWeight(m, 'major', q, t0 + 2000) > 0.7);                          // relearning window
  var fast = FC.newMem(), slow = FC.newMem();
  FC.memAnswer(fast, 'major', q, true, 1200, 0, t0); FC.memAnswer(slow, 'major', q, true, 9000, 0, t0);
  assert.ok(fast.p['major|0|0|triad'].h > slow.p['major|0|0|triad'].h);
  var L = FC.newMem(); FC.memAnswer(L, 'major', q, true, 1500, 0, t0); for (var i = 0; i < 4; i++) FC.memAnswer(L, 'major', { pc: 7, deg: 1, type: 'triad' }, true, 1500, 0, t0 + i);
  assert.ok(FC.memWeight(L, 'major', q, t0 + 10) > 0.4, 'a pair seen once, a few answers ago, is due again');
  assert.ok(FC.grade(1000, 3000) === 1 && FC.grade(60000, 3000) === 0.5);
});

check('memory model: persists, and rejects junk', function () {
  var store = {}, st = { getItem: function (k) { return store[k] == null ? null : store[k]; }, setItem: function (k, v) { store[k] = v; } };
  var m = FC.newMem(); FC.memAnswer(m, 'major', { pc: 7, deg: 4, type: '7' }, true, 2000, 0, 5e11);
  FC.saveMem(m, st);
  assert.deepStrictEqual(FC.loadMem(st), m);
  store['music-theory-ftc-mem-v1'] = '{"p":{"x":{"h":-1,"t":1}},"seq":"a"}';
  assert.deepStrictEqual(FC.loadMem(st), FC.newMem());
  FC.saveLog([[1, 2]], st); assert.deepStrictEqual(FC.loadLog(st), [[1, 2]]);
});

check('floors: 2 in 5 about the new challenge and 1 in 5 about faded older material', function () {
  var t = { asked: 0, fresh: 0 }, order = [];
  for (var i = 0; i < 5; i++) {
    var p = FC.floorPlan(t, true, true); order.push(p);
    FC.freshRecord(t, p === 'fresh', p === 'old');
  }
  var f = order.filter(function (x) { return x === 'fresh'; }).length, o = order.filter(function (x) { return x === 'old'; }).length;
  assert.ok(f >= 2 && o >= 1, order.join());
  assert.strictEqual(FC.floorPlan({ asked: 3, fresh: 0, old: 0 }, true, false), 'fresh');   // no older material to ask about: only the fresh floor
  assert.strictEqual(FC.floorPlan({ asked: 0, fresh: 0, old: 0 }, true, true), null);       // plenty of room: free draw
  assert.strictEqual(FC.floorPlan({ asked: 4, fresh: 2, old: 0 }, true, true), 'old');
});

check('pop answers: described, checked and named like a lead sheet', function () {
  var Ch = require('../js/chords.js');
  function d(key, mode, deg, type) { return FC.describe(Ch.chordInKey(key, mode, deg, type), type); }
  assert.deepStrictEqual(d('C', 'major', 1, 'triad'), { root: 2, type: 'triad', qual: 'min', sev: null });     // Dm
  assert.deepStrictEqual(d('C', 'major', 6, 'triad').qual, 'dim');
  assert.strictEqual(d('C', 'major', 0, '7').sev, 'maj');                                                        // Cmaj7
  assert.strictEqual(d('C', 'major', 4, '7').sev, 'dom');                                                        // G7
  assert.strictEqual(d('C', 'major', 1, '7').sev, null);                                                         // Dm7: the m says it
  assert.strictEqual(d('C', 'major', 4, 'sus4').qual, null);
  var w = d('G', 'major', 1, '7');                                                                              // Am7 in G
  assert.ok(FC.checkAnswer(w, 7, { root: 9, type: '7', qual: 'min', sev: null }));
  assert.ok(!FC.checkAnswer(w, 7, { root: 9, type: '7', qual: 'maj', sev: 'dom' }));
  assert.ok(!FC.checkAnswer(w, 7, { root: 9, type: 'triad', qual: 'min', sev: null }));
  assert.ok(!FC.checkAnswer(w, 7, { root: 10, type: '7', qual: 'min', sev: null }));
  assert.ok(FC.needsSev('9', 'maj') && !FC.needsSev('9', 'min') && !FC.needsSev('triad', 'maj') && !FC.needsQual('sus2'));
  assert.strictEqual(FC.answerName({ root: 9, type: '7', qual: 'min' }, false), 'Am7');
  assert.strictEqual(FC.answerName({ root: 10, type: 'triad', qual: 'maj' }, true), 'B\u266D');
  assert.strictEqual(FC.answerName({ root: 1, type: '7', qual: 'maj', sev: 'maj' }, false), 'C\u266Fmaj7');
  // every Pop chord in every key is named right by its own description, in both spellings of the root
  ['major', 'minor'].forEach(function (mode) {
    FC.chords(mode, true, 999).forEach(function (c) {
      var ch = Ch.chordInKey('C', mode, c.deg, c.type), want = FC.describe(ch, c.type);
      assert.ok(FC.checkAnswer(want, 0, { root: want.root, type: c.type, qual: want.qual, sev: want.sev }));
    });
  });
});
// chord quality tables
(function () {
  var Q = require('../js/quality.js');
  var d7 = Q.rows('7').filter(function (r) { return r.symbol === 'C\u00B07'; })[0];
  assert.deepStrictEqual(d7.names, ['C', 'E\u266D', 'G\u266D', 'B\u266D\u266D']);
  assert.strictEqual(Q.sizeName(6, 9), 'd7');
  Q.TYPES.forEach(function (t) {
    var rs = Q.rows(t);
    assert.ok(rs.length > 0 && Q.table(t).indexOf('<svg') > 0);
    rs.forEach(function (r) { assert.strictEqual(r.notes[0].name, 'C'); });
  });
  console.log('ok quality tables');
})();
// sync: credentials, the versioned envelope, merging
var Sync = require('../js/sync.js');
(async function () {
  var d = await Sync.derive('Dondo Music', 'water-nutmeg'), d2 = await Sync.derive('  dondo   music ', 'WATER-nutmeg'), d3 = await Sync.derive('dondo music', 'water-nutmeg2');
  assert.strictEqual(d.id, d2.id); assert.strictEqual(d.token, d2.token);                  // case and spacing do not matter
  assert.notStrictEqual(d.id, d3.id); assert.notStrictEqual(d.id, d.token);
  assert.ok(/^[0-9a-f]{64}$/.test(d.id) && /^[0-9a-f]{64}$/.test(d.token));
  assert.ok(Sync.validName('abcde') && !Sync.validName('abcd') && !Sync.validName('    ab   '));
  assert.ok(Sync.validPass('four-sixsixs') === false && Sync.validPass('four-fives') && !Sync.validPass('abc-defg') && !Sync.validPass('abcdefg-abcd'));
  for (var i = 0; i < 300; i++) assert.ok(Sync.validPass(Sync.randomPassphrase()), 'passphrase shape');
  Sync.WORDS.forEach(function (w) { assert.ok(/^[a-z]{4,6}$/.test(w), w); });
  assert.strictEqual(new Set(Sync.WORDS).size, Sync.WORDS.length);
  var payload = { schema: 1, savedAt: 5, keys: { 'music-theory-x': { t: 3, v: 'abc' } } };
  var env = await Sync.seal(d.key, payload), parsed = JSON.parse(env);
  assert.strictEqual(parsed.v, 1);
  assert.deepStrictEqual(await Sync.open(d.key, env), payload);
  await assert.rejects(Sync.open(d3.key, env), /wrong name or passphrase/);
  await assert.rejects(Sync.open(d.key, JSON.stringify(Object.assign({}, parsed, { v: 2 }))), /newer version/);
  await assert.rejects(Sync.open(d.key, 'not json'), /not readable/);
  var newer = await Sync.seal(d.key, { schema: 2, savedAt: 1, keys: {} });
  await assert.rejects(Sync.open(d.key, newer), /newer version/);
  // merging
  var K = 'music-theory-';
  var a = {}, b = {};
  a[K + 'state-v1'] = { t: 10, v: 'A' }; b[K + 'state-v1'] = { t: 20, v: 'B' };                 // newest wins
  a[K + 'only-a'] = { t: 1, v: '1' }; b[K + 'only-b'] = { t: 1, v: '2' };
  a[K + 'cards-mem-v1'] = { t: 5, v: JSON.stringify({ p: { x: { h: 1, t: 100, n: 1 }, y: { h: 1, t: 50, n: 1 } }, seq: 4, tm: {} }) };
  b[K + 'cards-mem-v1'] = { t: 9, v: JSON.stringify({ p: { x: { h: 2, t: 200, n: 2 }, z: { h: 1, t: 1, n: 1 } }, seq: 7, tm: {} }) };
  a[K + 'notes-v1'] = { t: 5, v: JSON.stringify({ play: { lv: 3 }, find: { lv: 1 } }) };
  b[K + 'notes-v1'] = { t: 9, v: JSON.stringify({ play: { lv: 2 }, find: { lv: 2, ever: true } }) };
  a[K + 'trials-v3'] = { t: 5, v: JSON.stringify({ k: { ms: 9000, wrong: 0 } }) };
  b[K + 'trials-v3'] = { t: 9, v: JSON.stringify({ k: { ms: 12000, wrong: 1 }, j: { ms: 5000, wrong: 0 } }) };
  a[K + 'gone'] = { t: 30, v: null }; b[K + 'gone'] = { t: 10, v: 'still here' };               // a deletion newer than the data wins
  var m = Sync.merge(a, b);
  assert.strictEqual(m.keys[K + 'state-v1'].v, 'B');
  assert.strictEqual(m.keys[K + 'only-a'].v, '1'); assert.strictEqual(m.keys[K + 'only-b'].v, '2');
  var mem = JSON.parse(m.keys[K + 'cards-mem-v1'].v);
  assert.deepStrictEqual(Object.keys(mem.p).sort(), ['x', 'y', 'z']); assert.strictEqual(mem.p.x.h, 2); assert.strictEqual(mem.seq, 7);
  var st = JSON.parse(m.keys[K + 'notes-v1'].v);
  assert.strictEqual(st.play.lv, 3); assert.strictEqual(st.find.lv, 2); assert.strictEqual(st.find.ever, true);
  var tr = JSON.parse(m.keys[K + 'trials-v3'].v);
  assert.strictEqual(tr.k.ms, 9000); assert.strictEqual(tr.j.ms, 5000);
  assert.strictEqual(m.keys[K + 'gone'].v, null);
  assert.ok(m.toLocal.indexOf(K + 'only-b') >= 0 && m.toLocal.indexOf(K + 'only-a') < 0);
  assert.ok(m.toRemote.indexOf(K + 'only-a') >= 0 && m.toRemote.indexOf(K + 'only-b') < 0);
  var again = Sync.merge(m.keys, m.keys);
  assert.strictEqual(again.toLocal.length + again.toRemote.length, 0);                            // merging a merge changes nothing
  // the Worker's contract against an in-memory stand-in
  var store = {}, fetchLog = [];
  global.fetch = async function (url, o) {
    var id = url.split('/s/')[1], method = o.method, tok = o.headers.Authorization.replace('Bearer ', '');
    fetchLog.push(method);
    if (method === 'GET') return store[id] ? (store[id].tok === tok ? { status: 200, text: async () => store[id].body } : { status: 403, text: async () => '' }) : { status: 404, text: async () => '' };
    store[id] = { tok: tok, body: o.body }; return { status: 200, text: async () => 'ok' };
  };
  assert.strictEqual(await Sync.exists(d), false);
  await Sync.push(d, m.keys);
  assert.strictEqual(await Sync.exists(d), true);
  assert.deepStrictEqual((await Sync.pull(d)).keys[K + 'state-v1'], { t: 20, v: 'B' });
  var acct = await Sync.newAccount('dondo music');
  assert.ok(Sync.validPass(acct.pass) && acct.name === 'dondo music');
  console.log('ok sync');
})().then(function () {
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall tests passed');
  process.exit(failures ? 1 : 0);
}, function (e) { console.log('FAIL sync', e && e.message); process.exit(1); });
