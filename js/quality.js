/* Chord quality tables (Explore > "Chord quality"): for each chord type, every quality it comes in, built on C and drawn on a staff
 * with the stacked intervals (blue, between neighbouring notes) and the interval from the root to the top note (orange bracket).
 * Pure functions: Quality.table(typeId) returns an HTML string; Quality.rows(typeId) returns the data (tested in tools/test_theory.js). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./glyphs.js'));
  else root.Quality = factory(root.Glyphs);
})(typeof self !== 'undefined' ? self : this, function (Glyphs) {
  'use strict';

  var LETTERS = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
  var SIZE = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };                // major / perfect sizes of the simple intervals
  var PERFECT = { 1: 1, 4: 1, 5: 1 };
  function base(n) { return ((n - 1) % 7) + 1; }
  function adj(n, q) {                                                       // semitones from the major / perfect size, for a quality letter
    if (PERFECT[base(n)]) return { P: 0, d: -1, A: 1 }[q];
    return { M: 0, m: -1, d: -2, A: 1 }[q];
  }
  function semis(n, q) { return SIZE[base(n)] + 12 * Math.floor((n - 1) / 7) + adj(n, q); }
  function sizeName(step, sm) {                                              // interval name between two notes (step: generic distance 0.., sm: semitones)
    var n = step + 1, b = base(n), exp = SIZE[b] + 12 * Math.floor((n - 1) / 7), d = sm - exp;
    var q = PERFECT[b] ? (d === 0 ? 'P' : d === -1 ? 'd' : d === 1 ? 'A' : d < 0 ? 'dd' : 'AA')
                       : (d === 0 ? 'M' : d === -1 ? 'm' : d === -2 ? 'd' : d === 1 ? 'A' : d < 0 ? 'dd' : 'AA');
    return q + n;
  }
  function accText(a) { return a === 0 ? '' : a === 1 ? '♯' : a === -1 ? '♭' : a === -2 ? '♭♭' : a === 2 ? '×' : String(a); }

  // a chord from a recipe such as "3M 5P 7m": the notes above C, lowest first
  function build(recipe) {
    var notes = [{ n: 1, step: 0, sm: 0 }];
    recipe.split(' ').forEach(function (t) {
      var n = parseInt(t, 10), q = t.slice(String(n).length);
      notes.push({ n: n, step: n - 1, sm: semis(n, q) });
    });
    notes.forEach(function (x) {
      x.letter = LETTERS.charAt(x.step % 7);
      x.acc = x.sm - (NAT[x.step % 7] + 12 * Math.floor(x.step / 7));
      x.name = x.letter + accText(x.acc);
    });
    return notes;
  }

  // [symbol, recipe, extra columns..., name]
  var TABLES = {
    triad: {
      caption: 'A triad is two stacked thirds (blue). Their sum is the 5th (orange): major + minor makes a perfect 5th, minor + minor a diminished one, major + major an augmented one. In a major or minor triad the word names the 3rd; in a diminished or augmented triad it names the 5th.',
      cols: [],
      rows: [['C', '3M 5P', 'major triad'], ['Cm', '3m 5P', 'minor triad'], ['C°', '3m 5d', 'diminished triad'], ['C+', '3M 5A', 'augmented triad']]
    },
    sus2: {
      caption: 'A suspended chord swaps the 3rd for a neighbouring note, so it is neither major nor minor. Sus2 uses the 2nd.',
      cols: [],
      rows: [['Csus2', '2M 5P', 'suspended 2nd']]
    },
    sus4: {
      caption: 'A suspended chord swaps the 3rd for a neighbouring note, so it is neither major nor minor. Sus4 uses the 4th, which wants to fall to the 3rd.',
      cols: [],
      rows: [['Csus4', '4P 5P', 'suspended 4th']]
    },
    add9: {
      caption: 'Add9 puts a 9th (a 2nd, an octave up) on a triad, with no 7th. The triad is named as usual.',
      cols: ['Triad', 'Added'],
      rows: [['Cadd9', '3M 5P 9M', 'major', 'major 9th', 'major add 9'], ['Cm(add9)', '3m 5P 9M', 'minor', 'major 9th', 'minor add 9'],
             ['C°(add9)', '3m 5d 9M', 'diminished', 'major 9th', 'diminished add 9'], ['C+(add9)', '3M 5A 9M', 'augmented', 'major 9th', 'augmented add 9']]
    },
    '7': {
      caption: 'A seventh chord adds a third on top of a triad. The triad and the 7th are named separately: in Cmaj7 the C is a major triad and “maj” describes the 7th. A bare 7 means a minor 7th on a major triad (the dominant seventh).',
      cols: ['Triad', '7th'],
      rows: [['Cmaj7', '3M 5P 7M', 'major', 'major', 'major seventh'], ['C7', '3M 5P 7m', 'major', 'minor', 'dominant seventh'],
             ['Cm7', '3m 5P 7m', 'minor', 'minor', 'minor seventh'], ['Cm(maj7)', '3m 5P 7M', 'minor', 'major', 'minor-major seventh'],
             ['Cø7', '3m 5d 7m', 'diminished', 'minor', 'half-diminished seventh'], ['C°7', '3m 5d 7d', 'diminished', 'diminished', 'fully diminished seventh'],
             ['Caug7 (C7♯5)', '3M 5A 7m', 'augmented', 'minor', 'augmented seventh'], ['Cmaj7♯5', '3M 5A 7M', 'augmented', 'major', 'augmented major seventh'],
             ['(not used)', '3M 5A 7A', 'augmented', 'augmented', '—'], ['(very rare)', '3m 5d 7M', 'diminished', 'major', 'diminished major seventh']]
    },
    '9': {
      caption: 'A ninth chord is a seventh chord with a major 9th (a 2nd, an octave up) added on top.',
      cols: ['Seventh chord', 'Added'],
      rows: [['Cmaj9', '3M 5P 7M 9M', 'major seventh', 'major 9th', 'major ninth'], ['C9', '3M 5P 7m 9M', 'dominant seventh', 'major 9th', 'dominant ninth'],
             ['Cm9', '3m 5P 7m 9M', 'minor seventh', 'major 9th', 'minor ninth'], ['Cm(maj9)', '3m 5P 7M 9M', 'minor-major seventh', 'major 9th', 'minor-major ninth'],
             ['Cm9♭5', '3m 5d 7m 9M', 'half-diminished seventh', 'major 9th', 'half-diminished ninth'],
             ['C9♯5', '3M 5A 7m 9M', 'augmented seventh', 'major 9th', 'augmented ninth'], ['Cmaj9♯5', '3M 5A 7M 9M', 'augmented major seventh', 'major 9th', 'augmented major ninth']]
    },
    '11': {
      caption: 'An eleventh chord stacks the 7th, 9th and 11th on a triad. The 11th is a perfect 4th an octave up; over a major 3rd it rubs against the 3rd, so it is often voiced without it.',
      cols: ['Ninth chord', 'Added'],
      rows: [['Cmaj11', '3M 5P 7M 9M 11P', 'major ninth', 'perfect 11th', 'major eleventh'], ['C11', '3M 5P 7m 9M 11P', 'dominant ninth', 'perfect 11th', 'dominant eleventh'],
             ['Cm11', '3m 5P 7m 9M 11P', 'minor ninth', 'perfect 11th', 'minor eleventh']]
    },
    '13': {
      caption: 'A thirteenth chord stacks every third up to the 13th (a 6th, an octave up): 7th, 9th, 11th and 13th. Players usually leave some out, most often the 5th and the 11th.',
      cols: ['Eleventh chord', 'Added'],
      rows: [['Cmaj13', '3M 5P 7M 9M 11P 13M', 'major eleventh', 'major 13th', 'major thirteenth'], ['C13', '3M 5P 7m 9M 11P 13M', 'dominant eleventh', 'major 13th', 'dominant thirteenth'],
             ['Cm13', '3m 5P 7m 9M 11P 13M', 'minor eleventh', 'major 13th', 'minor thirteenth']]
    }
  };

  function rows(type) {
    var t = TABLES[type] || TABLES.triad, nc = t.cols.length;
    return t.rows.map(function (r) {
      var notes = build(r[1]);
      return { symbol: r[0], notes: notes, cells: r.slice(2, 2 + nc), name: r[2 + nc], names: notes.map(function (n) { return n.name; }) };
    });
  }

  // ---- drawing ----
  var SP = 11, K = SP / 250, W = 190, X_NOTE = 86;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function staff(row) {
    var notes = row.notes, top = 13, bot = -3, H = (top - bot) * SP / 2 + 10;                // positions -3..13 (half spaces above the bottom line)
    function y(p) { return 5 + (top - p) * SP / 2; }
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(row.symbol + ': ' + row.names.join(' ')) + '">'];
    var i;
    for (i = 0; i < 5; i++) out.push('<line x1="2" x2="' + (W - 2) + '" y1="' + y(2 * i) + '" y2="' + y(2 * i) + '" stroke="#333" stroke-width="1"/>');
    out.push('<path d="' + Glyphs.gclef + '" transform="translate(6,' + y(2) + ') scale(' + K + ',-' + K + ')" fill="#222"/>');
    var pos = notes.map(function (n) { return n.step * 1 - 2 + (n.step >= 0 ? 0 : 0) ; });        // C4 sits at -2: one step = one half space
    var minP = Math.min.apply(null, pos), maxP = Math.max.apply(null, pos), q;
    for (q = -2; q >= minP; q -= 2) out.push('<line x1="' + (X_NOTE - 11) + '" x2="' + (X_NOTE + 11) + '" y1="' + y(q) + '" y2="' + y(q) + '" stroke="#333" stroke-width="1.1"/>');
    for (q = 10; q <= maxP; q += 2) out.push('<line x1="' + (X_NOTE - 11) + '" x2="' + (X_NOTE + 11) + '" y1="' + y(q) + '" y2="' + y(q) + '" stroke="#333" stroke-width="1.1"/>');
    var cols = [];                                                                             // accidentals, stacked leftwards, highest first
    for (i = notes.length - 1; i >= 0; i--) {
      var a = notes[i].acc;
      if (!a) continue;
      var c = 0;
      while (cols[c] !== undefined && cols[c] - pos[i] < 6) c++;
      cols[c] = pos[i];
      var ax = X_NOTE - 15 - c * 9, ay = y(pos[i]);
      if (a === 1) out.push('<path d="' + Glyphs.sharp + '" transform="translate(' + ax + ',' + ay + ') scale(' + K + ',-' + K + ')" fill="#222"/>');
      else if (a === -1) out.push('<path d="' + Glyphs.flat + '" transform="translate(' + ax + ',' + ay + ') scale(' + K + ',-' + K + ')" fill="#222"/>');
      else if (a === -2) {
        out.push('<path d="' + Glyphs.flat + '" transform="translate(' + (ax - 4) + ',' + ay + ') scale(' + K + ',-' + K + ')" fill="#222"/>');
        out.push('<path d="' + Glyphs.flat + '" transform="translate(' + (ax + 3) + ',' + ay + ') scale(' + K + ',-' + K + ')" fill="#222"/>');
      } else out.push('<text x="' + ax + '" y="' + (ay + 4) + '" font-size="12" text-anchor="middle">' + esc(accText(a)) + '</text>');
    }
    notes.forEach(function (n, k) {                                                             // whole notes
      out.push('<ellipse cx="' + X_NOTE + '" cy="' + y(pos[k]) + '" rx="' + (0.72 * SP) + '" ry="' + (0.5 * SP) + '" fill="#fff" stroke="#222" stroke-width="1.6"/>');
    });
    // blue: the interval between neighbouring notes, to the right of the stack
    var bx = X_NOTE + 14;
    for (i = 0; i + 1 < notes.length; i++) {
      var lab = sizeName(notes[i + 1].step - notes[i].step, notes[i + 1].sm - notes[i].sm);
      out.push('<text x="' + bx + '" y="' + (y((pos[i] + pos[i + 1]) / 2) + 3.5) + '" font-size="9.5" font-weight="700" fill="#2563eb">' + lab + '</text>');
    }
    // orange: the bracket from the root to the top note, and its interval
    var tp = notes[notes.length - 1], bk = X_NOTE + 44, y0 = y(pos[0]), y1 = y(pos[notes.length - 1]);
    out.push('<path d="M' + (bk - 4) + ' ' + y0 + 'H' + bk + 'V' + y1 + 'H' + (bk - 4) + '" fill="none" stroke="#ea580c" stroke-width="1.6"/>');
    out.push('<text x="' + (bk + 4) + '" y="' + ((y0 + y1) / 2 + 3.5) + '" font-size="11" font-weight="700" fill="#ea580c">' + sizeName(tp.step, tp.sm) + '</text>');
    out.push('</svg>');
    return out.join('');
  }

  function table(type) {
    var t = TABLES[type] || TABLES.triad, data = rows(type);
    var h = ['<p class="q-caption">' + esc(t.caption) + '</p>',
      '<div class="q-wrap"><table class="q-table"><thead><tr><th>Chord</th><th>Notes in C</th>' + t.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '<th>Name</th></tr></thead><tbody>'];
    data.forEach(function (r) {
      h.push('<tr><th scope="row" class="q-sym">' + esc(r.symbol) + '</th><td class="q-staff">' + staff(r) + '</td>' +
        r.cells.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '<td class="q-name">' + esc(r.name) + '</td></tr>');
    });
    h.push('</tbody></table></div><p class="q-key"><span class="q-blue">Blue</span>: the interval between neighbouring notes. <span class="q-orange">Orange</span>: from the root to the top note. M major, m minor, P perfect, d diminished, A augmented.</p>');
    return h.join('');
  }

  return { table: table, rows: rows, sizeName: sizeName, TYPES: Object.keys(TABLES) };
});
