/* Diatonic chords in a key: what you get by stacking (or suspending) notes of the scale on each
   degree. Pure music data, no DOM.

   For a key (root name + 'major' | 'minor') every degree 1..7 can carry every chord TYPE below.
   The chord's quality follows from the key (ii in major is minor, V is dominant...). Each chord
   comes with its symbol (Dm7), roman numeral (ii7), the church mode that starts on its root
   (Dorian), a plain-English description and its notes with their intervals. */
var Chords = (function () {
  'use strict';

  var T = (typeof Theory !== 'undefined') ? Theory : require('./theory.js');

  var FLAT = '♭';
  var SHARP = '♯';
  var DIM = '°';
  var HALF_DIM = 'ø';

  // Chord types. `steps` are scale steps above the chord root: 0 root, 2 third, 4 fifth,
  // 6 seventh, 8 ninth, 10 eleventh, 12 thirteenth (counting scale notes, so 1 = 2nd, 3 = 4th).
  var TYPES = [
    { id: 'triad', label: 'Triad', steps: [0, 2, 4] },
    { id: 'sus2', label: 'Sus2', steps: [0, 1, 4] },
    { id: 'sus4', label: 'Sus4', steps: [0, 3, 4] },
    { id: 'add9', label: 'Add9', steps: [0, 2, 4, 8] },
    { id: '7', label: '7th', steps: [0, 2, 4, 6] },
    { id: '9', label: '9th', steps: [0, 2, 4, 6, 8] },
    { id: '11', label: '11th', steps: [0, 2, 4, 6, 8, 10] },
    { id: '13', label: '13th', steps: [0, 2, 4, 6, 8, 10, 12] }
  ];

  var MODE_NAMES = ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian'];
  // How each mode sounds (the signature note is what differs from plain major or natural minor).
  var MODE_INFO = {
    Ionian: 'Bright, stable, resolved. The half step between the 7th degree and the tonic (the leading tone) pulls strongly toward home, so it sounds settled and \u201Cnormal\u201D to most Western ears. Think of most folk, pop, and classical tunes.',
    Dorian: 'Minor, but less sad than natural minor. Its flat 3rd gives it the minor quality, while its natural (raised) 6th adds a lift that keeps it cool, soulful, and a bit hopeful. It\u2019s common in jazz, funk, and Celtic folk (\u201CScarborough Fair,\u201D Miles Davis\u2019s \u201CSo What\u201D).',
    Phrygian: 'Dark, tense, exotic. The flat 2nd, a half step above the tonic, is the signature, and it creates a heavy, brooding pull downward. It evokes Spanish flamenco and is a staple of heavy metal riffs.',
    Lydian: 'Bright, airy, dreamy. The raised 4th is the signature, and it makes a major scale sound more floating and wondrous, with less of the grounded feeling of Ionian. It\u2019s common in film scoring for a sense of magic or awe (the Simpsons theme is a well-known example).',
    Mixolydian: 'Major but relaxed and earthy. The flat 7th removes the leading-tone pull, so the music feels less like it\u2019s driving toward a finish and more like it\u2019s content to stay put. It\u2019s bluesy and rootsy, common in rock, folk, and blues-based music (\u201CSweet Home Alabama\u201D).',
    Aeolian: 'Sad, serious, dark but settled. The flat 3rd, 6th, and 7th make the whole scale lean minor, with a melancholy, somber, or dramatic feel. Unlike Phrygian, its sadness is more resigned than menacing.',
    Locrian: 'Unstable, dissonant, unresolved. The flat 2nd and flat 5th mean the tonic chord is diminished rather than a stable major or minor triad, so there\u2019s no firm sense of home. It\u2019s rarely used as a true tonal center, and when it is, it sounds tense and eerie.'
  };
  // Every description opens "The <mode> scale is ..." (e.g. "The mixolydian scale is major but relaxed and earthy.").
  MODE_NAMES.forEach(function (m) {
    var d = MODE_INFO[m];
    MODE_INFO[m] = 'The ' + m.toLowerCase() + ' scale is ' + d.charAt(0).toLowerCase() + d.slice(1);
  });
  // How each chord type sounds. Triads and sevenths vary with quality (see typeInfo below).
  var TYPE_INFO = {
    triad: 'The foundation of Western harmony, with a stable, complete, unembellished sound.',
    sus2: 'Open, airy, and ambiguous. The 3rd is replaced by the 2nd, so the chord is neither major nor minor. It sounds spacious and suspended without being strongly tense, and is common in pop, rock, and ambient music.',
    sus4: 'Tense and expectant. The 4th replaces the 3rd and sits a half step above where the 3rd would be, so it creates a strong pull to resolve down to a major or minor triad. It sounds like a question waiting for its answer, and it\u2019s often used to build anticipation before a chord resolves.',
    add9: 'Bright, shimmering, and lush. It\u2019s a triad with the 9th (a 2nd up an octave) added and no 7th. Because it keeps the 3rd, it\u2019s clearly major or minor, unlike sus2, and the extra note adds sparkle and openness. It\u2019s common in pop ballads and singer-songwriter music.',
    '7': 'Four notes in stacked thirds.',
    '9': 'A seventh chord with the 9th added. It sounds richer and jazzier than a plain 7th, with more color but about the same amount of tension. It\u2019s funky, soulful, and a little bluesy.',
    '11': 'The most problematic of the extensions. On a dominant chord, the 11th clashes with the major 3rd, creating a harsh dissonance, so the 3rd is usually omitted. The result sounds open, suspended, and modal, a bit like a sus4 with a 7th and 9th on top. On minor chords it works naturally and sounds smooth, spacious, and atmospheric.',
    '13': 'The fullest and biggest of these chords. It\u2019s a dominant-style chord stacked all the way up with the 13th (a 6th up an octave). In practice, players usually omit the 11th and sometimes the 5th to avoid clutter. It sounds rich, sophisticated, and expansive, with a big-band, jazz, and funk flavor, and it\u2019s often used for a big, lush ending.'
  };
  var QUALITY_INFO = {
    triad: {
      major: 'Major: bright, happy, resolved.',
      minor: 'Minor: sad, serious, introspective.',
      diminished: 'Diminished: tense, unstable, wants to move.'
    },
    '7': {
      dominant: 'Dominant 7th: bluesy, restless, and driving. The tritone between the 3rd and the 7th makes it want to resolve, and it\u2019s the engine of blues and a staple of jazz and rock.',
      major: 'Major 7th: dreamy, smooth, and sophisticated, with a soft shimmer instead of a drive to resolve.',
      minor: 'Minor 7th: mellow, soulful, and relaxed, and one of the most common chords in jazz, R&B, and soul.',
      'half-diminished': 'Half-diminished 7th: dark and tense but softer than fully diminished; a minor seventh with a flat 5th.'
    },
    '9': {
      major: 'Major 9ths are lush and dreamy.',
      minor: 'Minor 9ths are smooth and mellow.'
    }
  };
  // Brightest to darkest: each step lowers one more note by a half step.
  var BRIGHT_TO_DARK = ['Lydian', 'Ionian', 'Mixolydian', 'Dorian', 'Aeolian', 'Phrygian', 'Locrian'];

  // How often each mode turns up in written music, most common first (a rough, conventional ranking):
  // major and natural minor dominate; Mixolydian and Dorian are the common "modal" colours;
  // Lydian and Phrygian are occasional; Locrian is rare.
  var COMMON_TO_RARE = ['Ionian', 'Aeolian', 'Mixolydian', 'Dorian', 'Lydian', 'Phrygian', 'Locrian'];

  // Chord-type rankings (rough, conventional; ties share a rank). Lower = less.
  // Ambiguity: how little the chord says about major vs minor. Tension: how much it wants to resolve.
  var AMBIGUITY = { '7': 0, '9': 0, '13': 0, triad: 1, add9: 1, '11': 2, sus2: 3, sus4: 3 };
  var TENSION = { triad: 0, sus2: 1, add9: 1, sus4: 2, '11': 3, '7': 4, '9': 4, '13': 4 };

  // How often each chord type turns up in written music, most common first (rough, conventional).
  var TYPE_COMMON_TO_RARE = ['triad', '7', 'sus4', 'sus2', 'add9', '9', '11', '13'];

  // Per type: how much it says about major vs minor (ambiguity) and how much it wants to resolve
  // (tension), as clauses that are woven into one closing sentence (see `feelInfo`).
  var AMBIGUITY_INFO = {
    triad: 'The 3rd establishes major or minor',
    add9: 'The 3rd establishes major or minor',
    sus2: 'With no 3rd, the chord is neither major nor minor',
    sus4: 'With no 3rd, the chord is neither major nor minor',
    '7': 'The 3rd and 7th together pin down exactly what kind of chord it is',
    '9': 'The 3rd and 7th pin down what kind of chord it is, and the 9th only adds color',
    '11': 'The 3rd is usually omitted, so the major-or-minor quality is mostly left unstated',
    '13': 'The 3rd and 7th pin down what kind of chord it is, and the 13th only adds color'
  };
  var TENSION_INFO = {
    triad: 'the chord has little tension, feeling resolved and stable',
    add9: 'the chord has little tension, sounding shimmering and open',
    sus2: 'the chord has little tension, sounding open rather than driving',
    sus4: 'the chord has moderate tension, since the 4th wants to fall to the 3rd and so anticipates resolution',
    '11': 'the chord has fairly high tension, behaving like a sus4 with extra notes: suspended and modal rather than driving',
    '7': 'the chord has the highest tension, because the tritone between the 3rd and the flat 7th drives strongly toward resolution',
    '9': 'the chord has the highest tension, because the tritone between the 3rd and the flat 7th drives strongly toward resolution',
    '13': 'the chord has the highest tension, because the tritone between the 3rd and the flat 7th drives strongly toward resolution'
  };
  // quality changes the tension: only the dominant version has that drive
  var TENSION_QUALITY = {
    major: 'the chord has much lower tension than the dominant version, sitting at rest',
    minor: 'the chord has much lower tension than the dominant version, sitting at rest',
    'half-diminished': 'the chord is darker and more unsettled than a minor seventh, because of the flat 5th',
    diminished: 'the chord has high tension, sounding unstable and wanting to move'
  };

  // Quality-aware ranks (lower = less) for the chord actually on the selected degree. The static
  // AMBIGUITY / TENSION tables above rank the dominant versions; these follow the quality.
  function tensionRank(typeId, q) {
    if (typeId === 'triad') return q === 'diminished' ? 4.5 : 0;
    if (typeId === 'sus2' || typeId === 'add9') return 1;
    if (typeId === 'sus4') return 2;
    if (typeId === '11') return q === 'minor' ? 1.5 : 3;               // a minor 11th works naturally
    // 7th, 9th, 13th: only the dominant version has the tritone drive
    if (q === 'dominant') return 4;
    if (q === 'half-diminished') return 3.5;
    return 0.8;                                                         // major or minor: at rest
  }
  function ambiguityRank(typeId, q) {
    if (typeId === '11') return q === 'minor' ? 1 : 2;                  // a minor 11th keeps its 3rd
    return AMBIGUITY[typeId];
  }

  var NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  var ORDINALS = { 7: 'seventh', 9: 'ninth', 11: 'eleventh', 13: 'thirteenth' };

  // interval (semitones above the chord root, ascending) -> label
  var INTERVAL_LABEL = {
    0: 'R', 2: '2', 3: FLAT + '3', 4: '3', 5: '4', 6: FLAT + '5', 7: '5', 8: SHARP + '5', 9: '6',
    10: FLAT + '7', 11: '7', 12: '8', 13: FLAT + '9', 14: '9', 15: SHARP + '9', 16: FLAT + '11',
    17: '11', 18: SHARP + '11', 19: '12', 20: FLAT + '13', 21: '13', 22: SHARP + '13', 23: '14'
  };

  function typeById(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return TYPES[0];
  }

  // The mode that starts on this degree of the key. A natural-minor key is Aeolian on degree 1.
  function modeName(mode, deg) {
    return MODE_NAMES[(deg + (mode === 'minor' ? 5 : 0)) % 7];
  }

  function has(list, n) { return list.indexOf(n) >= 0; }

  // Name the chord from its intervals above the root.
  // Returns { suffix, roman, desc } pieces (roman suffix excludes the numeral itself).
  function describe(typeId, ints) {
    var type = typeById(typeId);
    var third = has(ints, 3) ? 'min' : has(ints, 4) ? 'maj' : null;
    var fifth = has(ints, 6) ? 'dim' : has(ints, 8) ? 'aug' : 'perf';
    var triadWord = third === 'min' ? (fifth === 'dim' ? 'diminished' : 'minor')
      : third === 'maj' ? (fifth === 'aug' ? 'augmented' : 'major') : '';
    var out = { suffix: '', roman: '', desc: '', lower: third === 'min', quality: triadWord };

    if (typeId === 'sus2' || typeId === 'sus4') {
      out.suffix = out.roman = typeId;
      out.desc = 'suspended ' + (typeId === 'sus2' ? '2nd' : '4th');
      return out;
    }

    var triadSfx = third === 'min' ? (fifth === 'dim' ? 'dim' : 'm') : (fifth === 'aug' ? 'aug' : '');
    var triadRoman = third === 'min' ? (fifth === 'dim' ? DIM : '') : (fifth === 'aug' ? '+' : '');

    if (typeId === 'triad') {
      out.suffix = triadSfx;
      out.roman = triadRoman;
      out.desc = triadWord + ' triad';
      return out;
    }

    if (typeId === 'add9') {
      var alt9 = has(ints, 13) ? FLAT + '9' : has(ints, 15) ? SHARP + '9' : '9';
      out.suffix = triadSfx + 'add' + alt9;
      out.roman = triadRoman + 'add' + alt9;
      out.desc = triadWord + ' add' + alt9;
      return out;
    }

    // sevenths and extensions
    var sev = has(ints, 11) ? 'maj' : has(ints, 10) ? 'min' : has(ints, 9) ? 'dim' : null;
    var alts = [];
    if (type.steps.indexOf(8) >= 0) {
      if (has(ints, 13)) alts.push(FLAT + '9');
      else if (has(ints, 15)) alts.push(SHARP + '9');
    }
    if (type.steps.indexOf(10) >= 0 && has(ints, 18)) alts.push(SHARP + '11');
    if (type.steps.indexOf(12) >= 0 && has(ints, 20)) alts.push(FLAT + '13');
    var n = parseInt(typeId, 10);
    // a ninth chord whose 9th is altered is better called a 7th chord with that alteration
    var num = (n === 9 && alts.length) ? 7 : n;
    var altText = alts.length ? '(' + alts.join(',') + ')' : '';

    var s, r, qual;
    if (third === 'maj' && fifth === 'perf') {
      if (sev === 'maj') { s = 'maj' + num; r = 'maj' + num; qual = 'major'; }
      else { s = '' + num; r = '' + num; qual = 'dominant'; }
    } else if (third === 'min' && fifth === 'perf') {
      if (sev === 'min') { s = 'm' + num; r = '' + num; qual = 'minor'; }          // lower-case numeral already says minor
      else { s = 'm(maj' + num + ')'; r = '(maj' + num + ')'; qual = 'minor-major'; }
    } else if (third === 'min' && fifth === 'dim') {
      if (sev === 'dim') { s = 'dim' + num; r = DIM + num; qual = 'diminished'; }
      else { s = 'm' + num + FLAT + '5'; r = HALF_DIM + num; qual = 'half-diminished'; }
    } else {                                   // augmented triad
      s = (sev === 'maj' ? 'maj' : '') + num + SHARP + '5';
      r = '+' + (sev === 'maj' ? 'maj' : '') + num;
      qual = 'augmented';
    }
    out.suffix = s + altText;
    out.roman = r + altText;
    out.desc = qual + ' ' + ORDINALS[num] + (alts.length ? ' with ' + alts.join(' and ') : '');
    return out;
  }

  // The chord of type `typeId` on scale degree `deg` (0-based: 0 = I) of the key.
  function chordInKey(rootName, mode, deg, typeId) {
    var scale = T.spellScale(rootName, mode);
    var type = typeById(typeId);
    var abs = [];      // semitones above the KEY root
    var notes = [];
    type.steps.forEach(function (s) {
      var idx = deg + s;
      abs.push(scale.offsets[idx % 7] + 12 * Math.floor(idx / 7));
      notes.push(scale.names[idx % 7]);
    });
    var ints = abs.map(function (a) { return a - abs[0]; });
    var triadInts = [0, 2, 4].map(function (s) {
      var idx = deg + s;
      return scale.offsets[idx % 7] + 12 * Math.floor(idx / 7) - abs[0];
    });
    var d = describe(typeId, ints);
    // numeral case follows the diatonic triad on this degree (minor/diminished -> lower case)
    var numeral = triadInts[1] === 3 ? NUMERALS[deg].toLowerCase() : NUMERALS[deg];
    var rootName2 = notes[0];
    return {
      type: type.id,
      degree: deg,
      rootName: rootName2,
      notes: notes,
      intervals: ints,
      intervalLabels: ints.map(function (i) { return INTERVAL_LABEL[i] || String(i); }),
      pcOffsets: abs.map(function (a) { return ((a % 12) + 12) % 12; }),   // from the key root, mod 12
      rootOffset: ((abs[0] % 12) + 12) % 12,
      symbol: rootName2 + d.suffix,
      roman: numeral + d.roman,
      mode: modeName(mode, deg),
      modeFull: rootName2 + ' ' + modeName(mode, deg),
      modeInfo: MODE_INFO[modeName(mode, deg)],
      feelInfo: (function () {
        var q = d.desc.split(' ')[0];
        var tension = TENSION_INFO[type.id];
        if (type.id === 'triad' && q === 'diminished') tension = TENSION_QUALITY.diminished;
        if (['7', '9', '13'].indexOf(type.id) >= 0 && q !== 'dominant' && TENSION_QUALITY[q]) tension = TENSION_QUALITY[q];
        var amb = AMBIGUITY_INFO[type.id];
        if (type.id === '11' && q === 'minor') {                        // the 3rd is kept, and it sounds natural
          amb = 'The 3rd is kept on a minor 11th, so the chord clearly states minor';
          tension = 'the chord has low tension, sounding smooth, spacious, and atmospheric';
        }
        return amb + '; ' + tension + '.';
      })(),
      tensionRank: tensionRank(type.id, d.desc.split(' ')[0]),
      ambiguityRank: ambiguityRank(type.id, d.desc.split(' ')[0]),
      typeInfo: [TYPE_INFO[type.id], (QUALITY_INFO[type.id] || {})[d.desc.split(' ')[0] === 'dominant' ? 'dominant' : d.desc.split(' ')[0]]]
        .filter(Boolean).join(' '),
      frequency: COMMON_TO_RARE.indexOf(modeName(mode, deg)),    // 0 (most common) .. 6 (rarest)
      darkness: BRIGHT_TO_DARK.indexOf(modeName(mode, deg)),     // 0 (brightest) .. 6 (darkest)
      description: d.desc,
      quality: d.quality
    };
  }

  // ---- chords inside a non-diatonic scale (pentatonic, whole tone) -----------------
  // A chord is available on a scale note when every chord tone is itself a note of the scale.
  // `ints` are semitones above the chord root (14 = the ninth).
  var ALT_TYPES = [
    { id: 'maj',   label: 'Major',        sym: '',       ints: [0, 4, 7],          desc: 'Major triad' },
    { id: 'min',   label: 'Minor',        sym: 'm',      ints: [0, 3, 7],          desc: 'Minor triad' },
    { id: 'aug',   label: 'Augmented',    sym: 'aug',    ints: [0, 4, 8],          desc: 'Augmented triad: two major thirds, floating and unresolved' },
    { id: 'sus2',  label: 'sus2',         sym: 'sus2',   ints: [0, 2, 7],          desc: 'Suspended second: the third is replaced by the 2nd, open and unresolved' },
    { id: 'sus4',  label: 'sus4',         sym: 'sus4',   ints: [0, 5, 7],          desc: 'Suspended fourth: the third is replaced by the 4th' },
    { id: 'p5',    label: 'Power (5)',    sym: '5',      ints: [0, 7],             desc: 'Power chord: just the root and fifth' },
    { id: 'six',   label: '6',            sym: '6',      ints: [0, 4, 7, 9],       desc: 'Major triad with an added sixth' },
    { id: 'm6',    label: 'm6',           sym: 'm6',     ints: [0, 3, 7, 9],       desc: 'Minor triad with an added sixth' },
    { id: 'add9',  label: 'add9',         sym: 'add9',   ints: [0, 4, 7, 14],      desc: 'Major triad with an added ninth' },
    { id: 'madd9', label: 'm(add9)',      sym: 'm(add9)', ints: [0, 3, 7, 14],     desc: 'Minor triad with an added ninth' },
    { id: 'six9',  label: '6/9',          sym: '6/9',    ints: [0, 4, 7, 9, 14],   desc: 'Major triad with added sixth and ninth, the classic pentatonic chord' },
    { id: 'dom7',  label: '7',            sym: '7',      ints: [0, 4, 7, 10],      desc: 'Dominant seventh' },
    { id: 'm7',    label: 'm7',           sym: 'm7',     ints: [0, 3, 7, 10],      desc: 'Minor seventh' },
    { id: '7sus4', label: '7sus4',        sym: '7sus4',  ints: [0, 5, 7, 10],      desc: 'Dominant seventh with the third replaced by the 4th' },
    { id: 'dom9',  label: '9',            sym: '9',      ints: [0, 4, 7, 10, 14],  desc: 'Dominant ninth' },
    { id: 'm9',    label: 'm9',           sym: 'm9',     ints: [0, 3, 7, 10, 14],  desc: 'Minor ninth' },
    { id: '7s5',   label: '7♯5',     sym: '7♯5', ints: [0, 4, 8, 10],    desc: 'Augmented dominant seventh (whole-tone sound)' },
    { id: '7b5',   label: '7♭5',     sym: '7♭5', ints: [0, 4, 6, 10],    desc: 'Dominant seventh with a flattened fifth (whole-tone sound)' },
    { id: '9s5',   label: '9♯5',     sym: '9♯5', ints: [0, 4, 8, 10, 14], desc: 'Augmented dominant ninth (whole-tone sound)' }
  ];
  var ALT_LABEL = { 0: 'R', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♯5', 9: '6',
                    10: '♭7', 11: '7', 14: '9' };

  function altTypeById(id) {
    for (var i = 0; i < ALT_TYPES.length; i++) if (ALT_TYPES[i].id === id) return ALT_TYPES[i];
    return ALT_TYPES[0];
  }

  // The chord of type `typeId` on note `idx` of `scale` (from Theory.spellAlt), or null if some
  // chord tone is not in the scale.
  function chordInScale(scale, idx, typeId) {
    var type = altTypeById(typeId);
    var base = scale.offsets[idx];
    var names = [];
    var pcs = [];
    for (var i = 0; i < type.ints.length; i++) {
      var off = ((base + type.ints[i]) % 12 + 12) % 12;
      var at = scale.offsets.indexOf(off);
      if (at < 0) return null;
      names.push(scale.names[at]);
      pcs.push(off);
    }
    return {
      type: type.id, degree: idx, rootName: names[0], notes: names, pcOffsets: pcs,
      intervalLabels: type.ints.map(function (n) { return ALT_LABEL[n] || String(n); }),
      symbol: names[0] + type.sym, description: type.desc
    };
  }

  var api = {
    TYPES: TYPES, MODE_NAMES: MODE_NAMES, TYPE_COMMON_TO_RARE: TYPE_COMMON_TO_RARE, AMBIGUITY: AMBIGUITY, AMBIGUITY_INFO: AMBIGUITY_INFO, TENSION_INFO: TENSION_INFO, TENSION: TENSION, MODE_INFO: MODE_INFO, TYPE_INFO: TYPE_INFO, BRIGHT_TO_DARK: BRIGHT_TO_DARK, COMMON_TO_RARE: COMMON_TO_RARE, typeById: typeById, modeName: modeName, chordInKey: chordInKey,
    ALT_TYPES: ALT_TYPES, chordInScale: chordInScale
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  return api;
})();
