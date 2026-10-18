/* Page wiring: state, events, caption. */
(function () {
  'use strict';

  var state = { root: 0, mode: 'major', spell: 0, selected: false,
                flash: false, cardMode: 'key', card: null, answered: false, guess: null,
                chord: null,
                scaleKind: 'full', clef: 'treble' };                      // Explore: { deg: 0..6, type } = a chord on a degree of the key
  var modeSort = document.getElementById('mode-sort');
  var typeSort = document.getElementById('type-sort');
  var modeSortSel = document.getElementById('mode-sort-select');
  var typeSortSel = document.getElementById('type-sort-select');
  var modeHelp = document.getElementById('mode-help');
  var typeHelp = document.getElementById('type-help');
  var modeTip = document.getElementById('mode-tip');
  var typeTip = document.getElementById('type-tip');
  // Scale order: the numerals' case says major or minor; the pattern depends on the key's mode.
  function scaleOrderNote() {
    var head = 'Scale order: the modes follow the degrees of the scale, in order. Capital roman numerals are major chords and lower case are minor. ';
    return state.mode === 'major'
      ? head + 'In this order they always run major, minor, minor, major, major, minor, minor (I ii iii IV V vi vii\u00B0); the last, vii\u00B0, is strictly a diminished chord.'
      : head + 'In a natural minor key the same pattern starts from the sixth step: minor, diminished, major, minor, minor, major, major (i ii\u00B0 III iv v VI VII).';
  }
  var SORT_NOTES = {
    brightness: 'Brightness: from the brightest mode (Lydian) to the darkest (Locrian). Each step down the list lowers one more note by a half step, so the sound gets progressively darker.',
    frequency: 'Frequency: how often the mode is used in written music, from the most common (Ionian and Aeolian, i.e. major and natural minor) to the rarest (Locrian). A rough, conventional ranking.'
  };
  var TYPE_SORT_NOTES = {
    complexity: 'Complexity: from the simplest chord to the most complex, mostly by number of notes. Triads, sus2 and sus4 have three; add9 and the 7th have four; then the 9th (five), 11th (six) and 13th (seven). Ties are a judgment call: the plain triad first, then the suspensions, and add9 before the 7th.',
    frequency: 'Frequency: how often the chord type turns up in written music, from the most common (triads, then sevenths) to the rarest (the 11th and 13th). A rough, conventional ranking.',
    ambiguity: 'Ambiguity (for the selected mode\u2019s chord): how little the chord says about major versus minor, from least ambiguous (the 7th, 9th and 13th, whose 3rd and 7th pin the chord down) to most ambiguous (sus2 and sus4, which have no 3rd at all).',
    tension: 'Tension (for the selected mode\u2019s chord): how strongly the chord wants to move on, from the most settled (the plain triad) to the most driving (the dominant 7th, 9th and 13th, where the tritone pulls toward resolution). The order follows the chord on the selected mode: a major or minor 7th, 9th or 13th sits low, and only the dominant (the V chord in a major key) sits at the top.'
  };
  var typeSortBy = 'frequency';                       // type chip order: frequency | complexity | ambiguity | tension
  // ---- progressions: chords collected as (degree, type), so they follow whatever key is picked ----
  var PROG_KEY = 'music-theory-progression-v1';
  var progSection = document.getElementById('progressions');
  var progDetails = document.getElementById('prog-details');
  var progSummary = document.getElementById('prog-summary');
  var progHint = document.getElementById('prog-hint');
  var progList = document.getElementById('prog-list');
  var progStatus = document.getElementById('prog-status');
  var progPrev = document.getElementById('prog-prev');
  var progNext = document.getElementById('prog-next');
  var chordSoundRow = document.getElementById('chord-sound');
  var chordPlayBtn = document.getElementById('chord-play');
  var progSoundBtn = document.getElementById('prog-sound');
  var progSoundLabel = document.getElementById('prog-sound-label');
  var soundNoteEl = document.getElementById('sound-note');
  var holding = false;                                // the Chords play button (or space bar) is held down
  var holdSig = '';
  var progSoundOn = false;                            // the Progressions sound switch
  var progClear = document.getElementById('prog-clear');
  var progMenus = document.getElementById('prog-menus');
  var progMenu = document.getElementById('prog-menu');
  var progConfirm = document.getElementById('prog-confirm');
  var progConfirmText = document.getElementById('prog-confirm-text');
  var progYes = document.getElementById('prog-confirm-yes');
  var progNo = document.getElementById('prog-confirm-no');
  var confirmMode = null;                             // 'delete' | 'discard' while the inline confirmation row is showing
  var pendingId = null;                               // the stored progression to open once 'discard' is confirmed
  var progSelect = document.getElementById('prog-select');
  var saveForm = document.getElementById('prog-save-form');
  var progName = document.getElementById('prog-name');
  var progSaveBtn = document.getElementById('prog-save-btn');
  var progCancel = document.getElementById('prog-cancel');
  var renaming = false;
  var armed = null;                                   // a destructive button waiting for its second click
  var armedTimer = null;
  var progActions = document.getElementById('prog-actions');
  var addProgBtn = document.getElementById('add-prog');
  var TYPE_KEYS = 'asdfghjk';                         // type chips, in the order shown: A S D F G H J K
  var progIndex = -1;                                 // which chord of the progression is lit (-1: none)
  var progRevealed = false;                           // shown once a type and degree have been picked
  function loadProg() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(PROG_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(function (c) {
        return c && typeof c.deg === 'number' && c.deg >= 0 && c.deg < 7 && typeof c.type === 'string';
      }).map(function (c) { return copyChord(c); }) : [];
    } catch (e) { return []; }
  }
  var prog = loadProg();                              // the progression on screen (a saved one, or the unsaved working one)

  // ---- named, saved progressions ------------------------------------------------------
  // `saved.items` are the named progressions; `saved.current` is the id of the one on screen
  // (null: the unsaved working progression). Edits to a saved progression are written straight
  // back to it. Opening a stored progression while unsaved chords exist asks first (nothing is kept covertly).
  var SAVED_KEY = 'music-theory-saved-progressions-v1';
  function cleanInv(v) { return Number.isInteger(v) && v >= -12 && v <= 12 ? v : 0; }
  function copyChord(c) { var o = { deg: c.deg, type: c.type }; if (cleanInv(c.inv)) o.inv = c.inv; return o; }   // inv: inversions moved up (+) or down (-) from the suggested voicing
  function copyChords(list) { return list.map(copyChord); }
  function loadSaved() {
    var out = { items: [], current: null };
    try {
      var raw = JSON.parse(window.localStorage.getItem(SAVED_KEY));
      if (raw && Array.isArray(raw.items)) {
        raw.items.forEach(function (it) {
          if (it && typeof it.id === 'string' && typeof it.name === 'string' && Array.isArray(it.chords)) {
            out.items.push({ id: it.id, name: it.name.slice(0, 40), chords: it.chords.filter(function (c) {
              return c && typeof c.deg === 'number' && c.deg >= 0 && c.deg < 7 && typeof c.type === 'string';
            }).map(copyChord) });
          }
        });
        if (typeof raw.current === 'string' && out.items.some(function (i) { return i.id === raw.current; })) out.current = raw.current;
      }
    } catch (e) { /* none saved */ }
    return out;
  }
  var saved = loadSaved();
  function currentItem() {
    for (var i = 0; i < saved.items.length; i++) if (saved.items[i].id === saved.current) return saved.items[i];
    return null;
  }
  if (currentItem()) prog = copyChords(currentItem().chords);
  function persistSaved() { try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); } catch (e) { /* storage unavailable */ } }
  function syncSaved() {
    var it = currentItem();
    if (it) { it.chords = copyChords(prog); persistSaved(); }
  }
  function saveProg() {
    try { window.localStorage.setItem(PROG_KEY, JSON.stringify(saved.current ? [] : prog)); } catch (e) { /* storage unavailable */ }
    syncSaved();
  }
  var viewGroup = document.getElementById('view-group');
  var flashModeGroup = document.getElementById('flashmode-group');
  var flashModeInputs = document.querySelectorAll('input[name="flashmode"]');
  var level = 'pop';                                  // pop | jazz: pop hides the advanced theory
  var POP_HIDDEN_TYPES = ['11', '13'];
  var levelInputs = document.querySelectorAll('input[name="level"]');
  var modeHeadTip = document.getElementById('mode-head-tip');
  var MODE_TIP = modeHeadTip.textContent;
  var POP_DEG_TIP = 'The chord built on each step of the key. The roman numeral says which step; capitals are major chords, lower case are minor.';
  var degLabel = document.getElementById('lbl-deg');
  var sortBy = 'scale';                               // mode chip order: scale | brightness | frequency
  var chordsDetails = document.getElementById('chords-details');
  var typePicked = false;                             // a type chip was pressed (before any degree): show it as selected
  var chordCleared = false;                           // user toggled the chord off while the panel is open
  var chordTypes_ = { full: 'triad', pentatonic: 'maj', wholetone: 'aug' };   // last chosen chord type per scale type
  var score = { ok: 0, bad: 0 };
  var weights = Weights.load();                       // per-key odds; persisted in localStorage when possible
  var missedThisCard = false;
  var lastResult = '';                                // for the screen-reader caption

  var stage = document.getElementById('stage');
  var caption = document.getElementById('caption');
  var resetBtn = document.getElementById('reset');
  var modeInputs = document.querySelectorAll('input[name="mode"]');
  var viewInputs = document.querySelectorAll('input[name="view"]');
  var kindInputs = document.querySelectorAll('input[name="scalekind"]');
  var kindGroup = document.getElementById('scalekind-group');
  var scoreBox = document.getElementById('score');
  var okEl = document.getElementById('n-ok');
  var badEl = document.getElementById('n-bad');
  var scoreReset = document.getElementById('score-reset');
  var chordsPanel = document.getElementById('chords');
  var chordDegrees = document.getElementById('chord-degrees');
  var chordTypes = document.getElementById('chord-types');
  var chordInfo = document.getElementById('chord-info');
  var legendChord = document.querySelectorAll('.legend-chord');

  function currentSpec() {
    var specs = Theory.specsFor(state.mode, state.root);
    return specs[state.spell] || specs[0];
  }

  // ---- caption --------------------------------------------------------------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function updateCaption() {
    caption.textContent = '';
    if (quizOn() && state.card) {
      caption.appendChild(el('p', 'cap-hint', 'Study: find the chord shown on the staff, in the key of ' + Theory.keyTitle(currentSpec(), state.mode) +
        '. Choose a type and a degree in the Chords section; the second one you choose is your answer.'));
      return;
    }
    if (state.flash && state.card) {
      var cs = Theory.specsFor(state.mode, state.card.pc)[state.card.spell];
      if (state.cardMode === 'sig') {
        caption.appendChild(el('p', 'cap-hint', state.answered ? lastResult + ' Press Next for another card.'
          : (lastResult ? lastResult + ' ' : '') + 'Study: which key signature belongs to the ' + state.mode + ' key of ' +
            cs.name + '? Choose it from the sharps and flats above the keyboard.'));
        return;
      }
      if (state.answered) {
        caption.appendChild(el('p', 'cap-hint', lastResult + ' Press Next for another card.'));
        return;
      }
      caption.appendChild(el('p', 'cap-hint',
        (lastResult ? lastResult + ' ' : '') + 'Study: which ' + state.mode + ' key has ' +
        (cs.n === 0 ? 'no sharps or flats' : cs.n + ' ' + cs.kind + (cs.n === 1 ? '' : 's')) +
        '? Press its key.'));
      return;
    }
    if (!state.selected) {
      caption.appendChild(el('p', 'cap-hint',
        'The number in each box and on each key is how many sharps or flats that key signature has. ' +
        'Switch between major and minor above and the boxes update to match.'));
      return;
    }
    var sp = currentSpec();
    var alt = state.scaleKind === 'pentatonic' || state.scaleKind === 'wholetone';
    var scale = alt ? Theory.spellAlt(sp.name, state.mode, state.scaleKind) : Theory.spellScale(sp.name, state.mode);
    var notes = Theory.signatureNotes(sp);
    var kindWord = sp.kind === 'sharp' ? 'sharp' : 'flat';

    caption.appendChild(el('h2', 'cap-title', Theory.keyTitle(sp, state.mode)));
    caption.appendChild(el('p', 'cap-sig', sp.n === 0
      ? 'No sharps or flats'
      : sp.n + ' ' + kindWord + (sp.n === 1 ? '' : 's') + ': ' + notes.join(' ')));

    var list = el('ul', 'cap-scale');
    list.setAttribute('aria-label', 'Scale notes');
    scale.names.concat([scale.names[0]]).forEach(function (name, i) {
      var cls = '';
      list.appendChild(el('li', cls, name));
    });
    caption.appendChild(list);

    if (alt) {
      caption.appendChild(el('p', 'cap-third', (state.scaleKind === 'pentatonic'
        ? (state.mode === 'major' ? 'Major' : 'Minor') + ' pentatonic scale (5 notes)'
        : 'Whole-tone scale (6 notes, each a whole step apart)') + ': ' + scale.names.join(' ')));
      return;
    }
    var third = el('p', 'cap-third');
    var semis = scale.third.offset;
    third.appendChild(document.createTextNode(
      (state.mode === 'major' ? 'Major' : 'Minor') + ' third: '));
    third.appendChild(el('strong', null, scale.third.name));
    third.appendChild(document.createTextNode(
      ' — ' + semis + ' semitones above ' + scale.names[0]));
    caption.appendChild(third);
  }

  function isAlt() { return state.scaleKind === 'pentatonic' || state.scaleKind === 'wholetone'; }
  function altScale() { return Theory.spellAlt(currentSpec().name, state.mode, state.scaleKind); }
  // the chosen type, or one that exists on the root if the last one doesn't fit this key
  function curType() { return chordTypes_[state.scaleKind] || 'triad'; }

  // ---- chord selector ---------------------------------------------------------
  function updateChordPanel() {
    var show = state.selected && (!state.flash || quizOn());
    chordsPanel.hidden = !show;
    var canFind = show && !state.flash && chordsDetails.open;          // "Find a chord" lives in the open selector
    findBtn.hidden = !canFind;
    if (!canFind && findOn) { findOn = false; picks = []; }
    findBtn.setAttribute('aria-pressed', findOn ? 'true' : 'false');
    var active = show && state.chord;
    Array.prototype.forEach.call(legendChord, function (li) { li.hidden = !active; });
    if (!show) return;
    var alt = isAlt();
    var rootName = currentSpec().name;
    document.getElementById('chords-summary').textContent = 'Chords in the key of ' + rootName + (state.mode === 'minor' ? ' minor' : '');
    var sc = alt ? altScale() : null;
    var type = curType();

    chordDegrees.textContent = '';
    var n = alt ? sc.offsets.length : 7;
    var pop = level === 'pop';
    degLabel.textContent = alt ? 'Chord on' : (pop ? 'Degree' : 'Mode');
    modeHeadTip.textContent = pop ? POP_DEG_TIP : MODE_TIP;
    chordsPanel.setAttribute('data-level', level);
    Array.prototype.forEach.call(typeSortSel.options, function (o) {
      o.hidden = o.disabled = pop && o.classList.contains('jazz-only');
    });
    if (pop && typeSortBy !== 'frequency') typeSortBy = 'frequency';      // Pop: no sort menu, so always the default order
    if (pop) sortBy = 'scale';
    modeSort.hidden = alt || pop;
    typeSort.hidden = alt || pop;
    modeSortSel.value = sortBy;
    typeSortSel.value = typeSortBy;
    modeTip.textContent = alt ? '' : (sortBy === 'scale' ? scaleOrderNote() : (SORT_NOTES[sortBy] || ''));   // "?" is transparent when there's no description
    modeHelp.classList.toggle('is-empty', !modeTip.textContent);
    typeTip.textContent = alt ? '' : (TYPE_SORT_NOTES[typeSortBy] || '');
    typeHelp.classList.toggle('is-empty', !typeTip.textContent);
    var order = [];
    for (var k = 0; k < n; k++) order.push(k);
    if (!alt && sortBy !== 'scale') {
      var key = sortBy === 'brightness' ? 'darkness' : 'frequency';
      order.sort(function (x, y) {
        return Chords.chordInKey(rootName, state.mode, x, 'triad')[key] - Chords.chordInKey(rootName, state.mode, y, 'triad')[key];
      });
    }
    for (var oi = 0; oi < order.length; oi++) {
      var d = order[oi];
      var b = el('button', 'chip chip-deg');
      b.type = 'button';
      b.setAttribute('data-deg', d);
      b.setAttribute('data-key', String(d + 1));
      b.setAttribute('aria-keyshortcuts', String(d + 1));
      b.setAttribute('aria-pressed', (state.chord && state.chord.deg === d) || (quizOn() && ftcSel.deg === d) ? 'true' : 'false');
      if (alt) {
        var ac = Chords.chordInScale(sc, d, type);
        b.appendChild(el('span', 'chip-num', sc.names[d]));
        b.appendChild(el('span', 'chip-sym', ac ? ac.symbol : '\u2014'));
        if (!ac) { b.disabled = true; b.setAttribute('aria-label', sc.names[d] + ': not available in this scale'); }
        else b.setAttribute('aria-label', ac.symbol);
      } else {
        var c = Chords.chordInKey(rootName, state.mode, d, type);
        var hideSym = quizOn() && !state.answered;                  // Find the chord: the names would give the answer away until the guess is right (or given up)
        b.setAttribute('aria-label', c.roman + (hideSym ? '' : ', ' + c.symbol) + (pop ? '' : ', ' + c.mode));
        if (!pop) b.setAttribute('data-dark', c.darkness);           // gentle shading: brightest mode to darkest
        b.appendChild(el('span', 'chip-num', c.roman));
        b.appendChild(el('span', 'chip-sym', hideSym ? '\u00a0' : c.symbol));
        if (!pop) b.appendChild(el('span', 'chip-mode', c.mode));
      }
      chordDegrees.appendChild(b);
    }
    chordTypes.textContent = '';
    var types = alt ? Chords.ALT_TYPES.filter(function (t) {
      for (var i = 0; i < sc.offsets.length; i++) if (Chords.chordInScale(sc, i, t.id)) return true;
      return false;
    }) : Chords.TYPES.filter(function (t) { return !pop || POP_HIDDEN_TYPES.indexOf(t.id) < 0; });
    if (!alt && typeSortBy !== 'complexity') {         // stable sort: ties keep the complexity (list) order
      var rank = null;
      if (typeSortBy === 'ambiguity' || typeSortBy === 'tension') {
        var rkey = typeSortBy === 'ambiguity' ? 'ambiguityRank' : 'tensionRank';
        if (state.chord) {                              // rank the chords actually on the selected mode's degree
          rank = {};
          Chords.TYPES.forEach(function (t) { rank[t.id] = Chords.chordInKey(rootName, state.mode, state.chord.deg, t.id)[rkey]; });
        } else {
          rank = typeSortBy === 'ambiguity' ? Chords.AMBIGUITY : Chords.TENSION;
        }
      }
      if (!rank) {                                    // frequency: position in the common-to-rare list
        rank = {};
        Chords.TYPE_COMMON_TO_RARE.forEach(function (id, n) { rank[id] = n; });
      }
      types = types.map(function (t, i) { return { t: t, i: i }; }).sort(function (x, y) {
        return (rank[x.t.id] - rank[y.t.id]) || (x.i - y.i);
      }).map(function (o) { return o.t; });
    }
    types.forEach(function (t, ti) {
      var tb = el('button', 'chip chip-type', t.label);
      if (ti < TYPE_KEYS.length) { tb.setAttribute('data-key', TYPE_KEYS.charAt(ti).toUpperCase()); tb.setAttribute('aria-keyshortcuts', TYPE_KEYS.charAt(ti)); }
      tb.type = 'button';
      tb.setAttribute('data-type', t.id);
      tb.setAttribute('aria-pressed', (state.chord || typePicked) && type === t.id ? 'true' : 'false');   // nothing is pre-selected
      chordTypes.appendChild(tb);
    });

    chordInfo.textContent = '';
    if (!state.chord) {
      chordInfo.appendChild(el('p', 'chord-hint', findOn ? findHint() : quizOn() ? 'Choose a type and a degree, in either order. The second one you choose is your answer.' : alt
        ? 'Pick a note to light up the chord built on it, then try the other types. Only chords whose notes all belong to this scale are offered.'
        : 'Pick a type and a degree to light up the chord on the keyboard. ' +
          'Each chip shows the roman numeral and chord name for the chosen type.'));
      return;
    }
    var head = el('div', 'ci-head');
    var ch, intro;
    if (alt) {
      ch = Chords.chordInScale(sc, state.chord.deg, state.chord.type);
      if (!ch) return;
      head.appendChild(el('span', 'ci-tag', 'Chord'));
      head.appendChild(el('span', 'ci-symbol', ch.symbol));
      chordInfo.appendChild(head);
      chordInfo.appendChild(el('p', 'ci-desc', ch.description + ' \u2014 every note belongs to the ' +
        rootName + ' ' + (state.scaleKind === 'pentatonic' ? state.mode + ' pentatonic' : 'whole-tone') + ' scale.'));
    } else {
      ch = Chords.chordInKey(rootName, state.mode, state.chord.deg, state.chord.type);
      head.appendChild(el('span', 'ci-tag', 'Chord'));
      head.appendChild(el('span', 'ci-symbol', ch.symbol));
      // "C: iii": the key before the numeral; lower case for a minor key, as in analysis notation
      var keyLabel = state.mode === 'minor' ? rootName.charAt(0).toLowerCase() + rootName.slice(1) : rootName;
      head.appendChild(el('span', 'ci-roman', keyLabel + ': ' + ch.roman));
      chordInfo.appendChild(head);
      var tp = el('p', 'ci-desc');
      tp.appendChild(el('strong', 'ci-lead', ch.description));
      tp.appendChild(document.createTextNode(' ' + ch.typeInfo + (pop ? '' : ' ' + ch.feelInfo)));
      chordInfo.appendChild(tp);
      var mp = el('p', 'ci-desc');
      var lead = el('strong', 'ci-lead');
      lead.appendChild(el('span', 'ci-tag', 'Mode'));
      lead.appendChild(document.createTextNode(ch.modeFull));
      mp.appendChild(lead);
      mp.appendChild(document.createTextNode(' ' + ch.modeInfo));
      if (!pop) chordInfo.appendChild(mp);
    }
    var list = el('ul', 'ci-notes');
    list.setAttribute('aria-label', 'Chord notes');
    ch.notes.forEach(function (nm, i) {
      var li = el('li', i === 0 ? 'is-root' : '', nm);
      li.appendChild(el('small', null, ch.intervalLabels[i]));
      list.appendChild(li);
    });
    head.appendChild(list);                             // top right of the description box, level with the symbol
  }

  modeSortSel.addEventListener('change', function () { sortBy = modeSortSel.value; updateChordPanel(); });
  typeSortSel.addEventListener('change', function () { typeSortBy = typeSortSel.value; updateChordPanel(); });

  chordsPanel.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    if (quizOn()) {                                      // Find the chord: the second pick is the guess
      if (b.hasAttribute('data-deg')) ftcPick('deg', parseInt(b.getAttribute('data-deg'), 10));
      else if (b.hasAttribute('data-type')) ftcPick('type', b.getAttribute('data-type'));
      else return;
      var kept = chordsPanel.querySelector('button[' + (b.hasAttribute('data-deg') ? 'data-deg="' + b.getAttribute('data-deg') : 'data-type="' + b.getAttribute('data-type')) + '"]');
      if (kept) kept.focus({ preventScroll: true });
      return;
    }
    if (findOn && picks.length) picks = [];             // choosing a chord by hand replaces the picked notes
    if (b.hasAttribute('data-deg')) {
      var deg = parseInt(b.getAttribute('data-deg'), 10);
      state.chord = (state.chord && state.chord.deg === deg) ? null : { deg: deg, type: curType() };
      chordCleared = !state.chord;
    } else if (b.hasAttribute('data-type')) {
      chordTypes_[state.scaleKind] = b.getAttribute('data-type');
      typePicked = true;
      if (state.chord) state.chord = { deg: state.chord.deg, type: curType() };
      if (state.chord && isAlt() && !Chords.chordInScale(altScale(), state.chord.deg, curType())) {
        var sc2 = altScale();                 // this type isn't on that note: move to the first note that has it
        var first = -1;
        for (var q = 0; q < sc2.offsets.length && first < 0; q++) if (Chords.chordInScale(sc2, q, curType())) first = q;
        state.chord = first < 0 ? null : { deg: first, type: curType() };
      }
    } else {
      return;
    }
    draw(false, false);
    var again = chordsPanel.querySelector('button[' + (b.hasAttribute('data-deg') ? 'data-deg="' + b.getAttribute('data-deg')
      : 'data-type="' + b.getAttribute('data-type')) + '"]');
    if (again) again.focus({ preventScroll: true });     // the panel was rebuilt; keep keyboard focus on the same chip
  });

  // The chord highlight only shows while the panel is open; opening it picks the I chord (Ionian in major).
  chordsDetails.addEventListener('toggle', function () {
    if (restoring) return;
    chordCleared = false;
    var keep = progOn() && progIndex >= 0 ? prog[progIndex] : null;     // a progression chord stays lit either way
    state.chord = null;
    if (keep) state.chord = { deg: keep.deg, type: keep.type };
    typePicked = false;
    draw(false, false);
  });

  // ---- remembering the app between visits --------------------------------------------
  // The key, mode, chord, which level you're on, and whether the two sections are open. (The
  // progression itself and the study weights have their own keys.) `restoring` holds saves and
  // toggle handlers off while the saved state is put back.
  var STATE_KEY = 'music-theory-state-v1';
  var restoring = false;

  function saveState() {
    if (restoring || state.flash) return;
    try {
      window.localStorage.setItem(STATE_KEY, JSON.stringify({
        root: state.root, spell: state.spell, selected: state.selected, mode: state.mode, level: level,
        scaleKind: state.scaleKind, chord: state.chord, chordTypes: chordTypes_, typePicked: typePicked,
        chordsOpen: chordsDetails.open, progOpen: progDetails.open, progIndex: progIndex, progRevealed: progRevealed, clef: state.clef
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function typeIds(kind) {
    return (kind === 'full' ? Chords.TYPES : Chords.ALT_TYPES).map(function (t) { return t.id; });
  }

  function restoreState() {
    var s = null;
    try { s = JSON.parse(window.localStorage.getItem(STATE_KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') return;
    restoring = true;
    setTimeout(function () { restoring = false; }, 200);
    if (typeof s.clef === 'string' && KeyboardRender.CLEFS.some(function (c) { return c.id === s.clef; })) state.clef = s.clef;
    if (s.mode === 'minor') { state.mode = 'minor'; document.getElementById('mode-minor').checked = true; }
    if (s.level === 'jazz') { level = 'jazz'; document.getElementById('level-jazz').checked = true; }
    var kinds = { full: 'sk-full', pentatonic: 'sk-pent', wholetone: 'sk-whole' };
    if (level === 'jazz' && kinds[s.scaleKind]) { state.scaleKind = s.scaleKind; document.getElementById(kinds[s.scaleKind]).checked = true; }
    if (s.chordTypes && typeof s.chordTypes === 'object') {
      ['full', 'pentatonic', 'wholetone'].forEach(function (k) {
        if (typeof s.chordTypes[k] === 'string' && typeIds(k).indexOf(s.chordTypes[k]) >= 0) chordTypes_[k] = s.chordTypes[k];
      });
    }
    if (s.selected && Number.isInteger(s.root) && s.root >= 0 && s.root < 12) {
      state.root = s.root;
      state.selected = true;
      state.spell = Number.isInteger(s.spell) && s.spell >= 0 && s.spell < Theory.specsFor(state.mode, s.root).length ? s.spell : 0;
      var c = s.chord;
      if (c && Number.isInteger(c.deg) && c.deg >= 0 && c.deg < 7 && typeIds(state.scaleKind).indexOf(c.type) >= 0 &&
          !(level === 'pop' && POP_HIDDEN_TYPES.indexOf(c.type) >= 0)) {
        state.chord = { deg: c.deg, type: c.type };
      }
    }
    typePicked = !!s.typePicked;
    progRevealed = !!s.progRevealed;
    if (Number.isInteger(s.progIndex) && s.progIndex >= 0 && s.progIndex < prog.length) progIndex = s.progIndex;
    chordsDetails.open = !!s.chordsOpen;
    progDetails.open = !!s.progOpen;
  }

  // ---- progression helpers ---------------------------------------------------
  // if the lit chord was changed by hand it is no longer 'the progression's chord'
  function syncProgIndex() {
    if (progIndex >= 0 && (!state.chord || !prog[progIndex] || state.chord.deg !== prog[progIndex].deg ||
        state.chord.type !== prog[progIndex].type)) progIndex = -1;
  }

  // Explore: a flat key puts the flat octave on the left of the keyboard (window starting on F), anything else the
  // sharp octave (window starting on C). The flashcards keep the older window rule (undefined).
  function flatFirst() { return state.flash ? undefined : !!(state.selected && currentSpec().kind === 'flat'); }
  function rootKeyS() { return KeyboardRender.rootKeyS(state.root, flatFirst()); }   // the key number of the root key on screen

  // suggested left-hand voicings for the whole progression in the current key and keyboard window
  var planCache = { key: '', plan: [] };
  function getPlan() {
    var key = state.root + '|' + state.mode + '|' + flatFirst() + '|' + JSON.stringify(prog);
    if (planCache.key !== key) {
      var range = KeyboardRender.windowRange(state.root, undefined, flatFirst());
      var chords = prog.map(function (c) { return Chords.chordInKey('C', state.mode, c.deg, c.type).pcOffsets; });
      planCache = { key: key, plan: Fingering.plan(chords, range.lo, range.hi) };
    }
    return planCache.plan;
  }

  function clefConfig() {
    var id = clefAllowed(state.clef) ? state.clef : 'treble';
    return KeyboardRender.CLEFS.filter(function (c) { return c.id === id; })[0] || KeyboardRender.CLEFS[0];
  }
  // whole octaves that move the suggested progression to the middle of the chosen clef (the notation only)
  function staffOctaveShift() {
    var tonic = ChordAudio.tonicMidi(state.root), all = [];
    getPlan().forEach(function (v) { if (v) v.notes.forEach(function (n) { all.push(tonic + n.o); }); });
    var avg = all.reduce(function (a, b) { return a + b; }, 0) / (all.length || 1);
    return 12 * Math.round((clefConfig().mid - avg) / 12);
  }
  // a voicing may go up as far as the keyboard shows and down until its highest note leaves the staff
  // (it must still touch it: the space just under the bottom line is the lowest place for the top note)
  function voicingFits(i, v, win) {
    if (v.notes[v.notes.length - 1].o > win.hi) return false;
    var tonic = ChordAudio.tonicMidi(state.root), shiftOct = staffOctaveShift(), ch = progChord(i), clef = clefConfig();
    var top = v.notes[v.notes.length - 1];
    return KeyboardRender.notePosition(tonic + top.o + shiftOct, ch.notes[top.idx], clef) >= -1;
  }
  function tryVoicing(i, k) {
    var win = KeyboardRender.windowRange(state.root, 2, flatFirst());
    var v = Fingering.shift(getPlan()[i].notes, k, -99, 99);
    return v && voicingFits(i, v, win) ? v : null;
  }

  // the voicing used for progression chord i: the suggested one, moved by the inversions the player chose
  function voicing(i) {
    var base = getPlan()[i];
    if (!base) return null;
    for (var k = cleanInv(prog[i] && prog[i].inv); ; k += k > 0 ? -1 : 1) {      // fall back towards the suggestion if it no longer fits
      var v = tryVoicing(i, k);
      if (v) return v;
      if (k === 0) return base;
    }
  }
  function moveInversion(i, dir) {
    if (!prog[i]) return;
    var want = cleanInv(prog[i].inv) + (dir === 'up' ? 1 : -1);
    if (want < -12 || want > 12 || !tryVoicing(i, want)) { progStatus.textContent = 'No higher or lower inversion fits.'; return; }
    if (want) prog[i].inv = want; else delete prog[i].inv;
    saveProg();
    lightProg(i);
    var v = voicing(i);
    progStatus.textContent = 'Chord ' + (i + 1) + ': ' + progChord(i).symbol + ', ' + (v ? v.name : '');
  }

  function uniqueName(base, exceptId) {
    var name = base, k = 2;
    function taken(n) { return saved.items.some(function (i) { return i.id !== exceptId && i.name.toLowerCase() === n.toLowerCase(); }); }
    while (taken(name)) { name = base + ' (' + k + ')'; k++; }
    return name;
  }
  function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function defaultName() { return 'Progression ' + (saved.items.length + 1); }

  function disarm() {
    clearTimeout(armedTimer);
    armed = null;
    if (!progSection.hidden) updateProgPanel();
  }
  // the first click arms a destructive button (its label changes); a second click within 3 s goes ahead
  function confirmed(btn) {
    if (armed === btn) { clearTimeout(armedTimer); armed = null; return true; }
    armed = btn;
    clearTimeout(armedTimer);
    armedTimer = setTimeout(disarm, 3000);
    updateProgPanel();
    return false;
  }

  function showProgChange() { progIndex = -1; renaming = false; confirmMode = null; pendingId = null; persistSaved(); saveProg(); draw(false, false); }

  function saveCurrentAs(name) {
    var item = { id: newId(), name: uniqueName((name || '').trim() || defaultName()), chords: copyChords(prog) };
    saved.items.push(item);
    saved.current = item.id;
    showProgChange();
    progStatus.textContent = 'Saved "' + item.name + '".';
  }
  function openSaved(id) {
    if (id === saved.current) return;
    var it = null;
    saved.items.forEach(function (i) { if (i.id === id) it = i; });
    if (!it) return;
    prog = copyChords(it.chords);
    saved.current = id;
    showProgChange();
  }
  function newProgression() {
    prog = [];
    saved.current = null;
    showProgChange();
    progStatus.textContent = 'New progression.';
  }
  function duplicateCurrent() {
    var it = currentItem();
    if (!it) return;
    var copy = { id: newId(), name: uniqueName(it.name + ' copy'), chords: copyChords(it.chords) };
    saved.items.splice(saved.items.indexOf(it) + 1, 0, copy);
    prog = copyChords(copy.chords);
    saved.current = copy.id;
    showProgChange();
    progStatus.textContent = 'Duplicated as "' + copy.name + '".';
  }
  function deleteCurrent() {
    var it = currentItem();
    if (!it) return;
    saved.items.splice(saved.items.indexOf(it), 1);
    prog = [];
    saved.current = null;
    showProgChange();
    progStatus.textContent = 'Deleted "' + it.name + '".';
  }

  // The selector reads "Stored: <name>" (or "Stored progressions…" when none is open) while closed,
  // and while its list is open it shows a "Stored Progressions…" header above the plain names.
  function renderSaved(open) {
    var it = currentItem();
    progSelect.textContent = '';
    if (open || !it) {
      var h = el('option', null, open ? 'Stored Progressions…' : 'Stored progressions…');
      h.value = '';
      if (open) h.disabled = true;
      progSelect.appendChild(h);
    }
    saved.items.forEach(function (i) {
      var o = el('option', null, !open && it && i.id === it.id ? 'Stored: ' + i.name : i.name);
      o.value = i.id;
      progSelect.appendChild(o);
    });
    progSelect.value = it ? it.id : '';
  }

  function updateSavedBar() {
    var it = currentItem();
    var has = saved.items.length > 0;
    progMenus.hidden = !has;                                   // CSS also hides the menus while the section is collapsed
    renderSaved(false);
    progMenu.value = '';
    Array.prototype.forEach.call(progMenu.options, function (o) {
      if (o.value === 'rename' || o.value === 'dup' || o.value === 'del') o.disabled = !it;
      if (o.value === 'new') o.disabled = !it;                  // already on a new one
    });
    if (confirmMode === 'delete' && !it) confirmMode = null;
    progConfirm.hidden = !confirmMode;
    if (confirmMode === 'delete') { progConfirmText.textContent = 'Delete "' + it.name + '"?'; progYes.textContent = 'Delete'; progYes.className = 'btn-reset btn-danger'; }
    else if (confirmMode === 'discard') { progConfirmText.textContent = 'Discard current progression?'; progYes.textContent = 'Yes'; progYes.className = 'btn-reset btn-danger'; }
    progMenu.hidden = !it || !chordsDetails.open;              // the Actions menu: a stored progression, chord selector open
    var needsSave = saved.current === null && prog.length > 0;
    saveForm.hidden = !(needsSave || renaming);
    progSaveBtn.textContent = renaming ? 'Rename' : 'Save';
    progCancel.hidden = !renaming;
    progName.placeholder = renaming ? 'New name' : defaultName();
    progClear.textContent = armed === progClear ? 'Click again to clear' : 'Clear';
  }

  function progOn() { return state.selected && !state.flash && !isAlt() && progDetails.open && prog.length > 0; }

  function progChord(i) {
    return Chords.chordInKey(currentSpec().name, state.mode, prog[i].deg, prog[i].type);
  }

  function lightProg(i) {
    progIndex = i;
    chordTypes_.full = prog[i].type;
    state.chord = { deg: prog[i].deg, type: prog[i].type };
    chordCleared = false;
    draw(false, false);
    progStatus.textContent = 'Chord ' + (i + 1) + ' of ' + prog.length + ': ' + progChord(i).symbol;
  }

  // dir +1 / -1; wraps round the ends, and starts at the first chord if none is lit yet
  function stepProg(dir) {
    if (!progOn()) return false;
    var n = prog.length;
    lightProg(progIndex < 0 ? (dir > 0 ? 0 : n - 1) : (progIndex + dir + n) % n);
    return true;
  }

  function addToProg() {
    if (!state.chord || isAlt()) return;
    prog.push({ deg: state.chord.deg, type: state.chord.type });
    saveProg();
    progRevealed = true;
    var added = Chords.chordInKey(currentSpec().name, state.mode, state.chord.deg, state.chord.type);
    draw(false, false);
    progStatus.textContent = 'Added ' + added.roman + ' (' + added.symbol + '): ' + prog.length + ' in the progression.';
  }


  // ---- typing a progression ------------------------------------------------------
  var textBtn = document.getElementById('prog-text-btn');
  var textPop = null;
  function closeTextPop(refocus) {
    if (!textPop) return;
    textPop.remove();
    textPop = null;
    document.removeEventListener('pointerdown', textOutside, true);
    document.removeEventListener('keydown', textKeys, true);
    if (refocus) textBtn.focus();
  }
  function textOutside(e) { if (textPop && !textPop.contains(e.target) && !textBtn.contains(e.target)) closeTextPop(false); }
  function textKeys(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeTextPop(true); } }
  function allowedTypeIds() {
    return Chords.TYPES.map(function (t) { return t.id; }).filter(function (id) { return level !== 'pop' || POP_HIDDEN_TYPES.indexOf(id) < 0; });
  }
  function submitText() {
    var input = textPop.querySelector('input[type="text"]');
    var err = textPop.querySelector('.text-pop-error');
    if (isAlt()) { err.textContent = 'Progressions use the seven-note scale: switch to Full scale first.'; return; }
    var res = ProgText.parse(input.value, allowedTypeIds());
    if (res.errors.length) { err.textContent = res.errors.slice(0, 3).join('. ') + (res.errors.length > 3 ? ' (and ' + (res.errors.length - 3) + ' more)' : ''); input.focus(); return; }
    var replace = textPop.querySelector('input[type="checkbox"]');
    if (replace && replace.checked) prog = [];
    res.chords.forEach(function (c) { prog.push({ deg: c.deg, type: c.type }); });
    if (prog.length > 64) prog.length = 64;
    saveProg();
    progRevealed = true;
    closeTextPop(false);
    draw(false, false);
    progStatus.textContent = (replace && replace.checked ? 'Progression set: ' : 'Added ') + res.chords.length + ' chord' + (res.chords.length === 1 ? '' : 's') + '; ' + prog.length + ' in the progression.';
    textBtn.focus();
  }
  function openTextPop() {
    if (textPop) { closeTextPop(true); return; }
    textPop = document.createElement('div');
    textPop.id = 'text-pop';
    textPop.setAttribute('role', 'dialog');
    textPop.setAttribute('aria-label', 'Type a progression');
    textPop.innerHTML =
      '<div class="text-pop-head"><span class="text-pop-title">Type a progression</span>' +
      '<button type="button" class="text-pop-close" aria-label="Close">\u00D7</button></div>' +
      '<form class="text-pop-form" autocomplete="off">' +
      '<input type="text" spellcheck="false" aria-label="Chords" placeholder="I - V - vi - IV | I - V - I" maxlength="400">' +
      '<button type="submit" class="btn-reset btn-primary">Enter</button></form>' +
      (prog.length ? '<label class="text-pop-replace"><input type="checkbox"> Replace the current progression</label>' : '') +
      '<p class="text-pop-help">Roman numerals, or 1\u20137. Add 7, 9, sus4, sus2 or add9 for other chord types' + (level === 'pop' ? '' : ' (and 11, 13)') +
      '. Hyphens, bars and spaces just separate chords. The key decides major or minor.</p>' +
      '<p class="text-pop-error" role="alert"></p>';
    document.body.appendChild(textPop);
    var r = textBtn.getBoundingClientRect(), w = textPop.offsetWidth, h = textPop.offsetHeight;
    var left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    textPop.style.left = left + 'px';
    textPop.style.top = top + 'px';
    textPop.querySelector('.text-pop-close').addEventListener('click', function () { closeTextPop(true); });
    textPop.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); submitText(); });
    textPop.querySelector('input[type="text"]').addEventListener('input', function () { textPop.querySelector('.text-pop-error').textContent = ''; });
    document.addEventListener('pointerdown', textOutside, true);
    document.addEventListener('keydown', textKeys, true);
    textPop.querySelector('input[type="text"]').focus();
  }
  textBtn.addEventListener('click', openTextPop);

  // ---- sound ---------------------------------------------------------------
  // Chords: the chord sounds while the button (or the Shift key) is held. Progressions: a switch that
  // keeps the lit chord sounding, following the stepping. Either stops when its section collapses or the
  // key (or, for a held chord, the chord) changes.
  function keySig() { return state.root + '|' + state.mode + '|' + state.scaleKind; }
  function chordSig() { return keySig() + '|' + (state.chord ? state.chord.deg + ':' + state.chord.type : ''); }
  function midiBase() { return ChordAudio.tonicMidi(state.root); }
  function heldNotes() {
    if (!state.chord) return [];
    var ch = isAlt() ? Chords.chordInScale(altScale(), state.chord.deg, state.chord.type)
                     : Chords.chordInKey(currentSpec().name, state.mode, state.chord.deg, state.chord.type);
    if (!ch) return [];
    var r = KeyboardRender.windowRange(state.root, undefined, flatFirst());
    var v = Fingering.plan([ch.pcOffsets], r.lo, r.hi)[0];
    return v ? v.notes.map(function (n) { return midiBase() + n.o; }) : [];
  }
  function litNotes() {
    if (!progSoundOn || progIndex < 0) return [];
    var vp = voicing(progIndex);
    return vp ? vp.notes.map(function (n) { return midiBase() + n.o; }) : [];
  }
  function applySound() {
    ChordAudio.engine.setNotes(holding ? heldNotes() : litNotes(), true);
  }
  function syncSound() {
    var ok = state.selected && (!state.flash || quizOn());
    var canHold = ok && !!state.chord && chordsDetails.open && !chordsPanel.hidden;
    chordSoundRow.hidden = !canHold;
    if (holding && (!canHold || chordSig() !== holdSig)) holding = false;
    chordPlayBtn.classList.toggle('playing', holding);
    var progOk = ok && !isAlt() && !progSection.hidden && progDetails.open && prog.length > 0;
    if (progSoundOn && !progOk) progSoundOn = false;              // a key change keeps it going, with the new key's notes
    progSoundBtn.disabled = !progOk;
    progSoundBtn.setAttribute('aria-pressed', progSoundOn ? 'true' : 'false');
    progSoundLabel.textContent = progSoundOn ? 'Sound on' : 'Sound off';
    applySound();
  }
  function startHold() {
    if (holding || chordSoundRow.hidden) return;
    holding = true;
    holdSig = chordSig();
    ChordAudio.engine.unlock();
    chordPlayBtn.classList.add('playing');
    applySound();
    checkBlocked();
  }
  function stopHold() {
    if (!holding) return;
    holding = false;
    chordPlayBtn.classList.remove('playing');
    applySound();
  }
  function toggleProgSound() {
    if (progSoundBtn.disabled) return;
    progSoundOn = !progSoundOn;
    if (progSoundOn) {
      ChordAudio.engine.unlock();
      if (progIndex < 0 && progOn()) { lightProg(0); return; }       // nothing lit yet: start at the first chord
    }
    syncSound();
    checkBlocked();
  }
  chordPlayBtn.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    try { chordPlayBtn.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    startHold();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { chordPlayBtn.addEventListener(n, stopHold); });
  chordPlayBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  chordPlayBtn.addEventListener('click', function (e) { e.preventDefault(); });
  progSoundBtn.addEventListener('click', toggleProgSound);
  window.addEventListener('blur', stopHold);
  // browsers (Safari above all) start audio only from a user gesture: prepare it on the first of any
  // (Safari counts click, key presses and touch-end as gestures, but not pointer-down)
  ['click', 'mouseup', 'pointerup', 'touchend', 'keydown'].forEach(function (n) {
    document.addEventListener(n, function () { ChordAudio.engine.unlock(); }, { capture: true, passive: true });
  });
  ChordAudio.engine.onRunning(function () { applySound(); soundNote(); });
  function soundNote() {            // say so if the browser is still holding the audio back
    var want = holding || progSoundOn;
    var blocked = want && !ChordAudio.engine.running();
    soundNoteEl.hidden = !blocked;
  }
  function checkBlocked() { setTimeout(soundNote, 300); }
  // Shift key (pressed on its own): Progressions open (with something to play) -> toggles its sound on release;
  // otherwise Chords open -> plays the chord while held. Shift used with another key (Shift+Tab, capitals) does nothing.
  var shiftMode = null;                             // 'prog' | 'chord' while a lone Shift press is under way
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Shift') {
      if (shiftMode) { shiftMode = null; stopHold(); }       // it became a combination: cancel
      return;
    }
    if (e.repeat || shiftMode || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, select, textarea')) return;
    if (!progSection.hidden && progDetails.open && !progSoundBtn.disabled) shiftMode = 'prog';
    else if (!chordSoundRow.hidden) { shiftMode = 'chord'; startHold(); }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key !== 'Shift' || !shiftMode) return;
    var mode = shiftMode;
    shiftMode = null;
    if (mode === 'prog') toggleProgSound(); else stopHold();
  });
  document.addEventListener('pointerdown', function () {        // Shift+click is not a sound command
    if (shiftMode === 'chord') stopHold();
    shiftMode = null;
  }, true);

  function syncHints() {          // the keystroke hints on the chord chips only show while Progressions is open
    chordsPanel.classList.toggle('show-hints', !progSection.hidden && progDetails.open);
  }

  function updateProgPanel() {
    syncProgIndex();
    if (state.chord && chordsDetails.open && state.selected && !state.flash && !isAlt()) progRevealed = true;
    var visible = state.selected && !state.flash && !isAlt() && (progRevealed || prog.length > 0 || saved.items.length > 0);   // a saved progression shows as soon as a key is picked
    progSection.hidden = !visible;
    syncHints();
    if (!visible) return;
    progActions.hidden = !chordsDetails.open;                 // Add / Clear only while the chord selector is open
    progClear.hidden = !prog.length;
    addProgBtn.disabled = !state.chord;
    addProgBtn.textContent = '+ Add ' + (state.chord ? Chords.chordInKey(currentSpec().name, state.mode, state.chord.deg, state.chord.type).roman + ' ' : '') + 'to progression';
    updateSavedBar();
    var curIt = currentItem();
    progSummary.textContent = 'Progressions' + (curIt ? ': ' + curIt.name : '') + (prog.length ? ' (' + prog.length + ')' : '');
    progHint.textContent = prog.length
      ? 'Pick a key on the piano to light the first chord, then press Next or the right arrow to step through; it wraps round to the start. The lit chord shows a suggested left-hand fingering (1 = thumb) under the keys, chosen with inversions to keep the hand moving as little as possible through the progression.'
      : 'Choose a type and a degree in the chord selector, then press Add (or Enter) to collect chords here.';
    progPrev.disabled = progNext.disabled = !prog.length;
    progList.textContent = '';
    if (!prog.length) { progList.appendChild(el('li', 'prog-empty', 'No chords yet.')); return; }
    prog.forEach(function (c, i) {
      var ch = progChord(i);
      var li = el('li', 'prog-item');
      li.draggable = true;                                    // drag to reorder
      var b = el('button', 'chip chip-prog');
      b.type = 'button';
      b.setAttribute('data-prog', i);
      b.setAttribute('aria-pressed', i === progIndex ? 'true' : 'false');
      b.setAttribute('aria-label', 'Chord ' + (i + 1) + ': ' + ch.roman + ', ' + ch.symbol);
      var vp2 = voicing(i);
      if (vp2) b.title = ch.symbol + ': ' + vp2.name + ', fingers ' + vp2.notes.map(function (n) { return n.finger; }).join('-');
      b.appendChild(el('span', 'chip-num', ch.roman));
      b.appendChild(el('span', 'chip-sym', ch.symbol));
      var x = el('button', 'prog-x', '\u00D7');
      x.type = 'button';
      x.setAttribute('data-prog-remove', i);
      x.setAttribute('aria-label', 'Remove chord ' + (i + 1) + ' (' + ch.roman + ')');
      li.appendChild(b);
      li.appendChild(x);
      progList.appendChild(li);
    });
  }

  // ---- reordering by dragging the chips ---------------------------------------
  var dragFrom = -1;
  function dropSlot(e) {            // where a drop at the pointer would insert: 0..prog.length, and the chip it is next to
    var items = Array.prototype.slice.call(progList.querySelectorAll('.prog-item'));
    var best = -1, bestD = Infinity, after = false;
    items.forEach(function (it, i) {
      var r = it.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var d = Math.pow(e.clientX - cx, 2) + 4 * Math.pow(e.clientY - cy, 2);
      if (d < bestD) { bestD = d; best = i; after = e.clientX > cx; }
    });
    return { index: best < 0 ? 0 : best + (after ? 1 : 0), item: items[best], after: after };
  }
  function clearDropMarks() {
    Array.prototype.forEach.call(progList.querySelectorAll('.drop-before, .drop-after, .dragging'), function (n) {
      n.classList.remove('drop-before', 'drop-after', 'dragging');
    });
  }
  progList.addEventListener('dragstart', function (e) {
    var li = e.target.closest ? e.target.closest('.prog-item') : null;
    if (!li) return;
    dragFrom = Array.prototype.indexOf.call(progList.children, li);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (err) { /* some browsers refuse */ }
    li.classList.add('dragging');
  });
  progList.addEventListener('dragover', function (e) {
    if (dragFrom < 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var slot = dropSlot(e);
    Array.prototype.forEach.call(progList.querySelectorAll('.drop-before, .drop-after'), function (n) { n.classList.remove('drop-before', 'drop-after'); });
    if (slot.item) slot.item.classList.add(slot.after ? 'drop-after' : 'drop-before');
  });
  progList.addEventListener('drop', function (e) {
    if (dragFrom < 0) return;
    e.preventDefault();
    var to = dropSlot(e).index;
    var from = dragFrom;
    dragFrom = -1;
    clearDropMarks();
    if (to > from) to--;
    if (to === from) return;
    var lit = progIndex >= 0 ? prog[progIndex] : null;
    var moved = prog.splice(from, 1)[0];
    prog.splice(to, 0, moved);
    progIndex = lit ? prog.indexOf(lit) : -1;
    saveProg();
    draw(false, false);
    progStatus.textContent = 'Moved chord ' + (from + 1) + ' to position ' + (to + 1) + '.';
  });
  progList.addEventListener('dragend', function () { dragFrom = -1; clearDropMarks(); });

  // ---- drawing --------------------------------------------------------------
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SLIDE_MS = 520;
  var EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';
  var slideDone = null;                       // cancels a slide in progress

  function endSlide() { if (slideDone) { slideDone(); slideDone = null; } }

  // Slide from the keyboard that is on screen (`oldSvg`) to the freshly drawn one so the
  // clicked key (`oldKey`) glides to the left edge. Both drawings are aligned on the key
  // and move together; the old one slides out on the left, the new one slides in.
  function slide(oldSvg, oldKeyLeft, newSvg) {
    var newRoot = newSvg.querySelector('.key[data-s="' + rootKeyS() + '"]');
    if (oldKeyLeft == null || !newRoot || !oldSvg.animate) return;
    var dx = oldKeyLeft - newRoot.getBoundingClientRect().left;
    if (Math.abs(dx) < 1) return;
    var rect = newSvg.getBoundingClientRect();
    var pad = rect.width * (KeyboardRender.PAD / KeyboardRender.WIDTH);

    oldSvg.setAttribute('aria-hidden', 'true');
    oldSvg.style.cssText = 'position:absolute;left:' + newSvg.offsetLeft + 'px;top:' + newSvg.offsetTop +
      'px;width:' + rect.width + 'px;pointer-events:none;';
    stage.insertBefore(oldSvg, newSvg);       // old one underneath, new one on top
    stage.classList.add('sliding');
    stage.style.clipPath = 'inset(0 ' + pad + 'px 0 ' + pad + 'px)';

    var opts = { duration: SLIDE_MS, easing: EASE, fill: 'both' };
    var a1 = oldSvg.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dx) + 'px)' }], opts);
    var a2 = newSvg.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'translateX(0)' }], opts);
    // flashcard: the signature card stays put while the keyboard slides under it
    var a3 = null;
    var newCard = newSvg.querySelector('.flashcard, .sigcard');
    if (newCard) {
      var oldCard = oldSvg.querySelector('.flashcard, .sigcard');
      if (oldCard) oldCard.style.display = 'none';
      var units = KeyboardRender.WIDTH / rect.width;          // screen px -> SVG user units
      a3 = newCard.animate([{ transform: 'translateX(' + (-dx * units) + 'px)' }, { transform: 'translateX(0)' }], opts);
    }
    var finished = false;
    function done() {
      if (finished) return;
      finished = true;
      a1.cancel(); a2.cancel(); if (a3) a3.cancel();
      if (oldSvg.parentNode === stage) stage.removeChild(oldSvg);
      stage.classList.remove('sliding');
      stage.style.clipPath = '';
    }
    slideDone = done;
    a2.onfinish = function () { done(); if (slideDone === done) slideDone = null; };
  }

  // what the big stave shows: the progression (Progressions open), else the selected chord and its inversions (Chords open)
  function buildStaff() {
    if (!state.selected || state.flash) return null;
    var progOpen = progDetails.open;          // (the sections are visible whenever a key is selected outside the flashcards)
    var chordOpen = chordsDetails.open;
    if (!progOpen && !chordOpen) return null;
    var tonic = ChordAudio.tonicMidi(state.root);
    var clefId = clefAllowed(state.clef) ? state.clef : 'treble';   // a Jazz-only clef falls back to treble in Pop
    var clefCfg = KeyboardRender.CLEFS.filter(function (c) { return c.id === clefId; })[0] || KeyboardRender.CLEFS[0];
    if (progOpen) {
      if (isAlt() || !prog.length) return { kind: 'empty', clef: clefId, hint: isAlt() ? 'Progressions use the seven-note scale' : 'Add chords to see the progression here', chords: [] };
      var shift = staffOctaveShift();
      return { kind: 'prog', clef: clefId, chords: prog.map(function (c, i) {
        var ch = progChord(i), v = voicing(i);
        if (!v) return null;
        return { notes: v.notes.map(function (n) { return { midi: tonic + n.o + shift, name: ch.notes[n.idx] }; }),
                 top: ch.roman, sub: ch.symbol, lit: i === progIndex };
      }).filter(Boolean) };
    }
    if (!state.chord) return { kind: 'empty', clef: clefId, hint: 'Select a chord to see it here', chords: [] };
    var cd = isAlt() ? Chords.chordInScale(altScale(), state.chord.deg, state.chord.type)
                     : Chords.chordInKey(currentSpec().name, state.mode, state.chord.deg, state.chord.type);
    if (!cd) return { kind: 'empty', clef: clefId, hint: 'Select a chord to see it here', chords: [] };
    var vo = chordVoicings(cd, tonic, clefCfg), chords = vo.chords, slots = vo.slots;
    if (findOn && picks.length) {                         // Find a chord: highlight the voicing nearest the notes picked (same lowest note)
      var lm = tonic + (Math.min.apply(null, picks) - rootKeyS()), bi = -1, bd = 1e9;
      chords.forEach(function (c, i) {
        var dist = Math.abs(c.bass - lm);
        if (c.bass % 12 === ((lm % 12) + 12) % 12 && dist < bd) { bd = dist; bi = i; }
      });
      if (bi >= 0) chords[bi].lit = true;
    }
    return { kind: 'chord', clef: clefId, chords: chords, slots: slots };
  }

  // every closed-position voicing of a chord on the stave, lowest bass first
  function chordVoicings(cd, tonic, clefCfg, slotsOverride) {
    var offs = cd.pcOffsets, n = offs.length;
    var pcs = offs.map(function (o) { return (tonic + o) % 12; });
    // the widest chord this level offers fixes the slot width (two octaves of voicings = 2 x notes per chord)
    var maxNotes = 3;
    if (isAlt()) Chords.ALT_TYPES.forEach(function (t) { maxNotes = Math.max(maxNotes, t.ints.length); });
    else Chords.TYPES.forEach(function (t) { if (level !== 'pop' || POP_HIDDEN_TYPES.indexOf(t.id) < 0) maxNotes = Math.max(maxNotes, t.steps.length); });
    var slots = slotsOverride || 2 * maxNotes;          // (Find the chord opens just this chord's own voicings: no spare room)
    var labels = slots > 10 ? ['Root', '1st inv.', '2nd inv.', '3rd inv.', '4th inv.', '5th inv.', '6th inv.']
                            : ['Root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion'];
    var chords = [];
    // closed-position voicings: for each chord tone as the lowest note, every such pitch in the two octaves from the clef's starting note (middle C for treble);
    // the other tones follow upwards, each the nearest pitch above the one before
    for (var k = 0; k < n; k++) {
      for (var bass = clefCfg.low; bass < clefCfg.low + 24; bass++) {
        if (bass % 12 !== pcs[k]) continue;
        var items = [], prev = bass - 1;
        for (var q = 0; q < n; q++) {
          var j = (k + q) % n, m = prev + 1;
          while (m % 12 !== pcs[j]) m++;
          items.push({ midi: m, name: cd.notes[j] });
          prev = m;
        }
        chords.push({ bass: bass, notes: items, top: labels[k], sub: k === 0 ? cd.symbol : cd.symbol + '/' + cd.notes[k], lit: false });
      }
    }
    chords.sort(function (x, y) { return x.bass - y.bass; });
    return { chords: chords, slots: slots, labels: labels };
  }

  // Find the chord, once answered: all the voicings, the card's own one highlighted
  function buildQuizStave() {
    var cd = ftcChord(), tonic = ChordAudio.tonicMidi(ftcQ.pc);
    var clefCfg = KeyboardRender.CLEFS.filter(function (c) { return c.id === 'treble'; })[0] || KeyboardRender.CLEFS[0];
    var vo = chordVoicings(cd, tonic, clefCfg, 2 * cd.notes.length), shown = state.card.chord.notes;
    var hit = -1;
    vo.chords.forEach(function (c, i) {
      if (c.notes.length === shown.length && c.notes.every(function (nt, j) { return nt.midi === shown[j].midi; })) hit = i;
    });
    if (hit < 0) {                                        // (a wide chord whose card voicing starts below the clef's range)
      var iv = (state.card.inv || 0) % cd.notes.length;
      vo.chords.push({ bass: shown[0].midi, notes: shown, top: vo.labels[iv], sub: iv === 0 ? cd.symbol : cd.symbol + '/' + cd.notes[iv], lit: true });
      vo.chords.sort(function (x, y) { return x.bass - y.bass; });
    } else vo.chords[hit].lit = true;
    return { kind: 'chord', clef: 'treble', chords: vo.chords, slots: vo.slots, fixedClef: true, compact: vo.slots > 10 };
  }

  // fade used when nothing is "clicked" (reset)
  function fade(svg) {
    if (svg.animate && !reduceMotion) svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
  }

  // anim: false | 'fade' | { oldKeyS: absolute semitone of the clicked key in the current drawing }
  function draw(anim, focusRoot) {
    endSlide();
    var oldSvg = stage.firstElementChild;
    var oldKeyLeft = null;                    // measured while the old drawing is still in the page
    if (anim && anim.oldKeyS != null && oldSvg) {
      var oldKey = oldSvg.querySelector('.key[data-s="' + anim.oldKeyS + '"]');
      if (oldKey) oldKeyLeft = oldKey.getBoundingClientRect().left;
    }
    if (state.chord && isAlt() && state.selected && !Chords.chordInScale(altScale(), state.chord.deg, state.chord.type)) {
      state.chord = null;                     // that chord does not exist in this key's scale
    }
    syncProgIndex();
    state.fingerSpace = state.selected && !state.flash && !isAlt() && prog.length > 0;
    state.fingering = null;
    if (state.fingerSpace && progIndex >= 0 && progDetails.open) {      // only while the Progressions section is expanded
      var vp = voicing(progIndex);
      state.fingering = vp ? vp.notes : null;
    }
    if (textPop && (!progDetails.open || !state.selected || state.flash)) closeTextPop(false);
    if (findOn && picks.length) syncPicks();
    state.picked = findOn ? picks : null;
    state.staff = buildStaff();
    state.quizStave = quizOn() && state.answered && state.card && state.card.chord ? buildQuizStave() : null;
    stage.innerHTML = KeyboardRender.render(quizOn() ? Object.assign({}, state, { selected: false }) : state);
    resetBtn.hidden = !state.selected || (state.flash && state.cardMode === 'sig') || quizOn();
    updateCaption();
    updateChordPanel();
    updateFtc();
    updateProgPanel();
    syncSound();
    var svg = stage.firstElementChild;
    if (anim && svg && !reduceMotion) {
      if (anim === 'fade') fade(svg);
      else if (oldKeyLeft != null) slide(oldSvg, oldKeyLeft, svg);   // old drawing is re-attached for the slide
    }
    if (focusRoot) {
      var k = stage.querySelector('.key[data-s="' + rootKeyS() + '"]');
      if (k) k.focus({ preventScroll: true });
    }
    saveState();
  }

  // ---- actions --------------------------------------------------------------
  // Root the keyboard on pitch class `pc` (the key at absolute semitone `fromS` in the
  // current drawing). `spell` picks between two spellings of the same key (e.g. F#
  // major vs Gb major) when the user clicked a box.
  function selectRoot(pc, spell, viaKeyboard, fromS) {
    var specs = Theory.specsFor(state.mode, pc);
    var sameKey = state.selected && pc === state.root;
    if (spell == null) spell = sameKey ? state.spell : 0;
    if (spell < 0 || spell >= specs.length) spell = 0;
    var curS = rootKeyS();
    var rotated = !(state.selected && fromS === curS) && (pc !== state.root || fromS !== curS);
    state.root = pc;
    state.spell = spell;
    state.selected = true;
    if (progDetails.open && prog.length && !isAlt()) {      // a progression is being stepped through: start at its first chord
      progIndex = 0;
      chordTypes_.full = prog[0].type;
      state.chord = { deg: prog[0].deg, type: prog[0].type };
      chordCleared = false;
    }
    draw(rotated && fromS != null ? { oldKeyS: fromS } : false, viaKeyboard);
    if (progIndex === 0 && state.chord && progOn()) progStatus.textContent = 'Chord 1 of ' + prog.length + ': ' + progChord(0).symbol;
  }

  // ---- Study: Find the chord ----------------------------------------------------
  // A random chord is named in a given key; the player finds it in the chord selector and presses Check.
  // Two dials set the difficulty (how many keys, how many chord groups); they climb by themselves after a
  // run of first-try answers unless that is switched off, and can always be moved by hand.
  var FTC_KEY = 'music-theory-ftc-v1';
  var FM_IDS = { key: 'fm-key', sig: 'fm-sig', chord: 'fm-chord' };
  var ftcLv = { major: { keys: 1, chords: 1 }, minor: { keys: 1, chords: 1 } };
  var ftcAuto = true, ftcNext = 'keys', ftcStreak = 0;
  var ftcQ = null;                                    // { pc, spell, deg, type, inv }  (inv: the inversion shown, 0 = root position)
  var ftcW = FindChord.loadWeights();                 // chords you have missed turn up more often (persisted)
  var ftcMissed = false;                              // a wrong Check on this question: no streak credit
  var ftcPrevChordsOpen = null;                       // the chord selector's state before the quiz opened it
  var ftcSection = document.getElementById('ftc');
  var ftcMsg = document.getElementById('ftc-msg');
  var ftcAutoBox = document.getElementById('ftc-auto');

  function quizOn() { return state.flash && state.cardMode === 'chord'; }
  function ftcPop() { return level === 'pop'; }

  function loadFtc() {
    try {
      var o = JSON.parse(window.localStorage.getItem(FTC_KEY));
      if (!o || typeof o !== 'object') return;
      ['major', 'minor'].forEach(function (m) {
        if (o.levels && o.levels[m]) {
          ftcLv[m].keys = FindChord.clamp(o.levels[m].keys, 1, FindChord.maxKeys());
          ftcLv[m].chords = FindChord.clamp(o.levels[m].chords, 1, FindChord.maxChords(m, false));
        }
      });
      ftcAuto = o.auto !== false;
      ftcNext = o.next === 'chords' ? 'chords' : 'keys';
    } catch (e) { /* defaults */ }
  }
  function saveFtc() {
    try { window.localStorage.setItem(FTC_KEY, JSON.stringify({ levels: ftcLv, auto: ftcAuto, next: ftcNext })); } catch (e) { /* storage unavailable */ }
  }
  function resetFtc() {
    ftcLv = { major: { keys: 1, chords: 1 }, minor: { keys: 1, chords: 1 } };
    ftcAuto = true; ftcNext = 'keys'; ftcStreak = 0;
    ftcAutoBox.checked = true;
    try { window.localStorage.removeItem(FTC_KEY); } catch (e) { /* storage unavailable */ }
  }
  // the levels in force: the chord dial is capped by what this level (Pop / Jazz) offers
  function ftcLevels() {
    var l = ftcLv[state.mode];
    return { keys: FindChord.clamp(l.keys, 1, FindChord.maxKeys()), chords: FindChord.clamp(l.chords, 1, FindChord.maxChords(state.mode, ftcPop())) };
  }
  function ftcSpec() { return Theory.specsFor(state.mode, ftcQ.pc)[ftcQ.spell]; }
  function ftcChord() { return Chords.chordInKey(ftcSpec().name, state.mode, ftcQ.deg, ftcQ.type); }
  function ftcSay(text) { ftcMsg.textContent = text; }                // (a screen-reader message; the card shows it too)

  var ftcSel = { deg: null, type: null };            // this attempt's picks; the second one makes the guess
  var ftcWrong = false;                              // the chips still show a wrong guess

  function ftcClearPicks() {
    ftcSel = { deg: null, type: null };
    ftcWrong = false;
    state.chord = null;
    typePicked = false;
    chordTypes_.full = 'triad';
  }

  // closed-position voicing of the question's chord, centred on the treble staff
  function ftcNoteMiss() {                              // this chord (in this key) will turn up more often
    FindChord.miss(ftcW, state.mode, ftcQ);
    FindChord.saveWeights(ftcW);
  }
  function ftcName(ch) {                                // the chord as shown: G7, or G7/B for an inversion
    return ftcQ.inv ? ch.symbol + '/' + ch.notes[ftcQ.inv % ch.notes.length] : ch.symbol;
  }
  function ftcNotes() {
    var ch = ftcChord(), tonic = ChordAudio.tonicMidi(ftcQ.pc), items = [], prev = null, i;
    var n = ch.pcOffsets.length, k = (ftcQ.inv || 0) % n;                      // the chord tone k sits lowest
    for (i = 0; i < n; i++) {
      var j = (k + i) % n, pc = (tonic + ch.pcOffsets[j]) % 12, m = prev === null ? 48 : prev + 1;
      while (m % 12 !== pc) m++;
      items.push({ midi: m, name: ch.notes[j] });
      prev = m;
    }
    var avg = items.reduce(function (a, n) { return a + n.midi; }, 0) / items.length;
    var shift = 12 * Math.round((71 - avg) / 12);
    return items.map(function (n) { return { midi: n.midi + shift, name: n.name }; });
  }

  function ftcNewQuestion(animate) {
    var l = ftcLevels();
    var q = FindChord.pick(state.mode, ftcPop(), l.keys, l.chords, Math.random, ftcQ, function (c) { return FindChord.weightOf(ftcW, state.mode, c); });
    q = { pc: q.pc, deg: q.deg, type: q.type };
    q.spell = Math.floor(Math.random() * Theory.specsFor(state.mode, q.pc).length);
    var nNotes = Chords.chordInKey(Theory.specsFor(state.mode, q.pc)[q.spell].name, state.mode, q.deg, q.type).pcOffsets.length;
    q.inv = FindChord.pickInversion(nNotes, !ftcPop(), Math.random);              // Jazz: inversions mixed in at every level
    var oldSvg = stage.firstElementChild;
    var oldKey = animate && oldSvg ? oldSvg.querySelector('.key[data-pc="' + q.pc + '"]') : null;
    ftcQ = q;
    state.answered = false;
    state.root = q.pc;
    state.spell = q.spell;
    state.selected = true;                            // (the chord selector needs the key; the keyboard picture ignores it)
    chordCleared = false;
    ftcClearPicks();
    ftcMissed = false;
    state.card = { pc: q.pc, spell: q.spell, chord: { notes: ftcNotes() }, symbol: ftcChord().symbol, deg: q.deg, type: q.type, inv: q.inv, title: '', status: '' };   // (symbol: for the tests and screen readers' sake, not drawn)
    ftcSay('', '');
    return oldKey ? { oldKeyS: parseInt(oldKey.getAttribute('data-s'), 10) } : (animate ? 'fade' : false);
  }

  function enterQuiz() {
    restoring = true;                                 // opening the selector must not wipe what the toggle handler resets
    setTimeout(function () { restoring = false; }, 80);
    if (ftcPrevChordsOpen === null) ftcPrevChordsOpen = chordsDetails.open;
    chordsDetails.open = true;
    state.scaleKind = 'full';
    document.getElementById('sk-full').checked = true;
    ftcQ = null;
    ftcStreak = 0;
    ftcNewQuestion(false);
  }
  function exitQuiz() {
    if (ftcPrevChordsOpen !== null) {
      restoring = true;
      setTimeout(function () { restoring = false; }, 80);
      chordsDetails.open = ftcPrevChordsOpen;
      ftcPrevChordsOpen = null;
    }
    ftcQ = null;
    state.chord = null;
    state.card = null;
    typePicked = false;
    ftcSel = { deg: null, type: null };
  }

  function ftcNextQuestion(viaKeyboard) {
    if (!quizOn() || !state.answered) return;
    var anim = ftcNewQuestion(true);
    updateScore();
    draw(anim, false);
    if (viaKeyboard) { var first = chordTypes.querySelector('.chip'); if (first) first.focus({ preventScroll: true }); }
  }

  // "I give up": light the right type and degree and go on as if it had been answered (it counts as one miss)
  function ftcGiveUp(viaKeyboard) {
    if (!quizOn() || state.answered || !ftcQ) return;
    var want = ftcChord();
    if (!ftcMissed) { score.bad++; ftcNoteMiss(); }
    ftcMissed = true;
    ftcStreak = 0;
    ftcWrong = false;
    ftcSel = { deg: ftcQ.deg, type: ftcQ.type };
    typePicked = true;
    chordTypes_.full = ftcQ.type;
    state.chord = { deg: ftcQ.deg, type: ftcQ.type };
    state.answered = true;
    state.card.status = '';
    state.card.title = ftcName(want) + ' is ' + want.roman + ' in ' + Theory.keyTitle(ftcSpec(), state.mode);
    state.card.modeLine = ftcPop() ? '' : 'Mode: ' + want.mode;
    ftcSay('The answer: ' + state.card.title + '.');
    updateScore();
    draw(false, false);
    if (viaKeyboard) { var nb = stage.querySelector('.next-btn'); if (nb) nb.focus({ preventScroll: true }); }
  }

  // a chip was chosen: type and degree can come in either order; the second one is the guess
  function ftcPick(kind, value) {
    if (!quizOn() || state.answered || !ftcQ) return;
    if (ftcWrong) ftcClearPicks();                    // after a wrong guess the next click starts a new attempt
    ftcSel[kind] = value;
    typePicked = ftcSel.type !== null;
    chordTypes_.full = ftcSel.type || 'triad';
    if (ftcSel.deg === null || ftcSel.type === null) { draw(false, false); return; }
    var got = { deg: ftcSel.deg, type: ftcSel.type };
    state.chord = got;
    var want = ftcChord(), where = Theory.keyTitle(ftcSpec(), state.mode);
    if (got.deg === ftcQ.deg && got.type === ftcQ.type) {
      score.ok++;
      if (!ftcMissed) { FindChord.hit(ftcW, state.mode, ftcQ); FindChord.saveWeights(ftcW); }   // known: ease off
      state.answered = true;
      state.card.title = ftcName(want) + ' is ' + want.roman + ' in ' + where;
      state.card.modeLine = ftcPop() ? '' : 'Mode: ' + want.mode;
      state.card.status = '';
      var text = 'Correct: ' + state.card.title + '.';
      if (ftcMissed) ftcStreak = 0;
      else {
        ftcStreak++;
        if (ftcAuto && ftcStreak >= FindChord.STREAK) {
          var l = ftcLevels();
          var up = FindChord.levelUp(state.mode, ftcPop(), l.keys, l.chords, ftcNext);
          if (up) {
            ftcLv[state.mode] = { keys: up.keys, chords: up.chords };
            ftcNext = up.next;
            text += up.keys > l.keys ? ' Level up: one more key.' : ' Level up: more chords.';
          }
          ftcStreak = 0;
        }
      }
      saveFtc();
      ftcSay(text, 'ok');
      updateScore();
      draw(false, false);
      feedback('yes');
      return;
    }
    score.bad++;
    if (!ftcMissed) ftcNoteMiss();
    ftcMissed = true;
    ftcStreak = 0;
    ftcWrong = true;                                  // (the chips keep showing the wrong chord until the next click)
    var have = Chords.chordInKey(ftcSpec().name, state.mode, got.deg, got.type);
    state.card.status = 'That is ' + have.symbol + ' (' + have.roman + '). Try again.';
    ftcSay(state.card.status, 'bad');
    updateScore();
    draw(false, false);
    feedback('nope');
  }

  function ftcKeyName(pc) {
    return Theory.specsFor(state.mode, pc).map(function (sp) { return sp.name + (state.mode === 'minor' ? 'm' : ''); }).join('/');
  }
  function ftcStep(dial, delta) {
    var l = ftcLevels();
    var max = dial === 'keys' ? FindChord.maxKeys() : FindChord.maxChords(state.mode, ftcPop());
    var next = FindChord.clamp(l[dial] + delta, 1, max);
    if (next === l[dial]) return;
    ftcLv[state.mode] = { keys: dial === 'keys' ? next : l.keys, chords: dial === 'chords' ? next : l.chords };
    ftcStreak = 0;
    saveFtc();
    updateFtc();
  }

  function updateFtc() {
    var on = quizOn();
    ftcSection.hidden = !on;
    chordsPanel.classList.toggle('quizzing', on);
    if (!on || !ftcQ) return;
    var l = ftcLevels(), maxC = FindChord.maxChords(state.mode, ftcPop());
    document.getElementById('ftc-keys-n').textContent = l.keys;
    document.getElementById('ftc-chords-n').textContent = l.chords;
    document.getElementById('ftc-keys-dn').disabled = l.keys <= 1;
    document.getElementById('ftc-keys-up').disabled = l.keys >= FindChord.maxKeys();
    document.getElementById('ftc-chords-dn').disabled = l.chords <= 1;
    document.getElementById('ftc-chords-up').disabled = l.chords >= maxC;
    var newestKey = FindChord.keys(state.mode, l.keys).slice(-1)[0];
    document.getElementById('ftc-keys-list').textContent = l.keys === 1 ? ftcKeyName(newestKey) + ' only' : '+ ' + ftcKeyName(newestKey);
    var home = state.mode === 'minor' ? 'A' : 'C';
    var group = FindChord.groups(state.mode, ftcPop())[l.chords - 1].map(function (ch) {
      return Chords.chordInKey(home, state.mode, ch.deg, ch.type).roman;
    }).join(' ');
    document.getElementById('ftc-chords-list').textContent = (l.chords === 1 ? '' : '+ ') + group;
    document.getElementById('ftc-streak').textContent = ftcAuto ? '(' + ftcStreak + '/' + FindChord.STREAK + ')' : '';
  }

  document.getElementById('ftc-keys-dn').addEventListener('click', function () { ftcStep('keys', -1); });
  document.getElementById('ftc-keys-up').addEventListener('click', function () { ftcStep('keys', 1); });
  document.getElementById('ftc-chords-dn').addEventListener('click', function () { ftcStep('chords', -1); });
  document.getElementById('ftc-chords-up').addEventListener('click', function () { ftcStep('chords', 1); });
  ftcAutoBox.addEventListener('change', function () { ftcAuto = ftcAutoBox.checked; ftcStreak = 0; saveFtc(); updateFtc(); });
  loadFtc();
  ftcAutoBox.checked = ftcAuto;

  function setCardMode(m) {
    state.cardMode = m;
    var radio = document.getElementById(FM_IDS[m]);
    if (radio) radio.checked = true;
  }
  // Pop studies keys, signatures and chords; Jazz studies chords only
  function syncStudyOptions() {
    viewGroup.hidden = false;
    ['fm-key', 'fm-sig'].forEach(function (id) {
      var input = document.getElementById(id);
      input.hidden = level === 'jazz';
      input.nextElementSibling.hidden = level === 'jazz';
    });
  }

  // ---- Chords: find a chord from keys picked on the keyboard ------------------------
  var findBtn = document.getElementById('find-chord-btn');
  var findOn = false;
  var picks = [];                                     // picked keys, as absolute semitones (the keys' data-s)

  // every chord the selector offers in this key, as pitch classes, for Find a chord
  function findCands() {
    var out = [], rank = {};
    Chords.TYPE_COMMON_TO_RARE.forEach(function (id, n) { rank[id] = n; });
    function pcOf(o) { return (state.root + o) % 12; }
    if (isAlt()) {
      var sc = altScale();
      for (var i = 0; i < sc.offsets.length; i++) {
        Chords.ALT_TYPES.forEach(function (t, ti) {
          var c = Chords.chordInScale(sc, i, t.id);
          if (c) out.push({ deg: i, type: t.id, pcs: c.pcOffsets.map(pcOf), rootPc: pcOf(c.pcOffsets[0]), rank: ti * 10 + i });
        });
      }
    } else {
      var name = currentSpec().name;
      for (var deg = 0; deg < 7; deg++) {
        Chords.TYPES.forEach(function (t) {
          if (level === 'pop' && POP_HIDDEN_TYPES.indexOf(t.id) >= 0) return;
          var c = Chords.chordInKey(name, state.mode, deg, t.id);
          out.push({ deg: deg, type: t.id, pcs: c.pcOffsets.map(pcOf), rootPc: pcOf(c.rootOffset), rank: rank[t.id] * 10 + deg });
        });
      }
    }
    return out;
  }
  // light up the chord the picked notes name (none lit when they name no chord in this key)
  function syncPicks() {
    var best = FindChord.identify(findCands(), picks);
    if (best) {
      state.chord = { deg: best.deg, type: best.type };
      chordTypes_[state.scaleKind] = best.type;
      typePicked = true;
      chordCleared = false;
    } else {
      state.chord = null;
      typePicked = false;
    }
  }
  function togglePick(s) {
    var i = picks.indexOf(s);
    if (i >= 0) picks.splice(i, 1); else picks.push(s);
    if (!picks.length) { state.chord = null; typePicked = false; }
    draw(false, false);
  }
  function findHint() {
    return 'Find a chord: click keys on the keyboard to pick notes (click a key again to unselect it). The chord lights up here as soon as the notes name one in this key.' +
      (picks.length ? ' Picked so far: ' + picks.length + ' key' + (picks.length === 1 ? '' : 's') + '.' : '');
  }
  findBtn.addEventListener('click', function () {
    findOn = !findOn;
    picks = [];
    draw(false, false);
  });

  // ---- flashcards -------------------------------------------------------------
  function newCard() {
    var avoid = state.card ? state.card.pc : -1;
    var pc = Weights.pick(weights[state.mode], Math.random, avoid);
    missedThisCard = false;
    state.guess = null;
    // a two-spelling key shows one spelling on the cue (random), both once solved; the shown one is lit
    state.card = { pc: pc, spell: Math.floor(Math.random() * Theory.specsFor(state.mode, pc).length) };
    if (state.cardMode === 'sig') {               // find-the-signature: the keyboard is rooted on the card's tonic
      state.root = pc;
      state.spell = state.card.spell;
      state.selected = false;
    }
  }

  function updateScore() {
    okEl.textContent = score.ok;
    badEl.textContent = score.bad;
    scoreBox.hidden = !state.flash;
    flashModeGroup.hidden = !state.flash;
    kindGroup.hidden = state.flash || level === 'pop';
  }

  // brief feedback marks: kind 'yes' | 'nope'; `keyEl` is the key that was pressed
  function feedback(kind, keyEl) {
    var svg = stage.firstElementChild;
    if (!svg || !svg.animate) return;
    var mark = svg.querySelector(kind === 'yes' ? '.fb-yes' : '.fb-nope');
    if (mark) {
      mark.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
        { duration: 1000, easing: 'ease-out' });
    }
    if (kind !== 'nope' || reduceMotion) return;
    var card = svg.querySelector('.flashcard');
    if (card) {
      card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(9px)' },
        { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' }], { duration: 320 });
    }
    var body = keyEl && keyEl.querySelector('.body');
    if (body) {                                   // red flash over the key that was pressed
      var flashEl = body.cloneNode(false);
      flashEl.setAttribute('fill', '#ef4444');
      flashEl.setAttribute('stroke', 'none');
      flashEl.setAttribute('pointer-events', 'none');
      flashEl.removeAttribute('class');
      body.parentNode.appendChild(flashEl);
      var an = flashEl.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
      an.onfinish = function () { if (flashEl.parentNode) flashEl.parentNode.removeChild(flashEl); };
    }
  }

  // The player pressed a key (pitch class `pc`, absolute semitone `fromS` in the drawing).
  function answer(pc, viaKeyboard, fromS, keyEl) {
    if (state.answered) return;                 // already solved: press Next for the next card
    if (pc !== state.card.pc) {
      score.bad++;
      missedThisCard = true;
      Weights.miss(weights, state.mode, state.card.pc);    // this key will turn up more often
      Weights.save(weights);
      state.guess = pc;                         // show what the pressed key's signature is (no rotation, no highlights)
      lastResult = 'Incorrect. That key is ' + Theory.specsFor(state.mode, pc).map(function (sp) {
        return Theory.keyTitle(sp, state.mode);
      }).join(' or ') + '.';
      updateScore();
      draw(false, false);
      var pressed = fromS != null ? stage.querySelector('.key[data-s="' + fromS + '"]') : null;
      if (viaKeyboard && pressed) pressed.focus({ preventScroll: true });
      feedback('nope', pressed);
      return;
    }
    score.ok++;
    if (!missedThisCard) { Weights.hit(weights, state.mode, pc); Weights.save(weights); }   // known: ease off
    lastResult = 'Correct, ' + Theory.keyTitle(Theory.specsFor(state.mode, pc)[state.card.spell], state.mode) + '.';
    // rotate to the key just identified and light up its scale, then deal the next card
    var rotated = !(state.selected && fromS === state.root) && (pc !== state.root || fromS !== state.root);
    state.root = pc;
    state.spell = state.card.spell;
    state.selected = true;
    state.answered = true;                      // the card stays up until Next is pressed
    state.guess = null;
    updateScore();
    draw(rotated && fromS != null ? { oldKeyS: fromS } : false, false);
    feedback('yes');
    if (viaKeyboard) {
      var nb = stage.querySelector('.next-btn');
      if (nb) nb.focus({ preventScroll: true });
    }
  }

  // find-the-signature: the player clicked one of the signature boxes
  function answerSig(box) {
    if (state.answered) return;
    var pick = { kind: box.getAttribute('data-kind'), n: parseInt(box.getAttribute('data-n'), 10),
                 pc: parseInt(box.getAttribute('data-pc'), 10), spell: parseInt(box.getAttribute('data-spell'), 10) };
    var sp = Theory.specsFor(state.mode, pick.pc)[pick.spell];
    if (pick.pc !== state.card.pc || pick.spell !== state.card.spell) {     // F#/Gb are separate answers
      score.bad++;
      missedThisCard = true;
      Weights.miss(weights, state.mode, state.card.pc);
      Weights.save(weights);
      state.guess = pick;
      lastResult = 'Incorrect. That signature is ' + Theory.keyTitle(sp, state.mode) + '.';
      updateScore();
      draw(false, false);
      var again = stage.querySelector('.sigbox[data-kind="' + pick.kind + '"][data-n="' + pick.n + '"]');
      if (again && again.animate && !reduceMotion) {
        again.animate([{ transform: again.getAttribute('transform') + ' translate(0,0)' },
          { transform: again.getAttribute('transform') + ' translate(-6,0)' },
          { transform: again.getAttribute('transform') + ' translate(5,0)' },
          { transform: again.getAttribute('transform') + ' translate(0,0)' }], { duration: 280 });
      }
      return;
    }
    score.ok++;
    if (!missedThisCard) { Weights.hit(weights, state.mode, pick.pc); Weights.save(weights); }
    var notes = Theory.signatureNotes(sp);
    lastResult = 'Correct, ' + Theory.keyTitle(sp, state.mode) + ' has ' +
      (sp.n === 0 ? 'no sharps or flats' : sp.n + ' ' + sp.kind + (sp.n === 1 ? '' : 's') + ' (' + notes.join(' ') + ')') + '.';
    state.guess = pick;
    state.answered = true;
    state.selected = true;                      // light up the key's scale on the keyboard
    state.spell = pick.spell;
    updateScore();
    draw(false, false);
    var nb = stage.querySelector('.next-btn');
    if (nb && box.getAttribute('data-kbd') === '1') nb.focus({ preventScroll: true });
  }

  // find-the-signature: Next rotates the keyboard onto the next tonic, as clicking a key does in Explore
  function nextSigCard(viaKeyboard) {
    var oldSvg = stage.firstElementChild;
    state.answered = false;
    state.selected = false;
    state.guess = null;
    lastResult = '';
    newCard();                                   // roots the keyboard on the new tonic
    var oldKey = oldSvg && oldSvg.querySelector('.key[data-pc="' + state.root + '"]');
    var fromS = oldKey ? parseInt(oldKey.getAttribute('data-s'), 10) : null;
    updateScore();
    draw(fromS != null ? { oldKeyS: fromS } : 'fade', false);
    if (viaKeyboard) {
      var first = stage.querySelector('.sigbox');
      if (first) first.focus({ preventScroll: true });
    }
  }

  // Next: the solved card slides out to the left while the new one slides in from the right.
  function nextCard(viaKeyboard) {
    if (!state.flash || !state.answered) return;
    if (quizOn()) { ftcNextQuestion(viaKeyboard); return; }
    if (state.cardMode === 'sig') { nextSigCard(viaKeyboard); return; }
    var oldSvg = stage.firstElementChild;
    var oldCard = oldSvg && oldSvg.querySelector('.flashcard');
    var oldClone = oldCard ? oldCard.cloneNode(true) : null;
    state.answered = false;
    state.selected = false;          // clear the scale highlights; state.root is kept so the keyboard doesn't rotate
    lastResult = '';
    newCard();
    updateScore();
    draw(false, viaKeyboard);
    var svg = stage.firstElementChild;
    var card = svg && svg.querySelector('.flashcard');
    if (!card || !oldClone || reduceMotion || !card.animate) return;
    var d = KeyboardRender.WIDTH * 0.55;
    var opts = { duration: 450, easing: EASE, fill: 'both' };
    Array.prototype.forEach.call(oldClone.querySelectorAll('.next-btn, .fb-yes, .fb-nope'), function (n) {
      n.parentNode.removeChild(n);
    });
    svg.insertBefore(oldClone, card);
    var out = oldClone.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(' + (-d) + 'px)', opacity: 0 }], opts);
    out.onfinish = function () { if (oldClone.parentNode) oldClone.parentNode.removeChild(oldClone); };
    card.animate([{ transform: 'translateX(' + d + 'px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], opts);
  }

  function press(pc, spell, viaKeyboard, fromS, keyEl) {
    if (quizOn()) return;                                  // Find the chord: the key is the question's, not the player's
    if (findOn && state.selected && keyEl && fromS != null) { togglePick(fromS); return; }   // Find a chord: keys are picked, not rooted
    if (state.flash && state.card) { if (state.cardMode !== 'sig') answer(pc, viaKeyboard, fromS, keyEl); }
    else selectRoot(pc, spell, viaKeyboard, fromS);
  }

  function setView(flash) {
    if (flash === state.flash) return;
    state.flash = flash;
    state.root = 0;
    state.spell = 0;
    state.selected = false;
    lastResult = '';
    state.answered = false;
    state.guess = null;
    state.chord = null;
    chordCleared = false;
    if (flash) {
      if (level === 'jazz' && state.cardMode !== 'chord') setCardMode('chord');     // Jazz studies chords only
      if (quizOn()) enterQuiz(); else newCard();
    } else { exitQuiz(); state.card = null; }
    updateScore();
    draw('fade', false);
  }

  function setFlashMode(m) {
    if (m === state.cardMode) return;
    if (quizOn()) exitQuiz();
    setCardMode(m);
    state.root = 0;
    state.spell = 0;
    state.selected = false;
    lastResult = '';
    state.answered = false;
    state.guess = null;
    state.card = null;
    if (m === 'chord') enterQuiz(); else newCard();
    updateScore();
    draw('fade', false);
  }

  function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    state.spell = 0;                 // spellings differ between modes
    if (state.flash) {               // a new deck: clear the highlights, deal a fresh card
      state.root = 0;
      state.selected = false;
      lastResult = '';
      state.answered = false;
      state.guess = null;
      state.card = null;
      if (quizOn()) { ftcQ = null; ftcStreak = 0; state.chord = null; typePicked = false; ftcNewQuestion(false); }
      else newCard();
    }
    draw(state.flash ? 'fade' : false, false);
  }

  function reset() {
    typePicked = false;
    progRevealed = false;                  // the Progressions section waits for the first chord again
    state.chord = null;
    chordCleared = false;
    state.root = 0;
    state.spell = 0;
    state.selected = false;
    draw('fade', false);
  }

  // ---- events ---------------------------------------------------------------
  function intAttr(el, name) {
    return el.hasAttribute(name) ? parseInt(el.getAttribute(name), 10) : null;
  }


  // ---- clef picker -------------------------------------------------------------
  var POP_CLEFS = ['treble', 'alto', 'bass'];            // Pop shows the three everyday clefs; Jazz all of them
  function clefAllowed(id) { return level === 'jazz' || POP_CLEFS.indexOf(id) >= 0; }
  var clefPop = null, clefPopFrom = null;
  function closeClefPop(refocus) {
    if (!clefPop) return;
    clefPop.remove();
    clefPop = null;
    document.removeEventListener('pointerdown', clefOutside, true);
    document.removeEventListener('keydown', clefKeys, true);
    if (refocus) { var hit = stage.querySelector('.clef-hit'); if (hit) hit.focus(); }
  }
  function clefOutside(e) { if (clefPop && !clefPop.contains(e.target) && !(e.target.closest && e.target.closest('.clef-hit'))) closeClefPop(false); }
  function clefKeys(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeClefPop(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var items = Array.prototype.slice.call(clefPop.querySelectorAll('button'));
      var i = items.indexOf(document.activeElement);
      i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[i].focus();
      e.preventDefault();
    }
  }
  function openClefPop(anchor) {
    if (clefPop) { closeClefPop(false); return; }
    clefPopFrom = anchor;
    clefPop = document.createElement('div');
    clefPop.id = 'clef-pop';
    if (level === 'jazz') clefPop.className = 'wide';
    clefPop.setAttribute('role', 'dialog');
    clefPop.setAttribute('aria-label', 'Choose a clef');
    var html = '<div class="clef-pop-title">Clef</div><div class="clef-pop-list' + (level === 'jazz' ? ' two' : '') + '" role="listbox">';
    KeyboardRender.CLEFS.filter(function (c) { return clefAllowed(c.id); }).forEach(function (c) {
      html += '<button type="button" role="option" class="clef-opt" data-clef="' + c.id + '" aria-selected="' + (c.id === state.clef) + '">' +
        KeyboardRender.clefIcon(c.id) + '<span class="clef-opt-name">' + c.name + '</span><span class="clef-opt-note">' + c.note + '</span></button>';
    });
    clefPop.innerHTML = html + '</div>';
    document.body.appendChild(clefPop);
    var r = anchor.getBoundingClientRect(), w = clefPop.offsetWidth, h = clefPop.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    clefPop.style.left = left + 'px';
    clefPop.style.top = top + 'px';
    clefPop.addEventListener('click', function (e) {
      var b = e.target.closest('.clef-opt');
      if (!b) return;
      var picked = b.getAttribute('data-clef');
      if (picked !== state.clef) {                      // a new clef starts every chord from the suggested inversion again
        prog.forEach(function (c) { delete c.inv; });
        saveProg();
      }
      state.clef = picked;
      closeClefPop(false);
      saveState();
      draw(false, false);
      var hit = stage.querySelector('.clef-hit');
      if (hit && e.detail === 0) hit.focus();
    });
    document.addEventListener('pointerdown', clefOutside, true);
    document.addEventListener('keydown', clefKeys, true);
    var cur = clefPop.querySelector('[aria-selected="true"]');
    if (cur) cur.focus();
  }

  stage.addEventListener('click', function (e) {
    var ch = e.target.closest && e.target.closest('.clef-hit');
    if (ch) { openClefPop(ch); return; }
    var iz = e.target.closest && e.target.closest('.inv-zone');
    if (iz) { moveInversion(parseInt(iz.getAttribute('data-chord'), 10), iz.getAttribute('data-dir')); return; }
    if (e.target.closest && e.target.closest('.next-btn')) { nextCard(e.detail === 0); return; }
    if (e.target.closest && e.target.closest('.giveup-btn')) { ftcGiveUp(e.detail === 0); return; }
    var sb = e.target.closest('.sigbox');
    if (sb && stage.contains(sb)) { if (e.detail === 0) sb.setAttribute('data-kbd', '1'); answerSig(sb); return; }
    var t = e.target.closest('[data-pc]');
    if (!t || !stage.contains(t)) return;
    var spell = t.hasAttribute('data-spell') ? parseInt(t.getAttribute('data-spell'), 10) : null;
    press(parseInt(t.getAttribute('data-pc'), 10), spell, false, intAttr(t, 'data-s'), t.classList.contains('key') ? t : null);
  });

  function plainKey(e) { return !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey; }

  stage.addEventListener('keydown', function (e) {
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && plainKey(e) && progOn()) {   // stepping a progression beats key-to-key focus moves
      e.preventDefault();
      stepProg(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    var chk = e.target.closest ? e.target.closest('.clef-hit') : null;
    if (chk && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openClefPop(chk); return; }
    var gb = e.target.closest ? e.target.closest('.giveup-btn') : null;
    if (gb && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ftcGiveUp(true); return; }
    var nb = e.target.closest ? e.target.closest('.next-btn') : null;
    if (nb && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      nextCard(true);
      return;
    }
    var sbx = e.target.closest ? e.target.closest('.sigbox') : null;
    if (sbx && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      sbx.setAttribute('data-kbd', '1');
      answerSig(sbx);
      return;
    }
    var t = e.target.closest ? e.target.closest('.key') : null;
    if (!t) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      press(parseInt(t.getAttribute('data-pc'), 10), null, true, intAttr(t, 'data-s'), t);
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !(e.key === 'ArrowRight' && state.flash && state.answered)) {
      // keys are ordered chromatically by their absolute semitone
      e.preventDefault();
      var keys = Array.prototype.slice.call(stage.querySelectorAll('.key')).sort(function (a, b) {
        return parseInt(a.getAttribute('data-s'), 10) - parseInt(b.getAttribute('data-s'), 10);
      });
      var i = keys.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i >= 0 && i < keys.length) keys[i].focus();
    }
  });

  // Flashcards: once a card is solved, the right arrow deals the next one (same as the Next button).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!state.flash || !state.answered) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, select, textarea')) return;      // radios etc. keep their arrow keys
    e.preventDefault();
    nextCard(true);
  });

  // Progressions: arrows step, Enter adds the selected chord, and the section's own buttons
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || !plainKey(e)) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, select, textarea')) return;
    if (quizOn() && e.key === 'Enter') {                  // Find the chord: Enter checks, then goes on
      var qchip = t && t.closest && t.closest('button[data-deg], button[data-type]');
      if (qchip || !t || t === document.body || t === document.documentElement) {
        e.preventDefault();
        if (state.answered) ftcNextQuestion(true);
        return;
      }
    }
    if (state.selected && (!state.flash || quizOn()) && !chordsPanel.hidden && chordsDetails.open) {
      // chord selector shortcuts: 1-7 pick the degree/mode; A S D F ... pick the type chips in the order shown
      var sc = null;
      if (/^[1-7]$/.test(e.key)) {
        var dchip = chordDegrees.querySelector('[data-deg="' + (parseInt(e.key, 10) - 1) + '"]');
        if (dchip && !dchip.disabled) sc = dchip.getAttribute('aria-pressed') === 'true' ? 'same' : dchip;     // never toggles a degree off
      } else if (e.key.length === 1 && TYPE_KEYS.indexOf(e.key.toLowerCase()) >= 0) {
        var tchip = chordTypes.children[TYPE_KEYS.indexOf(e.key.toLowerCase())];
        if (tchip) sc = tchip.getAttribute('aria-pressed') === 'true' ? 'same' : tchip;
      }
      if (sc) {
        e.preventDefault();
        if (sc !== 'same') sc.click();
        return;
      }
    }
    if (e.key.toLowerCase() === 'p' && !progSoundBtn.disabled && !progSection.hidden) {
      e.preventDefault();
      toggleProgSound();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && progOn()) {
      e.preventDefault();
      stepProg(e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === 'Enter' && state.chord && state.selected && !state.flash && !isAlt() && chordsDetails.open) {
      var inPanel = t && t.closest && t.closest('#chords');
      var chip = t && t.closest && t.closest('button[data-deg], button[data-type]');
      if (chip || (!inPanel && (!t || t === document.body || t === document.documentElement))) {
        e.preventDefault();                       // Enter submits the chord instead of re-pressing the chip
        addToProg();
      }
    }
  });

  progSelect.addEventListener('change', function () {
    var id = progSelect.value;
    if (id && saved.current === null && prog.length) {      // unsaved chords would be lost: ask first
      confirmMode = 'discard'; pendingId = id; renaming = false;
      updateProgPanel();
      progYes.focus();
    } else if (id) openSaved(id);
    renderSaved(false);
  });
  progSelect.addEventListener('mousedown', function () { if (!progSelect.disabled) renderSaved(true); });
  progSelect.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ' || e.key === 'Enter') renderSaved(true);
  });
  progSelect.addEventListener('blur', function () { renderSaved(false); });
  progMenu.addEventListener('change', function () {
    var v = progMenu.value;
    progMenu.value = '';
    if (v === 'new') newProgression();
    else if (v === 'dup') duplicateCurrent();
    else if (v === 'del') { if (currentItem()) { confirmMode = 'delete'; renaming = false; updateProgPanel(); progYes.focus(); } }
    else if (v === 'rename' && currentItem()) {
      renaming = true;
      confirmMode = null;
      updateProgPanel();
      progName.value = currentItem().name;
      progName.focus();
      progName.select();
    }
  });
  saveForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var it = currentItem();
    if (renaming && it) {
      var nm = progName.value.trim();
      if (nm) it.name = uniqueName(nm, it.id);
      renaming = false;
      progName.value = '';
      persistSaved();
      draw(false, false);
      progStatus.textContent = 'Renamed to "' + it.name + '".';
    } else if (saved.current === null && prog.length) {
      saveCurrentAs(progName.value);
      progName.value = '';
    }
  });
  progName.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && renaming) { renaming = false; progName.value = ''; updateProgPanel(); }
  });
  progDetails.addEventListener('toggle', function () { syncHints(); if (!restoring) draw(false, false); });      // fingering shows only while expanded

  progSection.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#add-prog')) { addToProg(); return; }
    var rm = e.target.closest ? e.target.closest('[data-prog-remove]') : null;
    if (rm) {
      var r = parseInt(rm.getAttribute('data-prog-remove'), 10);
      var gone = progChord(r);
      prog.splice(r, 1);
      saveProg();
      if (progIndex === r) progIndex = -1; else if (progIndex > r) progIndex--;
      draw(false, false);
      progStatus.textContent = 'Removed ' + gone.roman + '. ' + prog.length + ' left.';
      return;
    }
    var cb = e.target.closest ? e.target.closest('[data-prog]') : null;
    if (cb) {
      var i = parseInt(cb.getAttribute('data-prog'), 10);
      lightProg(i);
      var again = progList.querySelector('[data-prog="' + i + '"]');
      if (again) again.focus({ preventScroll: true });
      return;
    }
    if (e.target === progNext) stepProg(1);
    else if (e.target === progPrev) stepProg(-1);
    else if (e.target === progYes) {
      var mode = confirmMode, pid = pendingId;
      if (mode === 'delete') deleteCurrent();
      else if (mode === 'discard') { prog = []; saved.current = null; openSaved(pid); }
    }
    else if (e.target === progNo) { confirmMode = null; pendingId = null; updateProgPanel(); }
    else if (e.target === progCancel) { renaming = false; progName.value = ''; updateProgPanel(); }
    else if (e.target === progClear) {
      if (saved.current && !confirmed(progClear)) return;       // clearing a saved progression needs a second click
      prog = [];
      progIndex = -1;
      progRevealed = true;                       // it was on screen, so it stays (empty)
      saveProg();
      draw(false, false);
      progStatus.textContent = 'Progression cleared.';
    }
  });

  Array.prototype.forEach.call(kindInputs, function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) return;
      state.scaleKind = input.value;
      typePicked = false;
      chordCleared = false;
      state.chord = null;               // chord types differ per scale; the default is picked in draw()
      draw(false, false);
    });
  });

  Array.prototype.forEach.call(levelInputs, function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) return;
      level = input.value;
      syncStudyOptions();                           // Jazz studies chords only; Pop has all three activities
      if (level === 'jazz' && state.flash && state.cardMode !== 'chord') setFlashMode('chord');
      if (level === 'pop') {
        if (chordTypes_.full && POP_HIDDEN_TYPES.indexOf(chordTypes_.full) >= 0) chordTypes_.full = 'triad';
        if (state.scaleKind !== 'full') { state.scaleKind = 'full'; document.getElementById('sk-full').checked = true; chordCleared = false; state.chord = null; }
        else if (state.chord && POP_HIDDEN_TYPES.indexOf(state.chord.type) >= 0) state.chord = { deg: state.chord.deg, type: 'triad' };
      }
      if (quizOn()) { state.chord = null; typePicked = false; ftcNewQuestion(false); }    // the chord pool differs between levels
      updateScore();                    // also shows/hides the scale-type switch
      draw(false, false);
    });
  });

  Array.prototype.forEach.call(modeInputs, function (input) {
    input.addEventListener('change', function () {
      if (input.checked) setMode(input.value);
    });
  });

  Array.prototype.forEach.call(flashModeInputs, function (input) {
    input.addEventListener('change', function () {
      if (input.checked) setFlashMode(input.value);
    });
  });

  Array.prototype.forEach.call(viewInputs, function (input) {
    input.addEventListener('change', function () {
      if (input.checked) setView(input.value === 'flash');
    });
  });

  // Reset app settings: everything back to how a first visit looks (study weights, saved
  // progression, remembered key / chord / open sections, level, mode, score)
  var resetAppBtn = document.getElementById('reset-app');
  resetAppBtn.addEventListener('click', function () {
    restoring = true;                                  // no saves while the sections snap shut
    setTimeout(function () { restoring = false; }, 300);
    if (state.flash) setView(false);
    Weights.reset(weights);
    Weights.save(weights);
    FindChord.resetWeights(ftcW);
    FindChord.saveWeights(ftcW);
    prog = [];
    progIndex = -1;
    progRevealed = false;
    typePicked = false;
    chordCleared = false;
    saved = { items: [], current: null };
    renaming = false;
    confirmMode = null;
    pendingId = null;
    armed = null;
    try { window.localStorage.removeItem(PROG_KEY); window.localStorage.removeItem(SAVED_KEY); window.localStorage.removeItem(STATE_KEY); } catch (e) { /* storage unavailable */ }
    state.clef = 'treble';
    level = 'pop';
    document.getElementById('level-pop').checked = true;
    syncStudyOptions();
    resetFtc();
    state.mode = 'major';
    document.getElementById('mode-major').checked = true;
    state.scaleKind = 'full';
    document.getElementById('sk-full').checked = true;
    state.cardMode = 'key';
    document.getElementById('fm-key').checked = true;
    document.getElementById('view-explore').checked = true;
    sortBy = 'scale';
    typeSortBy = 'frequency';
    chordTypes_ = { full: 'triad', pentatonic: 'maj', wholetone: 'aug' };
    chordsDetails.open = false;
    progDetails.open = false;
    state.root = 0;
    state.spell = 0;
    state.selected = false;
    state.chord = null;
    score.ok = 0;
    score.bad = 0;
    lastResult = '';
    updateScore();
    draw('fade', false);
    resetAppBtn.textContent = 'App settings reset';
    setTimeout(function () { resetAppBtn.textContent = 'Reset app settings'; }, 1800);
  });

  scoreReset.addEventListener('click', function () {
    score.ok = 0;
    score.bad = 0;
    lastResult = '';
    updateScore();
  });

  resetBtn.addEventListener('click', reset);

  restoreState();
  syncStudyOptions();
  updateScore();
  draw(false, false);
})();
