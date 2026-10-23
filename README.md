# Music Theory (Piano)

An interactive piano keyboard that shows the key signature of every major and minor key.
Click any key (black or white) to root the keyboard there and light up its scale.

No build tools or dependencies. Open `index.html` in a browser, or open the single-file
`dist/index.html`.

## What it does

- **Major / Minor selector.** Switches every label box between major and natural-minor
  signatures. The selected root stays put; its spelling re-defaults for the new mode.
- **Click a key to root it.** The keyboard slides to the new view. The view always starts on
  C (the start of the pair of black keys) or F (the start of the triple) and ends after E or B,
  so a group of black keys is never split. It shows two full octaves from the root: roots C to E
  start on C (17 white keys), roots F to B start on F (18). The scale keeps going through the second
  octave (chords light up there too). The key-signature boxes appear only above the leftmost octave, so
  each signature shows once (the boxes are drawn smaller than the old one-octave layout to fit; the page
  is also a little wider). Fingering and sound stay in the lower octave. Black keys work too.
- **Scale highlight.** All keys of the scale are lit in one uniform light yellow. Highlighted keys
  are named with the correct spelling of the scale (D major shows F♯, G♭ major shows C♭). Use the
  chord selector (pick type Triad and degree 1, the I chord) to see the root, third and fifth.
- **Pop / Jazz level.** A Pop / Jazz switch at the left of the controls (default Pop). Pop hides the
  advanced theory you don't need for carols and pop tunes: the Pentatonic / Whole tone switch, the 11th
  and 13th chord types, the Ambiguity and Tension sorts, the mode names and brightness shading on the
  degree chips (the row is labelled "Degree"), the mode sort, and the mode paragraph and the
  tension/ambiguity sentence in the chord description. Study mode is a Pop-only activity: the Explore / Study switch is hidden in Jazz (and switching to Jazz from study mode returns to Explore). Jazz shows the advanced theory. Switching back to Pop
  returns to the full scale and drops any hidden chord type.
- **Find the signature (Study).** With Study on, a second switch picks the direction. *Find the key*
  is the original card (a signature is shown; press the key). *Find the signature* reverses it: the keyboard
  rotates onto a random tonic (the lit key, labelled with its spelling) and all the signatures of the current
  Major / Minor deck sit above it, C (or Am) in the first column centred vertically between two rows, sharps
  on top and flats below, so equal numbers of accidentals line up in columns. Click the matching signature. F♯ and G♭ (D♯m and E♭m) are separate boxes and
  independent answers: the lit key says which one is asked for. A wrong pick is named and counts as a miss
  (missed tonics come up more often); a right pick names the key, counts its accidentals and lists them,
  lights the scale, and offers Next, which rotates the keyboard onto the next tonic as a click does in Explore.
- **Keyboard shortcuts (chord selector, while it is open).** 1-7 pick the degree (Mode row in Jazz; same
  degrees, whatever the sort order); A S D F G H J K pick the Type chips in the order they are shown (so
  they follow the Frequency / Complexity / ... sort). Each chip shows its key in the corner, but only while the Progressions section is open. In Pop the type sort menu is hidden (the order is always by frequency). Enter submits the
  chord to the progression. Pressing a key that is already selected leaves it selected.
- **Sound.** (`js/audio.js`, Web Audio; no samples, no piano imitation: each note is a soft triangle plus a sine.) In the
  Chords section a "Hold to play" speaker button appears when the section is open and a chord is selected. In
  Progressions a "Sound off / Sound on" switch keeps the lit chord sounding and follows the stepping, cross-fading
  over ~0.1 s and letting shared notes ring (it starts at the first chord if none is lit). The notes are the
  left-hand voicing the keyboard shows. **Shift key** (pressed alone, not in a combination): with Progressions open it toggles the progression sound on release (P
  does too); otherwise, with Chords open and a chord selected, it plays the chord while held; with neither open (or
  nothing to play) it does nothing. A held chord stops if the chord or key changes; the progression sound keeps
  going across key changes but stops when its section is collapsed or hidden. The audio engine is created on
  the first click or key press, as browsers require.
- **Reordering and Clear.** The chiclets in a progression can be dragged with the mouse to a new position (a bar shows where
  the chord will land; the lit chord stays lit, the fingering is recomputed, and a saved progression is updated). The
  Add and Clear (and the Actions menu) are shown only while the chord selector is open; Clear only when there are chords.
- **Saved progressions.** Once a progression has chords, a name box and Save button appear (Enter also saves). After the
  first save, two menus appear on the Progressions header line, only while the section is expanded: a selector of the
  saved progressions, and an Actions menu (Rename, Duplicate, Delete, then New progression after a separator; shown only while the chord selector is open). New progression looks exactly like
  working on the first one (name box and Save, no placeholder entry), and the Actions menu is hidden until it is saved or a stored one is opened. Opening a stored progression while a new one has unsaved chords asks "Discard current progression?" (Yes / Cancel).
  Delete asks for confirmation; Clear on a saved progression needs a second click. Edits to a saved progression are kept
  automatically, names are kept unique (a suffix is added), and everything lives in localStorage and is cleared by
  Reset app settings.
- **Progressions (Explore).** A collapsible section below the chord selector, hidden until a chord (type and
  degree) has been selected, unless a saved progression exists, in which case it appears as soon as a key is picked; then it appears (collapsed) and stays. Nothing is pre-selected: opening the chord selector
  or Reset view leaves no chord, and the section waits for the first one. Inside the section, under its title (so only
  while it is expanded, and only while the chord selector is open), an "Add ... to progression" button, or the
  Enter key (even with a type or degree chip focused), submits the selected chord; Clear sits at the far right
  of the same row. The progression is a row of chiclets (roman numeral over chord name; × removes one) stored by degree and type, so it follows whatever key you pick. It is saved in localStorage.
  With the section open, picking a key on the piano lights the first chord; Next, the right arrow (also
  while a piano key has focus), or a click on a chiclet steps through, wrapping at the end (Prev / left arrow go
  back). The lit chord is layered onto the keyboard exactly as in the chord selector, and a suggested **left-hand fingering** is labelled under its keys (1 = thumb, 5 = little finger; an "LH" row just under the keys, shown only while the Progressions section is expanded),. Fingering is computed as the progression is entered (`js/fingering.js`): each chord is voiced as an inversion inside the keys on screen, chosen for the whole progression at once (including the wrap from the last chord back to the first) to keep the hand moving as little as possible and the stretch to 9 semitones or less. Chords of five or more notes (9th, 11th, 13th) are cut to four tones: root, 3rd, 7th and top extension. Each chiclet's tooltip gives its inversion and fingers. Full scales only (not
  pentatonic or whole tone).
- **Scale type (Explore).** A Full scale / Pentatonic / Whole tone switch beside Major / Minor. Pentatonic
  follows the mode (major pentatonic 1 2 3 5 6, minor pentatonic 1 ♭3 4 5 ♭7); whole tone is six notes a
  whole step apart. The lit keys use the same light yellow and carry correctly spelled names. The
  chord selector works for all three. For pentatonic and whole tone it offers only chords whose
  notes all belong to the scale (pentatonic: major/minor, sus2, sus4, 6, add9, 6/9, m7, 7sus4, power
  chords; whole tone: augmented, 7♯5, 7♭5, 9♯5), and greys out the notes that can't carry the chosen type.
- **Label boxes are clickable too.** For a key with two spellings (F♯/G♭ major, D♯/E♭ minor)
  click the half of the tall box you want.
- **Chord selector (Explore).** With a key selected, a panel below the keyboard lists the chord on
  each degree of the key (roman numeral + chord name) and eight chord types: triad, sus2, sus4,
  add9, 7th, 9th, 11th, 13th. Pick a degree and the chord lights up (root deep amber, other chord
  tones orange, the rest of the scale faint) and the panel shows the symbol (Em7), roman numeral
  with its key (D: ii7; the key letter is lower case for a minor key, e.g. d: iv), the mode that starts on its root (E Dorian) with a description of how that mode sounds, the chord type's description ending in one sentence on its ambiguity and tension (tension adjusts to the chord's quality: dominant sevenths drive, major and minor ones rest), and the notes with their
  intervals. The seven degree chips (labelled Mode) can be sorted (via a small menu at the right of the row, with a "?" beside it that pops up an explanation of the chosen order on mouse-over; scale order's explains the capital/lower-case numerals and the major/minor pattern) by scale order, brightness (Lydian to Locrian), or frequency of use (Ionian, Aeolian, Mixolydian, Dorian, Lydian, Phrygian, Locrian; a rough conventional ranking). The eight chord types can likewise be sorted by frequency of use (the default), complexity (number of notes), ambiguity (how little they say about major vs minor) or tension (how much they want to resolve). Both sort controls sit at the right of their rows. The mode chips are very gently shaded from the brightest mode (Lydian) to the darkest (Locrian). Chord qualities come from the key, so they are always diatonic. (`js/chords.js`) The panel is collapsible (click its
  "Chords in the key of C" header, naming the selected key) and starts collapsed. The chord sources are linked in the footer.
- **Study.** The Explore / Study switch turns on a quiz. All the signature boxes and
  the counts on the keys are hidden and one random key signature (just the clef and accidentals)
  is shown. Press the key you think it is: a wrong key shakes the card, flashes the key red,
  shows "Nope" and adds to the incorrect count; the right key adds to the correct count, slides
  the keyboard to that key with its scale lit up, and deals a new card. Major/Minor picks the
  deck; "Reset score" clears the counts.
  The keys carry no labels (only the notes of the scale light up and are named once you answer).
  After a correct answer a **Next** button sits beside the clef; the solved card slides out and the
  new one slides in.
- **Weighted deal.** Every wrong answer makes that key more likely to come up again (+2 to its
  weight, max 16, separately for major and minor); getting it right first time eases it back (-1).
  Weights are saved in the browser's localStorage when available. The quiet "Reset app settings
  weights" link in the footer clears them. (`js/weights.js`)
- **Keyboard accessible.** Tab to a key, Enter/Space to root, ← → to move between keys.

- **Notation on the stave.** While the Chords or Progressions section is open, the signature boxes give way to one treble stave (the current key's signature) stretched across the keyboard. With Chords open and a chord selected it shows the chord in root position and each inversion, with the chord symbol (and slash bass) underneath. With Progressions open it ignores the chord selector and shows the progression as whole-note block chords, one per slot, using the same smooth left-hand voicings as the fingering plan, with Roman numeral and symbol underneath and the lit chord highlighted. With nothing to show the stave is empty, with a hint. Closing both sections brings the signature boxes back.

- **Clef picker.** Click the clef on the big stave to choose treble, treble 8va, treble 8vb, alto, tenor or bass (the choice is remembered). Key signatures and note positions follow the clef; inversions start from a clef-appropriate note (middle C for treble) and progressions are moved by whole octaves to sit around the middle of the staff. (Grand staff is not done yet.)

- **Choosing inversions.** With Progressions open, click above a chord on the stave to move that chord up one inversion, below it to move it down. The fingering under the keyboard, the sound and the notation all follow, the choice is saved with the progression, and it stops where the voicing would leave the keyboard.

- **Typing a progression.** The small icon at the right of the progression line opens a box where you can type chords as Roman numerals, e.g. `I - V - vi - IV | I - V7 - I` (or digits 1-7; 7, 9, sus2, sus4, add9 and, in Jazz, 11/13 after a numeral). Hyphens, bars and spaces just separate chords; the key decides major or minor. Enter appends them (or replaces the progression if you tick the box); a bad chord is reported and nothing is added. Altered and borrowed chords (bVII) are not supported.

## Layout of the code

| File | Role |
| --- | --- |
| `js/theory.js` | Pure music data: key signatures by pitch class, scale spelling, accidental order |
| `js/render.js` | Pure function `render(state) -> SVG string`; all geometry and colors |
| `js/app.js` | DOM wiring: state, clicks, mode toggle, caption |
| `js/glyphs.js` | Generated Bravura outlines for the clef, sharp and flat |
| `index.html`, `styles.css` | Page shell and styling |
| `tools/` | Tests, bundler and glyph generator (not needed to run the app) |

State is just `{ root: 0..11, mode: 'major'|'minor', spell: 0|1, selected: bool }`.

## Development

```
node tools/test_theory.js      # signature table vs independently spelled scales, geometry
python3 tools/browser_check.py # drives the page in headless Chromium (needs playwright)
python3 tools/build.py         # writes dist/index.html
python3 tools/gen_glyphs.py    # regenerates js/glyphs.js (needs: pip install verovio)
```

## Notes and choices

- Natural minor only. Impractical key signatures (7 sharps, 7+ flats) are not shown, so each
  black key has its usual spelling: D♭, E♭, A♭, B♭ in major; C♯, F♯, G♯, B♭ in minor.
- Music symbols are drawn from the Bravura font outlines (SIL Open Font License 1.1).

The app icon (a keyboard with a note over it) is `icon.svg`; the same SVG is inlined as the tab-bar favicon (with a 64px PNG fallback for browsers that ignore SVG favicons) and beside the title.

## Installing on the iPad (PWA via GitHub Pages)

`python3 tools/build.py` writes `dist/index.html` and a deployable `docs/` folder (app, manifest, icons, offline service worker). Re-run it before every push.

1. Create an empty GitHub repo (e.g. `music-theory`), then in this folder: `git remote add origin https://github.com/<you>/music-theory.git && git push -u origin main`.
2. Repo > Settings > Pages > Source: "Deploy from a branch", branch `main`, folder `/docs`.
3. On the iPad, open `https://<you>.github.io/music-theory/` in Safari > Share > Add to Home Screen.
4. After updating: rebuild, commit, push; the app picks up the new version the next time it is opened online (close and reopen it once).

## Study: Find the chord

Study > "Find the chord" shows a staff card like Find the key (clef and key signature) with a chord on it. Work out the chord and enter it in the Chords section with the Type and Degree chips, in either order; the second pick is your guess. A wrong guess is reported on the card and the next click starts a new attempt; a right one names the chord and offers Next. "I give up" (beside the card) lights the right chord and offers Next, counting as one miss. The piano keyboard is hidden, and the chord names on the Degree chips stay blank until a guess is made. Works in Pop and Jazz (Jazz offers only this Study activity) and in major and minor, each with its own levels.

Two difficulty dials (no longer adjustable by hand; the local ▲▼ buttons step the level): **Keys** (1-12, most familiar first: C G F D B♭ ...; A E D B G ... in minor) and **Chords** (groups: I IV V V7, then vi ii, then the sevenths, iii and vii°, then sus4, sus2, add9, 9ths, and in Jazz 11ths and 13ths). "Level up automatically" adds a key, then a chord group, alternately, after ten first-try answers in a row (five in the local copy). Beside "Level n" a row of bubbles (ten, or five locally) shows the latest first-try answers, newest on the left: green when right, a red X when wrong. A full green row is a level-up: the row stays up until Next, then starts empty at the new level. Levels are remembered. The ladder lives in `js/findchord.js`. When a level-up adds a key, the first question in that level is the new key's home triad (I, or i in minor).

## Chords: Find a chord

With the Chords section open, the "Find a chord" button (top right) switches the keyboard into a picker: click keys to pick notes (click a picked key again to unselect it; the keyboard does not move). As soon as the picked pitch classes are exactly the notes of a chord the selector offers in this key (any octave or inversion), that type and degree light up in the picker and the stave shows all its voicings with the one nearest your lowest note highlighted. When several chords share the same notes (C sus2 and G sus4 are both C D G) the one rooted on your lowest key wins. Choosing a chord with the chips, closing the section, or pressing the button again ends it. Change keys by switching it off first. Logic: `FindChord.identify` in `js/findchord.js`.

## Telling the local copy from the published one

`local.js` (gitignored, so it never reaches GitHub) marks a copy as local: when the page finds it beside `index.html`, it shows an orange **LOCAL** badge in the header, an orange bar across the top, and `[LOCAL]` in the tab title. `tools/build.py` also copies it into `dist/` (never `docs/`), so `dist/index.html` shows the badge too. Delete `local.js` to see the app the way the published copy looks.

### Find the chord: misses, inversions and the opened staff

- A chord you miss (a wrong guess, or "I give up") is remembered per key and chord and dealt more often, the same scheme as the key-signature cards (+2 per miss, -1 per clean answer, capped at 16). It is saved in the browser (`music-theory-ftc-weights-v1`) and cleared by "Reset app settings".
- Jazz mixes inversions into every level (root position about 40% of the time, the rest shared among the inversions); the answer names it, e.g. "G7/B is V7 in C major". Pop stays in root position.
- After the answer the card opens into every voicing of the chord. The staff is only as wide as those voicings need, and the chord that was on the card stays exactly where it was (it only slides sideways if the voicings would run off the edge).

### Explore: a sharp octave and a flat octave

The signature boxes use the whole keyboard, one octave for the sharp keys and one for the flat keys. In major the sharp octave is C D E F♯ G A B (C has no accidentals, so it joins the sharps; likewise A minor) and the flat octave is F G♭ A♭ B♭ D♭ E♭. F♯ and G♭ (D♯ and E♭ in minor) are no longer stacked in one box: each sits in its own octave. The sharp octave is on the left at first and for a sharp key; selecting a flat key or signature puts the flat octave on the left.

### The keyboard always starts on C or F

The leftmost key is C for the keys of C, D♭, D, E♭ and E, and F for F, F♯/G♭, G, A♭, A, B♭ and B, so no group of black keys is split and the root key is always in the left octave. With Find a chord switched on the keyboard does not move; keys below the root simply stay dark, so the root is the leftmost lit key.

### Explore: the box rows follow the accidentals

A signature with an odd number of accidentals sits on the lower row of boxes, an even number (including none: C major, A minor) on the upper row, whichever key it is over; a dashed line joins a box to a black key.

## Explore: horizontal / vertical signatures
A small rotating dial at the top right of the Explore keyboard switches the signature layout (remembered). Going to vertical, clones of the existing staves slide into the open spaces (sharps first, then flats, with a one-second pause between them); each group shakes for half a second where it lands and then settles slightly dimmer than the originals; going back, the duplicates fade out over 1.5 seconds. Reduced-motion users get no animation. **Horizontal** (default) is the original view: each key has one box, sharp keys in one octave and flat keys in the other. **Vertical** keeps every horizontal box where it is and fills all the open spaces in both octaves, so every key has a signature in each octave; odd accidental counts stay on the lower row, even on the upper, and the alternate spelling of F♯/G♭ (D♯/E♭ in minor) stacks above the visible one.

## Find the chord: level-up and the opened stave
Automatic level-ups now show a banner saying what was added (a new key, or which chords on which numerals) with a confetti burst (none under reduced motion); the banner stays until the next question. When the stave opens after a correct guess, any spare width is used to give the highlighted chord room on either side, so its box doesn't touch the neighbouring inversions' labels.

### Levels in Find the chord
The row shows "Stage s: Step t" (hover for "Step t of N"); the app never says "level". Finishing a stage shows a Congratulations banner with the share of pop/jazz songs now playable (a rough model, stored as `cov` in `DATA`) and what the next stage introduces. Each level adds one challenge, and that newest challenge is weighted up (x4) while it is new, and every run of five questions is guaranteed at least two about it. Levels are remembered per mode and Pop/Jazz (`lvl` in `music-theory-ftc-v1`); trial bests are in `music-theory-trials-v2`.

### The level order (Find the chord)
The ladder is a list of **stages**; each stage adds keys only or chords only, and the levels inside a stage are its **steps**. (Say "plan step" for the older 15-step plan.) Every combination of Pop/Jazz and major/minor has its own key order and chord list, frozen as data in `js/findchord.js` (`DATA`):
- It always starts with the keys C and G and the chords I, IV, V (i, iv, v in minor); stage 1 then adds its next two chords one at a time (Pop major: ii, then vi). The TYPE chips stay hidden until a chord that is not a triad is introduced.
- Early stages add at most two keys or chords (while keys x chords <= 30); later ones add one at a time. The rare-chord tail adds one whole chord type per stage (Pop: sevenths, sus4, add9, sus2, 9ths; Jazz: 9ths, the remaining triads, sus4, add9, sus2, 11ths, 13ths).
- A **new key stage** sends the chords back to I IV V, which then return one stage at a time; a **new chord stage** sends the keys back to C and G, which return one stage at a time. Only diatonic chords for now; borrowed chords would come after their source key.
- Pop keys: C G D A F E B♭ E♭ A♭ D♭ B F♯. Jazz keys: C G B♭ F E♭ A♭ D D♭ A E B F♯. Minor uses the relative minors.
- The stage sequences came from a planner that minimises the cumulative shortfall in "songs playable" (key coverage x chord coverage^N, N=5 Pop, 6 Jazz, using rough share estimates). Sizes: Pop major 90 levels, Pop minor 80, Jazz 130.

### iPhone
On phone-sized screens (narrow, or a phone on its side) the Keys / Chords / Level controls are hidden in Find the chord; the level-up banner and confetti still appear, just under the keyboard. A new Find the chord question also scrolls the staff to the middle of the screen so the clef is in view.

### Find the chord: score and phone orientation
- After the first guess the instruction text is replaced by the correct/incorrect count and the Reset score button.
- On a phone, Find the chord wants the phone upright and every other view wants it on its side. Browsers (iOS in particular) cannot force this, so a "turn your phone" notice covers the app until the phone is turned; where the browser allows an orientation lock it is requested too. Desktop and iPad are unaffected.

### Time trial (Find the chord)
"Time Trial" sits in the middle of the progress row, and appears once 7 of the last 10 answers were right (3 of 5 in the local copy); a level-up locks it again. Its popup (a vertical list, closed by a click outside or Esc) lists the levels from the current one down to 1, each with its best time and the number of wrong answers in that run. Picking one starts a two-second countdown ("Ready… Set…", nothing else shown), then the trial: ten questions drawn from that level's keys and chords, with no "I give up", no chord names on the degree chips, and the progress bubbles cleared (they show the trial's ten answers). A correct answer moves straight on; a wrong one adds 10 seconds (`TRIAL_PENALTY` in `js/app.js`) and also moves on. The clock is a circle whose hand sweeps once a minute, filling in behind it, starting at 12 o'clock. The score is the total time, penalties included; per-level bests are kept in `localStorage` (`music-theory-trials-v1`), and the best time per level keeps that run's wrong-answer count, and the results replace the staff, with the time, the wrong answers, the previous best and two buttons, **Try Again** (same level, new countdown) and **Back to Study**; a new best gets confetti and "New best time for Stage s: Step t!". During a trial each chip carries a tiny keyboard-shortcut hint at its bottom centre (only on devices with a mouse or trackpad, i.e. not on phones or iPads without one). Stop abandons a trial. "Reset app settings" also clears the saved best times. Back to Study (or Stop) puts the normal bubbles and streak back and asks a fresh question. Trials never change the saved level and never level you up.
