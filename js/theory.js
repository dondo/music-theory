/* Music theory data for the key-signature keyboard.
   Everything is keyed by pitch class (0 = C ... 11 = B) so the keyboard can be
   rotated to start on any key. */
var Theory = (function () {
  'use strict';

  var SHARP = '♯';
  var FLAT = '♭';
  var DOUBLE_SHARP = '𝄪';
  var DOUBLE_FLAT = '𝄫';

  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
  var BLACK_PCS = [1, 3, 6, 8, 10];

  // semitone offsets of each scale degree from the root
  var INTERVALS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10]          // natural minor
  };

  // order in which sharps / flats are added to a key signature
  var SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  var FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

  function spec(name, kind, n) {
    return { name: name, kind: kind, n: n };
  }

  // Key signature for each pitch class. A pitch class can have more than one
  // spelling (e.g. F# major / Gb major); the first entry is the default.
  // Impractical spellings (e.g. 7 sharps, 9 flats) are left out.
  var SIGNATURES = {
    major: {
      0: [spec('C', 'sharp', 0)],
      1: [spec('D' + FLAT, 'flat', 5)],
      2: [spec('D', 'sharp', 2)],
      3: [spec('E' + FLAT, 'flat', 3)],
      4: [spec('E', 'sharp', 4)],
      5: [spec('F', 'flat', 1)],
      6: [spec('F' + SHARP, 'sharp', 6), spec('G' + FLAT, 'flat', 6)],
      7: [spec('G', 'sharp', 1)],
      8: [spec('A' + FLAT, 'flat', 4)],
      9: [spec('A', 'sharp', 3)],
      10: [spec('B' + FLAT, 'flat', 2)],
      11: [spec('B', 'sharp', 5)]
    },
    minor: {
      0: [spec('C', 'flat', 3)],
      1: [spec('C' + SHARP, 'sharp', 4)],
      2: [spec('D', 'flat', 1)],
      3: [spec('D' + SHARP, 'sharp', 6), spec('E' + FLAT, 'flat', 6)],
      4: [spec('E', 'sharp', 1)],
      5: [spec('F', 'flat', 4)],
      6: [spec('F' + SHARP, 'sharp', 3)],
      7: [spec('G', 'flat', 2)],
      8: [spec('G' + SHARP, 'sharp', 5)],
      9: [spec('A', 'sharp', 0)],
      10: [spec('B' + FLAT, 'flat', 5)],
      11: [spec('B', 'sharp', 2)]
    }
  };

  function mod12(x) {
    return ((x % 12) + 12) % 12;
  }

  function isBlack(pc) {
    return BLACK_PCS.indexOf(mod12(pc)) !== -1;
  }

  function accidentalSymbol(d) {
    if (d === 0) return '';
    if (d === 1) return SHARP;
    if (d === -1) return FLAT;
    if (d === 2) return DOUBLE_SHARP;
    if (d === -2) return DOUBLE_FLAT;
    return '?';
  }

  // "F#" -> { letterIndex: 3, accidental: 1, pc: 6 }
  function parseName(name) {
    var letterIndex = LETTERS.indexOf(name.charAt(0));
    var ch = name.charAt(1);
    var accidental = ch === SHARP ? 1 : ch === FLAT ? -1 : 0;
    return {
      letterIndex: letterIndex,
      accidental: accidental,
      pc: mod12(NATURAL_PC[letterIndex] + accidental)
    };
  }

  // Spell a scale correctly: one letter per degree, accidentals as needed.
  // Returns { rootName, mode, rootPc, offsets, names, third } where `third` is
  // the third degree (the major or minor third above the root).
  function spellScale(rootName, mode) {
    var root = parseName(rootName);
    var offsets = INTERVALS[mode];
    var names = offsets.map(function (semis, k) {
      var letterIndex = (root.letterIndex + k) % 7;
      var target = mod12(root.pc + semis);
      var d = mod12(target - NATURAL_PC[letterIndex]);
      if (d > 6) d -= 12;
      return LETTERS[letterIndex] + accidentalSymbol(d);
    });
    return {
      rootName: rootName,
      mode: mode,
      rootPc: root.pc,
      offsets: offsets.slice(),
      names: names,
      third: { degree: 3, offset: offsets[2], name: names[2] }
    };
  }

  // Pentatonic and whole-tone scales, spelled with consecutive letters (steps = letter steps from the
  // root). Same shape as spellScale; `third` is meaningful only for the diatonic scale.
  var ALT = {
    pentatonic: {
      major: { offsets: [0, 2, 4, 7, 9], steps: [0, 1, 2, 4, 5] },
      minor: { offsets: [0, 3, 5, 7, 10], steps: [0, 2, 3, 4, 6] }
    },
    wholetone: {
      major: { offsets: [0, 2, 4, 6, 8, 10], steps: [0, 1, 2, 3, 4, 5] },
      minor: { offsets: [0, 2, 4, 6, 8, 10], steps: [0, 1, 2, 3, 4, 5] }
    }
  };

  function spellAlt(rootName, mode, kind) {
    var def = ALT[kind] && ALT[kind][mode];
    if (!def) return spellScale(rootName, mode);
    var root = parseName(rootName);
    var names = def.offsets.map(function (semis, k) {
      var letterIndex = (root.letterIndex + def.steps[k]) % 7;
      var d = mod12(mod12(root.pc + semis) - NATURAL_PC[letterIndex]);
      if (d > 6) d -= 12;
      return LETTERS[letterIndex] + accidentalSymbol(d);
    });
    return { rootName: rootName, mode: mode, rootPc: root.pc, offsets: def.offsets.slice(), names: names,
             kind: kind, third: null };
  }

  // The accidentals of a key signature in order, e.g. ["F#", "C#"].
  function signatureNotes(sp) {
    var order = sp.kind === 'sharp' ? SHARP_ORDER : FLAT_ORDER;
    var sym = sp.kind === 'sharp' ? SHARP : FLAT;
    return order.slice(0, sp.n).map(function (l) { return l + sym; });
  }

  function specsFor(mode, pc) {
    return SIGNATURES[mode][mod12(pc)];
  }

  // text shown for a key: "D" in major, "Dm" in minor
  function keyLabel(sp, mode) {
    return sp.name + (mode === 'minor' ? 'm' : '');
  }

  function keyTitle(sp, mode) {
    return sp.name + ' ' + mode;
  }

  var api = {
    SHARP: SHARP,
    FLAT: FLAT,
    DOUBLE_SHARP: DOUBLE_SHARP,
    DOUBLE_FLAT: DOUBLE_FLAT,
    LETTERS: LETTERS,
    NATURAL_PC: NATURAL_PC,
    INTERVALS: INTERVALS,
    SIGNATURES: SIGNATURES,
    mod12: mod12,
    isBlack: isBlack,
    parseName: parseName,
    spellScale: spellScale,
    spellAlt: spellAlt,
    signatureNotes: signatureNotes,
    specsFor: specsFor,
    keyLabel: keyLabel,
    keyTitle: keyTitle
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  return api;
})();
