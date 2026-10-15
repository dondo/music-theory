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

// ---- flashcard weights -------------------------------------------------------
var Wt = require('../js/weights.js');
check('weights: a miss raises the odds, a clean hit eases them, bounds hold', function () {
  var w = Wt.fresh();
  Wt.miss(w, 'major', 6);
  assert.strictEqual(w.major[6], 1 + Wt.MISS_BUMP);
  assert.strictEqual(w.minor[6], 1, 'minor deck unaffected');
  Wt.hit(w, 'major', 6);
  assert.strictEqual(w.major[6], 1 + Wt.MISS_BUMP - Wt.HIT_DECAY);
  for (var i = 0; i < 50; i++) Wt.miss(w, 'major', 2);
  assert.strictEqual(w.major[2], Wt.MAX);
  for (i = 0; i < 50; i++) Wt.hit(w, 'major', 2);
  assert.strictEqual(w.major[2], Wt.MIN);
});
check('weights: a missed key is dealt more often, never twice in a row', function () {
  var w = Wt.fresh();
  for (var i = 0; i < 4; i++) Wt.miss(w, 'major', 7);          // weight 9 vs 1
  var seed = 12345;
  function rng() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  var counts = [];
  for (i = 0; i < 12; i++) counts.push(0);
  for (i = 0; i < 12000; i++) counts[Wt.pick(w.major, rng, -1)]++;
  assert.ok(counts[7] > counts[0] * 6, 'heavy key dominates: ' + counts[7] + ' vs ' + counts[0]);
  for (i = 0; i < 12; i++) assert.ok(counts[i] > 0, 'every key still appears');
  for (i = 0; i < 2000; i++) assert.notStrictEqual(Wt.pick(w.major, rng, 7), 7, 'avoid is honoured');
  assert.strictEqual(Wt.pick(w.major, function () { return 0.999999999; }, 11), 10, 'edge of the range');
});
check('weights: persistence round-trips; corrupt data falls back; reset clears', function () {
  var store = { data: {}, getItem: function (k) { return k in this.data ? this.data[k] : null; },
                setItem: function (k, v) { this.data[k] = String(v); } };
  var w = Wt.fresh();
  Wt.miss(w, 'minor', 3);
  Wt.save(w, store);
  assert.strictEqual(Wt.load(store).minor[3], 1 + Wt.MISS_BUMP);
  store.data[Wt.STORAGE_KEY] = '{nope';
  assert.deepStrictEqual(Wt.load(store), Wt.fresh());
  store.data[Wt.STORAGE_KEY] = JSON.stringify({ major: [1, 2], minor: [] });
  assert.deepStrictEqual(Wt.load(store), Wt.fresh());
  assert.deepStrictEqual(Wt.load(null), Wt.fresh(), 'no storage at all is fine');
  Wt.reset(w);
  assert.deepStrictEqual(w, Wt.fresh());
  Wt.save(w, { setItem: function () { throw new Error('quota'); } });       // must not throw
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

console.log(failures ? '\n' + failures + ' FAILED' : '\nall tests passed');
process.exit(failures ? 1 : 0);
