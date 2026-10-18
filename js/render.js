/* Renders the keyboard + key-signature boxes as an SVG string.

   The keyboard is a window onto a continuous chromatic keyboard. The window starts
   at the root key (white or black) and ends on the same note an octave higher, so
   it always shows the full octave. Everything is keyed by absolute semitone `s`
   (0 = C, 12 = the next C, ...) so any root works.

   state = { root: 0..11, mode: 'major'|'minor', spell: 0|1, selected: bool }  */
var KeyboardRender = (function () {
  'use strict';

  var T = (typeof Theory !== 'undefined') ? Theory : require('./theory.js');
  var G = (typeof Glyphs !== 'undefined') ? Glyphs : require('./glyphs.js');
  var CH = (typeof Chords !== 'undefined') ? Chords : require('./chords.js');

  var SHARP = T.SHARP;
  var FLAT = T.FLAT;

  // ---- geometry -------------------------------------------------------------
  var S = 6.8;                        // staff space (px between staff lines)
  var K = S / 250;                    // Bravura font units -> px
  var CLEF_W = 671 * K;
  var ACC_ADV = 1.15 * S;             // advance between accidentals

  var W = 64;                         // white key width
  var BW = 40;                        // black key width
  var BOXW = 80;                      // label box width
  var H = 64;                         // height of one staff
  var PAD = 40;
  var MAX_WHITES = 18;                // the widest window: two full octaves, F up to B (the 2nd octave's last group)
  var BOX_SC = 0.75;                  // the key-signature boxes over the keys are drawn at this scale of the full size
  var WIDTH = MAX_WHITES * W + 2 * PAD;

  var BOXW_E = BOXW * BOX_SC, H_E = H * BOX_SC;   // size of those boxes
  var Y_WT = 218 - H_E;               // top of the white-key label boxes (their bottoms sit 32 above the keys)
  var Y_BB = Y_WT - 14;               // bottom of the black-key label boxes
  var TOP_CUT = 52;                   // unused space above the highest box, trimmed from the picture
  var KEY_TOP = 250;
  var WH = 100;                       // visible height of white keys (cut off)
  var BH = 62;                        // black key height
  var COUNT_Y = KEY_TOP + 20;
  var DEG_Y = KEY_TOP + WH + 26;      // centre of the scale-degree badges
  var HEIGHT = DEG_Y + 14 + 34;
  var GUESS_CY = KEY_TOP + WH + 54;   // flashcards: centre of the row showing a wrong guess's signature
  var HEIGHT_FLASH = GUESS_CY + H / 2 + 18;

  // ---- colours --------------------------------------------------------------
  var INK = '#1c1c1c';
  // [box fill, border, connector line]
  var PAL = {
    sharp: ['#eef3fb', '#9db4d8', '#6f8fc4'],   // light blue
    flat: ['#f3eefb', '#b7a3d8', '#9a82c9']     // light purple
  };
  // darker variants of the sharp/flat colours for text on highlighted keys
  var PAL_DARK = { sharp: '#2f4f8f', flat: '#5b3d9e' };

  var HL = {                                    // key fills when highlighted
    white: { scale: '#fef08a', root: '#fde047', third: '#fde047', fifth: '#fde047',
             croot: '#f59e0b', ctone: '#fb923c', cscale: '#fef9c3' },     // c*: a chord is selected
    black: { scale: '#fef08a', root: '#eab308', third: '#eab308', fifth: '#eab308',
             croot: '#d97706', ctone: '#f97316', cscale: '#fde68a' }
  };
  var THIRD_STROKE = '#9a3412';
  var SELECT = '#ea580c';                       // outline of the selected root's box
  var BADGE = {
    scale: { fill: '#fde68a', stroke: '#a16207', text: '#422006', r: 11 },
    root: { fill: '#eab308', stroke: '#854d0e', text: '#2b1a00', r: 11 },
    third: { fill: '#ea580c', stroke: '#9a3412', text: '#ffffff', r: 14 }
  };
  var NEUTRAL_BAND = '#9aa1b2';                 // key-top band in flashcard mode (no blue/purple hint)
  var HL_INK = '#2b1a00';                       // key-name text on highlighted keys

  // Staff positions in half-spaces above the bottom line (E4 = 0), treble clef.
  var SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4];      // F5 C5 G5 D5 A4 E5 B4
  var FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1];       // B4 E5 A4 D5 G4 C5 F4

  var BLACK_NAMES = {
    1: ['C' + SHARP, 'D' + FLAT],
    3: ['D' + SHARP, 'E' + FLAT],
    6: ['F' + SHARP, 'G' + FLAT],
    8: ['G' + SHARP, 'A' + FLAT],
    10: ['A' + SHARP, 'B' + FLAT]
  };

  // ---- keyboard geometry in absolute coordinates ----------------------------
  var WHITE_INDEX = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
  var BLACK_BELOW = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };   // white key just below

  function whiteX(s) {                    // left edge of white key s
    return (Math.floor(s / 12) * 7 + WHITE_INDEX[T.mod12(s)]) * W;
  }

  function boundaryX(s) {                 // centre of black key s
    return (Math.floor(s / 12) * 7 + BLACK_BELOW[T.mod12(s)] + 1) * W;
  }

  // The visible window. It always starts at the beginning of a black-key group (on C, the
  // start of the pair, or F, the start of the triple) and ends at the end of one (after E
  // or after B), so a pair or triple of black keys is never split. It is the smallest such
  // window that holds the root and the same note an octave higher.
  function whiteIndex(s) {                // white key at/under s -> index; black key -> white key above
    var o = Math.floor(s / 12) * 7;
    var pc = T.mod12(s);
    return T.isBlack(pc) ? o + BLACK_BELOW[pc] + 1 : o + WHITE_INDEX[pc];
  }

  // The window always starts on C (a black-key pair) or F (a triple), so no group of black keys is split:
  // C for the keys of C, D♭, D, E♭ and E, F for F, F♯/G♭, G, A♭, A, B♭ and B. The root key is in its left octave.
  function windowGeom(r, octaves) {
    var startPc = T.mod12(r) <= 4 ? 0 : 5;                    // C or F
    var start = r - T.mod12(r) + startPc;
    var left = whiteIndex(start) * W;
    var wi = whiteIndex(start + 12 * (octaves || 1));          // `octaves` octaves above the start (or the white key above it)
    while ((wi % 7) !== 2 && (wi % 7) !== 6) wi++;               // E or B ends a group
    var right = (wi + 1) * W;
    return { left: left, right: right, width: right - left, startSemitone: start };
  }

  // lowest and highest semitone (absolute) of the keys fully on screen for root r; the keys that
  // belong to the visible window, whichever way the chord is voiced
  function windowRange(r, octaves) {
    var geo = windowGeom(r, octaves);
    var shift = (WIDTH - geo.width) / 2 - geo.left;
    var winL = geo.left + shift, winR = geo.right + shift;
    var lo = null, hi = null;
    for (var s = geo.startSemitone - 1; s <= geo.startSemitone + 30; s++) {
      var pc = T.mod12(s);
      var ok;
      if (!T.isBlack(pc)) {
        var x = whiteX(s) + shift;
        ok = x + W > winL + 0.01 && x < winR - 0.01 && (x + W / 2) >= winL - 0.01 && (x + W / 2) <= winR + 0.01;
      } else {
        var bcx = boundaryX(s) + shift;
        ok = bcx - BW / 2 >= winL - 0.01 && bcx + BW / 2 <= winR + 0.01;
      }
      if (ok) { if (lo === null) lo = s; hi = s; }
    }
    return { lo: lo - r, hi: hi - r };          // relative to the tonic
  }

  // ---- small helpers --------------------------------------------------------
  function f(n) { return Number(n.toFixed(2)); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function letterOf(pc) {                 // white key pitch class -> 'C'..'B'
    return T.LETTERS[T.NATURAL_PC.indexOf(pc)];
  }

  function hlType(deg) {
    while (deg > 8) deg -= 7;             // degrees 9, 10, ... repeat 2, 3, ...
    if (deg === 1 || deg === 8) return 'root';
    if (deg === 3) return 'third';
    if (deg === 5) return 'fifth';
    return 'scale';
  }

  // How a key is lit. Without a chord: by scale degree. With one: chord root / chord tone, and the
  // rest of the scale only faintly.
  function keyType(d, ctx, pc) {
    if (ctx.flashRoot != null) return pc === ctx.flashRoot ? 'root' : null;   // find-the-signature card: just the tonic
    if (ctx.chordRoles) {
      var role = ctx.chordRoles[pc];
      if (role) return role;
      return d ? 'cscale' : null;
    }
    return d ? 'scale' : null;
  }

  // scale degree of the key `off` semitones above the root (null if not in scale)
  function degreeOf(off, scale) {
    if (!scale) return null;
    if (off > 12) {                       // the extra keys continue the scale upward
      var up = degreeOf(off - 12, scale);
      return up && { deg: up.deg + 7, name: up.name };
    }
    if (off === 12) return { deg: 8, name: scale.names[0] };
    var i = scale.offsets.indexOf(off);
    return i < 0 ? null : { deg: i + 1, name: scale.names[i] };
  }

  // ---- one five-line staff with clef, accidentals, count and name -----------
  function staff(cx, top, sp, label, plain, fs) {
    fs = fs || 10;
    var x0 = cx - BOXW / 2;
    var mid = top + H / 2;
    var bottom = mid + 2 * S;
    var topline = mid - 2 * S;
    var out = [];
    var i;
    for (i = 0; i < 5; i++) {
      var y = bottom - i * S;
      out.push('<line x1="' + f(x0 + 3) + '" y1="' + f(y) + '" x2="' + f(x0 + BOXW - 3) +
        '" y2="' + f(y) + '" stroke="' + INK + '" stroke-width="0.8"/>');
    }
    [x0 + 3, x0 + BOXW - 3].forEach(function (x) {
      out.push('<line x1="' + f(x) + '" y1="' + f(topline) + '" x2="' + f(x) + '" y2="' +
        f(bottom) + '" stroke="' + INK + '" stroke-width="1"/>');
    });
    var clefX = x0 + 6;
    out.push('<use href="#gclef" transform="translate(' + f(clefX) + ',' + f(bottom - S) +
      ') scale(' + K.toFixed(5) + ',' + (-K).toFixed(5) + ')" fill="' + INK + '"/>');
    var steps = sp.kind === 'sharp' ? SHARP_STEPS : FLAT_STEPS;
    var ax = clefX + CLEF_W + 3.5;
    for (i = 0; i < sp.n; i++) {
      var ay = bottom - steps[i] * S / 2;
      out.push('<use href="#' + sp.kind + '" transform="translate(' + f(ax + i * ACC_ADV) +
        ',' + f(ay) + ') scale(' + K.toFixed(5) + ',' + (-K).toFixed(5) + ')" fill="' + INK + '"/>');
    }
    var col = PAL[sp.kind][1];
    if (plain) return out.join('');      // flashcard: just clef + accidentals, no count or name
    if (sp.n > 0) {
      out.push('<text x="' + f(x0 + BOXW - 6) + '" y="' + f(top + 12) +
        '" text-anchor="end" font-size="' + fs + '" font-weight="bold" fill="' + col + '">' + sp.n + '</text>');
    }
    out.push('<text x="' + f(x0 + BOXW - 6) + '" y="' + f(top + H - 6) +
      '" text-anchor="end" font-size="' + fs + '" font-weight="bold" fill="' + col + '">' + esc(label) + '</text>');
    return out.join('');
  }

  // ---- label boxes -----------------------------------------------------------
  function boxLabel(sp, mode) {
    return T.keyLabel(sp, mode);
  }

  // staff() draws a full-size box with its top centre at (cx, top); this scales it to BOX_SC about that point
  function smallStaff(cx, top, sp, label) {
    return '<g transform="translate(' + f(cx) + ',' + f(top) + ') scale(' + BOX_SC + ') translate(' + f(-cx) + ',' + f(-top) + ')">' +
      staff(cx, top, sp, label, false, 13.5) + '</g>';
  }

  // The boxes are spread over the whole window, in two octaves: the sharp keys' (C, with no accidentals, is one of
  // them) and the flat keys'. The octave of the selected key's kind is the left one.
  function boxIsFlat(sp) { return sp.kind === 'flat'; }

  // One box over a key. The row says how many accidentals the signature has: an odd number sits on the lower row, an even
  // number (C major and A minor have none) on the upper row. A line joins the box to its key (dashed for a black key).
  function keyBox(k, mode, spellIdx, isSelected, stacked, extra) {
    var sp = T.specsFor(mode, k.pc)[spellIdx];
    var pal = PAL[sp.kind];
    var top = sp.n % 2 === 1 ? Y_WT : Y_BB - H_E;
    if (stacked) top -= H_E + 4;                              // the other spelling of F♯/G♭, stacked above the one in the row
    var x = k.cx - BOXW_E / 2;
    return (extra ? '<g class="xbox" data-kind="' + sp.kind + '">' : '') + (stacked ? '' : '<line x1="' + f(k.cx) + '" y1="' + f(top + H_E) + '" x2="' + f(k.cx) + '" y2="' + KEY_TOP + '" stroke="' + pal[2] +
        '" stroke-width="1.5"' + (T.isBlack(k.pc) ? ' stroke-dasharray="4 3"' : '') + '/>') +
      '<g class="box" data-pc="' + k.pc + '" data-s="' + k.s + '" data-spell="' + spellIdx + '" role="button" tabindex="-1" aria-label="' +
        esc('Root the keyboard on ' + T.keyTitle(sp, mode)) + '">' +
      '<rect x="' + f(x) + '" y="' + f(top) + '" width="' + f(BOXW_E) + '" height="' + f(H_E) + '" rx="6" fill="' + pal[0] +
        '" stroke="' + (isSelected ? SELECT : pal[1]) + '" stroke-width="' + (isSelected ? 3 : 1.5) + '"/>' +
      smallStaff(k.cx, top, sp, boxLabel(sp, mode)) + '</g>' + (extra ? '</g>' : '');       // extra = only in the vertical layout
  }

  // ---- keys ------------------------------------------------------------------
  function whiteKey(k, ctx) {
    var sp = T.specsFor(ctx.mode, k.pc)[0];
    var d = degreeOf(k.off, ctx.scale);
    var type = (ctx.rootFirst && k.off < 0) ? null : keyType(d, ctx, k.pc);
    var fill = type ? HL.white[type] : '#ffffff';
    var stroke = '#333';
    var sw = 1.5;
    var out = [];
    out.push('<rect class="body" x="' + f(k.x) + '" y="' + KEY_TOP + '" width="' + W + '" height="' + (WH + 12) +
      '" rx="4" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>');
    // hover / focus indicator: an inset ring, so neighbouring keys can't paint over it
    out.push('<rect class="hover-ring" x="' + f(k.x + 3) + '" y="' + (KEY_TOP + 3) + '" width="' + (W - 6) +
      '" height="' + (WH - 6) + '" rx="3" pointer-events="none"/>');
    out.push('<line x1="' + f(k.x) + '" y1="' + KEY_TOP + '" x2="' + f(k.x + W) + '" y2="' + KEY_TOP +
      '" stroke="' + (ctx.flash ? NEUTRAL_BAND : PAL[sp.kind][1]) + '" stroke-width="6" pointer-events="none"/>');
    if (k.inside) {
      if (sp.n > 0 && !ctx.flash) {
        out.push('<text x="' + f(k.cx) + '" y="' + COUNT_Y + '" text-anchor="middle" font-size="15" ' +
          'font-weight="bold" fill="' + (type ? PAL_DARK[sp.kind] : PAL[sp.kind][1]) +
          '" pointer-events="none">' + sp.n + '</text>');
      }
      if (d || !ctx.flash || ctx.flashRoot === k.pc) {   // flashcards: no labels, except the scale once lit (and the tonic when asked for its signature)
        out.push('<text x="' + f(k.cx) + '" y="' + (KEY_TOP + WH - 16) + '" text-anchor="middle" font-size="18" ' +
          'font-weight="bold" fill="' + (type ? HL_INK : '#333') + '" pointer-events="none">' +
          esc(d ? d.name : (ctx.flashRoot === k.pc ? ctx.flashName : letterOf(k.pc))) + '</text>');
      }
    }
    var label = d ? d.name : letterOf(k.pc);
    return '<g class="key key-white' + (type ? ' hl hl-' + type : '') + '" data-pc="' + k.pc + '" data-s="' + k.s +
      '" tabindex="' + (ctx.sig ? '-1' : '0') + '" role="button" aria-label="' +
      esc(label + ' key. Root the keyboard on ' + letterOf(k.pc) + '.') + '">' + out.join('') + '</g>';
  }

  function blackKey(k, ctx) {
    var specs = T.specsFor(ctx.mode, k.pc);
    var single = specs.length === 1;
    var d = degreeOf(k.off, ctx.scale);
    var type = (ctx.rootFirst && k.off < 0) ? null : keyType(d, ctx, k.pc);
    var x = k.cx - BW / 2;
    var fill = type ? HL.black[type] : '#222';
    var stroke = '#111';
    var sw = type ? (type === 'cscale' ? 3.6 : 7.2) : 1.2;   // lit black keys keep a heavy border so they still read as black
    var out = [];
    out.push('<rect class="body" x="' + f(x) + '" y="' + KEY_TOP + '" width="' + BW + '" height="' + BH +
      '" rx="3" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>');
    var ri = type ? 6 : 3;           // inset past the heavy border of a lit key
    out.push('<rect class="hover-ring" x="' + f(x + ri) + '" y="' + (KEY_TOP + ri) + '" width="' + (BW - 2 * ri) +
      '" height="' + (BH - 2 * ri) + '" rx="2" pointer-events="none"/>');
    if (single) {
      out.push('<line x1="' + f(x) + '" y1="' + KEY_TOP + '" x2="' + f(x + BW) + '" y2="' + KEY_TOP +
        '" stroke="' + (ctx.flash ? NEUTRAL_BAND : PAL[specs[0].kind][1]) + '" stroke-width="6" pointer-events="none"/>');
    }
    var colFor = function (kind) { return type ? PAL_DARK[kind] : PAL[kind][1]; };
    function count(cx, n, kind) {
      return '<text x="' + f(cx) + '" y="' + COUNT_Y + '" text-anchor="middle" font-size="15" font-weight="bold" fill="' +
        colFor(kind) + '" pointer-events="none">' + n + '</text>';
    }
    if (ctx.flash) {
      // flashcard mode: no signature counts on the keys
    } else if (single) {
      out.push(count(k.cx, specs[0].n, specs[0].kind));
    } else {
      out.push(count(k.cx - 11, specs[0].n, specs[0].kind));
      out.push('<text x="' + f(k.cx) + '" y="' + COUNT_Y + '" text-anchor="middle" font-size="12" fill="' +
        (type ? '#6b5a1a' : '#999') + '" pointer-events="none">/</text>');
      out.push(count(k.cx + 11, specs[1].n, specs[1].kind));
    }
    if (d) {
      out.push('<text x="' + f(k.cx) + '" y="' + (KEY_TOP + BH - 14) + '" text-anchor="middle" font-size="14" ' +
        'font-weight="bold" fill="' + HL_INK + '" pointer-events="none">' + esc(d.name) + '</text>');
    } else if (ctx.flashRoot === k.pc) {
      out.push('<text x="' + f(k.cx) + '" y="' + (KEY_TOP + BH - 14) + '" text-anchor="middle" font-size="14" ' +
        'font-weight="bold" fill="' + HL_INK + '" pointer-events="none">' + esc(ctx.flashName) + '</text>');
    } else if (!ctx.flash) {
      var n = BLACK_NAMES[k.pc];
      out.push('<text x="' + f(k.cx) + '" y="' + (KEY_TOP + BH - 22) + '" text-anchor="middle" font-size="12" ' +
        'fill="#e8e8e8" pointer-events="none">' + esc(n[0]) + '</text>');
      out.push('<text x="' + f(k.cx) + '" y="' + (KEY_TOP + BH - 8) + '" text-anchor="middle" font-size="12" ' +
        'fill="#e8e8e8" pointer-events="none">' + esc(n[1]) + '</text>');
    }
    var label = d ? d.name : BLACK_NAMES[k.pc].join(' / ');
    return '<g class="key key-black' + (type ? ' hl hl-' + type : '') + '" data-pc="' + k.pc + '" data-s="' + k.s +
      '" tabindex="' + (ctx.sig ? '-1' : '0') + '" role="button" aria-label="' +
      esc(label + ' key. Root the keyboard on ' + BLACK_NAMES[k.pc].join(' or ') + '.') + '">' + out.join('') + '</g>';
  }

  // scale-degree badges below the keyboard; the third is larger and labelled
  function degreeBadges(keys, ctx) {
    var out = [];
    keys.forEach(function (k) {
      var d = degreeOf(k.off, ctx.scale);
      if (!d || !k.inside) return;
      var b = BADGE[hlType(d.deg)];
      var third = d.deg === 3;
      var keyBottom = KEY_TOP + WH;       // the keys are cut off at this line
      out.push('<line x1="' + f(k.cx) + '" y1="' + keyBottom + '" x2="' + f(k.cx) + '" y2="' + (DEG_Y - b.r) +
        '" stroke="' + b.stroke + '" stroke-width="1.5" pointer-events="none"/>');
      out.push('<circle cx="' + f(k.cx) + '" cy="' + DEG_Y + '" r="' + b.r + '" fill="' + b.fill +
        '" stroke="' + b.stroke + '" stroke-width="1.5" pointer-events="none"/>');
      out.push('<text x="' + f(k.cx) + '" y="' + (DEG_Y + (third ? 5.5 : 4.5)) + '" text-anchor="middle" font-size="' +
        (third ? 15 : 13) + '" font-weight="bold" fill="' + b.text + '" pointer-events="none">' + d.deg + '</text>');
      if (third) {
        out.push('<text x="' + f(k.cx) + '" y="' + (DEG_Y + b.r + 17) + '" text-anchor="middle" font-size="12.5" ' +
          'font-weight="bold" fill="#c2410c" pointer-events="none">' + ctx.mode + ' 3rd</text>');
      }
    });
    return out.join('');
  }

  // ---- flashcard: one bare key signature, big, with hidden feedback marks ----
  var CARD_SCALE = 1.7;
  var CARD_CY = 120;
  // A key with two common spellings (F# / Gb major, D# / Eb minor) shows both signatures
  // side by side, so the card never gives away which spelling "the answer" is.
  var CARD_GAP = 32;

  // below the keyboard: the signature(s) of the key that was pressed by mistake
  function guessRow(pc, mode) {
    var specs = T.specsFor(mode, pc);
    var cx = WIDTH / 2;
    var gap = 14;
    var total = specs.length * BOXW + (specs.length - 1) * gap;
    var left = cx - total / 2;
    var boxes = specs.map(function (sp, i) {
      var mid = left + BOXW / 2 + i * (BOXW + gap);
      return '<g transform="translate(' + f(mid) + ',' + GUESS_CY + ')">' +
        '<rect x="' + (-BOXW / 2) + '" y="' + (-H / 2) + '" width="' + BOXW + '" height="' + H + '" rx="8" ' +
          'fill="#fff5f5" stroke="#f1b4b4" stroke-width="1.2"/>' +
        staff(0, -H / 2, sp, '', true) + '</g>';
    }).join('');
    var title = specs.map(function (sp) { return T.keyTitle(sp, mode); }).join(' / ');
    return '<g class="guess" data-guess-pc="' + pc + '" data-cards="' + specs.length + '">' +
      '<text x="' + f(left - 18) + '" y="' + (GUESS_CY + 5) + '" text-anchor="end" font-size="15" fill="#7b8294" ' +
        'pointer-events="none">You pressed</text>' + boxes +
      '<text x="' + f(left + total + 18) + '" y="' + (GUESS_CY + 5) + '" font-size="17" font-weight="bold" fill="#b91c1c" ' +
        'pointer-events="none">= ' + esc(title) + '</text></g>';
  }
  function nextButton(x, cy) {             // lives beside the clef; shown once the card is solved
    var w = 132, h = 48;
    if (cy == null) cy = CARD_CY;
    return '<g class="next-btn" role="button" tabindex="0" aria-label="Next card" transform="translate(' + f(x) + ',' +
      (cy - h / 2) + ')">' +
      '<rect width="' + w + '" height="' + h + '" rx="24" fill="#2563eb"/>' +
      '<text x="' + (w / 2) + '" y="' + (h / 2 + 6) + '" text-anchor="middle" font-size="20" font-weight="bold" ' +
        'fill="#ffffff" pointer-events="none">Next →</text></g>';
  }
  function giveUpButton(x, cy) {            // "find the chord": shows the answer instead
    var w = 132, h = 40;
    return '<g class="giveup-btn" role="button" tabindex="0" aria-label="I give up: show the answer" transform="translate(' + f(x) + ',' + (cy - h / 2) + ')">' +
      '<rect width="' + w + '" height="' + h + '" rx="20" fill="#ffffff" stroke="#c3cadb" stroke-width="1.5"/>' +
      '<text x="' + (w / 2) + '" y="' + (h / 2 + 6) + '" text-anchor="middle" font-size="17" font-weight="bold" fill="#5d6475" pointer-events="none">I give up</text></g>';
  }
  function flashCard(card, mode, answered) {
    if (!card) return '';
    var all = T.specsFor(mode, card.pc);
    // a two-spelling key (F#/Gb major, D#/Eb minor) shows just one signature on the cue; both once solved
    var specs = (answered || all.length === 1) ? all : [all[card.spell] || all[0]];
    var cx = WIDTH / 2;
    var bw = BOXW * CARD_SCALE;
    var total = specs.length * bw + (specs.length - 1) * CARD_GAP;
    var left = cx - total / 2;
    var boxes = specs.map(function (sp, i) {
      var mid = left + bw / 2 + i * (bw + CARD_GAP);
      return '<g transform="translate(' + f(mid) + ',' + CARD_CY + ') scale(' + CARD_SCALE + ')">' +
        '<rect x="' + (-BOXW / 2) + '" y="' + (-H / 2) + '" width="' + BOXW + '" height="' + H + '" rx="8" ' +
          'fill="#ffffff" stroke="#c3cadb" stroke-width="1.2"/>' +
        staff(0, -H / 2, sp, '', true) + '</g>';
    }).join('');
    var title = specs.map(function (sp) { return T.keyTitle(sp, mode); }).join(' / ');
    return '<g class="flashcard" data-answer-pc="' + card.pc + '" data-n="' + specs[0].n + '" data-cards="' + specs.length + '">' +
      boxes +
      '<text x="' + cx + '" y="' + (CARD_CY + H / 2 * CARD_SCALE + 30) + '" text-anchor="middle" font-size="16" ' +
        (answered ? 'font-weight="bold" fill="#15803d"' : 'fill="#5d6475"') + ' pointer-events="none">' +
        (answered ? esc(title) : 'Which ' + mode + ' key has ' + (specs.length > 1 ? 'these signatures' : 'this signature') +
          '? Press it on the keyboard.') + '</text>' +
      (answered ? nextButton(left + total + 28) : '') +
      '<text class="fb-nope" x="' + f(left + total + 28) + '" y="' + (CARD_CY + 10) + '" font-size="34" font-weight="bold" ' +
        'fill="#dc2626" opacity="0" pointer-events="none">✗ Nope</text>' +
      '<text class="fb-yes" x="' + f(left - 28) + '" y="' + (CARD_CY + 10) + '" text-anchor="end" font-size="34" ' +
        'font-weight="bold" fill="#16a34a" opacity="0" pointer-events="none">✓ Yes!</text>' +
      '</g>';
  }


  // ---- "find the signature" card: every signature of the mode in two centred rows ----
  // sharps (and C / Am) on top, flats below, each in order of number of accidentals. The keyboard
  // underneath shows the tonic; the player clicks the signature that belongs to it.
  var SIG_SCALE = 1.3;
  var SIG_GAP = 12;
  var SIG_ROW = { sharp: 54, flat: 148 };
  var SIG_TEXT_Y = 224;
  var HEIGHT_SIG = KEY_TOP + WH + 24;

  function sigRows(mode) {
    var rows = { sharp: [], flat: [] };
    for (var pc = 0; pc < 12; pc++) {
      T.specsFor(mode, pc).forEach(function (sp, i) { rows[sp.kind].push({ sp: sp, pc: pc, spell: i }); });
    }
    rows.sharp.sort(function (a, b) { return a.sp.n - b.sp.n; });
    rows.flat.sort(function (a, b) { return a.sp.n - b.sp.n; });
    return rows;
  }

  function countText(sp) {
    return sp.n === 0 ? 'no sharps or flats' : sp.n + ' ' + sp.kind + (sp.n === 1 ? '' : 's');
  }

  function sigGrid(state, mode) {
    var rows = sigRows(mode);
    var answered = !!state.answered;
    var g = state.guess && typeof state.guess === 'object' ? state.guess : null;
    var cx = WIDTH / 2;
    var bw = BOXW * SIG_SCALE;
    var out = ['<g class="sigcard" data-answer-pc="' + state.card.pc + '">'];
    // columns by number of accidentals: C / Am (none) in the first column, centred between the two
    // rows; sharps 1-6 above and flats 1-6 below, so equal counts line up
    var cols = 7;
    var total = cols * bw + (cols - 1) * SIG_GAP;
    var left = cx - total / 2;
    var midY = (SIG_ROW.sharp + SIG_ROW.flat) / 2;
    ['sharp', 'flat'].forEach(function (kind) {
      out.push('<text x="' + f(left + total + 16) + '" y="' + (SIG_ROW[kind] + 5) + '" text-anchor="start" font-size="14" ' +
        'fill="#7b8294" pointer-events="none">' + (kind === 'sharp' ? 'Sharps' : 'Flats') + '</text>');
      rows[kind].forEach(function (e) {
        var mid = left + bw / 2 + e.sp.n * (bw + SIG_GAP);
        var cy = e.sp.n === 0 ? midY : SIG_ROW[kind];
        var picked = g && g.kind === e.sp.kind && g.n === e.sp.n;
        var fill = '#ffffff', stroke = '#c3cadb', sw = 1.2;
        if (picked) {
          fill = answered ? '#f0fdf4' : '#fff5f5';
          stroke = answered ? '#16a34a' : '#dc2626';
          sw = 3;
        }
        out.push('<g class="sigbox" data-pc="' + e.pc + '" data-spell="' + e.spell + '" data-kind="' + e.sp.kind + '" data-n="' + e.sp.n +
          '" role="button" tabindex="0" aria-label="' + esc('Signature with ' + countText(e.sp)) + '" ' +
          'transform="translate(' + f(mid) + ',' + f(cy) + ') scale(' + SIG_SCALE + ')">' +
          '<rect x="' + (-BOXW / 2) + '" y="' + (-H / 2) + '" width="' + BOXW + '" height="' + H + '" rx="8" fill="' + fill +
            '" stroke="' + stroke + '" stroke-width="' + (sw / SIG_SCALE) + '"/>' +
          staff(0, -H / 2, e.sp, '', true) + '</g>');
      });
    });
    var msg, color, bold = true;
    if (answered && g) {
      var sp = T.specsFor(mode, g.pc)[g.spell];
      var notes = T.signatureNotes(sp);
      msg = T.keyTitle(sp, mode) + ': ' + countText(sp) + (notes.length ? ' (' + notes.join(' ') + ')' : '');
      color = '#15803d';
    } else if (g) {
      msg = 'That signature is ' + T.keyTitle(T.specsFor(mode, g.pc)[g.spell], mode) + '. Try again.';
      color = '#b91c1c';
    } else {
      msg = 'Which signature belongs to the ' + mode + ' key whose tonic is lit? Click it above.';
      color = '#5d6475';
      bold = false;
    }
    var tx = answered ? cx - 90 : cx;
    out.push('<text class="sig-msg" x="' + f(tx) + '" y="' + SIG_TEXT_Y + '" text-anchor="middle" font-size="16" ' +
      (bold ? 'font-weight="bold" ' : '') + 'fill="' + color + '" pointer-events="none">' + esc(msg) + '</text>');
    if (answered) out.push(nextButton(cx + 150, SIG_TEXT_Y - 6));
    out.push('</g>');
    return out.join('');
  }


  // ---- the big stave: the current key's signature across the keyboard, with chords on it ------
  // staffData = { kind: 'chord' | 'prog' | 'empty', hint, chords: [{ notes: [{ midi, name }], top, sub, lit }] }
  var SB = 10;                                  // staff space of the big stave
  var YB = 158;                                 // its bottom line
  var KB = SB / 250;                            // Bravura font units -> px
  var LETTER_IDX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  var FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

  function accidentalValue(name) {              // note name -> -2..2
    var v = 0;
    for (var i = 1; i < name.length; i++) {
      var ch = name.charAt(i);
      if (ch === T.SHARP) v += 1;
      else if (ch === T.FLAT) v -= 1;
      else if (name.substr(i, 2) === T.DOUBLE_SHARP) { v += 2; i++; }
      else if (name.substr(i, 2) === T.DOUBLE_FLAT) { v -= 2; i++; }
    }
    return v;
  }

  // The clefs on offer. line: which staff line (0 = bottom) the glyph's origin sits on; bottom: diatonic
  // number (octave * 7 + letter, C = 0) of the bottom line; trans: written pitch minus sounding pitch;
  // low: lowest bass note of the inversions shown in Chords mode; sharp/flat: key signature positions.
  var CLEF_ORDER = ['treble', 'treble8va', 'treble8', 'tenor', 'alto', 'bass'];
  var CLEFS = [
    { id: 'treble', mid: 71,  name: 'Treble',     note: 'G clef: right hand, melody, most instruments', glyph: 'gclef',    w: 671, line: 1, bottom: 30, trans: 0,  low: 60,
      sharp: [8, 5, 9, 6, 3, 7, 4], flat: [4, 7, 3, 6, 2, 5, 1] },
    { id: 'bass', mid: 50,    name: 'Bass',       note: 'F clef: left hand, bass instruments',          glyph: 'fclef',    w: 684, line: 3, bottom: 18, trans: 0,  low: 36,
      sharp: [6, 3, 7, 4, 1, 5, 2], flat: [2, 5, 1, 4, 0, 3, -1] },
    { id: 'alto', mid: 60,    name: 'Alto',       note: 'C clef on the middle line: viola',             glyph: 'cclef',    w: 699, line: 2, bottom: 24, trans: 0,  low: 48,
      sharp: [7, 4, 8, 5, 2, 6, 3], flat: [3, 6, 2, 5, 1, 4, 0] },
    { id: 'tenor', mid: 57,   name: 'Tenor',      note: 'C clef on the fourth line: cello, bassoon, trombone', glyph: 'cclef', w: 699, line: 3, bottom: 22, trans: 0, low: 48,
      sharp: [2, 6, 3, 7, 4, 8, 5], flat: [5, 8, 4, 7, 3, 6, 2] },
    { id: 'treble8va', mid: 83, name: 'Treble 8va', note: 'G clef sounding an octave higher: piccolo, recorder, high soprano', glyph: 'gclef8va', w: 671, line: 1, bottom: 30, trans: -12, low: 72,
      sharp: [8, 5, 9, 6, 3, 7, 4], flat: [4, 7, 3, 6, 2, 5, 1] },
    { id: 'treble8', mid: 59, name: 'Treble 8vb', note: 'G clef sounding an octave lower: guitar, tenor voice', glyph: 'gclef8vb', w: 671, line: 1, bottom: 30, trans: 12, low: 48,
      sharp: [8, 5, 9, 6, 3, 7, 4], flat: [4, 7, 3, 6, 2, 5, 1] }
  ];
  CLEFS.sort(function (a, b) { return CLEF_ORDER.indexOf(a.id) - CLEF_ORDER.indexOf(b.id); });
  function clefDef(id) {
    for (var i = 0; i < CLEFS.length; i++) if (CLEFS[i].id === id) return CLEFS[i];
    return CLEFS[0];
  }

  // a small picture of a clef on its staff, for the picker
  function clefIcon(id) {
    var c = clefDef(id), sp = 7, bot = 50, i, k = (sp / 250).toFixed(5);
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 76" width="60" height="76" aria-hidden="true" focusable="false">'];
    for (i = 0; i < 5; i++) out.push('<line x1="2" y1="' + (bot - i * sp) + '" x2="58" y2="' + (bot - i * sp) + '" stroke="#333" stroke-width="1"/>');
    out.push('<path d="' + G[c.glyph] + '" transform="translate(8,' + (bot - c.line * sp) + ') scale(' + k + ',-' + k + ')" fill="#222"/></svg>');
    return out.join('');
  }

  // staff position of a note: half-spaces above the bottom line of the clef
  function notePosition(midi, name, clef) {
    var letter = name.charAt(0);
    var oct = Math.round((midi + clef.trans - (LETTER_PC[letter] + accidentalValue(name))) / 12) - 1;
    return oct * 7 + LETTER_IDX[letter] - clef.bottom;
  }

  function yAt(p) { return YB - p * SB / 2; }

  function accGlyph(val, x, y) {                // an accidental centred on (x, y)
    var k = KB.toFixed(5);
    function use(id, dx) {
      return '<use href="#' + id + '" transform="translate(' + f(x + dx) + ',' + f(y) + ') scale(' + k + ',-' + k + ')" fill="' + INK + '"/>';
    }
    if (val === 1) return use('sharp', 0);
    if (val === -1) return use('flat', 0);
    if (val === -2) return use('flat', -0.45 * SB) + use('flat', 0.45 * SB);
    if (val === 2) {
      var d = 0.5 * SB;
      return '<path d="M' + f(x - d) + ' ' + f(y - d) + 'L' + f(x + d) + ' ' + f(y + d) + 'M' + f(x + d) + ' ' + f(y - d) + 'L' + f(x - d) +
        ' ' + f(y + d) + '" stroke="' + INK + '" stroke-width="' + f(0.38 * SB) + '" fill="none"/>';
    }
    // natural: two stems joined by two rising bars
    var a = 0.28 * SB, u = SB;
    return '<g fill="' + INK + '" stroke="' + INK + '" stroke-width="1">' +
      '<line x1="' + f(x - a) + '" y1="' + f(y - 1.4 * u) + '" x2="' + f(x - a) + '" y2="' + f(y + 0.7 * u) + '"/>' +
      '<line x1="' + f(x + a) + '" y1="' + f(y - 0.7 * u) + '" x2="' + f(x + a) + '" y2="' + f(y + 1.4 * u) + '"/>' +
      '<polygon points="' + [[-a, -0.1], [a, -0.5], [a, -0.15], [-a, 0.25]].map(function (q) { return f(x + q[0]) + ',' + f(y + q[1] * u); }).join(' ') + '" stroke="none"/>' +
      '<polygon points="' + [[-a, 0.3], [a, -0.1], [a, 0.25], [-a, 0.65]].map(function (q) { return f(x + q[0]) + ',' + f(y + q[1] * u); }).join(' ') + '" stroke="none"/></g>';
  }

  // a block chord (whole notes) centred on cx; sigVal maps a letter to the key signature's accidental
  function chordOnStave(cx, notes, sigVal, ink, clef) {
    var items = notes.map(function (n) {
      var val = accidentalValue(n.name);
      return { p: notePosition(n.midi, n.name, clef), val: val, show: val !== (sigVal[n.name.charAt(0)] || 0) };
    }).sort(function (a, b) { return a.p - b.p; });
    var out = [];
    var rx = 0.72 * SB, ry = 0.5 * SB;
    var prev = null;
    items.forEach(function (it) {                 // a second above the note below goes on the right-hand side
      it.right = !!(prev && it.p - prev.p === 1 && !prev.right);
      prev = it;
    });
    var minP = items[0].p, maxP = items[items.length - 1].p;
    var q;
    // ledger lines: every even position below the stave down to the lowest note, above it up to the highest
    var lines = [];
    for (q = -2; q >= minP; q -= 2) lines.push(q);
    for (q = 10; q <= maxP; q += 2) lines.push(q);
    lines.forEach(function (l) {
      out.push('<line x1="' + f(cx - 1.25 * SB) + '" y1="' + f(yAt(l)) + '" x2="' + f(cx + (items.some(function (i) { return i.right; }) ? 2.1 : 1.25) * SB) +
        '" y2="' + f(yAt(l)) + '" stroke="' + INK + '" stroke-width="1.1"/>');
    });
    // accidentals, stacked leftwards so close ones do not collide (highest note first)
    var cols = [];
    items.slice().reverse().forEach(function (it) {
      if (!it.show) return;
      var c = 0;
      while (cols[c] !== undefined && cols[c] - it.p < 6) c++;
      cols[c] = it.p;
      out.push(accGlyph(it.val, cx - 1.7 * SB - c * 1.15 * SB, yAt(it.p)));
    });
    items.forEach(function (it) {
      var x = cx + (it.right ? 2 * rx - 1 : 0);
      out.push('<ellipse cx="' + f(x) + '" cy="' + f(yAt(it.p)) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="' + ink + '"/>' +
        '<ellipse cx="' + f(x) + '" cy="' + f(yAt(it.p)) + '" rx="' + f(0.3 * SB) + '" ry="' + f(0.52 * SB) + '" transform="rotate(35 ' + f(x) + ' ' + f(yAt(it.p)) + ')" fill="#fff"/>');
    });
    return out.join('');
  }

  // ---- "find the chord" card: clef, key signature and one chord, to be found in the Chords section ----
  // once answered, the card opens out into the big stave: every voicing of the chord, the one shown highlighted.
  // The stave is only as wide as its voicings need, and is placed so the chord that was on the card stays exactly where it
  // was (same height, same x) unless the voicings would run off the edge, when it slides over just as far as it must.
  function chordAnswer(card, stave, rootSpec, mode) {
    var sp = rootSpec, clef = clefDef('treble'), adv = 1.15 * SB, dy = 150 - YB;          // (the card draws its stave at y = 150)
    var sigW = Math.max(sp.n, 1) * adv;
    var header = 6 + 8 + clef.w * KB + 8 + sigW + 26;                                      // left edge of the stave to its first voicing
    var cardX = (WIDTH / 2 - 130) + 14 + 8 + clef.w * KB + 8 + sigW + 36;                  // where chordCard puts the chord
    var chords = stave.chords, n = chords.length, lit = 0;
    chords.forEach(function (c, i) { if (c.lit) lit = i; });
    var slot = Math.min(stave.compact ? 54 : 64, (WIDTH - 16 - header - 18) / n);
    var need = header + n * slot + 18;
    var winL = Math.max(8, Math.min(cardX - header - (lit * slot + slot / 2), WIDTH - 8 - need)), winR = winL + need;
    var cx = WIDTH / 2, ty = 262;
    var out = ['<g class="flashcard chordcard opened" data-answer-pc="' + card.pc + '" data-chord="' + esc(card.symbol || '') + '" data-qdeg="' + card.deg + '" data-qtype="' + esc(card.type || '') + '" data-qinv="' + (card.inv || 0) + '">',
      '<g transform="translate(0,' + f(dy) + ')">', bigStave(Object.assign({}, stave, { slot: slot }), winL, winR, rootSpec, mode), '</g>'];
    out.push('<text x="' + cx + '" y="' + ty + '" text-anchor="middle" font-size="16" font-weight="bold" fill="#15803d" pointer-events="none">' + esc(card.title || '') + '</text>');
    if (card.modeLine) out.push('<text class="mode-line" x="' + cx + '" y="' + (ty + 24) + '" text-anchor="middle" font-size="15" fill="#5d6475" pointer-events="none">' + esc(card.modeLine) + '</text>');
    out.push(nextButton(cx + 150, ty + 12));
    out.push('<text class="fb-nope" x="' + f(winL + 12) + '" y="56" font-size="34" font-weight="bold" fill="#dc2626" opacity="0" pointer-events="none">✗ Nope</text>');
    out.push('<text class="fb-yes" x="' + f(winL + 12) + '" y="56" font-size="34" font-weight="bold" fill="#16a34a" opacity="0" pointer-events="none">✓ Yes!</text>');
    out.push('</g>');
    return out.join('');
  }

  function chordCard(card, mode, answered) {
    if (!card || !card.chord) return '';
    var specs = T.specsFor(mode, card.pc), sp = specs[card.spell] || specs[0];
    var clef = clefDef('treble'), k = KB.toFixed(5);
    var cx = WIDTH / 2, boxW = 260, left = cx - boxW / 2, top = 30, bot = 200;
    var dy = 150 - YB;                                  // the stave helpers draw around YB; slide them to this card
    var x0 = left + 14, x1 = left + boxW - 14;
    var out = ['<g class="flashcard chordcard" data-answer-pc="' + card.pc + '" data-chord="' + esc(card.symbol || '') + '" data-qdeg="' + card.deg + '" data-qtype="' + esc(card.type || '') + '" data-qinv="' + (card.inv || 0) + '">',
      '<rect x="' + f(left) + '" y="' + top + '" width="' + boxW + '" height="' + (bot - top) + '" rx="10" fill="#ffffff" stroke="#c3cadb" stroke-width="1.2"/>',
      '<g transform="translate(0,' + f(dy) + ')">'];
    for (var i = 0; i < 5; i++) {
      out.push('<line x1="' + f(x0) + '" y1="' + f(YB - i * SB) + '" x2="' + f(x1) + '" y2="' + f(YB - i * SB) + '" stroke="' + INK + '" stroke-width="1"/>');
    }
    out.push('<use href="#' + clef.glyph + '" transform="translate(' + f(x0 + 8) + ',' + f(YB - clef.line * SB) + ') scale(' + k + ',-' + k + ')" fill="' + INK + '"/>');
    var steps = sp.kind === 'sharp' ? clef.sharp : clef.flat;
    var ax = x0 + 8 + clef.w * KB + 8, adv = 1.15 * SB;
    for (i = 0; i < sp.n; i++) {
      out.push('<use href="#' + sp.kind + '" transform="translate(' + f(ax + i * adv) + ',' + f(YB - steps[i] * SB / 2) + ') scale(' + k + ',-' + k + ')" fill="' + INK + '"/>');
    }
    var sigVal = {};
    (sp.kind === 'sharp' ? SHARP_ORDER : FLAT_ORDER).slice(0, sp.n).forEach(function (l) { sigVal[l] = sp.kind === 'sharp' ? 1 : -1; });
    out.push(chordOnStave(ax + Math.max(sp.n, 1) * adv + 36, card.chord.notes, sigVal, INK, clef));
    out.push('</g>');
    var ty = bot + 24;
    if (answered && card.title) {
      out.push('<text x="' + cx + '" y="' + ty + '" text-anchor="middle" font-size="16" font-weight="bold" fill="#15803d" pointer-events="none">' + esc(card.title) + '</text>');
      if (card.modeLine) out.push('<text class="mode-line" x="' + cx + '" y="' + (ty + 24) + '" text-anchor="middle" font-size="15" fill="#5d6475" pointer-events="none">' + esc(card.modeLine) + '</text>');
      out.push(nextButton(left + boxW + 28, (top + bot) / 2));
    } else if (card.status) {
      out.push('<text x="' + cx + '" y="' + ty + '" text-anchor="middle" font-size="16" fill="#b91c1c" pointer-events="none">' + esc(card.status) + '</text>');
    } else {
      out.push('<text x="' + cx + '" y="' + ty + '" text-anchor="middle" font-size="16" fill="#5d6475" pointer-events="none">Find this chord in the Chords section below.</text>');
    }
    if (!answered) out.push(giveUpButton(left + boxW + 28, (top + bot) / 2));
    out.push('<text class="fb-nope" x="' + f(left + boxW + 28) + '" y="' + ((top + bot) / 2 - 36) + '" font-size="34" font-weight="bold" fill="#dc2626" opacity="0" pointer-events="none">✗ Nope</text>');
    out.push('<text class="fb-yes" x="' + f(left - 28) + '" y="' + ((top + bot) / 2 + 10) + '" text-anchor="end" font-size="34" font-weight="bold" fill="#16a34a" opacity="0" pointer-events="none">✓ Yes!</text>');
    out.push('</g>');
    return out.join('');
  }

  // "Find a chord": the keys picked so far, marked in blue above whatever else is lit
  function pickedOverlay(whites, blacks, picked) {
    var out = ['<g class="picked" clip-path="url(#kbclip)" pointer-events="none">'];
    function mark(k, x, w, h, cy) {
      out.push('<g class="pick" data-s="' + k.s + '"><rect x="' + f(x) + '" y="' + KEY_TOP + '" width="' + w + '" height="' + h + '" rx="4" fill="rgba(37,99,235,0.30)" stroke="#2563eb" stroke-width="3"/>' +
        '<circle cx="' + f(k.cx) + '" cy="' + cy + '" r="8" fill="#2563eb" stroke="#ffffff" stroke-width="2"/></g>');
    }
    whites.forEach(function (k) { if (picked.indexOf(k.s) >= 0) mark(k, k.x, W, WH + 12, KEY_TOP + WH - 52); });
    blacks.forEach(function (k) { if (picked.indexOf(k.s) >= 0) mark(k, k.cx - BW / 2, BW, BH, KEY_TOP + BH - 16); });
    out.push('</g>');
    return out.join('');
  }

  function bigStave(data, winL, winR, rootSpec, mode) {
    var out = ['<g class="stave" aria-label="Notation">'];
    var under = [];
    var sp = rootSpec;
    var pal = PAL[sp.kind];
    var k = KB.toFixed(5);
    var x0 = winL + 6;
    for (var i = 0; i < 5; i++) {
      out.push('<line x1="' + f(x0) + '" y1="' + f(YB - i * SB) + '" x2="' + f(winR - 6) + '" y2="' + f(YB - i * SB) + '" stroke="' + INK + '" stroke-width="1"/>');
    }
    out.push('<line x1="' + f(x0) + '" y1="' + f(YB - 4 * SB) + '" x2="' + f(x0) + '" y2="' + f(YB) + '" stroke="' + INK + '" stroke-width="1.4"/>');
    // final barline: a thin line, then a thick one
    out.push('<line x1="' + f(winR - 11) + '" y1="' + f(YB - 4 * SB) + '" x2="' + f(winR - 11) + '" y2="' + f(YB) + '" stroke="' + INK + '" stroke-width="1.2"/>');
    out.push('<rect x="' + f(winR - 8.5) + '" y="' + f(YB - 4 * SB - 0.5) + '" width="3.5" height="' + f(4 * SB + 1) + '" fill="' + INK + '"/>');
    var clef = clefDef(data.clef);
    var clefX = x0 + 8;
    out.push('<use href="#' + clef.glyph + '" transform="translate(' + f(clefX) + ',' + f(YB - clef.line * SB) + ') scale(' + k + ',-' + k + ')" fill="' + INK + '"/>');
    // the clef is a button: clicking it opens the clef picker
    if (!data.fixedClef) out.push('<rect class="clef-hit" data-clef="' + clef.id + '" tabindex="0" role="button" aria-haspopup="true" aria-label="Clef: ' + clef.name +
      '. Press to change." x="' + f(x0 + 2) + '" y="' + f(YB - 4 * SB - 1.6 * SB) + '" width="' + f(clef.w * KB + 14) + '" height="' + f(4 * SB + 6.2 * SB) +
      '" rx="5"><title>Clef: ' + esc(clef.name) + ' (click to change)</title></rect>');
    var steps = sp.kind === 'sharp' ? clef.sharp : clef.flat;
    var ax = clefX + clef.w * KB + 8;
    var adv = 1.15 * SB;
    for (i = 0; i < sp.n; i++) {
      out.push('<use href="#' + sp.kind + '" transform="translate(' + f(ax + i * adv) + ',' + f(YB - steps[i] * SB / 2) + ') scale(' + k + ',-' + k + ')" fill="' + INK + '"/>');
    }
    out.push('<text x="' + f(x0 + 8) + '" y="' + f(YB - 4 * SB - 14 - (clef.glyph === 'gclef8va' ? 13 : 0)) + '" font-size="14" font-weight="bold" fill="' + pal[1] + '">' + esc(T.keyTitle(sp, mode)) + '</text>');
    var sigVal = {};
    (sp.kind === 'sharp' ? SHARP_ORDER : FLAT_ORDER).slice(0, sp.n).forEach(function (l) { sigVal[l] = sp.kind === 'sharp' ? 1 : -1; });

    var startX = ax + Math.max(sp.n, 1) * adv + 26;
    var endX = winR - 18;
    var chords = data.chords || [];
    if (!chords.length) {
      out.push('<text x="' + f((startX + endX) / 2) + '" y="' + f(YB - 2 * SB + 5) + '" text-anchor="middle" font-size="15" fill="#7b8294" pointer-events="none">' +
        esc(data.hint || '') + '</text>');
    } else {
      var n = data.slot ? chords.length : Math.max(chords.length, data.slots || 0);      // fixed slot width: chords do not shift when the chord type changes
      var slot = data.slot || Math.min(150, (endX - startX) / n);               // (data.slot: the caller sized the stave to its voicings)
      var fsTop = n > 10 ? 11 : n > 6 ? 13 : 14, fsSub = n > 10 ? 12 : 13;
      // if neighbouring labels would run into each other, alternate them between two rows
      var widths = chords.map(function (c) {
        return Math.max(String(c.top).length * fsTop * 0.54, String(c.sub || "").length * fsSub * 0.5);
      });
      var stagger = widths.some(function (w, j) { return j < widths.length - 1 && (w + widths[j + 1]) / 2 + 4 > slot; });
      chords.forEach(function (c, j) {
        var left = startX + j * slot;
        var cx = left + slot / 2;
        var ink = INK;
        if (c.lit) {                              // drawn beneath the staff lines, in the key's own tint
          under.push('<rect x="' + f(left + 2) + '" y="' + f(YB - 4 * SB - 5.5 * SB) + '" width="' + f(slot - 4) + '" height="' + f(14.5 * SB + 40) + '" rx="8" fill="' + pal[0] + '" stroke="' + pal[1] + '" stroke-width="1.2"/>');
        }
        out.push(chordOnStave(cx, c.notes, sigVal, ink, clef));
        var yTop = YB + 2.5 * SB + 24, ySub = YB + 2.5 * SB + 41;
        if (stagger) { yTop = j % 2 ? YB + 61 : YB + 30; ySub = yTop + 14; }
        out.push('<text x="' + f(cx) + '" y="' + f(yTop) + '" text-anchor="middle" font-size="' + fsTop + '" font-weight="bold" fill="' + (c.lit ? PAL_DARK[sp.kind] : '#333') + '" pointer-events="none">' + esc(c.top) + '</text>');
        if (c.sub) {
          out.push('<text x="' + f(cx) + '" y="' + f(ySub) + '" text-anchor="middle" font-size="' + fsSub + '" fill="' + (c.lit ? PAL_DARK[sp.kind] : '#5d6475') + '" pointer-events="none">' + esc(c.sub) + '</text>');
        }
        if (data.kind === 'prog') {       // click above the chord for the next inversion up, below it for the next one down
          var ys = c.notes.map(function (nt) { return yAt(notePosition(nt.midi, nt.name, clef)); });
          var yMid = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
          var zTop = 36, zBot = YB + 2.5 * SB + 48;
          [['up', zTop, yMid], ['down', yMid, zBot]].forEach(function (z) {
            var up = z[0] === 'up';
            var cy = up ? Math.max(zTop + 10, yMid - 16) : Math.min(zBot - 10, yMid + 16);
            var chev = up ? 'M-5 3 L0 -2 L5 3' : 'M-5 -3 L0 2 L5 -3';
            out.push('<g class="inv-zone" data-chord="' + j + '" data-dir="' + z[0] + '" role="button" aria-label="Chord ' + (j + 1) + ': ' +
              (up ? 'inversion up' : 'inversion down') + '"><title>' + (up ? 'Inversion up' : 'Inversion down') + '</title>' +
              '<rect class="inv-bg" x="' + f(left + 3) + '" y="' + f(z[1]) + '" width="' + f(slot - 6) + '" height="' + f(z[2] - z[1]) + '" rx="6"/>' +
              '<path class="inv-chev" d="' + chev + '" transform="translate(' + f(left + 13) + ',' + f(cy) + ')"/></g>');
          });
        }
        if (data.kind === 'prog' && j < chords.length - 1) {
          out.push('<line x1="' + f(left + slot) + '" y1="' + f(YB - 4 * SB) + '" x2="' + f(left + slot) + '" y2="' + f(YB) + '" stroke="' + INK + '" stroke-width="1"/>');
        }
      });
    }
    out.splice.apply(out, [1, 0].concat(under));
    out.push('</g>');
    return out.join('');
  }

  // ---- public: render a state to an SVG string -------------------------------
  function render(state) {
    var mode = state.mode === 'minor' ? 'minor' : 'major';
    var r = T.mod12(state.root || 0);
    var selected = !!state.selected;
    var specs = T.specsFor(mode, r);
    var spellIdx = state.spell >= 0 && state.spell < specs.length ? state.spell : 0;
    var rootSpec = specs[spellIdx];
    var altKind = (!state.flash && (state.scaleKind === 'pentatonic' || state.scaleKind === 'wholetone')) ? state.scaleKind : null;
    var scale = selected ? (altKind ? T.spellAlt(rootSpec.name, mode, altKind) : T.spellScale(rootSpec.name, mode)) : null;

    var flash = !!state.flash;
    var vertical = state.layout === 'vertical';                 // Explore boxes: every key of both octaves has its signature
    var flatLeft = !!(selected && rootSpec.kind === 'flat');    // Explore boxes: a flat key puts the flat octave on the left, otherwise the sharp octave leads
    var geo = windowGeom(r, 2);                                 // two full octaves
    var shift = (WIDTH - geo.width) / 2 - geo.left;
    var winL = geo.left + shift;
    var winR = geo.right + shift;
    var sig = flash && state.cardMode === 'sig' && !!state.card;       // flashcards, "find the signature" direction
    var ctx = { mode: mode, scale: scale, flash: flash, sig: sig, flashRoot: (sig && !state.answered) ? r : null,
                flashName: sig ? (T.specsFor(mode, state.card.pc)[state.card.spell] || rootSpec).name : '' };
    ctx.rootFirst = !!state.rootFirst;                          // Find a chord: keys below the root stay dark, so the root is the leftmost lit key
    if (scale && !flash && state.chord) {                       // Explore: a chord on a degree of the scale
      var pcOffs = null;
      if (altKind) {
        var ac = CH.chordInScale(scale, state.chord.deg, state.chord.type);
        pcOffs = ac && ac.pcOffsets;
      } else {
        pcOffs = CH.chordInKey(rootSpec.name, mode, state.chord.deg, state.chord.type).pcOffsets;
      }
      if (pcOffs) {
        ctx.chordRoles = {};
        pcOffs.forEach(function (off, i) {
          ctx.chordRoles[T.mod12(r + off)] = i === 0 ? 'croot' : 'ctone';
        });
      }
    }

    // collect the keys that are visible in the window
    var whites = [];
    var blacks = [];
    for (var s = geo.startSemitone - 1; s <= geo.startSemitone + 38; s++) {
      var pc = T.mod12(s);
      var off = s - r;
      if (!T.isBlack(pc)) {
        var x = whiteX(s) + shift;
        if (x + W > winL + 0.01 && x < winR - 0.01) {
          var cx = x + W / 2;
          whites.push({ s: s, pc: pc, off: off, x: x, cx: cx, inside: cx >= winL - 0.01 && cx <= winR + 0.01 });
        }
      } else {
        var bcx = boundaryX(s) + shift;
        // black keys that would be cut by the window edge are not shown
        if (bcx - BW / 2 >= winL - 0.01 && bcx + BW / 2 <= winR + 0.01) {
          blacks.push({ s: s, pc: pc, off: off, cx: bcx, inside: true });
        }
      }
    }
    var allKeys = whites.concat(blacks);

    var parts = [];
    var noKeys = flash && state.cardMode === 'chord';                  // Find the chord: just the staff card, no keyboard
    var opened = noKeys && !!state.answered && !!state.quizStave;      // answered: the card opens out into the big stave
    var svgH = sig ? HEIGHT_SIG : (opened ? 304 : (noKeys ? 276 : (flash ? HEIGHT_FLASH : HEIGHT)));
    var cut = (sig || flash) ? 0 : (state.staff && selected ? 30 : TOP_CUT);   // explore: no empty strip above the boxes; the big stave needs headroom for high chords
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ' + cut + ' ' + WIDTH + ' ' + (svgH - cut) + '" width="' + WIDTH +
      '" height="' + (svgH - cut) + '" class="kb-svg' + (sig ? ' sig' : '') + '" role="group" aria-label="Piano keyboard with key signatures" ' +
      'font-family="-apple-system, \'Segoe UI\', Roboto, \'Helvetica Neue\', \'DejaVu Sans\', Arial, sans-serif">');
    parts.push('<defs>' +
      '<path id="gclef" d="' + G.gclef + '"/>' +
      (state.staff && selected ? '<path id="gclef8va" d="' + G.gclef8va + '"/><path id="gclef8vb" d="' + G.gclef8vb + '"/><path id="fclef" d="' + G.fclef + '"/><path id="cclef" d="' + G.cclef + '"/>' : '') +
      '<path id="sharp" d="' + G.sharp + '"/>' +
      '<path id="flat" d="' + G.flat + '"/>' +
      '<clipPath id="kbclip"><rect x="' + f(winL) + '" y="' + (KEY_TOP - 6) + '" width="' + f(winR - winL) +
      '" height="' + (WH + 6) + '"/></clipPath></defs>');

    // keys (clipped to the window; white keys first so black keys sit on top)
    if (!noKeys) {
      parts.push('<g class="keys" clip-path="url(#kbclip)">');
      whites.forEach(function (k) { parts.push(whiteKey(k, ctx)); });
      blacks.forEach(function (k) { parts.push(blackKey(k, ctx)); });
      parts.push('</g>');
      if (state.picked && state.picked.length) parts.push(pickedOverlay(whites, blacks, state.picked));
    }

    if (sig) {
      parts.push(sigGrid(state, mode));
    } else if (flash) {
      parts.push(state.cardMode === 'chord' ? (opened ? chordAnswer(state.card, state.quizStave, rootSpec, mode) : chordCard(state.card, mode, !!state.answered)) : flashCard(state.card, mode, !!state.answered));
      if (typeof state.guess === 'number' && !state.answered) parts.push(guessRow(state.guess, mode));
    } else if (state.staff && selected) {
      parts.push(bigStave(state.staff, winL, winR, rootSpec, mode));    // chords or a progression: one big stave instead of the boxes
    } else {
      // label boxes above the keys
      parts.push('<g class="boxes">');
      whites.forEach(function (k) {
        var rel = k.s - geo.startSemitone;
        if (!k.inside || rel < 0 || rel > 23) return;
        var left = rel <= 11;
        var wnative = (boxIsFlat(T.specsFor(mode, k.pc)[0]) === flatLeft) === left;
        if (!vertical && !wnative) return;                                   // (vertical: every key has its box)
        parts.push(keyBox(k, mode, 0, selected && k.pc === r && spellIdx === 0, false, !wnative));
      });
      blacks.forEach(function (k) {
        var rel = k.s - geo.startSemitone;
        if (rel < 0 || rel > 23) return;
        var left = rel <= 11;
        var specs = T.specsFor(mode, k.pc);
        specs.forEach(function (sp, j) {
          var native = (boxIsFlat(sp) === flatLeft) === left;                // the spelling that belongs in this octave
          if (native || (vertical && specs.length === 1)) parts.push(keyBox(k, mode, j, selected && k.pc === r && spellIdx === j, false, !native));
          else if (vertical) parts.push(keyBox(k, mode, j, selected && k.pc === r && spellIdx === j, true, true));    // F♯/G♭: the alternate goes above
        });
      });
      parts.push('</g>');
    }

    // left-hand fingering for the lit progression chord: finger numbers under the keys to play
    if (state.fingering && !flash) {
      var fy = DEG_Y;                      // the (unused) degree-badge row, right under the keys
      parts.push('<g class="fingering" aria-label="Suggested left-hand fingering">');
      parts.push('<text x="' + f(winL - 8) + '" y="' + (fy + 5) + '" text-anchor="end" font-size="13" font-weight="bold" fill="#9a3412" pointer-events="none">LH</text>');
      state.fingering.forEach(function (nt) {
        var key = null;
        allKeys.forEach(function (k) { if (k.s === r + nt.o) key = k; });
        if (!key) return;
        parts.push('<g class="finger" data-finger="' + nt.finger + '" data-s="' + key.s + '">' +
          '<circle cx="' + f(key.cx) + '" cy="' + fy + '" r="13" fill="#fff7ed" stroke="#c2410c" stroke-width="2"/>' +
          '<text x="' + f(key.cx) + '" y="' + (fy + 5.5) + '" text-anchor="middle" font-size="16" font-weight="bold" fill="#7c2d12" pointer-events="none">' + nt.finger + '</text></g>');
      });
      parts.push('</g>');
    }

    // hint until a key has been picked (no degree badges once a key is selected)
    if (!scale && !flash) {
      parts.push('<text x="' + (WIDTH / 2) + '" y="' + (DEG_Y + 5) + '" text-anchor="middle" font-size="15" ' +
        'fill="#7b8294" pointer-events="none">↑ Click any key to root the keyboard there and light up its scale</text>');
    }

    parts.push('</svg>');
    return parts.join('');
  }

  var api = {
    render: render,
    CLEFS: CLEFS,
    notePosition: notePosition,
    clefIcon: clefIcon,
    windowGeom: windowGeom,
    windowRange: windowRange,
    WIDTH: WIDTH,
    HEIGHT: HEIGHT - TOP_CUT,
    KEY_TOP: KEY_TOP,
    PAD: PAD,
    W: W,
    BW: BW
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  return api;
})();
