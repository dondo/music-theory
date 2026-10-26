/* Page wiring: state, events, caption.
 *
 * TERMINOLOGY (what the player sees vs. what the code calls it). The UI says: a STAGE (a group of added keys or chords) is made of LEVELS,
 * shown as "Stage 1: Level 2" in Find the chord and "Level 2" in the other study activities. The code is older and still uses the
 * previous words, and was deliberately not renamed:
 *   - a UI "level" is a code "step": FindChord.levelInfo(...).step, FindChord.stageSteps, stepAdds, stepNote(), and in the clef ladder
 *     of Play/Find the note and Find the key / signature (STUDY_STEPS, stepLv, stepNo, cardStepNo, stepProgress, celebrateStep, STEP_CLEFS, slots, step-card CSS);
 *   - the code's "level" is the flat position in the whole ladder: FindChord.levelAt / levelCount, ftcLevelNo, ftcLv, ftcSetLevel (so
 *     "Stage 3: Level 2" is the code's level n, step 2 of stage 3). The older Pop/Jazz switch is also called `level` here (hidden state);
 *   - saved data keeps old names too (the 'step-' / 'note-' prefixes of Time Trial best keys); only the practice-log CSV header was changed to say `level`.
 * Only user-visible text (labels, banners, menus, README) uses the new words. */
(function () {
  'use strict';

  // what kind of device: a Mac names the key Option; a touch-only device (phone, tablet) has no keyboard to advertise shortcuts for
  var IS_MAC = (function () {
    try {
      var p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
      return /^mac/i.test(p) && !(navigator.maxTouchPoints > 1);          // (an iPad says "MacIntel" too, but has a touch screen)
    } catch (e) { return false; }
  })();
  var HAS_KEYBOARD = (function () {
    try { return !(window.matchMedia && window.matchMedia('(any-pointer: fine)').matches === false); } catch (e) { return true; }
  })();
  var ALT_NAME = IS_MAC ? 'Option' : 'Alt';
  var state = { chordView: 'scale', root: 0, mode: 'major', spell: 0, selected: false,
                flash: false, cardMode: 'key', card: null, answered: false, guess: null,
                chord: null,
                scaleKind: 'full', clef: 'treble', layout: 'horizontal' };                      // Explore: { deg: 0..6, type } = a chord on a degree of the key
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
  var qualityView = document.getElementById('quality-view'), cvGroup = document.getElementById('chordview-group');
  var qualityShown = null;                                   // the type whose table is in the page
  // Explore > Chord quality: with the Chords section open, a table of the qualities of the chosen type replaces the staff and keyboard
  function qualityOn() { return state.chordView === 'quality' && !state.flash && !isAlt() && state.selected && chordsDetails.open; }
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
  var APP_MODES = ['note', 'key', 'minor', 'chords', 'minorchords', 'theory', 'minortheory'];
  var appMode = 'note';                                // note | key | minor | chords | minorchords | theory | minortheory
  function chordy() { return appMode.indexOf('chords') >= 0 || appMode.indexOf('theory') >= 0; }
  function noteOn() { return appMode === 'note'; }
  function noteCardOn() { return noteOn() && state.flash && (state.cardMode === 'play' || state.cardMode === 'find'); }
  function theoryMode() { return appMode.indexOf('theory') >= 0; }          // Jazz level: roman numerals, 11ths/13ths, scale types, and the progression builder
  function appIsMinor() { return appMode.indexOf('minor') === 0; }
  var level = 'pop';                                  // pop | jazz: pop hides the advanced theory
  var POP_HIDDEN_TYPES = ['11', '13'];
  var levelInputs = document.querySelectorAll('input[name="level"]');
  var modeHeadTip = document.getElementById('mode-head-tip');
  var MODE_TIP = modeHeadTip.textContent;
  var POP_DEG_TIP = 'The chord built on each note of the key, named as on a lead sheet (the roman numeral is in the chip\u2019s accessible name).';
  var degLabel = document.getElementById('lbl-deg');
  var sortBy = 'scale';                               // mode chip order: scale | brightness | frequency
  var chordsDetails = document.getElementById('chords-details');
  var typePicked = false;                             // a type chip was pressed (before any degree): show it as selected
  var chordCleared = false;                           // user toggled the chord off while the panel is open
  var chordTypes_ = { full: 'triad', pentatonic: 'maj', wholetone: 'aug' };   // last chosen chord type per scale type
  var score = { ok: 0, bad: 0 };
  // study cards: each key / note (and, in Notes, each octave of a note) has its own memory: when it was last asked, how long it
  // takes to fade, how fast you answered. The next card is drawn by how likely you are to have forgotten it (js/memory.js).
  var CARD_MEM_KEY = 'music-theory-cards-mem-v1', OLD_WEIGHTS_KEY = 'keysig-flashcard-weights-v1';
  var cardMem = Memory.load(CARD_MEM_KEY);
  var cardT0 = null, cardTimed = false;               // when the card went up; false when the page was hidden meanwhile (the time can't be trusted)
  function startCardClock(trusted) { cardT0 = performance.now(); cardTimed = trusted !== false && !document.hidden; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) cardTimed = false; });
  function cardMemKey() {
    var c = state.card;
    if (noteOn()) return (state.cardMode === 'find' ? 'find|' : 'play|') + c.idx;
    return (state.cardMode === 'sig' ? 'sig|' : 'key|') + state.mode + '|' + c.pc;
  }
  // the first try at a card counts (later tries at the same card don't)
  function memRecord(correct) {
    if (missedThisCard || !state.card) return;
    var key = cardMemKey();
    Memory.answer(cardMem, key, key.split('|')[0], correct, cardTimed && cardT0 != null ? performance.now() - cardT0 : null, Date.now());
    Memory.save(CARD_MEM_KEY, cardMem);
  }
  var missedThisCard = false;
  var lastResult = '';                                // for the screen-reader caption

  var stage = document.getElementById('stage');
  var caption = document.getElementById('caption');
  var resetBtn = document.getElementById('reset');
  var modeInputs = document.querySelectorAll('input[name="mode"]');
  var viewInputs = document.querySelectorAll('input[name="view"]');
  var kindInputs = document.querySelectorAll('input[name="scalekind"]');
  var kindGroup = document.getElementById('scalekind-group');
  var layoutBar = document.getElementById('layout-bar');
  var layoutDial = document.getElementById('layout-dial');
  var pendingLayout = null;                 // 'in' | 'out': the layout animation the next draw() runs
  var scoreBox = document.getElementById('score');
  var scoreHome = scoreBox.parentNode;                 // (Find the chord shows it in the chord info instead, after the first guess)
  var okEl = document.getElementById('n-ok');
  var badEl = document.getElementById('n-bad');
  var scoreReset = document.getElementById('score-reset');
  var chordsPanel = document.getElementById('chords');
  var chordDegrees = document.getElementById('chord-degrees');
  var chordTypes = document.getElementById('chord-types');
  var chordInfo = document.getElementById('chord-info');
  var autoRow = document.getElementById('ftc-autorow');
  var phoneMq = window.matchMedia ? window.matchMedia('(max-width: 600px), (max-height: 500px) and (pointer: coarse)') : null;
  function isPhoneLayout() { return !!(phoneMq && phoneMq.matches); }
  var levelTag = document.getElementById('ftc-level');
  var quizHead = el('div', 'ftc-head');                         // Find the chord: "Level n" then the score, top left of the grey box
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
    if (noteOn()) {
      var t;
      if (!state.flash) t = 'Two octaves from middle C, a half step at a time, spelled with ' + (noteSpell ? 'flats' : 'sharps') + ' (switch above). Click a key or a note to light it up.';
      else if (state.answered) t = lastResult + ' Press Next for another note.';
      else if (state.cardMode === 'play') t = (lastResult ? lastResult + ' ' : '') + 'Study: play the note shown on the staff, in any octave.';
      else t = (lastResult ? lastResult + ' ' : '') + 'Study: one key is lit on the keyboard. Click its note on the staff.';
      caption.appendChild(el('p', 'cap-hint', t));
      return;
    }
    if (quizOn() && state.card) {
      caption.appendChild(el('p', 'cap-hint', 'Study: find the chord shown on the staff, in the key of ' + Theory.keyTitle(currentSpec(), state.mode) +
        ftcHintTail()));
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


  // Chord quality: arrows at the edges when the table scrolls sideways
  function updateQMore() {
    var wrap = qualityView.querySelector('.q-wrap'); if (!wrap) return;
    var l = qualityView.querySelector('.q-more-l'), r = qualityView.querySelector('.q-more-r');
    l.hidden = !(wrap.scrollLeft > 2);
    r.hidden = !(wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 2);
  }
  qualityView.addEventListener('scroll', updateQMore, true);
  qualityView.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.q-more'); if (!b) return;
    var wrap = qualityView.querySelector('.q-wrap');
    wrap.scrollBy({ left: (b.classList.contains('q-more-l') ? -1 : 1) * wrap.clientWidth * 0.7, behavior: 'smooth' });
  });
  window.addEventListener('resize', updateQMore);
  // ---- chord selector ---------------------------------------------------------
  function updateChordPanel() {
    var show = chordy() && state.selected && (!state.flash || quizOn());
    chordsPanel.hidden = !show;
    var qOn = qualityOn();
    cvGroup.hidden = !(show && !state.flash && chordsDetails.open && !isAlt());
    document.getElementById(state.chordView === 'quality' ? 'cv-quality' : 'cv-scale').checked = true;
    stage.classList.toggle('chords-open', !!(show && chordsDetails.open) || noteOn());
    stage.hidden = qOn; qualityView.hidden = !qOn; caption.hidden = qOn;
    if (qOn) { layoutBar.hidden = true; resetBtn.hidden = true; var qt = curType(); if (qualityShown !== qt) { qualityView.innerHTML = Quality.table(qt); qualityShown = qt; }
      updateQMore(); }
    else qualityShown = null;
    chordInfo.hidden = qOn;
    var canFind = show && !state.flash && chordsDetails.open && !qOn;          // "Find a chord" lives in the open selector
    findBtn.hidden = !canFind;
    if (!canFind && findOn) { findOn = false; picks = []; }
    findBtn.setAttribute('aria-pressed', findOn ? 'true' : 'false');
    var active = show && state.chord;
    Array.prototype.forEach.call(legendChord, function (li) { li.hidden = !active; });
    if (!show) return;
    var alt = isAlt();
    var rootName = currentSpec().name;
    document.getElementById('chords-summary').textContent = qualityOn() ? 'Chord quality (tables are in C)' : 'Chords in the key of ' + rootName + (state.mode === 'minor' ? ' minor' : '');
    var sc = alt ? altScale() : null;
    var type = curType();

    chordDegrees.textContent = '';
    var n = alt ? sc.offsets.length : 7;
    var pop = level === 'pop';
    degLabel.textContent = alt ? 'Chord on' : (pop ? 'Chord' : 'Mode');
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
    // Find the chord: only the degrees and types that can come up at the current chords level are offered
    var inPlay = quizOn() && !alt ? FindChord.chords(state.mode, ftcPop(), ftcLevels().chords) : null;
    function degInPlay(dd) { return !inPlay || inPlay.some(function (c) { return c.deg === dd; }); }
    function typeInPlay(id) { return !inPlay || inPlay.some(function (c) { return c.type === id; }); }
    var popQuiz = quizOn() && !alt && pop;                   // Pop Find the chord: root, quality and seventh rows replace the degree row
    if (popQuiz || qOn) order = [];
    chordDegrees.closest('.chord-row').hidden = qOn;
    degLabel.textContent = popQuiz ? 'Quality' : degLabel.textContent;
    if (popQuiz) modeHeadTip.textContent = 'dim, min (minor), maj (major) or aug. For a 7th, 9th, 11th or 13th chord on a major (or augmented) triad, also choose maj (Cmaj7) or dom (C7).';
    for (var oi = 0; oi < order.length; oi++) {
      var d = order[oi];
      if (!degInPlay(d)) continue;
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
        if (pop) b.appendChild(el('span', 'chip-num', c.symbol));                  // Pop: chord symbols (Am), as on a lead sheet
        else { b.appendChild(el('span', 'chip-num', c.roman)); b.appendChild(el('span', 'chip-sym', hideSym ? '\u00a0' : c.symbol)); }
        if (!pop) b.appendChild(el('span', 'chip-mode', c.mode));
      }
      chordDegrees.appendChild(b);
    }
    if (popQuiz) buildPopRows(chordDegrees);
    else { document.getElementById('root-row').hidden = true; document.getElementById('sev-row').hidden = true; }
    chordTypes.textContent = '';
    var typeRow = chordTypes.closest ? chordTypes.closest('.chord-row') : null;
    if (typeRow) typeRow.hidden = !alt && ftcTypesHidden();               // Find the chord: no TYPE row until a chord that is not a triad is in play
    var types = alt ? Chords.ALT_TYPES.filter(function (t) {
      for (var i = 0; i < sc.offsets.length; i++) if (Chords.chordInScale(sc, i, t.id)) return true;
      return false;
    }) : Chords.TYPES.filter(function (t) { return (!pop || POP_HIDDEN_TYPES.indexOf(t.id) < 0) && typeInPlay(t.id) && !(qOn && t.id === 'sus2'); });   // (the quality view shows Sus2 and Sus4 together)
    if (qOn && !alt) {                                  // Chord quality: its own teaching order
      var QORDER = ['triad', 'sus4', 'sus2', 'add9', '7', '9', '11', '13'];
      types = types.slice().sort(function (x, y) { return QORDER.indexOf(x.id) - QORDER.indexOf(y.id); });
    } else if (!alt && typeSortBy !== 'complexity') {         // stable sort: ties keep the complexity (list) order
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
      var tb = el('button', 'chip chip-type', qOn && t.id === 'sus4' ? 'Sus' : t.label);
      if (popQuiz) { if (ti < 8) { tb.setAttribute('data-key', String(ti + 1)); tb.setAttribute('aria-keyshortcuts', String(ti + 1)); } }
      else if (ti < TYPE_KEYS.length) { tb.setAttribute('data-key', TYPE_KEYS.charAt(ti).toUpperCase()); tb.setAttribute('aria-keyshortcuts', TYPE_KEYS.charAt(ti)); }
      tb.type = 'button';
      tb.setAttribute('data-type', t.id);
      tb.setAttribute('aria-pressed', (state.chord || typePicked || qOn) && (type === t.id || (qOn && t.id === 'sus4' && type === 'sus2')) ? 'true' : 'false');   // nothing is pre-selected
      chordTypes.appendChild(tb);
    });

    var firstRow = chordsDetails.querySelector('.chord-row'), infoHome = document.getElementById('chord-sound');
    if (quizOn()) { if (chordInfo.nextSibling !== firstRow) chordsDetails.insertBefore(chordInfo, firstRow); }      // Find the chord: the progress row leads the box
    else if (chordInfo.nextSibling !== infoHome) chordsDetails.insertBefore(chordInfo, infoHome);
    chordInfo.classList.toggle('quiz', quizOn());
    chordInfo.textContent = '';
    var scoreHere = quizOn() && (score.ok + score.bad > 0 || !!ftcTrial);       // Find the chord: after the first guess the score replaces the instruction
    var showHead = quizOn() && (scoreHere || isPhoneLayout());       // (on a phone the level and the bubbles show from the start)
    if (showHead) {
      quizHead.appendChild(levelTag);
      quizHead.appendChild(scoreBox); scoreBox.hidden = false;
      quizHead.appendChild(trialBox);
      quizHead.appendChild(autoRow);
      autoRow.hidden = !!ftcTrial;
      chordInfo.appendChild(quizHead);
    } else if (scoreBox.parentNode !== scoreHome) scoreHome.appendChild(scoreBox);
    if (quizOn()) {                                              // Find the chord: no chord description; the level controls sit below the score
      if (!scoreHere) {                                          // before the first guess: the instruction
        chordInfo.appendChild(el('p', 'chord-hint', ftcHint()));
        return;
      }
      return;
    }
    if (!state.chord) {
      chordInfo.appendChild(el('p', 'chord-hint', findOn ? findHint() : quizOn() ? (ftcHint()) : alt
        ? 'Pick a note to light up the chord built on it, then try the other types. Only chords whose notes all belong to this scale are offered.'
        : (level === 'pop' ? 'Pick a type and a chord to light it up on the keyboard. Each chip shows the chord name for the chosen type.' : 'Pick a type and a degree to light up the chord on the keyboard. Each chip shows the roman numeral and chord name for the chosen type.')));
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

  // Pop Find the chord: Root (a one-octave keyboard), Quality (dim / min / maj / aug) and, for a major or augmented 7th-and-up, maj or dom
  var POP_QUALS = [['dim', 'dim', 'P'], ['min', 'min', '['], ['maj', 'maj', ']'], ['aug', 'aug', '\\']];
  var POP_SEVS = [['maj', 'maj', ';'], ['dom', 'dom', '\'']];
  var WHITE_PCS = [0, 2, 4, 5, 7, 9, 11], WHITE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], BLACKS = [[1, 1, 'C\u266F', 'D\u266D'], [3, 2, 'D\u266F', 'E\u266D'], [6, 4, 'F\u266F', 'G\u266D'], [8, 5, 'G\u266F', 'A\u266D'], [10, 6, 'A\u266F', 'B\u266D']];
  function buildPopRows(qualBox) {
    POP_QUALS.forEach(function (q) {
      var b = el('button', 'chip chip-qual', q[1]);
      b.type = 'button'; b.setAttribute('data-qual', q[0]); b.setAttribute('data-key', q[2]); b.setAttribute('aria-keyshortcuts', q[2]);
      b.setAttribute('aria-pressed', ftcSel.qual === q[0] ? 'true' : 'false');
      qualBox.appendChild(b);
    });
    var rootBox = document.getElementById('chord-root'), sevBox = document.getElementById('chord-sev');
    rootBox.textContent = '';
    WHITE_PCS.forEach(function (pc, i) {
      var b = el('button', 'rk white', WHITE_NAMES[i]);
      b.type = 'button'; b.setAttribute('data-root', pc); b.style.left = (i * 44) + 'px'; b.setAttribute('aria-label', WHITE_NAMES[i]);
      b.setAttribute('aria-pressed', ftcSel.root === pc ? 'true' : 'false');
      rootBox.appendChild(b);
    });
    BLACKS.forEach(function (k) {
      var b = el('button', 'rk black');
      b.type = 'button'; b.setAttribute('data-root', k[0]); b.style.left = (k[1] * 44 - 14) + 'px'; b.setAttribute('aria-label', k[2] + ' or ' + k[3]);
      b.appendChild(el('span', null, k[2])); b.appendChild(el('span', null, k[3]));
      b.setAttribute('aria-pressed', ftcSel.root === k[0] ? 'true' : 'false');
      rootBox.appendChild(b);
    });
    if (HAS_KEYBOARD && !rootBox.nextElementSibling) rootBox.parentNode.appendChild(el('p', 'rootkeys-note', 'Keyboard: A\u2013G for the root; Shift for sharp, ' + ALT_NAME + ' for flat.'));
    document.getElementById('root-row').hidden = false;
    var needSev = ['7', '9', '11', '13'].indexOf(ftcSel.type) >= 0;           // (shown as soon as a seventh-or-more type is chosen; only a major or augmented chord needs the answer)
    sevBox.textContent = '';
    document.getElementById('sev-row').hidden = !needSev;
    if (needSev) POP_SEVS.forEach(function (q) {
      var b = el('button', 'chip chip-sev', q[1]);
      b.type = 'button'; b.setAttribute('data-sev', q[0]); b.setAttribute('data-key', q[2]); b.setAttribute('aria-keyshortcuts', q[2]);
      b.setAttribute('aria-pressed', ftcSel.sev === q[0] ? 'true' : 'false');
      if (ftcSel.qual === 'min' || ftcSel.qual === 'dim') { b.disabled = true; b.title = 'A minor or diminished chord has no maj/dom choice'; }     // (nothing to choose: the answer is complete)
      sevBox.appendChild(b);
    });
  }

  modeSortSel.addEventListener('change', function () { sortBy = modeSortSel.value; updateChordPanel(); });
  typeSortSel.addEventListener('change', function () { typeSortBy = typeSortSel.value; updateChordPanel(); });

  chordsPanel.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    if (quizOn()) {                                      // Find the chord: the second pick is the guess
      var kind = ['deg', 'type', 'root', 'qual', 'sev'].filter(function (k) { return b.hasAttribute('data-' + k); })[0];
      if (!kind) return;
      var raw = b.getAttribute('data-' + kind);
      ftcPick(kind, kind === 'deg' || kind === 'root' ? parseInt(raw, 10) : raw);
      var kept = chordsPanel.querySelector('button[data-' + kind + '="' + raw + '"]');
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

  cvGroup.addEventListener('change', function (e) {
    state.chordView = e.target.value === 'quality' ? 'quality' : 'scale';
    saveState();
    draw(false, false);
  });

  // the Chords and Progressions sections no longer collapse
  [chordsDetails, progDetails].forEach(function (d) { d.querySelector('summary').addEventListener('click', function (e) { if (!e.target.closest('select, button, input, a')) e.preventDefault(); }); });
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

  var pendingStudy = null;
  var reopening = false;                    // true while a reload reopens the Study view
  var resumeQ = null;                       // a saved Study question, used once by the next newCard / ftcNewQuestion
  function saveState() {
    if (restoring) return;
    try {
      var o;
      if (state.flash) {          // Study: the Explore picks are kept as they were; only what is shared and the Study view itself change
        try { o = JSON.parse(window.localStorage.getItem(STATE_KEY)); } catch (e) { o = null; }
        o = Object.assign(o && typeof o === 'object' ? o : {}, { mode: state.mode, level: level, appMode: appMode, layout: state.layout, clef: state.clef });
      } else {
        o = {
          root: state.root, spell: state.spell, selected: state.selected, mode: state.mode, level: level,
          scaleKind: state.scaleKind, chord: state.chord, chordTypes: chordTypes_, typePicked: typePicked,
          chordsOpen: chordsDetails.open, progOpen: progDetails.open, progIndex: progIndex, progRevealed: progRevealed, clef: state.clef,
          layout: state.layout, chordView: state.chordView, appMode: appMode, noteSpell: noteSpell
        };
      }
      o.flash = !!state.flash;
      o.cardMode = state.cardMode;
      delete o.q;
      if (state.flash && !state.answered) {            // the open question, so a reload cannot be used to swap it
        if (quizOn() && ftcQ) o.q = { mode: state.mode, cardMode: 'chord', pc: ftcQ.pc, spell: ftcQ.spell, deg: ftcQ.deg, type: ftcQ.type, inv: ftcQ.inv, missed: ftcMissed };
        else if (!quizOn() && state.card) o.q = { mode: state.mode, cardMode: state.cardMode, pc: state.card.pc, spell: state.card.spell, missed: missedThisCard };
      }
      window.localStorage.setItem(STATE_KEY, JSON.stringify(o));
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
    if (s.layout === 'vertical') { state.layout = 'vertical'; syncDial(); }
    if (s.mode === 'minor') { state.mode = 'minor'; document.getElementById('mode-minor').checked = true; }
    if (s.level === 'jazz') { level = 'jazz'; document.getElementById('level-jazz').checked = true; }
    if (APP_MODES.indexOf(s.appMode) >= 0) appMode = s.appMode;
    else if (s.appMode === 'popchord') appMode = s.mode === 'minor' ? 'minorchords' : 'chords';      // (older saves)
    else if (s.appMode === 'jazz') appMode = s.mode === 'minor' ? 'minortheory' : 'theory';
    else appMode = level === 'jazz' ? (s.mode === 'minor' ? 'minortheory' : 'theory') : (s.mode === 'minor' ? 'minorchords' : 'chords');
    level = theoryMode() ? 'jazz' : 'pop';
    document.getElementById('level-' + level).checked = true;
    state.mode = appIsMinor() ? 'minor' : 'major';
    document.getElementById('mode-' + state.mode).checked = true;
    document.getElementById('am-' + appMode).checked = true;
    syncModeBtn();
    var kinds = { full: 'sk-full', pentatonic: 'sk-pent', wholetone: 'sk-whole' };
    if (level === 'jazz' && kinds[s.scaleKind]) { state.scaleKind = s.scaleKind; document.getElementById(kinds[s.scaleKind]).checked = true; }
    if (s.chordView === 'quality') state.chordView = 'quality';
    if (s.noteSpell === 1) noteSpell = 1;
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
    if (s.flash && FM_IDS[s.cardMode]) {
      var pm = s.cardMode;
      pendingStudy = chordy() ? 'chord' : noteOn() ? (pm === 'find' ? 'find' : 'play') : (pm === 'sig' ? 'sig' : 'key');
    }
    var rq = s.q;
    if (pendingStudy && rq && rq.cardMode === pendingStudy && rq.mode === state.mode && Number.isInteger(rq.pc) && rq.pc >= 0 && rq.pc < 12 &&
        Number.isInteger(rq.spell) && rq.spell >= 0 && rq.spell < Theory.specsFor(state.mode, rq.pc).length &&
        (rq.cardMode !== 'chord' || (Number.isInteger(rq.deg) && rq.deg >= 0 && rq.deg < 7 && typeIds('full').indexOf(rq.type) >= 0 && Number.isInteger(rq.inv) && rq.inv >= 0 && rq.inv < 7))) resumeQ = rq;      // Study view: reopened once everything is set up (below)
    typePicked = !!s.typePicked;
    progRevealed = !!s.progRevealed;
    if (Number.isInteger(s.progIndex) && s.progIndex >= 0 && s.progIndex < prog.length) progIndex = s.progIndex;
    chordsDetails.open = true;                        // (these two sections no longer collapse)
    progDetails.open = true;
  }

  // ---- progression helpers ---------------------------------------------------
  // if the lit chord was changed by hand it is no longer 'the progression's chord'
  function syncProgIndex() {
    if (progIndex >= 0 && (!state.chord || !prog[progIndex] || state.chord.deg !== prog[progIndex].deg ||
        state.chord.type !== prog[progIndex].type)) progIndex = -1;
  }

  // Find a chord (switched on, selector open): keys below the root stay dark, so the root is the leftmost lit key.
  function findActive() { return !!(findOn && state.selected && !state.flash && chordsDetails.open); }

  // suggested left-hand voicings for the whole progression in the current key and keyboard window
  var planCache = { key: '', plan: [] };
  function getPlan() {
    var key = state.root + '|' + state.mode + '|' + JSON.stringify(prog);
    if (planCache.key !== key) {
      var range = KeyboardRender.windowRange(state.root);
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
    var win = KeyboardRender.windowRange(state.root, 2);
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
    var r = KeyboardRender.windowRange(state.root);
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
  var ftcNextBtn = document.getElementById('ftc-next');
  function syncNext() { ftcNextBtn.hidden = !(quizOn() && state.answered && !chordsPanel.hidden); }
  ftcNextBtn.addEventListener('click', function (e) { nextCard(e.detail === 0); });
  function syncSound() {
    var ok = state.selected && (!state.flash || quizOn());
    var canHold = ok && !!state.chord && !qualityOn() && chordsDetails.open && !chordsPanel.hidden && !(quizOn() && state.answered);      // (Find the chord: no sound button once solved)
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
    var visible = theoryMode() && state.selected && !state.flash && !isAlt() && !qualityOn();   // Chord theory: the section is simply there once a key is picked
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
  var STAFF_FADE_MS = 350;
  var SLIDE_MS = 520;
  var EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';
  var slideDone = null;                       // cancels a slide in progress

  function endSlide() { if (slideDone) { slideDone(); slideDone = null; } }

  // Slide from the keyboard that is on screen (`oldSvg`) to the freshly drawn one so the
  // clicked key (`oldKey`) glides to the left edge. Both drawings are aligned on the key
  // and move together; the old one slides out on the left, the new one slides in.
  function slide(oldSvg, oldKeyLeft, newSvg) {
    var newRoot = newSvg.querySelector('.key[data-s="' + state.root + '"]');
    if (oldKeyLeft == null || !newRoot || !oldSvg.animate) return;
    var dx = oldKeyLeft - newRoot.getBoundingClientRect().left;
    if (Math.abs(dx) < 1 && !(oldSvg.querySelector('.stave') && newSvg.querySelector('.stave'))) return;      // (with a staff the key still changes: the same cross-fade, the keyboard just stays)
    var rect = newSvg.getBoundingClientRect();
    var pad = rect.width * (KeyboardRender.PAD / KeyboardRender.WIDTH);

    oldSvg.setAttribute('aria-hidden', 'true');
    oldSvg.style.cssText = 'position:absolute;left:' + newSvg.offsetLeft + 'px;top:' + newSvg.offsetTop +
      'px;width:' + rect.width + 'px;pointer-events:none;';
    stage.insertBefore(oldSvg, newSvg);       // old one underneath, new one on top
    stage.classList.add('sliding');
    stage.style.clipPath = 'inset(0 ' + pad + 'px 0 ' + pad + 'px)';

    // with a staff: the keyboard slides first (the old key's staff stays put), then the old staff fades out as the new one fades in
    var newStave = newSvg.querySelector('.stave'), oldStave = oldSvg.querySelector('.stave');
    var tail = newStave && oldStave ? STAFF_FADE_MS : 0;
    var opts = { duration: SLIDE_MS, easing: EASE, fill: 'both' };
    var a1, a2, a3 = null, extra = [], lastAnim;
    if (tail) {
      // With a staff, the drawings themselves stay put and their parts move: the keyboard slides, the old notes ride with it
      // (through a window that does not move, so they vanish at the key signature), and the staff frame never moves at all.
      var u2 = KeyboardRender.WIDTH / rect.width, fade = { duration: Math.round(SLIDE_MS * 0.85), fill: 'both', easing: EASE };          // (the cross-fade starts with the slide and completes just before it ends, on the same curve; notes and key signature share it)
      var q = function (svg, sel) { return Array.prototype.slice.call(svg.querySelectorAll(sel)); };
      var move = function (g, from, to) { return g.animate([{ transform: 'translateX(' + from * u2 + 'px)' }, { transform: 'translateX(' + to * u2 + 'px)' }], opts); };
      q(oldSvg, '.keys-slide').forEach(function (g) { a1 = move(g, 0, -dx); extra.push(a1); });
      q(newSvg, '.keys-slide').forEach(function (g) { a2 = move(g, dx, 0); extra.push(a2); });
      // the old notes travel with the keyboard, slowed so that they arrive together, ending where they line up with the new notes (a whole number of slots on), so the cross-fade needs no further movement
      var ow = oldSvg.querySelector('.stave-notes-wrap'), nw = newSvg.querySelector('.stave-notes-wrap');
      var D = dx * u2, S = D;
      if (ow && nw && +ow.getAttribute('data-slot') > 0) {
        var slotU = +ow.getAttribute('data-slot'), base = +ow.getAttribute('data-startx') - +nw.getAttribute('data-startx');
        var mm = (D - base) / slotU, kk = mm >= 0 ? Math.floor(mm) : Math.ceil(mm);
        S = base + kk * slotU;
        if (Math.abs(D) >= 1 && (S * D < 0 || Math.abs(S) > Math.abs(D))) S = 0;
      }
      q(oldSvg, '.stave-notes').forEach(function (g) { extra.push(move(g, 0, -S / u2)); });
      q(newSvg, '.stave-notes').forEach(function (g) { extra.push(move(g, S / u2, 0)); });   // the new notes slide in alongside the old ones, in step with them throughout   // (the same easing over the same time, just a shorter way: they arrive together)
      q(oldSvg, '.stave-under').forEach(function (g) { g.style.display = 'none'; });
      // the notes, the key and its signature all cross-fade while the keyboard slides
      var fadeNotes = fade;
      q(oldSvg, '.stave-notes-wrap').forEach(function (g) { extra.push(g.animate([{ opacity: 1 }, { opacity: 0 }], fadeNotes)); });
      q(newSvg, '.stave-notes-wrap, .stave-under').forEach(function (g) { extra.push(g.animate([{ opacity: 0 }, { opacity: 1 }], fadeNotes)); });
      q(oldSvg, '.stave-sig').forEach(function (g) { extra.push(g.animate([{ opacity: 1 }, { opacity: 0 }], fade)); });
      q(newSvg, '.stave-sig').forEach(function (g) { var sa = g.animate([{ opacity: 0 }, { opacity: 1 }], fade); extra.push(sa); lastAnim = lastAnim || sa; });
      q(newSvg, '.stave-lines').forEach(function (g) { extra.push(g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: SLIDE_MS, fill: 'both' })); });   // (the same lines as the old staff's)
      lastAnim = a2 || lastAnim;                                    // (the slide itself ends the whole thing)
      a1 = a1 || { cancel: function () {} }; a2 = a2 || { cancel: function () {} };
    } else {
      a1 = oldSvg.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dx) + 'px)' }], opts);
      a2 = newSvg.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'translateX(0)' }], opts);
      lastAnim = a2;
      // flashcard: the signature card stays put while the keyboard slides under it
      var newCard = newSvg.querySelector('.flashcard, .sigcard');
      if (newCard) {
        var oldCard = oldSvg.querySelector('.flashcard, .sigcard');
        if (oldCard) oldCard.style.display = 'none';
        var units = KeyboardRender.WIDTH / rect.width;          // screen px -> SVG user units
        a3 = newCard.animate([{ transform: 'translateX(' + (-dx * units) + 'px)' }, { transform: 'translateX(0)' }], opts);
      }
    }
    var finished = false;
    function done() {
      if (finished) return;
      finished = true;
      a1.cancel(); a2.cancel(); if (a3) a3.cancel(); extra.forEach(function (x) { x.cancel(); });
      if (oldSvg.parentNode === stage) stage.removeChild(oldSvg);
      stage.classList.remove('sliding');
      newSvg.style.overflow = '';
      stage.style.clipPath = '';
    }
    slideDone = done;
    lastAnim.onfinish = function () { done(); if (slideDone === done) slideDone = null; };
    return true;
  }

  // The keyboard did not move (e.g. F -> G: both start on F) but the signature boxes change octaves
  // (flat keys on the left <-> sharp keys on the left): cross-fade them in place.
  function boxSwap(oldSvg, newSvg) {
    var opts = { duration: 675, easing: 'ease-in-out' };
    function list(svg) {
      return Array.prototype.map.call(svg.querySelectorAll('.box'), function (b) {
        return { el: b, key: b.dataset.pc + '/' + b.dataset.spell, x: +b.querySelector('rect').getAttribute('x'), extra: !!b.closest('.xbox') };
      });
    }
    function lineOf(b) { var l = b.previousElementSibling; return l && l.tagName.toLowerCase() === 'line' ? l : null; }
    var olds = list(oldSvg), news = list(newSvg);
    // vertical layout: the same boxes sit in the same places, so they stay put (the new key's box is just highlighted)
    if (olds.some(function (o) { return o.extra; }) || news.some(function (n) { return n.extra; })) return;
    function same(arr, o) { return arr.some(function (b) { return b.key === o.key && Math.abs(b.x - o.x) < 1; }); }
    var ghost = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    ghost.setAttribute('pointer-events', 'none');
    news.forEach(function (n) {
      if (same(olds, n)) return;
      n.el.animate([{ opacity: 0 }, { opacity: 1 }], opts);
      var ln = lineOf(n.el);
      if (ln) ln.animate([{ opacity: 0 }, { opacity: 1 }], opts);
    });
    olds.forEach(function (o) {
      if (same(news, o)) return;
      var gl = lineOf(o.el), gg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      gg.innerHTML = (gl ? gl.outerHTML : '') + o.el.outerHTML;
      gg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: opts.duration, easing: opts.easing, fill: 'forwards' });
      ghost.appendChild(gg);
    });
    newSvg.appendChild(ghost);
    setTimeout(function () { ghost.remove(); }, opts.duration + 50);
  }

  // what the big stave shows: the progression (Progressions open), else the selected chord and its inversions (Chords open)
  // Notes: the run from middle C up an octave, a half step at a time (explore, find the note), or one note (play the note)
  function buildNoteStaff() {
    var clefId = state.flash ? cardClefId() : (clefAllowed(state.clef) ? state.clef : 'treble'), fixedClef = state.flash && cardStepNo() >= 2;
    var base = 60 + 12 * Math.round((KeyboardRender.CLEFS.filter(function (c) { return c.id === clefId; })[0].mid - 72) / 12);            // the two-octave run sits around the middle of the clef (middle C up in treble); the notation only, the keyboard stays put
    var flash = state.flash, card = state.card, answered = !!state.answered;
    if (flash && state.cardMode === 'play') {
      if (!card) return { kind: 'empty', clef: clefId, chords: [] };
      return { kind: 'notes', clef: clefId, fixedClef: fixedClef, slot: 260, chords: [{ notes: [{ midi: base + card.idx, name: card.name }], top: answered ? card.name : '', sub: '', lit: false }] };
    }
    var chords = [], sp = flash ? (card ? card.spell : 0) : noteSpell;
    for (var i = 0; i <= 24; i++) {
      var nm = (sp ? NOTE_FLAT : NOTE_SHARP)[i % 12];
      var lit = flash ? (answered && card && i === card.idx) : (noteSel != null && i === noteSel);
      var show = !flash || answered;                    // find the note: the names stay hidden until it is solved
      chords.push({ notes: [{ midi: base + i, name: nm }], top: show || lit ? nm : '', sub: '', lit: lit });
    }
    return { kind: 'notes', clef: clefId, fixedClef: fixedClef, chords: chords, hits: true };
  }

  function buildStaff() {
    if (!state.selected || state.flash || !chordy()) return null;      // (the stave belongs to the chord modes)
    var progOpen = progDetails.open && theoryMode();          // (the Progressions section belongs to the chord theory topics; Chords shows the chosen chord)
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
      var lm = tonic + (Math.min.apply(null, picks) - state.root), bi = -1, bd = 1e9;
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
    syncSlot();
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
    state.rootFirst = findActive();
    state.noteMode = noteOn();
    state.clefId = state.flash && !noteOn() && !chordy() && state.card && (state.cardMode === 'key' || state.cardMode === 'sig') ? cardClefId() : null;      // Find the key / signature: the clef of the step
    state.noteSpell = noteSpell;
    document.getElementById('notespell-group').hidden = !(noteOn() && !state.flash);
    document.getElementById(noteSpell ? 'ns-flat' : 'ns-sharp').checked = true;
    state.noteLit = null;
    if (noteOn()) {
      state.mode = 'major'; state.root = 0; state.spell = 0;
      state.noteLit = state.flash ? (state.cardMode === 'find' && state.card ? state.card.idx : null) : noteSel;
      state.staff = buildNoteStaff();
    } else state.staff = buildStaff();
    layoutBar.hidden = !!state.flash || noteOn() || !!(state.staff && state.selected);       // the signature boxes only show when no stave replaces them
    state.quizStave = quizOn() && state.answered && state.card && state.card.chord ? buildQuizStave() : null;
    var ghosts = pendingLayout === 'out' && oldSvg ? Array.prototype.map.call(oldSvg.querySelectorAll('.xbox'), function (g) { return g.outerHTML; }).join('') : '';
    stage.innerHTML = KeyboardRender.render(quizOn() ? Object.assign({}, state, { selected: false }) : state);
    if (ftcTrial && ftcTrial.view) ftcTrial.view();                       // (a countdown or the trial results fills the stage)
    if (levelBanner.hasAttribute('data-welcome')) {                        // a welcome belongs to its own study activity: leaving it takes the banner away
      var wk = levelBanner.getAttribute('data-welcome');
      if (!state.flash || state.cardMode !== (wk === '1' ? 'chord' : wk)) dismissWelcome();
    }
    if (!((quizOn() || studyQuizOn()) && state.answered) && !bannerHold) levelBanner.hidden = true;        // the level-up note stays until the next question
    if (!quizOn()) maybeStudyWelcome();
    resetBtn.hidden = noteOn() || !state.selected || (state.flash && state.cardMode === 'sig') || quizOn();
    updateCaption();
    updateChordPanel();
    updateFtc();
    updateProgPanel();
    syncSound();
    var svg = stage.firstElementChild;
    if (quizOn() && state.answered && !stageAnswered) centerStage = 'open';      // the staff has just opened out
    stageAnswered = quizOn() && state.answered;
    if (centerStage) { var how = centerStage; centerStage = false; centreQuizStage(how); }
    if (svg && pendingLayout === 'in') layoutIn(svg);
    else if (svg && ghosts) layoutOut(svg, ghosts);
    if (anim && svg && !reduceMotion) {
      if (anim === 'fade') fade(svg);
      else if (oldKeyLeft != null && !slide(oldSvg, oldKeyLeft, svg)) boxSwap(oldSvg, svg);   // old drawing is re-attached for the slide
    }
    if (focusRoot) {
      var k = stage.querySelector('.key[data-s="' + state.root + '"]');
      if (k) k.focus({ preventScroll: true });
    }
    saveState();
    syncNext();
  }

  // ---- actions --------------------------------------------------------------
  // Root the keyboard on pitch class `pc` (the key at absolute semitone `fromS` in the
  // current drawing). `spell` picks between two spellings of the same key (e.g. F#
  // major vs Gb major) when the user clicked a box.
  function selectRoot(pc, spell, viaKeyboard, fromS) {
    var specs = Theory.specsFor(state.mode, pc);
    var sameKey = state.selected && pc === state.root;
    if (spell == null) {
      spell = sameKey ? state.spell : 0;
      if (!sameKey && state.selected && specs.length > 1) {         // F♯/G♭ key pressed: keep the kind (sharps/flats) of the key being left
        var cur = currentSpec().kind;
        for (var i = 0; i < specs.length; i++) if (specs[i].kind === cur) { spell = i; break; }
      }
    }
    if (spell < 0 || spell >= specs.length) spell = 0;
    var rotated = !(state.selected && fromS === state.root) && (pc !== state.root || fromS !== state.root);
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
  var FM_IDS = { key: 'fm-key', sig: 'fm-sig', chord: 'fm-chord', play: 'fm-play', find: 'fm-find' };
  var ftcLv = {};                                                  // the level number for each of 'major|pop', 'major|jazz', 'minor|pop', 'minor|jazz'
  function ftcLvKey() { return state.mode + (level === 'pop' ? '|pop' : '|jazz'); }
  function ftcLevelNo() { return ftcTrial ? ftcTrial.level : FindChord.clamp(ftcLv[ftcLvKey()] || 1, 1, FindChord.levelCount(state.mode, level === 'pop')); }
  function ftcSetLevel(n) { ftcLv[ftcLvKey()] = FindChord.clamp(n, 1, FindChord.levelCount(state.mode, level === 'pop')); }
  var ftcAuto = true, ftcStreak = 0, ftcTried = 0, ftcRight = 0;     // (ftcTried: questions answered since the last level change)
  function streakNeed() { return window.MUSIC_THEORY_LOCAL ? 5 : FindChord.STREAK; }      // (the local copy levels up faster, to test)
  // The last few first-try answers as bubbles, newest on the left: green when right, a red X when wrong. A full green row is a level-up.
  var TRIAL_LEN = 10, TRIAL_PENALTY = 10000;                   // a time trial: ten questions, ten seconds for each wrong answer
  var ftcBub = null, bubFull = false;
  var ftcTrial = null;                                          // a time trial in progress (see below)
  // Play the note and Find the note have their own steps, bubbles and Time Trial, apart from Find the chord's and from each other.
  // The progress variables above and below belong to whichever activity is showing ('chord' | 'play' | 'find'); the others wait in `slots`.
  var STUDY_STEPS = 5, STEPS_KEY = 'music-theory-notes-v1';
  var stepLv = { play: 1, find: 1, key: 1, sig: 1 };
  var slots = {}, curSlot = 'chord';
  function slotSnap() { return { bub: ftcBub, bubFull: bubFull, streak: ftcStreak, tried: ftcTried, right: ftcRight, unlocked: trialUnlocked, ever: trialEver }; }
  function slotLoad(o) {
    o = o || {};
    ftcBub = o.bub || null; bubFull = !!o.bubFull; ftcStreak = o.streak | 0; ftcTried = o.tried | 0; ftcRight = o.right | 0;
    trialUnlocked = !!o.unlocked; trialEver = !!o.ever;
  }
  function slotWanted() { return quizOn() ? 'chord' : studyQuizOn() ? studySlot() : null; }
  function syncSlot() {
    var want = slotWanted(), tk = ftcTrial ? (ftcTrial.note || 'chord') : null;
    if (tk && tk !== want) abortTrial();                        // a time trial ends when its activity is left
    if (!want || want === curSlot) return;
    slots[curSlot] = slotSnap();
    slotLoad(slots[want]);
    curSlot = want;
    if (typeof syncTrialBox === 'function') syncTrialBox();
  }
  function bubN() { return ftcTrial ? TRIAL_LEN : streakNeed(); }
  function bubbles() {
    var n = bubN();
    if (!ftcBub) ftcBub = [];
    ftcBub.length = n;
    for (var i = 0; i < n; i++) if (ftcBub[i] !== 'ok' && ftcBub[i] !== 'bad') ftcBub[i] = null;
    return ftcBub;
  }
  function bubblesFull() { var b = bubbles(); return b.every(function (r) { return r === 'ok'; }); }
  window.musicTheoryLocalReady = function () {                  // local.js loads after the app starts: the streak length may change
    if (bubFull || (ftcBub && ftcBub.length)) bubFull = bubblesFull();
    ftcStreak = Math.min(ftcStreak, streakNeed() - 1);
    if (typeof updateFtc === 'function' && quizOn()) { updateFtc(); updateChordPanel(); }
  };
  // the Time Trial button appears once 7 of the last 10 answers were right (3 of 5 in the local copy), and stays
  var trialUnlocked = false;                                     // the current step may be trialled
  var trialEver = false;                                         // the button has appeared once: from then on it always shows
  function checkTrialUnlock() {
    if (trialUnlocked || ftcTrial) return;
    var b = bubbles(), right = b.filter(function (r) { return r === 'ok'; }).length;
    if (right >= (window.MUSIC_THEORY_LOCAL ? 3 : Math.ceil(0.7 * b.length))) { trialUnlocked = trialEver = true; if (typeof syncTrialBox === 'function') syncTrialBox(); }
  }
  function pushBub(result) {
    if (bubFull) { ftcBub = null; bubFull = false; }          // (the full green row stayed up for the celebration)
    var b = bubbles();
    b.unshift(result); b.length = bubN();
    checkTrialUnlock();
  }
  function showStreak() {
    var st = document.getElementById('streak-text'), b = bubbles(), right = 0;
    st.textContent = '';
    b.forEach(function (r) {
      var d = document.createElement('span');
      d.className = 'bub' + (r ? ' ' + r : '');
      if (r === 'ok') right++;
      d.textContent = r === 'bad' ? '\u2715' : r === 'ok' ? '\u2713' : '';
      st.appendChild(d);
    });
    st.setAttribute('role', 'img');
    st.setAttribute('aria-label', 'Last answers: ' + right + ' right out of ' + b.filter(Boolean).length);
  }
  var ftcFresh = { asked: 0, fresh: 0 };              // questions about the new challenge in the current run of five
  var ftcOpen = null;                                             // the first question of the new stage, already shown under its banner
  var ftcHomeNext = false;                                        // a key was just added: its home triad is the first question in it
  function ftcRaised(up) {                                        // the level just went up (true) or down (false)
    var info = FindChord.levelInfo(state.mode, ftcPop(), ftcLevelNo());
    ftcFresh = { asked: 0, fresh: 0 };
    ftcOpen = null;
    ftcHomeNext = !!up && !!info.add;                              // the first question of a new step is about what the step just put in play
    if (up) { trialUnlocked = false; if (typeof syncTrialBox === 'function') syncTrialBox(); }       // (a level-up locks Time Trial again)
  }
  var centerStage = false, stageAnswered = false;
  // Narrow screens scroll the stage sideways. 'card': centre the question's card with its "I give up" button;
  // 'open': the staff of inversions has opened, so show its clef through to the highlighted chord (centred if both fit)
  function centreQuizStage(how) {
    if (stage.scrollWidth <= stage.clientWidth) return;
    var base = stage.getBoundingClientRect().left - stage.scrollLeft;         // x of the stage's content origin on screen
    var card = stage.querySelector('.chordcard');
    if (!card) return;
    var left, right;
    if (how === 'open') {                                // the staff's left edge (the clef) through to the highlighted chord
      var st = card.querySelector('.stave'), lit = card.querySelector('.lit-box');
      if (!st) return;
      var sr = st.getBoundingClientRect();
      left = sr.left - base - 4;
      right = sr.right - base + 4;
      if (right - left > stage.clientWidth * 1.15) {      // too wide to show whole: the clef through to the highlighted chord
        left -= 4;
        right = (lit ? lit : st).getBoundingClientRect().right - base + 12;
      }
    } else {                                             // the card and the "I give up" button beside it
      var frame = card.querySelector('rect'), gu = card.querySelector('.giveup-btn');
      if (!frame) return;
      left = frame.getBoundingClientRect().left - base;
      right = (gu || frame).getBoundingClientRect().right - base;
    }
    var span = right - left, view = stage.clientWidth;
    stage.scrollLeft = span <= view ? left - (view - span) / 2 : left;
  }
  var ftcQ = null;                                    // { pc, spell, deg, type, inv }  (inv: the inversion shown, 0 = root position)
  var ftcMem = FindChord.loadMem();                    // the memory model: when each key/chord pair was last answered and how fast it fades (persisted)
  var ftcLog = FindChord.loadLog(), ftcLogTimer = null;   // every first-try answer, for tuning the model to you (persisted, capped)
  var ftcT0 = null, ftcDraw = 'w';                    // when the question appeared; how it was drawn (w weighted, f new-challenge floor, o older-material floor, h step opener)
  var LOG_NOTE_KEY = 'music-theory-ftc-log-notice', LOG_LINK_AT = 1000, LOG_NOTE_AT = 2000, LOG_NOTE_SNOOZE = 1000;
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
      if (o.lvl && typeof o.lvl === 'object') Object.keys(o.lvl).forEach(function (k) { if (/^(major|minor)\|(pop|jazz)$/.test(k) && Number.isInteger(o.lvl[k]) && o.lvl[k] >= 1) ftcLv[k] = o.lvl[k]; });
      ftcAuto = o.auto !== false;
      if (o.fresh && Number.isInteger(o.fresh.asked) && Number.isInteger(o.fresh.fresh) && o.fresh.asked >= 0 && o.fresh.asked < 5 && o.fresh.fresh >= 0) ftcFresh = { asked: o.fresh.asked, fresh: o.fresh.fresh };
      ftcStreak = Number.isInteger(o.streak) ? Math.max(0, Math.min(streakNeed() - 1, o.streak)) : 0;
      ftcTried = ftcRight = ftcStreak;
      ftcBub = Array.isArray(o.bub) ? o.bub.slice(0, 40) : null;
      bubFull = bubblesFull();
      trialUnlocked = o.trial === true;
      trialEver = o.ever === true || trialUnlocked;
      checkTrialUnlock();
      syncTrialBox();
    } catch (e) { /* defaults */ }
  }
  function saveFtc() {
    if (ftcTrial) return;                                        // (a trial is never saved: the normal state stays as it was)
    slots[curSlot] = slotSnap();
    var c = slots.chord || slotSnap();
    try { window.localStorage.setItem(FTC_KEY, JSON.stringify({ lvl: ftcLv, auto: ftcAuto, streak: c.streak, bub: c.bub || [], trial: c.unlocked, ever: c.ever, fresh: ftcFresh })); } catch (e) { /* storage unavailable */ }
    var no = {};
    ['play', 'find', 'key', 'sig'].forEach(function (m) { var q = slots[m] || {}; no[m] = { lv: stepLv[m], streak: q.streak | 0, bub: q.bub || [], trial: !!q.unlocked, ever: !!q.ever }; });
    try { window.localStorage.setItem(STEPS_KEY, JSON.stringify(no)); } catch (e) { /* storage unavailable */ }
  }
  function loadSteps() {
    try {
      var o = JSON.parse(window.localStorage.getItem(STEPS_KEY));
      if (!o || typeof o !== 'object') return;
      ['play', 'find', 'key', 'sig'].forEach(function (m) {
        var q = o[m];
        if (!q || typeof q !== 'object') return;
        stepLv[m] = FindChord.clamp(q.lv || 1, 1, STUDY_STEPS);
        var b = Array.isArray(q.bub) ? q.bub.slice(0, 40).map(function (r) { return r === 'ok' || r === 'bad' ? r : null; }) : null, need = streakNeed();
        var st = Number.isInteger(q.streak) ? Math.max(0, Math.min(need - 1, q.streak)) : 0;
        slots[m] = { bub: b, bubFull: !!b && b.length >= need && b.slice(0, need).every(function (r) { return r === 'ok'; }), streak: st, tried: st, right: st, unlocked: q.trial === true, ever: q.ever === true || q.trial === true };
      });
    } catch (e) { /* defaults */ }
  }
  function resetFtc() {
    abortTrial();
    ftcLv = {};
    trialUnlocked = trialEver = false; ftcAuto = true; ftcStreak = 0; ftcTried = 0; ftcRight = 0; ftcBub = null; bubFull = false; ftcFresh = { asked: 0, fresh: 0 };
    ftcAutoBox.checked = true;
    stepLv = { play: 1, find: 1, key: 1, sig: 1 }; slots = {}; slots[curSlot] = slotSnap(); if (curSlot !== 'chord') slots.chord = slotSnap();
    try { window.localStorage.removeItem(STEPS_KEY); } catch (e) { /* storage unavailable */ }
    try { window.localStorage.removeItem(FTC_KEY); window.localStorage.removeItem(TRIALS_KEY); window.localStorage.removeItem(WELCOME_KEY); window.localStorage.removeItem(STUDY_WELCOME_KEY); } catch (e) { /* storage unavailable */ }   // (the time trial bests go too)
  }
  // the levels in force: the chord dial is capped by what this level (Pop / Jazz) offers
  function ftcLevels() { return ftcTrial ? { keys: ftcTrial.keys, chords: ftcTrial.chords, inv: ftcTrial.inv } : FindChord.levelAt(state.mode, ftcPop(), ftcLevelNo()); }
  // true while only triads are in play: the TYPE row is hidden and a degree alone is the answer
  function popAns() { return quizOn() && ftcPop(); }                  // Pop answers: type + root + quality (+ seventh), not roman degrees
  function ftcHint() {
    if (popAns()) return ftcTypesHidden() ? 'Choose the chord\u2019s root on the keyboard and its quality.' : 'Choose the chord\u2019s type, root and quality, in any order; the last one you choose is your answer.';
    return ftcTypesHidden() ? 'Choose the chord\u2019s degree.' : 'Choose a type and a degree, in either order. The second one you choose is your answer.';
  }
  function ftcHintTail() { return '. ' + (popAns() ? (ftcTypesHidden() ? 'Choose the root and quality in the Chords section.' : 'Choose the type, root and quality in the Chords section.') : (ftcTypesHidden() ? 'Choose the chord\u2019s degree in the Chords section.' : 'Choose a type and a degree in the Chords section; the second one you choose is your answer.')); }
  function ftcTypesHidden() { return quizOn() && FindChord.chords(state.mode, ftcPop(), ftcLevels().chords).every(function (c) { return c.type === 'triad'; }); }
  function ftcSpec() { return Theory.specsFor(state.mode, ftcQ.pc)[ftcQ.spell]; }
  function ftcChord() { return Chords.chordInKey(ftcSpec().name, state.mode, ftcQ.deg, ftcQ.type); }
  // ---- level-up: what was added, and a confetti burst ----
  var levelBanner = document.getElementById('ftc-levelup');
  var levelText = document.getElementById('ftc-levelup-text');
  // the words for what is being put in play: keys by name, chords by numeral (in ascending order of degree)
  // (withEx: in Pop, where the answer is a chord name, a numeral is followed by an example in C major / A minor: "ii (Dm in C major)")
  function ftcNames(items, isKey, withEx) {
    var mode = state.mode, ref = Theory.specsFor(mode, mode === 'minor' ? 9 : 0)[0].name;
    if (isKey) return items.map(function (pc) { return Theory.keyTitle(Theory.specsFor(mode, pc)[0], mode); });
    var ex = withEx && ftcPop() && items.length <= 2;
    return items.map(function (c, i) { return { c: c, i: i }; }).sort(function (x, y) { return x.c.deg - y.c.deg || x.i - y.i; })
      .map(function (x) { var cd = Chords.chordInKey(ref, mode, x.c.deg, x.c.type); return cd ? (ex ? { r: cd.roman, e: ' (' + cd.symbol + ' in ' + ref + ' ' + mode + ')' } : cd.roman) : ''; }).filter(Boolean);
  }
  function ftcBold(names) { return names.map(function (x) { return typeof x === 'string' ? '<strong>' + x + '</strong>' : '<strong>' + x.r + '</strong>' + x.e; }); }
  function ftcJoin(list) { return list.length < 3 ? list.join(' and ') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }
  function ftcBlockLabel(chords) {                                // 'Sus4 chords on ' for a whole type, else ''
    var types = chords.map(function (c) { return c.type; }).filter(function (t, i, a) { return a.indexOf(t) === i; });
    if (chords.length > 2 && types.length === 1 && types[0] !== 'triad') { var d = Chords.TYPES.filter(function (x) { return x.id === types[0]; })[0]; return (d ? d.label : types[0]) + ' chords on '; }
    return '';
  }
  // between steps of a stage: what the next step puts in play (the chord numeral or key in bold)
  function stepNote(n) {
    var mode = state.mode, pop = ftcPop(), info = FindChord.levelInfo(mode, pop, n), add = FindChord.stepAdds(mode, pop, n);
    var lead = 'You\u2019ve completed Level ' + (info.step - 1) + ' (of ' + FindChord.stageSteps(mode, pop, n) + '). On to level ' + info.step + ', ';
    if (!add) return lead.replace(/, $/, '.');
    var verb = add.back ? 'adding back ' : 'introducing ', names, one;
    if (add.dim === 'K') {
      names = ftcNames(add.keys, true); one = names.length === 1;
      return lead + verb + (one ? 'a ' + (add.back ? '' : 'new ') + 'key: ' : (add.back ? '' : 'new ') + 'keys: ') + '<strong>' + ftcJoin(names) + '</strong>!';
    }
    if (add.dim === 'I') return lead + 'introducing inversions of ' + ftcJoin(ftcBold(ftcNames(add.chords, false, true))) + '!';
    names = ftcNames(add.chords, false, true); one = names.length === 1;
    if (one) return lead + verb + 'a ' + (add.back ? '' : 'new ') + 'chord: ' + (pop ? '' : 'Degree ') + ftcBold(names)[0] + '!';
    return lead + verb + (add.back ? '' : 'new ') + 'chords: ' + ftcBlockLabel(add.chords) + ftcJoin(ftcBold(names)) + '!';
  }
  // after a whole stage: what the next one introduces
  function stageNote(stage) {
    var mode = state.mode, pop = ftcPop(), it = FindChord.stageIntro(mode, pop, stage), count = it.kind === 'K' ? it.keys.length : it.chords.length;
    var many = count === 1 ? (it.kind === 'K' ? 'a new key' : 'a new chord') : (count === 2 ? 'two' : count) + (it.kind === 'K' ? ' new keys' : ' new chords');
    var names = it.kind === 'K' ? ftcNames(it.keys, true) : ftcNames(it.chords, false, true);
    var first = it.kind === 'K' ? ftcNames(it.keys.slice(0, 1), true)[0] : ftcNames(it.chords.slice(0, 1), false)[0];
    return 'Stage ' + stage + ' introduces ' + many + (it.kind === 'K' ? ': ' : ' to find: ') + (it.kind === 'C' ? ftcBlockLabel(it.chords) : '') + ftcJoin(ftcBold(names)) + (count === 2 ? ', starting with <strong>' + first + '</strong>!' : '.');
  }
  var bannerHold = false;                                       // a trial result stays up until the next pick
  function showBanner(title, text, withConfetti, icon) {
    document.getElementById('ftc-levelup-icon').textContent = icon || '\u{1F389}';
    document.getElementById('ftc-levelup-title').textContent = title;
    levelText.textContent = text;
    levelBanner.hidden = false;
    levelBanner.style.animation = 'none'; void levelBanner.offsetWidth; levelBanner.style.animation = '';
    if (withConfetti && !reduceMotion) {
      var r = levelBanner.getBoundingClientRect();
      confetti(r.left + r.width / 2, Math.max(60, r.top + r.height / 2));
    }
  }
  function celebrate(n, newStage, doneStage) {                     // n: the level just reached
    levelBanner.removeAttribute('data-welcome');
    var pop = ftcPop(), html, title = 'Nice work!', goRow = false;
    if (newStage) {
      var p = FindChord.stageCoverage(state.mode, pop, doneStage);
      title = 'Congratulations!';
      html = 'You have completed Stage ' + doneStage + '. You can now play ' + (p < 1 ? 'a few' : 'about ' + p + '% of all') + ' ' + (pop ? 'pop' : 'jazz') + ' songs!<span class="levelup-line2">' + stageNote(FindChord.levelInfo(state.mode, pop, n).stage) + '</span>';
      goRow = true;
    } else { html = stepNote(n); goRow = true; }
    var allTriads = function (k) { return FindChord.chords(state.mode, pop, FindChord.levelAt(state.mode, pop, k).chords).every(function (c) { return c.type === 'triad'; }); };
    if (n > 1 && allTriads(n - 1) && !allTriads(n))                  // the TYPE chips have just appeared
      html += '<span class="levelup-line2">Since we now have both triads and seventh chords, you\u2019ll have to select the \u2018type\u2019 as well as the ' + (pop ? 'root and quality' : 'degree') + '. Ready?</span>';
    var home = newStage ? document.querySelector('.stage-card') : ftcSection;           // a finished stage's banner sits over the clef; a level's stays under the keyboard
    if (levelBanner.parentNode !== home) home.insertBefore(levelBanner, newStage ? home.firstChild : null);
    document.getElementById('ftc-levelup-icon').textContent = '\u{1F389}';
    document.getElementById('ftc-levelup-title').textContent = title;
    if (goRow) html += '<span class="levelup-go-row"><button type="button" class="btn-reset levelup-go">Go \u2192</button></span>';   // (the same as Next)
    levelText.innerHTML = html;
    levelBanner.hidden = false;
    levelBanner.style.animation = 'none'; void levelBanner.offsetWidth; levelBanner.style.animation = '';
    if (newStage) previewOpener();
    if (reduceMotion) return;
    var r = levelBanner.getBoundingClientRect();
    confetti(r.left + r.width / 2, Math.max(60, r.top + r.height / 2));
  }
  // Play / Find the note: a level-up (n: the step just reached)
  function celebrateStep(n) {
    levelBanner.removeAttribute('data-welcome');
    var html = 'You\u2019ve completed Level ' + (n - 1) + ' (of ' + STUDY_STEPS + '). On to level ' + n + ', ' +
      ['', '', 'the <strong>bass clef</strong>!', 'where <strong>treble and bass</strong> take turns!', 'introducing the <strong>alto clef</strong>!', 'where <strong>treble, bass and alto</strong> all take turns!'][n] +
      '<span class="levelup-go-row"><button type="button" class="btn-reset levelup-go">Go \u2192</button></span>';
    if (levelBanner.parentNode !== ftcSection) ftcSection.appendChild(levelBanner);
    document.getElementById('ftc-levelup-icon').textContent = '\u{1F389}';
    document.getElementById('ftc-levelup-title').textContent = 'Nice work!';
    levelText.innerHTML = html;
    levelBanner.hidden = false;
    levelBanner.style.animation = 'none'; void levelBanner.offsetWidth; levelBanner.style.animation = '';
    if (reduceMotion) return;
    var r = levelBanner.getBoundingClientRect();
    confetti(r.left + r.width / 2, Math.max(60, r.top + r.height / 2));
  }
  // the first time Find the chord is opened: how it works (the banner sits over the clef; "Go" or the first answer dismisses it)
  var WELCOME_KEY = 'music-theory-ftc-welcomed';
  var STUDY_WELCOME_KEY = 'music-theory-study-welcomed';          // the other study activities, each welcomed once
  var STUDY_WELCOMES = {
    key: ['Find the Key', 'You\u2019ll be shown a key signature on the staff. Press the piano key it belongs to' + (HAS_KEYBOARD ? ' \u2014 click it, or type its letter (Shift for a sharp, ' + ALT_NAME + ' for a flat)' : '') + '. Keys you miss come back more often.'],
    sig: ['Find the Signature', 'A key is lit on the keyboard, and the key signatures are laid out above it. Click the signature that belongs to the lit key. F\u266F and G\u266D are separate boxes: the lit key says which one is asked for.'],
    play: ['Play the Note', 'A note appears on the staff. Press the matching piano key (any octave)' + (HAS_KEYBOARD ? ', or type its letter A\u2013G (Shift for a sharp, ' + ALT_NAME + ' for a flat)' : '') + '. Sharps and flats take turns.<span class="levelup-line2">There are five levels, aimed at learning different clefs: first the treble clef, then the bass clef, then the alto clef.</span>'],
    find: ['Find the Note', 'A key is lit on the keyboard. Click its note on the staff, in the right octave. Sharps and flats take turns.']
  };
  function dismissWelcome() {
    if (!levelBanner.hasAttribute('data-welcome')) return;
    bannerHold = false; levelBanner.hidden = true; levelBanner.removeAttribute('data-welcome');
  }
  function maybeStudyWelcome() {
    var m = state.cardMode, w = STUDY_WELCOMES[m], seen = [];
    if (!w || !state.flash || !state.card || bannerHold || state.answered) return;
    try { seen = JSON.parse(window.localStorage.getItem(STUDY_WELCOME_KEY)) || []; } catch (e) { return; }
    if (seen.indexOf(m) >= 0) return;
    var home = document.querySelector('.stage-card');
    if (levelBanner.parentNode !== home) home.insertBefore(levelBanner, home.firstChild);
    document.getElementById('ftc-levelup-icon').textContent = '\u{1F914}';
    document.getElementById('ftc-levelup-title').textContent = 'Welcome to \u201C' + w[0] + '!\u201D';
    levelText.innerHTML = w[1] + '<span class="levelup-go-row"><button type="button" class="btn-reset levelup-go">Go \u2192</button></span>';
    levelBanner.setAttribute('data-welcome', m);
    levelBanner.hidden = false;
    bannerHold = true;
    seen.push(m);
    try { window.localStorage.setItem(STUDY_WELCOME_KEY, JSON.stringify(seen)); } catch (e) { /* storage unavailable */ }
  }
  var NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  function maybeWelcome() {
    try { if (window.localStorage.getItem(WELCOME_KEY)) return; } catch (e) { return; }
    if (ftcLevelNo() !== 1 || ftcTrial) return;
    var mode = state.mode, pop = ftcPop(), total = FindChord.levelInfo(mode, pop, FindChord.levelCount(mode, pop)).stage, l = FindChord.levelAt(mode, pop, 1);
    var ks = ftcNames(FindChord.keys(mode, pop, l.keys), true), cs = FindChord.chords(mode, pop, l.chords);
    var w = function (n) { return NUM_WORDS[n] || String(n); };
    var what = w(cs.length) + (cs.every(function (c) { return c.type === 'triad'; }) ? ' triads' : ' chords');
    var home = document.querySelector('.stage-card');
    if (levelBanner.parentNode !== home) home.insertBefore(levelBanner, home.firstChild);
    document.getElementById('ftc-levelup-icon').textContent = '\u{1F914}';
    document.getElementById('ftc-levelup-title').textContent = 'Welcome to \u201CFind the Chord!\u201D';
    levelText.innerHTML = 'You\u2019ll be shown a chord with a key signature, and will identify it below. This is divided up into ' + total +
      ' stages; in each stage, a new key or chord will be introduced and you\u2019ll work your way back up to identifying it along with what you\u2019ve already done.' +
      '<span class="levelup-line2">The first stage starts with ' + what + ' in ' + w(ks.length) + ' keys, ' + ftcJoin(ks) + '. Good luck!</span>' +
      '<span class="levelup-go-row"><button type="button" class="btn-reset levelup-go">Go \u2192</button></span>';
    levelBanner.setAttribute('data-welcome', '1');
    levelBanner.hidden = false;
    bannerHold = true;
    try { window.localStorage.setItem(WELCOME_KEY, '1'); } catch (e) { /* storage unavailable */ }
  }
  // under a stage banner the clef shows the chord (or key's home chord) the stage opens with, with its inversions: the next question will be about it
  function previewOpener() {
    var keepBub = ftcBub, keepFull = bubFull;                       // (the full green row stays up while the banner shows)
    ftcHomeNext = true;
    ftcOpen = null;
    ftcNewQuestion(false);                                          // picks the opener (and counts it: undone below)
    ftcBub = keepBub; bubFull = keepFull;
    var q = ftcQ, want = ftcChord();
    ftcOpen = { pc: q.pc, deg: q.deg, type: q.type, spell: q.spell };
    ftcHomeNext = true;
    ftcFresh = { asked: 0, fresh: 0 };
    ftcQ.inv = 0; state.card.inv = 0; state.card.chord = { notes: ftcNotes() };
    state.answered = true;
    state.card.status = '';
    state.card.title = want.symbol + ' is ' + want.roman + ' in ' + Theory.keyTitle(ftcSpec(), state.mode);
    state.card.modeLine = ftcPop() ? '' : 'Mode: ' + want.mode;
    saveFtc();
    draw(false, false);
  }
  levelBanner.addEventListener('click', function (e) {
    if (levelBanner.hasAttribute('data-welcome') && e.target.closest && e.target.closest('.levelup-go')) { bannerHold = false; levelBanner.hidden = true; levelBanner.removeAttribute('data-welcome'); return; }
    if (e.target.closest && e.target.closest('.levelup-go') && (quizOn() || studyQuizOn()) && state.answered) nextCard(false);
  });
  function confetti(ox, oy) {
    var cv = document.createElement('canvas');
    cv.className = 'confetti';
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    document.body.appendChild(cv);
    var g = cv.getContext('2d'), colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#eab308', '#14b8a6'];
    var bits = [];
    for (var i = 0; i < 160; i++) {
      var a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 11;
      bits.push({ x: ox, y: oy, vx: Math.cos(a) * sp * 1.2, vy: Math.sin(a) * sp - 6, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5,
                  rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length] });
    }
    var t0 = performance.now(), TOTAL = 3200;
    (function frame(now) {
      var t = now - t0;
      g.clearRect(0, 0, cv.width, cv.height);
      bits.forEach(function (b) {
        b.vy += 0.28; b.vx *= 0.992; b.x += b.vx; b.y += b.vy; b.rot += b.vr;
        g.save(); g.globalAlpha = Math.max(0, Math.min(1, (TOTAL - t) / 900));
        g.translate(b.x, b.y); g.rotate(b.rot); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
      });
      if (t < TOTAL) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }

  function ftcSay(text) { ftcMsg.textContent = text; }                // (a screen-reader message; the card shows it too)

  var ftcSel = { deg: null, type: null, root: null, qual: null, sev: null };            // this attempt's picks; the second one makes the guess
  var ftcWrong = false;                              // the chips still show a wrong guess

  function ftcClearPicks() {
    ftcSel = { deg: null, type: null, root: null, qual: null, sev: null };
    ftcWrong = false;
    state.chord = null;
    typePicked = false;
    chordTypes_.full = 'triad';
  }

  // closed-position voicing of the question's chord, centred on the treble staff
  function saveLogSoon() {
    if (ftcLogTimer) return;
    ftcLogTimer = setTimeout(function () { ftcLogTimer = null; FindChord.saveLog(ftcLog); }, 1000);
  }
  window.addEventListener('pagehide', function () { FindChord.saveLog(ftcLog); FindChord.saveMem(ftcMem); });
  // one first-try answer (or give-up): updates the memory model and adds a row to the log
  function ftcRecord(correct, ms, gaveUp, trial) {
    if (!ftcQ) return;
    var now = Date.now(), info = FindChord.levelInfo(state.mode, ftcPop(), ftcLevelNo()), r = null;
    if (!trial) { r = FindChord.memAnswer(ftcMem, state.mode, ftcQ, correct, ms, ftcQ.inv || 0, now); FindChord.saveMem(ftcMem); }
    var rd = function (x, d) { return x == null ? '' : Math.round(x * d) / d; };
    ftcLog.push([now, state.mode, ftcPop() ? 1 : 0, ftcQ.pc, ftcQ.deg, ftcQ.type, ftcQ.inv || 0, correct ? 1 : 0, ms == null ? '' : Math.round(ms),
                 r ? rd(r.dt, 1) : '', r ? rd(r.R, 1000) : '', r ? rd(r.hBefore, 1) : '', r ? rd(r.hAfter, 1) : '', r ? rd(r.q, 1000) : '',
                 info.stage, info.step, trial ? '' : ftcDraw, gaveUp ? 1 : 0, trial ? 1 : 0]);
    if (ftcLog.length > FindChord.LOG_CAP) ftcLog.splice(0, ftcLog.length - FindChord.LOG_CAP);
    saveLogSoon();
    syncLogNote();
  }
  function ftcNoteMiss(gaveUp) { ftcRecord(false, null, !!gaveUp, false); }       // this pair will come back sooner
  function logCsv() {
    var cols = FindChord.LOG_COLUMNS;
    return [cols.join(',')].concat(ftcLog.map(function (r) { return r.join(','); })).join('\n') + '\n';
  }
  function downloadLog() {
    FindChord.saveLog(ftcLog);
    var blob = new Blob([logCsv()], { type: 'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'music-ftc-log-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  var logNote = document.getElementById('log-note'), logLink = document.getElementById('log-link');
  function logNextAt() { try { var n = parseInt(window.localStorage.getItem(LOG_NOTE_KEY), 10); return n > 0 ? n : LOG_NOTE_AT; } catch (e) { return LOG_NOTE_AT; } }
  function syncLogNote() {
    if (logLink) { logLink.textContent = 'Practice log: ' + ftcLog.length + ' answers (download)'; logLink.hidden = ftcLog.length < LOG_LINK_AT; }
    if (logNote) logNote.hidden = ftcLog.length < logNextAt();
  }
  if (logLink) logLink.addEventListener('click', downloadLog);
  if (logNote) logNote.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.id === 'log-note-dl') { downloadLog(); return; }
    try { window.localStorage.setItem(LOG_NOTE_KEY, String(ftcLog.length + LOG_NOTE_SNOOZE)); } catch (err) { /* storage unavailable */ }
    syncLogNote();
  });
  syncLogNote();
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
    if (bubFull) { ftcBub = null; bubFull = false; showStreak(); }                  // ("Next": the new level starts with empty bubbles)
    var l = ftcLevels();
    var isFresh = ftcTrial ? null : FindChord.freshTest(state.mode, ftcPop(), ftcLevelNo());
    var nowMs = Date.now();
    var prevFresh = isFresh && ftcLevelNo() > 1 ? FindChord.freshTest(state.mode, ftcPop(), ftcLevelNo() - 1) : null;
    var isOld = isFresh ? function (c) { return !isFresh(c) && (!prevFresh || prevFresh(c)); } : null;     // older material: what the step before introduced (else anything already in play)
    var plan = isFresh ? FindChord.floorPlan(ftcFresh, true, FindChord.anyPair(state.mode, ftcPop(), l.keys, l.chords, function (c) { return isOld(c) && !(ftcQ && c.pc === ftcQ.pc && c.deg === ftcQ.deg && c.type === ftcQ.type); })) : null;
    ftcDraw = plan === 'fresh' ? 'f' : plan === 'old' ? 'o' : 'w';
    var q = FindChord.pick(state.mode, ftcPop(), l.keys, l.chords, Math.random, ftcQ, function (c) { return FindChord.memWeight(ftcMem, state.mode, c, nowMs); },
                           plan === 'old' ? isOld : isFresh, plan ? 'only' : null);
    q = { pc: q.pc, deg: q.deg, type: q.type };
    var forceInv = false;
    if (ftcHomeNext && !resumeQ && !ftcTrial) {
      ftcDraw = 'h';                     // the step's first question: the key it added (its home triad, I or i), or one of the chords it added
      var add = FindChord.stepAdds(state.mode, ftcPop(), ftcLevelNo());
      if (ftcOpen) q = { pc: ftcOpen.pc, deg: ftcOpen.deg, type: ftcOpen.type };
      else if (add && add.dim === 'K' && add.keys.length) q = { pc: add.keys[add.keys.length - 1], deg: 0, type: 'triad' };
      else if (add && add.chords.length) {
        forceInv = add.dim === 'I';
        var inKeys = FindChord.keys(state.mode, ftcPop(), l.keys).filter(function (pc) { return !ftcQ || pc !== ftcQ.pc || l.keys < 2; });
        var ch = add.chords[Math.floor(Math.random() * add.chords.length)];
        q = { pc: inKeys[Math.floor(Math.random() * inKeys.length)], deg: ch.deg, type: ch.type };
      }
    }
    var ftcHomeNextWas = ftcHomeNext && !resumeQ && !ftcTrial;
    ftcHomeNext = false;
    q.spell = ftcOpen && ftcHomeNextWas ? ftcOpen.spell : Math.floor(Math.random() * Theory.specsFor(state.mode, q.pc).length);
    if (ftcHomeNextWas) ftcOpen = null;
    var resumed = resumeQ && resumeQ.cardMode === 'chord' ? resumeQ : null;
    resumeQ = null;
    if (resumed) q = { pc: resumed.pc, deg: resumed.deg, type: resumed.type, spell: resumed.spell };
    else if (isFresh) { FindChord.freshRecord(ftcFresh, isFresh(q), !isFresh(q) && isOld(q)); saveFtc(); }
    var nNotes = Chords.chordInKey(Theory.specsFor(state.mode, q.pc)[q.spell].name, state.mode, q.deg, q.type).pcOffsets.length;
    var mayInv = FindChord.mayInvert(state.mode, ftcPop(), l, q.deg, q.type);
    q.inv = resumed ? resumed.inv : FindChord.pickInversion(nNotes, mayInv, Math.random);                // Jazz: inversions mixed in at every level; Pop: from the stage's inversions step on
    if (forceInv && !resumed && mayInv && nNotes > 1) q.inv = 1 + Math.floor(Math.random() * (nNotes - 1));       // (an inversions step opens with an inverted chord)
    var oldSvg = stage.firstElementChild;
    var oldKey = animate && oldSvg ? oldSvg.querySelector('.key[data-pc="' + q.pc + '"]') : null;
    ftcQ = q;
    centerStage = 'card';                             // (a narrow screen scrolls so the card and its button are in view)
    state.answered = false;
    state.root = q.pc;
    state.spell = q.spell;
    state.selected = true;                            // (the chord selector needs the key; the keyboard picture ignores it)
    chordCleared = false;
    ftcClearPicks();
    ftcMissed = resumed ? !!resumed.missed : false;
    state.card = { pc: q.pc, spell: q.spell, chord: { notes: ftcNotes() }, symbol: ftcChord().symbol, deg: q.deg, type: q.type, inv: q.inv, title: '', status: '', noGiveUp: !!ftcTrial };   // (symbol: for the tests and screen readers' sake, not drawn)
    ftcSay('', '');
    ftcT0 = resumed ? null : performance.now();
    return oldKey ? { oldKeyS: parseInt(oldKey.getAttribute('data-s'), 10) } : (animate ? 'fade' : false);
  }

  function enterQuiz() {
    restoring = true;                                 // opening the selector must not wipe what the toggle handler resets
    setTimeout(function () { restoring = false; saveState(); }, 80);       // (the save skipped meanwhile, e.g. the Study mode, is made now)
    if (ftcPrevChordsOpen === null) ftcPrevChordsOpen = chordsDetails.open;
    chordsDetails.open = true;
    state.scaleKind = 'full';
    document.getElementById('sk-full').checked = true;
    ftcQ = null;
    if (!resumeQ && !reopening) { ftcStreak = 0; ftcTried = 0; ftcRight = 0; ftcBub = null; bubFull = false; }                      // (a reload keeps the streak it had)
    ftcNewQuestion(false);
    maybeWelcome();
  }
  function exitQuiz() {
    abortTrial();
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
    ftcSel = { deg: null, type: null, root: null, qual: null, sev: null };
  }

  // ---- Time trial: ten questions at a chosen level, against the clock ----
  // The normal state (bubbles, streak) is kept aside and put back afterwards. A wrong answer costs ten seconds and the trial moves on.
  var TRIALS_KEY = 'music-theory-trials-v3';       // (v2: the levels were renumbered with the staged ladder)
  var trialBox = el('div', 'trial-box'), trialBtn = el('button', 'btn-reset trial-btn', 'Time Trial \u25be'), trialList = el('div', 'trial-list'),
      trialClock = el('div', 'trial-clock'), trialPen = el('span', 'trial-pen'), trialStop = el('button', 'btn-reset trial-stop', 'Stop');
  var trialListOpen = false, trialTick = null, trialCountdown = null;
  trialBtn.type = 'button'; trialStop.type = 'button';
  trialBtn.setAttribute('aria-haspopup', 'true');
  trialList.setAttribute('role', 'menu'); trialList.hidden = true;
  var CX = 20, CY = 20, CR = 17;
  trialClock.innerHTML = '<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle cx="20" cy="20" r="18" class="tc-face"/>' +
    '<path class="tc-fill" d="M20 20"/><line class="tc-hand" x1="20" y1="20" x2="20" y2="3"/></svg>';
  trialClock.appendChild(trialPen); trialClock.appendChild(trialStop);
  trialClock.hidden = true;
  trialBtn.hidden = !trialEver;
  trialBox.appendChild(trialBtn); trialBox.appendChild(trialClock); trialBox.appendChild(trialList);
  function trialKey(n) { return studyQuizOn() ? (noteOn() ? 'note-' : 'step-') + studySlot() + ':' + n : state.mode + ':' + (ftcPop() ? 'pop' : 'jazz') + ':' + n; }
  // best per level: { ms, wrong } (older saves held just the time)
  function trialBests() {
    var o; try { o = JSON.parse(window.localStorage.getItem(TRIALS_KEY)) || {}; } catch (e) { o = {}; }
    Object.keys(o).forEach(function (k) { if (typeof o[k] === 'number') o[k] = { ms: o[k], wrong: null }; });
    return o;
  }
  function fmtTime(ms) {
    var t = Math.round(ms / 100) / 10, m = Math.floor(t / 60), sec = t - m * 60;
    return m ? m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(1) : sec.toFixed(1) + 's';
  }
  function trialElapsed() { return ftcTrial && ftcTrial.t0 ? performance.now() - ftcTrial.t0 + ftcTrial.penalty : 0; }
  function drawClock() {
    var frac = (trialElapsed() % 60000) / 60000, a = frac * 2 * Math.PI;
    var x = CX + CR * Math.sin(a), y = CY - CR * Math.cos(a);
    trialClock.querySelector('.tc-hand').setAttribute('x2', x.toFixed(2));
    trialClock.querySelector('.tc-hand').setAttribute('y2', y.toFixed(2));
    trialClock.querySelector('.tc-fill').setAttribute('d', frac < 0.0005 ? 'M20 20' :
      'M20 20 L20 ' + (CY - CR) + ' A' + CR + ' ' + CR + ' 0 ' + (frac > 0.5 ? 1 : 0) + ' 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Z');   // swept from 12 o'clock to the hand
  }
  function syncTrialBox() {
    trialBtn.hidden = !!ftcTrial || !trialEver;
    trialClock.hidden = !ftcTrial;
    trialStop.hidden = !!(ftcTrial && ftcTrial.done);
    chordsPanel.classList.toggle('trialing', !!ftcTrial);              // (keyboard hints on the chips, where there is a keyboard)
    trialBtn.setAttribute('aria-expanded', trialListOpen ? 'true' : 'false');
    if (!(ftcTrial && ftcTrial.done) && trialList.parentNode !== trialBox) trialBox.appendChild(trialList);      // (the results borrow the list for their own menu button)
    trialList.hidden = !trialListOpen || !!(ftcTrial && !ftcTrial.done);
  }
  function closeTrialList() { if (trialListOpen) { trialListOpen = false; syncTrialBox(); } }
  document.addEventListener('click', function (e) { if (trialListOpen && !trialBox.contains(e.target) && !(e.target.closest && e.target.closest('.tr-menu'))) closeTrialList(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && trialListOpen) { closeTrialList(); trialBtn.focus(); } });
  function stageLabel(n) { if (studyQuizOn()) return 'Level ' + n; var i = FindChord.levelInfo(state.mode, ftcPop(), n); return 'Stage ' + i.stage + ': Level ' + i.step; }
  // two levels: the stages (newest first; only the current one open to start with), and under each the steps reached so far
  function buildTrialList() {
    trialList.textContent = '';
    if (studyQuizOn()) {                                              // one stage only: the steps reached so far, newest first
      var ncur = stepNo(), nb = trialBests();
      for (var k = ncur; k >= 1; k--) {
        var nbtn = el('button', 'btn-reset trial-lvl'), nbest = nb[trialKey(k)], nlocked = k === ncur && !trialUnlocked;
        nbtn.type = 'button'; nbtn.setAttribute('data-level', k); nbtn.setAttribute('role', 'menuitem');
        if (nlocked) { nbtn.disabled = true; nbtn.classList.add('locked'); nbtn.title = 'Answer ' + (window.MUSIC_THEORY_LOCAL ? '3 of the last 5' : '7 of the last 10') + ' right to unlock'; }
        nbtn.appendChild(el('span', 'tl-n', 'Level ' + k));
        nbtn.appendChild(el('span', 'tl-best', nlocked ? 'play it first' : nbest ? fmtTime(nbest.ms) + (nbest.wrong == null ? '' : ' \u00b7 ' + nbest.wrong + ' wrong') : 'no time yet'));
        trialList.appendChild(nbtn);
      }
      return;
    }
    var cur = FindChord.clamp(ftcLv[ftcLvKey()] || 1, 1, FindChord.levelCount(state.mode, ftcPop())), bests = trialBests(), curStage = FindChord.levelInfo(state.mode, ftcPop(), cur).stage, groups = {}, order = [];
    for (var n = cur; n >= 1; n--) {
      var st = FindChord.levelInfo(state.mode, ftcPop(), n).stage;
      if (!groups[st]) { groups[st] = []; order.push(st); }
      groups[st].push(n);
    }
    order.forEach(function (st) {
      var open = st === curStage, g = el('div', 'tl-stage'), h = el('button', 'btn-reset tl-stage-head'), body = el('div', 'tl-steps');
      h.type = 'button'; h.setAttribute('aria-expanded', open ? 'true' : 'false');
      h.appendChild(el('span', 'tl-caret', '\u25b8'));
      h.appendChild(el('span', 'tl-n', 'Stage ' + st));
      h.appendChild(el('span', 'tl-best', groups[st].length + (groups[st].length === 1 ? ' level' : ' levels')));
      body.hidden = !open;
      groups[st].forEach(function (n) {
        var b = el('button', 'btn-reset trial-lvl'), best = bests[trialKey(n)];
        b.type = 'button'; b.setAttribute('data-level', n); b.setAttribute('role', 'menuitem');
        var locked = n === cur && !trialUnlocked;                    // the step in progress opens for a trial once it has been played well enough
        if (locked) { b.disabled = true; b.classList.add('locked'); b.title = 'Answer ' + (window.MUSIC_THEORY_LOCAL ? '3 of the last 5' : '7 of the last 10') + ' right to unlock'; }
        b.appendChild(el('span', 'tl-n', 'Level ' + FindChord.levelInfo(state.mode, ftcPop(), n).step));
        b.appendChild(el('span', 'tl-best', locked ? 'play it first' : best ? fmtTime(best.ms) + (best.wrong == null ? '' : ' \u00b7 ' + best.wrong + ' wrong') : 'no time yet'));
        body.appendChild(b);
      });
      g.appendChild(h); g.appendChild(body); trialList.appendChild(g);
    });
  }
  trialBtn.addEventListener('click', function () {
    trialListOpen = !trialListOpen;
    if (trialListOpen) buildTrialList();
    syncTrialBox();
  });
  trialList.addEventListener('click', function (e) {
    var h = e.target.closest ? e.target.closest('.tl-stage-head') : null;
    if (h) {                                                         // a stage opens or closes; the list stays up
      var body = h.nextElementSibling, open = body.hidden;
      body.hidden = !open; h.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {                                                  // scroll so the steps show (or as many as fit), keeping the stage's own row in view
        var lr = trialList.getBoundingClientRect(), br = body.getBoundingClientRect(), hr = h.getBoundingClientRect();
        var over = br.bottom - lr.bottom + 6;
        if (over > 0) trialList.scrollTop += Math.min(over, Math.max(0, hr.top - lr.top - 4));
      }
      return;
    }
    var b = e.target.closest ? e.target.closest('.trial-lvl') : null;
    if (b) startTrial(parseInt(b.getAttribute('data-level'), 10));
  });
  trialStop.addEventListener('click', function () { abortTrial(); ftcNewQuestionDraw(); });
  function ftcNewQuestionDraw() {
    if (studyQuizOn()) { state.answered = false; lastResult = ''; state.selected = false; if (noteOn()) newNoteCard(); else newCard(); updateScore(); draw(false, false); return; }
    var anim = ftcNewQuestion(false); updateScore(); draw(anim, false); }
  function startTrial(n) {
    var nq = studyQuizOn();
    if (!(quizOn() || nq) || (ftcTrial && !ftcTrial.done)) return;
    var lv = nq ? null : FindChord.levelAt(state.mode, ftcPop(), n);
    trialListOpen = false;
    var snap = ftcTrial ? ftcTrial.snap                                   // ("Try again": the state from before the first trial is still the one to return to)
      : { bub: ftcBub, bubFull: bubFull, streak: ftcStreak, tried: ftcTried, right: ftcRight, home: ftcHomeNext };
    clearInterval(trialTick); trialTick = null;
    ftcTrial = { level: n, note: nq ? studySlot() : null, keys: lv && lv.keys, chords: lv && lv.chords, inv: lv && lv.inv, n: 0, wrongs: 0, t0: 0, qStart: 0, penalty: 0, times: [], snap: snap, counting: true, done: false, view: null };
    ftcBub = null; bubFull = false; ftcStreak = 0; ftcTried = 0; ftcRight = 0; ftcHomeNext = false;
    bannerHold = false; levelBanner.hidden = true;
    syncTrialBox(); drawClock(); updateFtc(); updateScore(); updateChordPanel();
    chordsPanel.classList.add('counting');
    var steps = ['Ready…', 'Set…'], i = 0;                    // two seconds, then the first question
    var t = ftcTrial;
    t.view = function () {
      stage.innerHTML = '<div class="trial-count" role="status" aria-live="assertive"></div>';
      stage.firstChild.textContent = steps[Math.min(i, steps.length - 1)];
    };
    t.view();
    function go() {
      trialCountdown = null;
      chordsPanel.classList.remove('counting');
      t.counting = false; t.view = null;
      t.t0 = t.qStart = performance.now();
      trialTick = setInterval(drawClock, 50);
      ftcNewQuestionDraw();
    }
    trialCountdown = setTimeout(function () { i = 1; t.view(); trialCountdown = setTimeout(go, 1000); }, 1000);
  }
  // put the normal state back (no new question is drawn here)
  function abortTrial() {
    if (!ftcTrial) return;
    clearInterval(trialTick); trialTick = null;
    clearTimeout(trialCountdown); trialCountdown = null;
    chordsPanel.classList.remove('counting');
    var sn = ftcTrial.snap;
    ftcBub = sn.bub; bubFull = sn.bubFull; ftcStreak = sn.streak; ftcTried = sn.tried; ftcRight = sn.right; ftcHomeNext = sn.home;
    ftcTrial = null; trialListOpen = false;
    syncTrialBox();
  }
  function trialAnswer(ok) {
    var now = performance.now(), t = ftcTrial;
    if (!t.note) ftcRecord(ok, ftcT0 == null ? null : now - ftcT0, false, true);
    t.times.push(now - t.qStart + (ok ? 0 : TRIAL_PENALTY));
    if (!ok) {
      t.penalty += TRIAL_PENALTY; t.wrongs++;
      trialPen.textContent = '+' + (TRIAL_PENALTY / 1000) + 's';
      trialPen.classList.remove('show'); void trialPen.offsetWidth; trialPen.classList.add('show');
    }
    pushBub(ok ? 'ok' : 'bad');
    t.n++;
    if (t.n >= TRIAL_LEN) { finishTrial(now); return; }
    t.qStart = now;
    ftcNewQuestionDraw();
    feedback(ok ? 'yes' : 'nope');                                      // (shown in the clef area of the next card, while the clock runs on)
  }
  // the results take the place of the staff: time, wrong answers, and two ways on
  function finishTrial(now) {
    var t = ftcTrial, total = now - t.t0 + t.penalty, key = trialKey(t.level), bests = trialBests(), best = bests[key];
    var isBest = best == null || total < best.ms;
    if (isBest) { bests[key] = { ms: total, wrong: t.wrongs }; try { window.localStorage.setItem(TRIALS_KEY, JSON.stringify(bests)); } catch (e) { /* storage unavailable */ } }
    clearInterval(trialTick); trialTick = null;
    t.done = true; t.total = total;
    state.card = null; ftcQ = null; state.answered = false; ftcClearPicks();
    chordsPanel.classList.add('counting');
    t.view = function () {
      stage.innerHTML = '<div class="trial-result"><div class="tr-icon"></div><h3 class="tr-title"></h3><div class="tr-time"></div><p class="tr-detail"></p><p class="tr-best"></p>' +
        '<div class="tr-actions"><button type="button" class="btn-reset tr-again">Try Again</button><span class="tr-menu"><button type="button" class="btn-reset tr-trials" aria-haspopup="true">Time Trial \u25be</button></span><button type="button" class="btn-reset tr-back">Back to Study</button></div></div>';
      var q = function (c) { return stage.querySelector(c); };
      q('.tr-icon').textContent = isBest ? '\u{1F389}' : t.wrongs >= 3 ? '\u{1F61E}' : '\u{1F610}';      // party / sad (three or more wrong) / shrug
      q('.tr-title').textContent = isBest ? 'New best time for ' + stageLabel(t.level) + '!' : stageLabel(t.level) + ' time trial complete';
      q('.tr-time').textContent = fmtTime(total);
      q('.tr-detail').textContent = t.wrongs + ' wrong' + (t.wrongs ? ' (+' + (t.wrongs * TRIAL_PENALTY / 1000) + 's)' : '');
      q('.tr-best').textContent = isBest ? (best ? 'Previous best: ' + fmtTime(best.ms) + ' · ' + best.wrong + ' wrong' : 'First time at this level') :
        'Best: ' + fmtTime(best.ms) + (best.wrong == null ? '' : ' · ' + best.wrong + ' wrong');
      q('.tr-again').addEventListener('click', function () { startTrial(t.level); });
      q('.tr-trials').addEventListener('click', function () {
        trialListOpen = !trialListOpen;
        if (trialListOpen) { buildTrialList(); q('.tr-menu').appendChild(trialList); }
        syncTrialBox();
      });
      q('.tr-back').addEventListener('click', function () { abortTrial(); ftcNewQuestionDraw(); });
    };
    syncTrialBox(); drawClock(); updateFtc(); updateScore(); updateChordPanel();
    t.view();
    if (isBest && !reduceMotion) { var r = stage.getBoundingClientRect(); confetti(r.left + r.width / 2, Math.max(60, r.top + r.height / 3)); }
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
    if (!quizOn() || state.answered || !ftcQ || ftcTrial) return;
    var want = ftcChord();
    if (!ftcMissed) { score.bad++; ftcTried++; pushBub('bad'); ftcNoteMiss(true); }
    ftcMissed = true;
    ftcStreak = 0;
    ftcWrong = false;
    var wd = FindChord.describe(want, ftcQ.type);
    ftcSel = { deg: ftcQ.deg, type: ftcQ.type, root: (wd.root + ftcQ.pc) % 12, qual: wd.qual, sev: wd.sev };
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
    if (viaKeyboard && !ftcNextBtn.hidden) ftcNextBtn.focus({ preventScroll: true });
  }

  // a chip was chosen: type and degree can come in either order; the second one is the guess
  function ftcPick(kind, value) {
    if (!quizOn() || state.answered || !ftcQ) return;
    if (ftcTrial && (ftcTrial.counting || ftcTrial.done)) return;
    if (bannerHold) { bannerHold = false; levelBanner.hidden = true; levelBanner.removeAttribute('data-welcome'); }
    if (ftcWrong) ftcClearPicks();                    // after a wrong guess the next click starts a new attempt
    ftcSel[kind] = value;
    if (ftcTypesHidden()) ftcSel.type = 'triad';       // (only triads so far: the degree alone is the guess)
    typePicked = ftcSel.type !== null;
    chordTypes_.full = ftcSel.type || 'triad';
    var pa = popAns(), got, ok, haveName = null;
    if (pa) {                                          // Pop: type + root + quality (+ maj/dom); sus chords need no quality
      var T = ftcSel.type;
      if (ftcSel.qual !== null && !FindChord.needsSev(T, ftcSel.qual)) ftcSel.sev = null;
      if (ftcSel.root === null || T === null || (FindChord.needsQual(T) && ftcSel.qual === null) || (FindChord.needsSev(T, ftcSel.qual) && ftcSel.sev === null)) { draw(false, false); return; }
      var sel = { root: ftcSel.root, type: T, qual: FindChord.needsQual(T) ? ftcSel.qual : null, sev: ftcSel.sev };
      ok = FindChord.checkAnswer(FindChord.describe(ftcChord(), ftcQ.type), ftcQ.pc, sel);
      haveName = FindChord.answerName(sel, ftcSpec().kind === 'flat');
      got = ok ? { deg: ftcQ.deg, type: ftcQ.type } : null;
      state.chord = got;
    } else {
      if (ftcSel.deg === null || ftcSel.type === null) { draw(false, false); return; }
      got = { deg: ftcSel.deg, type: ftcSel.type };
      state.chord = got;
      ok = got.deg === ftcQ.deg && got.type === ftcQ.type;
    }
    var want = ftcChord(), where = Theory.keyTitle(ftcSpec(), state.mode);
    if (ftcTrial) { trialAnswer(ok); return; }
    if (ok) {
      score.ok++;
      if (!ftcMissed) ftcRecord(true, ftcT0 == null ? null : performance.now() - ftcT0, false, false);   // known: it fades more slowly now
      state.answered = true;
      state.card.title = ftcName(want) + ' is ' + want.roman + ' in ' + where;
      state.card.modeLine = ftcPop() ? '' : 'Mode: ' + want.mode;
      state.card.status = '';
      var text = 'Correct: ' + state.card.title + '.', levelUpNote = 0, newStage = false, doneStage = 0;
      if (ftcMissed) ftcStreak = 0;
      else {
        ftcStreak++; ftcTried++; ftcRight++; pushBub('ok');
        if (ftcAuto && ftcStreak >= streakNeed()) {
          var n0 = ftcLevelNo(), up = n0 < FindChord.levelCount(state.mode, ftcPop());
          if (up) {
            doneStage = FindChord.levelInfo(state.mode, ftcPop(), n0).stage;
            ftcSetLevel(n0 + 1);
            ftcRaised(true);
            newStage = FindChord.levelInfo(state.mode, ftcPop(), n0 + 1).stage !== doneStage;
            levelUpNote = n0 + 1;
            text += newStage ? ' Stage ' + doneStage + ' complete!' : ' Next level!';
          }
          ftcStreak = 0; ftcTried = 0; ftcRight = 0;
          if (up) bubFull = true; else { ftcBub = null; bubFull = false; }          // (the full green row stays up while the banner shows; the next question empties it)
        }
      }
      saveFtc();
      ftcSay(text, 'ok');
      updateScore();
      draw(false, false);
      feedback('yes');
      if (levelUpNote) celebrate(levelUpNote, newStage, doneStage);
      return;
    }
    score.bad++;
    if (!ftcMissed) { ftcNoteMiss(); ftcTried++; pushBub('bad'); }
    ftcMissed = true;
    ftcStreak = 0;
    saveFtc();
    ftcWrong = true;                                  // (the chips keep showing the wrong chord until the next click)
    if (haveName) state.card.status = 'That is ' + haveName + '. Try again.';
    else { var have = Chords.chordInKey(ftcSpec().name, state.mode, got.deg, got.type); state.card.status = 'That is ' + have.symbol + ' (' + have.roman + '). Try again.'; }
    ftcSay(state.card.status, 'bad');
    updateScore();
    draw(false, false);
    feedback('nope');
  }

  function ftcKeyName(pc) {
    return Theory.specsFor(state.mode, pc).map(function (sp) { return sp.name + (state.mode === 'minor' ? 'm' : ''); }).join('/');
  }
  // after the levels were changed by hand: a question that is no longer in play is replaced
  function ftcRevalidate() {
    if (!quizOn() || !ftcQ || state.answered) return;
    var l = ftcLevels();
    var okKey = FindChord.keys(state.mode, ftcPop(), l.keys).indexOf(ftcQ.pc) >= 0;
    var okChord = FindChord.chords(state.mode, ftcPop(), l.chords).some(function (c) { return c.deg === ftcQ.deg && c.type === ftcQ.type; });
    if (okKey && okChord) return;
    var anim = ftcNewQuestion(true);
    updateScore();
    draw(anim, false);
  }
  function updateFtc() {
    var on = quizOn(), non = studyQuizOn();
    ftcSection.hidden = !(on || non);
    chordsPanel.classList.toggle('quizzing', on);
    if (non) { updateStudyHead(); return; }
    if (!on || !ftcQ) return;
    var li = FindChord.levelInfo(state.mode, ftcPop(), ftcLevelNo());
    document.getElementById('ftc-level').textContent = (ftcTrial ? 'Trial \u00b7 ' : '') + 'Stage ' + li.stage + ': Level ' + li.step;
    document.getElementById('ftc-level').title = 'Level ' + li.step + ' of ' + FindChord.stageSteps(state.mode, ftcPop(), ftcLevelNo());
    document.getElementById('ftc-streak').textContent = '';
    showStreak();
  }

  // local testing: the same one-step-at-a-time moves the automatic level-up makes, up or back down
  function ftcDifficulty(dir) {
    if (ftcTrial) return;
    if (studyQuizOn()) { stepDifficulty(dir); return; }
    var n = ftcLevelNo(), to = n + dir;
    if (to < 1 || to > FindChord.levelCount(state.mode, ftcPop())) return;
    ftcSetLevel(to);
    ftcRaised(dir > 0);
    ftcStreak = 0; ftcTried = 0; ftcRight = 0; ftcBub = null; bubFull = false;
    saveFtc(); updateFtc(); updateChordPanel();
    if (dir > 0 && quizOn() && ftcQ && !state.answered) { var anim = ftcNewQuestion(true); updateScore(); draw(anim, false); }      // (a harder step opens with a question about what it adds)
    else ftcRevalidate();
  }
  document.getElementById('ftc-harder').addEventListener('click', function () { ftcDifficulty(1); });
  document.getElementById('ftc-easier').addEventListener('click', function () { ftcDifficulty(-1); });
  ftcAutoBox.addEventListener('change', function () { ftcAuto = ftcAutoBox.checked; ftcStreak = 0; ftcTried = 0; ftcRight = 0; ftcBub = null; bubFull = false; saveFtc(); updateFtc(); });
  loadFtc();
  slots.chord = slotSnap();                         // (what loadFtc restored belongs to Find the chord)
  loadSteps();
  ftcAutoBox.checked = ftcAuto;

  function setCardMode(m) {
    state.cardMode = m;
    var radio = document.getElementById(FM_IDS[m]);
    if (radio) radio.checked = true;
  }
  // Pop studies keys, signatures and chords; Jazz studies chords only
  function syncStudyOptions() {
    ['fm-key', 'fm-sig'].forEach(function (id) {
      var input = document.getElementById(id);
      input.hidden = chordy();
      input.nextElementSibling.hidden = chordy();
    });
    var fc = document.getElementById('fm-chord');
    fc.hidden = !chordy(); fc.nextElementSibling.hidden = !chordy();
    ['fm-play', 'fm-find'].forEach(function (id) { var x = document.getElementById(id); x.hidden = !noteOn(); x.nextElementSibling.hidden = !noteOn(); });
    ['fm-key', 'fm-sig'].forEach(function (id) { var x = document.getElementById(id); x.hidden = chordy() || noteOn(); x.nextElementSibling.hidden = chordy() || noteOn(); });
    viewGroup.hidden = false;
    document.getElementById('mode-group').hidden = true;
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
  // Notes: a pitch class and a spelling (black keys: sharp or flat); 'find' answers on the staff run, which spells with sharps
  var NOTE_SHARP = ['C', 'C\u266F', 'D', 'D\u266F', 'E', 'F', 'F\u266F', 'G', 'G\u266F', 'A', 'A\u266F', 'B'];
  var NOTE_FLAT = ['C', 'D\u266D', 'D', 'E\u266D', 'E', 'F', 'G\u266D', 'G', 'A\u266D', 'A', 'B\u266D', 'B'];
  // Play the note, Find the note, Find the key and Find the signature each have five steps, tracked apart:
  // 1 the clef of your choice in Notes (treble in Keys), 2 bass, 3 treble and bass taking turns, 4 alto, 5 treble, bass and alto taking turns
  var STEP_CLEFS = [null, null, ['bass'], ['treble', 'bass'], ['alto'], ['treble', 'bass', 'alto']];
  function studyQuizOn() {
    if (!state.flash) return false;
    if (noteOn()) return state.cardMode === 'play' || state.cardMode === 'find';
    return !chordy() && (state.cardMode === 'key' || state.cardMode === 'sig');
  }
  function studySlot() { return noteOn() ? (state.cardMode === 'find' ? 'find' : 'play') : (state.cardMode === 'sig' ? 'sig' : 'key'); }
  function stepNo() { return ftcTrial && ftcTrial.note ? ftcTrial.level : FindChord.clamp(stepLv[studySlot()] || 1, 1, STUDY_STEPS); }
  function cardStepNo() { return state.card && state.card.lv ? state.card.lv : stepNo(); }       // (a card keeps the step it was dealt in)
  function cardClefId() {
    var list = STEP_CLEFS[cardStepNo()];
    if (list) return state.card && state.card.clef && list.indexOf(state.card.clef) >= 0 ? state.card.clef : list[0];
    return noteOn() && clefAllowed(state.clef) ? state.clef : 'treble';
  }
  function dealStep(prev) {                                   // the step and clef of a new card (a mixed step never repeats the clef twice running)
    var lv = stepNo(), list = STEP_CLEFS[lv], clef = null;
    if (list) { var pool = list.length > 1 ? list.filter(function (c) { return !prev || c !== prev.clef; }) : list; clef = pool[Math.floor(Math.random() * pool.length)]; }
    return { lv: lv, clef: clef };
  }
  // the first try at a card counts toward the streak; returns the step just reached when the streak lifted it
  function stepProgress(ok) {
    syncSlot();
    if (!ok) { if (!missedThisCard) { ftcTried++; pushBub('bad'); } ftcStreak = 0; saveFtc(); return 0; }
    var up = 0;
    if (missedThisCard) ftcStreak = 0;
    else {
      ftcStreak++; ftcTried++; ftcRight++; pushBub('ok');
      if (ftcAuto && ftcStreak >= streakNeed()) {
        var n0 = stepNo(), can = n0 < STUDY_STEPS;
        if (can) { stepLv[studySlot()] = n0 + 1; trialUnlocked = false; syncTrialBox(); up = n0 + 1; }       // (a level-up locks Time Trial again)
        ftcStreak = 0; ftcTried = 0; ftcRight = 0;
        if (can) bubFull = true; else { ftcBub = null; bubFull = false; }
      }
    }
    saveFtc();
    return up;
  }
  // local testing: the same one-step moves the streak makes
  function stepDifficulty(dir) {
    var n = stepNo(), to = n + dir;
    if (to < 1 || to > STUDY_STEPS) return;
    stepLv[studySlot()] = to;
    if (dir > 0) { trialUnlocked = false; syncTrialBox(); }
    ftcStreak = 0; ftcTried = 0; ftcRight = 0; ftcBub = null; bubFull = false;
    saveFtc();
    state.answered = false; lastResult = ''; state.selected = false; if (noteOn()) newNoteCard(); else newCard(); updateScore(); draw(false, false);
  }
  // the progress row under the keyboard: step, bubbles, Time Trial, Advance automatically (as in Find the chord)
  var stepCard = el('section', 'chords step-card'), stepInfo = el('div', 'chord-info quiz step-info');
  stepCard.hidden = true;
  stepCard.appendChild(stepInfo);
  ftcSection.parentNode.insertBefore(stepCard, ftcSection.nextSibling);
  function updateStudyHead() {
    var on = studyQuizOn();
    stepCard.hidden = !on;
    if (!on) return;
    syncSlot();
    levelTag.textContent = (ftcTrial ? 'Trial \u00b7 ' : '') + 'Level ' + stepNo();
    levelTag.title = 'Level ' + stepNo() + ' of ' + STUDY_STEPS;
    quizHead.appendChild(levelTag);
    quizHead.appendChild(scoreBox); scoreBox.hidden = false;
    quizHead.appendChild(trialBox);
    quizHead.appendChild(autoRow);
    autoRow.hidden = !!ftcTrial;
    if (quizHead.parentNode !== stepInfo) stepInfo.appendChild(quizHead);
    showStreak();
  }
  var noteSel = null;                                  // Notes, Explore: the key/note last clicked (0..24)
  var noteSpell = 0, noteLastSpell = 1;                // Explore's sharps(0)/flats(1) toggle; Study alternates, starting with sharps
  function newNoteCard() {
    syncSlot();
    if (bubFull) { ftcBub = null; bubFull = false; }                                         // (a new step starts with empty bubbles)
    var avoid = state.card ? state.card.pc : -1, idx, pc, pre = state.cardMode === 'find' ? 'find|' : 'play|', keys = [];
    for (var i = 0; i < 25; i++) keys.push(pre + i);                                        // two octaves from middle C: 0..24, each remembered on its own
    idx = parseInt(Memory.pick(cardMem, keys, function (k) { return parseInt(k.slice(5), 10) % 12 === avoid; }, Math.random, Date.now()).slice(5), 10);
    pc = idx % 12;
    startCardClock(true);
    var flat = noteLastSpell === 0;                           // Study: sharps and flats take turns
    noteLastSpell = flat ? 1 : 0;
    var dl = dealStep(state.card);
    state.card = { idx: idx, pc: pc, spell: flat ? 1 : 0, name: (flat ? NOTE_FLAT : NOTE_SHARP)[pc], lv: dl.lv, clef: dl.clef };
    missedThisCard = false;
    state.guess = null;
  }
  function newCard() {
    if (noteOn()) { newNoteCard(); return; }
    syncSlot();
    if (bubFull) { ftcBub = null; bubFull = false; }                                          // (a new step starts with empty bubbles)
    var avoid = state.card ? state.card.pc : -1, prevCard = state.card;
    var pre = state.cardMode === 'sig' ? 'sig|' : 'key|', keys = [], i;
    for (i = 0; i < 12; i++) keys.push(pre + state.mode + '|' + i);
    var pc = parseInt(Memory.pick(cardMem, keys, function (k) { return parseInt(k.split('|')[2], 10) === avoid; }, Math.random, Date.now()).split('|')[2], 10);
    startCardClock(true);
    missedThisCard = false;
    state.guess = null;
    // a two-spelling key shows one spelling on the cue (random), both once solved; the shown one is lit
    var dl = dealStep(prevCard);
    state.card = { pc: pc, spell: Math.floor(Math.random() * Theory.specsFor(state.mode, pc).length), lv: dl.lv, clef: dl.clef };
    if (resumeQ && resumeQ.cardMode !== 'chord') {      // reloaded mid-question: the same card again
      state.card = { pc: resumeQ.pc, spell: resumeQ.spell, lv: dl.lv, clef: dl.clef };
      startCardClock(false);                            // (the time away isn't an answer time)
      missedThisCard = !!resumeQ.missed;
    }
    resumeQ = null;
    if (state.cardMode === 'sig') {               // find-the-signature: the keyboard is rooted on the card's tonic
      state.root = pc;
      state.spell = state.card.spell;
      state.selected = false;
    }
  }

  function updateScore() {
    okEl.textContent = score.ok;
    syncSlot();
    scoreBox.classList.toggle('quiz', quizOn() || studyQuizOn());
    showStreak();
    badEl.textContent = score.bad;
    scoreBox.hidden = !state.flash || (quizOn() && score.ok + score.bad === 0 && !isPhoneLayout() && !ftcTrial);
    if (!(quizOn() && score.ok + score.bad > 0) && !studyQuizOn() && scoreBox.parentNode !== scoreHome) scoreHome.appendChild(scoreBox);
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
    dismissWelcome();
    if (state.answered) return;                 // already solved: press Next for the next card
    if (ftcTrial && ftcTrial.note) { if (!(ftcTrial.counting || ftcTrial.done)) trialAnswer(pc === state.card.pc); return; }       // (a trial moves on whatever the answer)
    if (pc !== state.card.pc) {
      score.bad++;
      memRecord(false);                         // this key will turn up more often
      stepProgress(false);
      missedThisCard = true;
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
    memRecord(true);                            // known: it fades more slowly now
    var upTo = stepProgress(true);
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
    if (upTo) celebrateStep(upTo);
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
    if (ftcTrial && ftcTrial.note) { if (!(ftcTrial.counting || ftcTrial.done)) trialAnswer(pick.pc === state.card.pc && pick.spell === state.card.spell); return; }
    if (pick.pc !== state.card.pc || pick.spell !== state.card.spell) {     // F#/Gb are separate answers
      score.bad++;
      memRecord(false);
      stepProgress(false);
      missedThisCard = true;
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
    memRecord(true);
    var upTo = stepProgress(true);
    var notes = Theory.signatureNotes(sp);
    lastResult = 'Correct, ' + Theory.keyTitle(sp, state.mode) + ' has ' +
      (sp.n === 0 ? 'no sharps or flats' : sp.n + ' ' + sp.kind + (sp.n === 1 ? '' : 's') + ' (' + notes.join(' ') + ')') + '.';
    state.guess = pick;
    state.answered = true;
    state.selected = true;                      // light up the key's scale on the keyboard
    state.spell = pick.spell;
    updateScore();
    draw(false, false);
    if (upTo) celebrateStep(upTo);
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
    if (noteOn()) { state.answered = false; lastResult = ''; newNoteCard(); updateScore(); draw(false, false); return; }
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

  function noteAnswer(val) {
    dismissWelcome();                             // play the note: the pitch class pressed (any octave); find the note: the staff note clicked (0..24)
    if (ftcTrial && (ftcTrial.counting || ftcTrial.done)) return;
    if (state.answered || !state.card) return;
    var find = state.cardMode === 'find', pc = val % 12;
    if (ftcTrial && ftcTrial.note) { trialAnswer(find ? val === state.card.idx : pc === state.card.pc); return; }       // (a trial moves on whatever the answer)
    if (find ? val !== state.card.idx : pc !== state.card.pc) {
      score.bad++;
      memRecord(false);                                           // (the octave counts: the same note up the keyboard is its own card)
      stepProgress(false);
      missedThisCard = true;
      var octave = find && pc === state.card.pc;                  // the right note name, the wrong octave
      state.guess = octave ? 'octave' : pc;
      lastResult = octave ? 'Right note, wrong octave: pick the one that matches the lit key.' : 'Incorrect. That is ' + NOTE_SHARP[pc] + (NOTE_SHARP[pc] !== NOTE_FLAT[pc] ? ' / ' + NOTE_FLAT[pc] : '') + '.';
      updateScore();
      draw(false, false);
      feedback('nope', null);
      return;
    }
    score.ok++;
    memRecord(true);
    var upTo = stepProgress(true);
    state.answered = true;
    lastResult = 'Correct, ' + state.card.name + (state.cardMode === 'play' && NOTE_SHARP[pc] !== NOTE_FLAT[pc] ? ' (also ' + (state.card.spell ? NOTE_SHARP[pc] : NOTE_FLAT[pc]) + ')' : '') + '.';
    updateScore();
    draw(false, false);
    feedback('yes');
    if (upTo) celebrateStep(upTo);
  }
  function press(pc, spell, viaKeyboard, fromS, keyEl) {
    if (noteOn()) {
      if (!state.flash) { var ni0 = (fromS != null && fromS >= 0 && fromS <= 24) ? fromS : pc; noteSel = noteSel === ni0 ? null : ni0; draw(false, false); }
      else if (state.cardMode === 'play') noteAnswer(pc);
      return;
    }
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
      if (chordy() && state.cardMode !== 'chord') setCardMode('chord');     // the chord modes study chords only; the others never do
      else if (noteOn() && state.cardMode !== 'play' && state.cardMode !== 'find') setCardMode('play');
      else if (!chordy() && !noteOn() && (state.cardMode === 'chord' || state.cardMode === 'play' || state.cardMode === 'find')) setCardMode('key');
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
      if (quizOn()) { abortTrial(); ftcQ = null; ftcStreak = 0; ftcTried = 0; ftcRight = 0; ftcBub = null; bubFull = false; ftcFresh = { asked: 0, fresh: 0 }; state.chord = null; typePicked = false; ftcNewQuestion(false); }
      else newCard();
    }
    draw(state.flash ? 'fade' : false, false);
  }

  function reset() {
    if (state.flash) setView(false);
    if (appMode !== 'note') { document.getElementById('am-note').checked = true; applyAppMode('note'); syncModeBtn(); }
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
        KeyboardRender.clefIcon(c.id) + '<span class="clef-opt-name">' + c.name + '</span><span class="clef-opt-note">' + c.note + (c.more ? '<br>' + c.more : '') + '</span></button>';
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
    if (levelBanner.getAttribute('data-welcome') && levelBanner.getAttribute('data-welcome') !== '1' && !(e.target.closest && e.target.closest('.levelup-go'))) dismissWelcome();
    var ch = e.target.closest && e.target.closest('.clef-hit');
    if (ch) { openClefPop(ch); return; }
    var iz = e.target.closest && e.target.closest('.inv-zone');
    if (iz) { moveInversion(parseInt(iz.getAttribute('data-chord'), 10), iz.getAttribute('data-dir')); return; }
    if (e.target.closest && e.target.closest('.next-btn')) { nextCard(e.detail === 0); return; }
    if (e.target.closest && e.target.closest('.giveup-btn')) { ftcGiveUp(e.detail === 0); return; }
    var nh = e.target.closest('.note-hit');
    if (nh) {
      var ni = parseInt(nh.getAttribute('data-ni'), 10);
      if (!state.flash) { noteSel = noteSel === ni ? null : ni; draw(false, false); }
      else if (state.cardMode === 'find') noteAnswer(ni);
      return;
    }
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
      if (quizOn() && e.key === 'Enter' && !levelBanner.hidden) return;        // a banner is up: Enter doesn't skip it
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

  // a welcome banner is up: Enter is "Go" too (before any other Enter handling sees it)
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (levelBanner.hidden || !levelBanner.hasAttribute('data-welcome')) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, select, textarea')) return;
    e.preventDefault(); e.stopImmediatePropagation(); dismissWelcome();
  }, true);

  // Flashcards: once a card is solved, the right arrow deals the next one (same as the Next button).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (state.flash && !levelBanner.hidden && levelBanner.hasAttribute('data-welcome')) {      // the welcome banner: the right arrow is "Go"
      var wt = e.target;
      if (!(wt && wt.closest && wt.closest('input, select, textarea'))) { e.preventDefault(); bannerHold = false; levelBanner.hidden = true; levelBanner.removeAttribute('data-welcome'); return; }
    }
    if (quizOn() && state.answered && !levelBanner.hidden) {              // Find the chord: the right arrow goes on from a banner
      e.preventDefault();
      ftcNextQuestion(true);
      return;
    }
    if (!state.flash || !state.answered) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, select, textarea')) return;      // radios etc. keep their arrow keys
    e.preventDefault();
    nextCard(true);
  });

  // Pop Find the chord: 1-8 pick the type, A-G the root (Shift = sharp, Alt = flat), P [ ] \ the quality (dim min maj aug), ; ' the seventh (maj dom)
  var NATURALS = { KeyC: 0, KeyD: 2, KeyE: 4, KeyF: 5, KeyG: 7, KeyA: 9, KeyB: 11 };
  var QUAL_CODES = { KeyP: 'dim', BracketLeft: 'min', BracketRight: 'maj', Backslash: 'aug' }, SEV_CODES = { Semicolon: 'maj', Quote: 'dom' };
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || !popAns() || !state.selected || chordsPanel.hidden || !chordsDetails.open) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, select, textarea')) return;
    var btn = null, c = e.code;
    if (/^[1-8]$/.test(e.key) && !e.altKey && !e.shiftKey) btn = chordTypes.children[parseInt(e.key, 10) - 1];
    else if (NATURALS[c] !== undefined) btn = chordsPanel.querySelector('[data-root="' + ((NATURALS[c] + (e.shiftKey ? 1 : 0) - (e.altKey ? 1 : 0) + 12) % 12) + '"]');
    else if (!e.altKey && !e.shiftKey && QUAL_CODES[c]) btn = chordsPanel.querySelector('[data-qual="' + QUAL_CODES[c] + '"]');
    else if (!e.altKey && !e.shiftKey && SEV_CODES[c]) btn = chordsPanel.querySelector('[data-sev="' + SEV_CODES[c] + '"]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    btn.click();
  });

  // Notes, Play the note and Keys, Find the key: A-G name the note (Shift = sharp, Alt = flat); once solved, Enter (like the right arrow) goes on
  document.addEventListener('keydown', function (e) {
    var keyStudy = state.flash && !noteOn() && !chordy() && !!state.card && (state.cardMode === 'key' || state.cardMode === 'sig');     // Find the key / signature
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || !(noteCardOn() || keyStudy)) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, select, textarea')) return;
    if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
      if (!state.answered) return;
      if (t && t !== document.body && t !== document.documentElement && !(t.closest && t.closest('#stage'))) return;
      e.preventDefault();
      nextCard(true);
      return;
    }
    if ((state.cardMode === 'play' || state.cardMode === 'key') && !state.answered && NATURALS[e.code] !== undefined) {
      e.preventDefault();
      var npc = (NATURALS[e.code] + (e.shiftKey ? 1 : 0) - (e.altKey ? 1 : 0) + 12) % 12;
      if (state.cardMode === 'play') noteAnswer(npc); else answer(npc, true, null, null);
    }
  });

  // Progressions: arrows step, Enter adds the selected chord, and the section's own buttons
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || !plainKey(e)) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, select, textarea')) return;
    if (quizOn() && e.key === 'Enter') {                  // Find the chord: Enter checks, then goes on
      var qchip = t && t.closest && t.closest('button[data-deg], button[data-type], button[data-root], button[data-qual], button[data-sev]');
      if (qchip || !t || t === document.body || t === document.documentElement) {
        e.preventDefault();
        if (state.answered && levelBanner.hidden) ftcNextQuestion(true);          // (with a banner up, only the right arrow goes on)
        return;
      }
    }
    if (state.selected && (!state.flash || quizOn()) && !chordsPanel.hidden && chordsDetails.open && !popAns()) {
      // chord selector shortcuts: 1-7 pick the degree/mode; A S D F ... pick the type chips in the order shown
      var sc = null;
      if (/^[1-7]$/.test(e.key)) {
        var dchip = chordDegrees.querySelector('[data-deg="' + (parseInt(e.key, 10) - 1) + '"]');
        if (dchip && !dchip.disabled) sc = dchip.getAttribute('aria-pressed') === 'true' && !(quizOn() && ftcWrong) ? 'same' : dchip;     // never toggles a degree off (a wrong guess's chips are re-pickable: that starts a new attempt)
      } else if (e.key.length === 1 && TYPE_KEYS.indexOf(e.key.toLowerCase()) >= 0) {
        var tchip = chordTypes.children[TYPE_KEYS.indexOf(e.key.toLowerCase())];
        if (tchip) sc = tchip.getAttribute('aria-pressed') === 'true' && !(quizOn() && ftcWrong) ? 'same' : tchip;
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

  // the top-level topic: Note | Key | Pop Chord | Minor key | Jazz Chord (drives the hidden level and mode switches)
  function applyAppMode(am) {
    if (am === appMode) return;
    appMode = am;
    var wantLevel = theoryMode() ? 'jazz' : 'pop';
    var wantMode = appIsMinor() ? 'minor' : 'major';
    var lr = document.getElementById('level-' + wantLevel);
    if (!lr.checked) { lr.checked = true; lr.dispatchEvent(new Event('change')); } else { level = wantLevel; }
    var mr = document.getElementById('mode-' + wantMode);
    mr.checked = true; setMode(wantMode);
    syncStudyOptions();
    var wantCard = chordy() ? 'chord' : noteOn() ? ((state.cardMode === 'play' || state.cardMode === 'find') ? state.cardMode : 'play') : ((state.cardMode === 'sig') ? 'sig' : 'key');
    if (wantCard !== state.cardMode) { if (state.flash) setFlashMode(wantCard); else setCardMode(wantCard); }
    state.chord = null;
    if (!state.flash) {
      noteSel = null;
      if (!chordy()) { state.selected = false; state.root = 0; state.spell = 0; }      // the key-signature panel, nothing picked
      else if (!state.selected) { selectRoot(0, 0, false, null); }                       // the chord modes need a key: C
    }
    updateScore();
    draw(false, false);
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[name="notespell"]'), function (input) {
    input.addEventListener('change', function () { if (input.checked) { noteSpell = input.value === 'flat' ? 1 : 0; draw(false, false); } });
  });
  function syncModeBtn() {
    var r = document.getElementById('am-' + appMode);
    document.getElementById('mode-btn-label').textContent = document.querySelector('label[for="' + r.id + '"]').textContent;
  }
  (function buildKnots() {                          // one blob: a string whose knots swell out of it smoothly
    var n = document.querySelectorAll('input[name="appmode"]').length, ys = [], i, g = '';
    for (i = 0; i < n; i++) ys.push(8 + 18 + 36 * i);
    for (i = 0; i < n; i++) g += '<circle cx="25" cy="' + ys[i] + '" r="9.5"/>';
    var svg = '<svg class="knots" width="50" height="' + (16 + 36 * n) + '" aria-hidden="true"><defs><filter id="goo" x="-50%" y="-5%" width="200%" height="110%">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 14 -5.5"/></filter></defs>' +
      '<g filter="url(#goo)" fill="#4a7bec"><rect x="21.5" y="' + ys[0] + '" width="7" height="' + (ys[n - 1] - ys[0]) + '"/>' + g + '</g></svg>';
    document.getElementById('appmode-group').insertAdjacentHTML('afterbegin', svg);
  })();
  function initCardMode() {                              // a first visit opens in Notes, whose study cards are not the Keys ones
    var want = chordy() ? 'chord' : noteOn() ? ((state.cardMode === 'play' || state.cardMode === 'find') ? state.cardMode : 'play') : ((state.cardMode === 'sig') ? 'sig' : 'key');
    state.cardMode = want; document.getElementById('fm-' + want).checked = true;
  }
  function modeMenu(open) {
    document.getElementById('appmode-group').hidden = !open;
    document.getElementById('mode-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  document.getElementById('mode-btn').addEventListener('click', function (e) {
    e.stopPropagation(); modeMenu(document.getElementById('appmode-group').hidden);
  });
  document.addEventListener('click', function (e) {
    if (!document.getElementById('mode-menu').contains(e.target)) modeMenu(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') modeMenu(false); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="appmode"]'), function (input) {
    input.addEventListener('change', function () { if (input.checked) { applyAppMode(input.value); syncModeBtn(); modeMenu(false); } });
  });
  syncModeBtn();
  document.getElementById('am-' + appMode).checked = true;
  initCardMode();

  Array.prototype.forEach.call(levelInputs, function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) return;
      level = input.value;
      syncStudyOptions();                           // Jazz studies chords only; Pop has all three activities
      /* (the app-mode switch sets the study activity) */
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

  function syncDial() {
    var v = state.layout === 'vertical';
    layoutDial.setAttribute('aria-pressed', v ? 'true' : 'false');
    layoutDial.setAttribute('aria-label', 'Signature layout: ' + (v ? 'vertical (switch to horizontal)' : 'horizontal (switch to vertical)'));
  }
  layoutDial.addEventListener('click', function () {
    state.layout = state.layout === 'vertical' ? 'horizontal' : 'vertical';
    syncDial();
    pendingLayout = reduceMotion ? null : state.layout === 'vertical' ? 'in' : 'out';
    draw();
    pendingLayout = null;
  });
  // horizontal -> vertical: clones of the existing staves slide to the open spaces (sharps first, then flats)
  function layoutIn(svg) {
    var natives = Array.prototype.filter.call(svg.querySelectorAll('.box'), function (b) { return !b.closest('.xbox'); });
    var DUR = 700, SHAKE = 500, DIM = 400, GAP = 175, SEQ = DUR + SHAKE + DIM;     // per group: slide, shake in place, dim
    Array.prototype.forEach.call(svg.querySelectorAll('.xbox'), function (x) {
      var eb = x.querySelector('.box');
      var nb = natives.filter(function (b) { return b.dataset.pc === eb.dataset.pc && b.dataset.spell === eb.dataset.spell; })[0];
      if (!nb) return;
      var nr = nb.querySelector('rect'), er = eb.querySelector('rect');
      var dx = nr.getAttribute('x') - er.getAttribute('x'), dy = nr.getAttribute('y') - er.getAttribute('y');
      var d0 = x.dataset.kind === 'flat' ? SEQ + GAP : 0;                  // flats start once the sharps have settled
      x.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
        { duration: DUR, delay: d0, easing: 'ease-in-out', fill: 'backwards' });
      x.animate([0, -4, 4, -4, 4, -2, 2, 0].map(function (t) { return { transform: 'translate(' + t + 'px,0)' }; }),
        { duration: SHAKE, delay: d0 + DUR });      // no backwards fill: it would pin the transform and hide the slide
      x.querySelector('.xveil').animate([{ opacity: 0 }, { opacity: 0.4 }], { duration: DIM, delay: d0 + DUR + SHAKE, easing: 'ease-out', fill: 'backwards' });
    });
  }
  // vertical -> horizontal: the duplicates stay behind and fade out over a few seconds
  function layoutOut(svg, html) {
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('pointer-events', 'none');
    g.innerHTML = html;
    svg.appendChild(g);
    g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1500, easing: 'ease-out', fill: 'forwards' }).onfinish = function () { g.remove(); };
  }

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
    Memory.reset(cardMem);
    Memory.save(CARD_MEM_KEY, cardMem);
    try { window.localStorage.removeItem(OLD_WEIGHTS_KEY); } catch (e) { /* storage unavailable */ }
    FindChord.resetMem(ftcMem);                       // (the practice log is kept)
    FindChord.saveMem(ftcMem);
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
    noteSpell = 0; noteSel = null;
    level = 'pop'; appMode = 'note';
    document.getElementById('level-pop').checked = true;
    document.getElementById('am-note').checked = true; syncModeBtn();
    state.layout = 'horizontal'; syncDial();
    syncStudyOptions();
    resetFtc();
    state.mode = 'major';
    document.getElementById('mode-major').checked = true;
    state.scaleKind = 'full';
    document.getElementById('sk-full').checked = true;
    state.cardMode = 'play';
    document.getElementById('fm-play').checked = true;
    document.getElementById('view-explore').checked = true;
    sortBy = 'scale';
    typeSortBy = 'frequency';
    chordTypes_ = { full: 'triad', pentatonic: 'maj', wholetone: 'aug' };
    chordsDetails.open = true;
    progDetails.open = true;
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
    updateChordPanel();                                // (Find the chord: the instruction is back)
  });

  resetBtn.addEventListener('click', reset);

  // Turning the phone changes the width of the stage: put the card (or the opened staff) back in the middle of what is visible.
  var recentreTimer = null;
  function recentre() {
    clearTimeout(recentreTimer);
    recentreTimer = setTimeout(function () {
      if (quizOn() && !(ftcTrial && (ftcTrial.counting || ftcTrial.done))) centreQuizStage(state.answered ? 'open' : 'card');
    }, 200);
  }
  window.addEventListener('resize', recentre);
  window.addEventListener('orientationchange', recentre);

  restoreState();
  if (chordy() && !state.selected && !state.flash && !pendingStudy) { state.selected = true; state.root = 0; state.spell = 0; }
  syncStudyOptions();
  updateScore();
  if (pendingStudy) {                                   // reload in Study: back to the same Study mode
    document.getElementById('view-flash').checked = true;
    setCardMode(pendingStudy);
    reopening = true;
    setView(true);
    reopening = false;
  }
  draw(false, false);
})();
