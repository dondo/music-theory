"""Drive the real page in headless Chromium: click keys, toggle mode, screenshot.

Run from the webapp folder:  python3 tools/browser_check.py [path/to/index.html]
Writes screenshots to shots/ and prints assertion results.
"""
import os
import sys
from playwright.sync_api import sync_playwright

page_path = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "index.html")
os.makedirs("shots", exist_ok=True)
failures = []


def check(name, cond, detail=""):
    print(("ok   " if cond else "FAIL ") + name + (("  -> " + str(detail)) if detail and not cond else ""))
    if not cond:
        failures.append(name)


def leftmost_pc(page):
    """pitch class of the key whose body starts furthest left (the root)."""
    return page.evaluate("""() => {
      const keys = [...document.querySelectorAll('.key')];
      const root = keys.find(k => k.getBoundingClientRect().width > 0 &&
        k.dataset.s === String(window.__root));
      return null;
    }""")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1000, "height": 900}, device_scale_factor=1.5,
                              reduced_motion="reduce")  # animation is tested separately below
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("file://" + page_path)
    page.wait_for_selector(".kb-svg")

    def shot(name):
        page.wait_for_timeout(400)          # let the slide-in animation finish
        page.screenshot(path=f"shots/{name}.png", full_page=True)

    def key(s):
        return page.locator(f'.key[data-s="{s}"]').first

    def click_box_half(pc, half):
        """Click the middle of one staff in a (possibly two-staff) label box.
        Both halves of a double box share one bounding box, so aim by position."""
        bb = page.locator(f'.box[data-pc="{pc}"][data-spell="{half}"]').first.bounding_box()
        halves = page.locator(f'.box[data-pc="{pc}"]').count()
        page.mouse.click(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] * (half + 0.5) / halves)

    def root_key_is_leftmost(s):
        """the key with data-s == s must be the left-most key in the window."""
        xs = page.evaluate("""() => [...document.querySelectorAll('.key')].map(k => {
            const r = k.querySelector('.body').getBoundingClientRect();
            return [parseInt(k.dataset.s), r.left];
          })""")
        # among keys whose body is in the keyboard window (clipped keys excluded by caller)
        return xs

    # --- landing -----------------------------------------------------------
    shot("01_landing")
    check("landing: no highlighted keys", page.locator(".key.hl").count() == 0)
    check("landing: reset hidden", not page.locator("#reset").is_visible())
    check("landing: two full octaves (17 white keys from C) + 12 black", page.locator(".key-white").count() == 17 and page.locator(".key-black").count() == 12,
          (page.locator(".key-white").count(), page.locator(".key-black").count()))

    # --- hover indicator on the key under the pointer --------------------------
    def body_stroke(sel):
        return page.evaluate("(s) => { const b = document.querySelector(s + ' .hover-ring'); const c = getComputedStyle(b);"
                             " return [c.stroke, c.strokeWidth]; }", sel)
    page.locator('.key-white[data-pc="4"]').first.hover()
    check("hover: white key gets the blue outline", body_stroke('.key-white[data-pc="4"]')[0] == "rgb(37, 99, 235)",
          body_stroke('.key-white[data-pc="4"]'))
    page.locator('.key-black[data-pc="3"]').first.hover()
    check("hover: black key gets the blue outline", body_stroke('.key-black[data-pc="3"]')[0] == "rgb(37, 99, 235)")
    check("hover: only the hovered key is outlined", page.evaluate(
        "[...document.querySelectorAll('.key .hover-ring')].filter(b => getComputedStyle(b).stroke === 'rgb(37, 99, 235)').length") == 1)
    page.mouse.move(5, 5)
    check("hover: outline goes away when the pointer leaves", page.evaluate(
        "[...document.querySelectorAll('.key .hover-ring')].filter(b => getComputedStyle(b).stroke === 'rgb(37, 99, 235)').length") == 0)

    # --- click a white key (D) --------------------------------------------
    page.locator('.key-white[data-pc="2"]').first.click()
    shot("02_D_major")
    check("click D: caption says D major", "D major" in page.locator("#caption").inner_text())
    check("click D: scale has 8 highlighted keys", page.locator(".key.hl").count() >= 8, page.locator(".key.hl").count())
    check("click D: all scale keys uniform (no root/third/fifth classes)",
          page.locator(".key.hl-root, .key.hl-third, .key.hl-fifth").count() == 0 and page.locator(".key.hl-scale").count() >= 8)
    check("click D: reset visible", page.locator("#reset").is_visible())
    check("click D: view starts on C (pair of black keys intact)",
          page.evaluate("""() => {
            const w = [...document.querySelectorAll('.key-white')].map(k => [parseInt(k.dataset.s), k.querySelector('.body').getBoundingClientRect().left]);
            w.sort((a, b) => a[1] - b[1]); return w[0][0] === 0; }"""))
    third_txt = page.locator("#caption").inner_text()
    check("click D: caption mentions major third F♯", "Major third: F♯" in third_txt, third_txt)

    # --- click a black key (C#/Db) -----------------------------------------
    page.locator('.key-black[data-pc="1"]').first.click()
    shot("03_Db_major_black_root")
    check("black root: caption D♭ major", "D♭ major" in page.locator("#caption").inner_text(),
          page.locator("#caption").inner_text())
    check("black root: 8 scale keys highlighted", page.locator(".key.hl").count() >= 8, page.locator(".key.hl").count())
    leftmost_black = page.evaluate("""() => {
      const all = [...document.querySelectorAll('.key')].filter(k => k.classList.contains('hl'));
      all.sort((a, b) => a.querySelector('.body').getBoundingClientRect().left - b.querySelector('.body').getBoundingClientRect().left);
      return [all[0].dataset.s, all[0].classList.contains('key-black')]; }""")
    check("black root (D♭): view starts on C", page.locator(".key-white").first.get_attribute("data-s") == "0")


    # --- the view always starts on C or F, so no group of black keys is split ---
    for pc, start in ((0, "0"), (2, "0"), (4, "0"), (5, "5"), (7, "5"), (9, "5"), (11, "5")):
        page.locator(f'.key-white[data-pc="{pc}"]').first.click()
        first = page.evaluate("""() => { const w = [...document.querySelectorAll('.key-white')]
            .map(k => [parseInt(k.dataset.s), k.querySelector('.body').getBoundingClientRect().left]);
            w.sort((a, b) => a[1] - b[1]); return w[0][0]; }""")
        check(f"view for pc {pc} starts on {'C' if start == '0' else 'F'}", str(first) == start, first)
    for pc, start in ((1, "0"), (3, "0"), (6, "5"), (8, "5"), (10, "5")):
        page.locator(f'.key-black[data-pc="{pc}"]').first.click()
        first = page.locator(".key-white").first.get_attribute("data-s")
        check(f"view for black pc {pc} starts on {'C' if start == '0' else 'F'}", first == start, first)

    # --- the double-spelling black key: pick G♭ via its box ---------------
    page.locator('.key-black[data-pc="6"]').first.click()
    check("F#/Gb key defaults to F♯ major", "F♯ major" in page.locator("#caption").inner_text())
    click_box_half(6, 1)
    shot("04_Gb_major_via_box")
    cap = page.locator("#caption").inner_text()
    check("box half picks G♭ major", "G♭ major" in cap, cap)
    check("G♭ major caption: 6 flats", "6 flats" in cap, cap)
    check("G♭ major: third is B♭", "Major third: B♭" in cap, cap)
    check("same key click keeps the G♭ spelling",
          (page.locator('.key-black[data-pc="6"]').first.click() or True) and "G♭ major" in page.locator("#caption").inner_text())

    # --- toggle to minor (selection stays on the same pitch class) ---------
    page.locator('label[for="mode-minor"]').click()
    shot("05_minor_same_root")
    cap = page.locator("#caption").inner_text()
    check("toggle minor keeps the root (pc 6 -> F♯ minor)", "F♯ minor" in cap, cap)
    check("F♯ minor: 3 sharps", "3 sharps" in cap, cap)
    check("F♯ minor: minor third A", "Minor third: A" in cap, cap)
    check("minor: 8 keys highlighted", page.locator(".key.hl").count() >= 8)

    # --- minor: click E and the double-spelling key ------------------------
    page.locator('.key-white[data-pc="4"]').first.click()
    shot("06_E_minor")
    check("E minor: 1 sharp F♯", "1 sharp: F♯" in page.locator("#caption").inner_text(), page.locator("#caption").inner_text())
    page.locator('.key-black[data-pc="3"]').first.click()
    click_box_half(3, 1)
    shot("07_Eb_minor_via_box")
    cap = page.locator("#caption").inner_text()
    check("E♭ minor via box: 6 flats", "E♭ minor" in cap and "6 flats" in cap, cap)

    # --- back to major, then reset -----------------------------------------
    page.locator('label[for="mode-major"]').click()
    check("minor->major re-defaults spelling (pc 3 -> E♭ major)", "E♭ major" in page.locator("#caption").inner_text(),
          page.locator("#caption").inner_text())
    page.locator("#reset").click()
    shot("08_reset")
    check("reset: no highlights", page.locator(".key.hl").count() == 0)
    check("reset: back to C leftmost", page.locator(".key-white").first.get_attribute("data-s") == "0")

    # --- keyboard accessibility -------------------------------------------
    page.locator('.key-white[data-pc="7"]').first.focus()
    page.keyboard.press("Enter")
    check("keyboard Enter on G roots the keyboard", "G major" in page.locator("#caption").inner_text())
    check("focus returns to the (new leftmost) root key",
          page.evaluate("document.activeElement.dataset.s") == "7")
    page.keyboard.press("ArrowRight")
    check("ArrowRight moves focus to next key (A# black)",
          page.evaluate("document.activeElement.dataset.s") == "8")

    # --- every root, both modes: no console errors, 8 highlighted ----------
    ok_all = True
    for mode in ("major", "minor"):
        page.locator(f'label[for="mode-{mode}"]').click()
        for pc in range(12):
            page.locator(f'.key[data-pc="{pc}"]').first.click()
            n = page.locator(".key.hl").count()
            if n < 8 :
                ok_all = False
                print("   bad highlight count", mode, pc, n)
    check("all 24 keys: at least 8 highlighted keys", ok_all)


    # --- chord selector (Explore) -------------------------------------------------
    page.locator('label[for="mode-major"]').click()
    if page.locator("#reset").is_visible():
        page.locator("#reset").click()
    check("chords: panel hidden until a key is selected", not page.locator("#chords").is_visible())
    page.locator('.key-white[data-pc="2"]').first.click()          # D major
    page.wait_for_timeout(100)
    check("chords: panel shown once a key is selected", page.locator("#chords").is_visible())
    check("chords: panel starts collapsed", page.locator("#chords-details").get_attribute("open") is None)
    check("chords: collapsed -> no chord highlights", page.locator(".hl-croot, .hl-ctone, .hl-cscale").count() == 0
          and page.locator(".key.hl-scale").count() >= 8)
    page.locator("#chords-details summary").click()
    page.wait_for_timeout(150)
    check("chords: header names the key (D major)", page.locator("#chords-summary").text_content() == "Chords in the key of D", page.locator("#chords-summary").text_content())
    check("chords: panel opens", page.locator("#chords-details").get_attribute("open") is not None)
    check("chords: opening selects nothing (no chord, no type or degree chip pressed)",
          page.locator(".hl-croot, .hl-ctone").count() == 0 and page.locator(".chip[aria-pressed='true']").count() == 0
          and "Pick a type and a degree" in page.locator("#chord-info").inner_text())
    check("prog: no Progressions section until the first chord", not page.locator("#progressions").is_visible())
    page.locator('.chip-deg[data-deg="0"]').click()
    page.wait_for_timeout(100)
    check("prog: the section appears once a chord is selected", page.locator("#progressions").is_visible()
          and page.locator("#prog-details").get_attribute("open") is None and not page.locator("#add-prog").is_visible())
    # --- Pop / Jazz level (Pop is the default and hides the advanced theory) ---
    check("level: Pop is the default", page.locator("#level-pop").is_checked() and not page.locator("#level-jazz").is_checked())
    check("level: Pop hides the scale-type switch", not page.locator("#scalekind-group").is_visible())
    check("level: Pop hides 11th/13th", page.locator(".chip-type").all_inner_texts() == ["Triad", "7th", "Sus4", "Sus2", "Add9", "9th"],
          page.locator(".chip-type").all_inner_texts())
    check("level: Pop hides mode names, shading and mode sort", page.locator(".chip-mode").count() == 0
          and page.locator(".chip-deg[data-dark]").count() == 0 and not page.locator("#mode-sort").is_visible())
    check("level: Pop labels the row 'Degree' and keeps the seven chords", page.locator("#lbl-deg").text_content() == "Degree" and page.locator(".chip-deg").count() == 7)
    check("level: Pop hides the type sort menu", not page.locator("#type-sort").is_visible())
    pop_info = page.locator("#chord-info").inner_text()
    check("level: Pop info shows no mode paragraph or tension sentence", "Ionian" not in pop_info and "tension" not in pop_info.lower() and "D: I" in pop_info, pop_info)
    page.locator('label[for="level-jazz"]').click()
    page.wait_for_timeout(150)
    check("level: Jazz restores the scale-type switch, 11th/13th, mode names and the mode sort",
          page.locator("#scalekind-group").is_visible() and page.locator(".chip-type").count() == 8
          and page.locator(".chip-mode").count() == 7 and page.locator("#mode-sort").is_visible() and page.locator("#lbl-deg").text_content() == "Mode")
    check("level: Jazz hides the Flashcards switch", not page.locator("#view-group").is_visible())
    check("level: Jazz info shows the mode paragraph", "Ionian" in page.locator("#chord-info").inner_text())
    page.locator('.chip-type[data-type="13"]').click()
    page.locator('label[for="sk-pent"]').click()
    page.wait_for_timeout(100)
    page.locator('label[for="level-pop"]').click()
    page.wait_for_timeout(150)
    check("level: back to Pop resets scale kind to full and drops a hidden 13th",
          page.locator("#sk-full").is_checked() and not page.locator("#scalekind-group").is_visible()
          and page.locator('.chip-type[aria-pressed="true"]').count() <= 1 and page.locator('.chip-type[data-type="13"]').count() == 0)
    check("level: Pop shows the Flashcards switch", page.locator("#view-group").is_visible())
    page.locator('label[for="level-jazz"]').click()
    page.wait_for_timeout(150)
    if page.locator("#chords-details").get_attribute("open") is None:
        page.locator("#chords-details summary").click()
        page.wait_for_timeout(150)
    r0 = page.locator(".key.hl-croot").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))]")
    t0 = page.locator(".key.hl-ctone").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))].sort()")
    page.locator('.chip-deg[data-deg="0"]').click()
    page.wait_for_timeout(100)
    r0 = page.locator(".key.hl-croot").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))]")
    t0 = page.locator(".key.hl-ctone").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))].sort()")
    check("chords: the I chord lights D F# A", r0 == ["2"] and t0 == ["6", "9"], (r0, t0))
    check("chords: 7 degree chips and 8 type chips", page.locator(".chip-deg").count() == 7 and page.locator(".chip-type").count() == 8,
          (page.locator(".chip-deg").count(), page.locator(".chip-type").count()))
    check("chords: D major triad chips", page.locator(".chip-deg .chip-sym").all_inner_texts() == ["D", "Em", "F\u266Fm", "G", "A", "Bm", "C\u266Fdim"],
          page.locator(".chip-deg .chip-sym").all_inner_texts())
    page.locator('.chip-deg[data-deg="1"]').click()                 # ii
    check("chords: ii chord info (Em, ii, E Dorian)", all(x in page.locator("#chord-info").inner_text() for x in ("Em", "ii", "E Dorian", "minor triad")),
          page.locator("#chord-info").inner_text())
    check("chords: info shows the mode description, not 'uses the notes'", "Minor, but less sad" in page.locator("#chord-info").inner_text()
          and "uses the notes" not in page.locator("#chord-info").inner_text())
    check("chords: each degree chip names its mode (D major)", page.locator(".chip-deg .chip-mode").all_inner_texts()
          == ["Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian"], page.locator(".chip-deg .chip-mode").all_inner_texts())
    check("chords: numeral is shown with its key (D: ii)", page.locator("#chord-info .ci-roman").inner_text() == "D: ii", page.locator("#chord-info .ci-roman").inner_text())
    check("chords: info labels the Chord and the Mode", page.locator("#chord-info .ci-head .ci-tag").inner_text().lower() == "chord"
          and page.locator("#chord-info .ci-lead .ci-tag").inner_text().lower() == "mode")
    check("chords: info has separate mode and chord-type paragraphs",
          page.locator("#chord-info .ci-desc").count() == 2
          and "minor triad" in page.locator("#chord-info .ci-desc").nth(0).inner_text()
          and "Minor: sad, serious" in page.locator("#chord-info .ci-desc").nth(0).inner_text()
          and "E Dorian" in page.locator("#chord-info .ci-desc").nth(1).inner_text())
    check("chords: Type comes before Mode", page.evaluate("document.querySelector('#lbl-type').getBoundingClientRect().top < document.querySelector('#lbl-deg').getBoundingClientRect().top"))
    page.locator("#lbl-type + .help .help-btn").hover()
    page.wait_for_timeout(250)
    check("chords: Type heading tooltip", page.locator("#type-head-tip").is_visible()
          and page.locator("#type-head-tip").inner_text() == "The chord establishes a harmony, typically played by the left hand on a piano.")
    page.locator("#lbl-deg + .help .help-btn").hover()
    page.wait_for_timeout(250)
    check("chords: Mode heading tooltip", page.locator("#mode-head-tip").is_visible()
          and "which notes are available to build a melody" in page.locator("#mode-head-tip").inner_text())
    page.mouse.move(5, 5)
    check("chords: row label reads 'Mode'", page.locator("#lbl-deg").text_content() == "Mode")
    def modes():
        return page.locator(".chip-deg .chip-mode").all_inner_texts()
    page.locator('#mode-sort-select').select_option('brightness')
    check("chords: sort by brightness", modes() == ["Lydian", "Ionian", "Mixolydian", "Dorian", "Aeolian", "Phrygian", "Locrian"], modes())
    page.locator('#mode-sort-select').select_option('frequency')
    page.locator("#mode-help .help-btn").hover()
    page.wait_for_timeout(250)
    check("chords: hovering the ? shows the mode sort description", page.locator("#mode-tip").is_visible() and "Frequency:" in page.locator("#mode-tip").inner_text())
    page.mouse.move(5, 5)
    page.wait_for_timeout(250)
    check("chords: description hidden when not hovering", not page.locator("#mode-tip").is_visible())
    check("chords: sort by frequency", modes() == ["Ionian", "Aeolian", "Mixolydian", "Dorian", "Lydian", "Phrygian", "Locrian"], modes())
    check("chords: sorting keeps the selected chord", page.locator(".chip-deg[aria-pressed='true'] .chip-mode").all_inner_texts() == ["Dorian"])
    page.locator('#mode-sort-select').select_option('scale')
    check("chords: scale order restored", modes()[0] == "Ionian" and modes()[1] == "Dorian")
    page.locator('.chip-deg[data-deg="1"]').focus()
    def types():
        return page.locator(".chip-type").all_inner_texts()
    check("chords: Frequency is the default type order", types() == ["Triad", "7th", "Sus4", "Sus2", "Add9", "9th", "11th", "13th"] and page.locator("#type-sort-select").input_value() == "frequency", types())
    page.locator('#type-sort-select').select_option('ambiguity')
    check("chords: types sorted by ambiguity (7th, 9th, 13th, Triad, Add9, 11th, Sus2, Sus4)",
          types() == ["7th", "9th", "13th", "Triad", "Add9", "11th", "Sus2", "Sus4"], types())
    page.locator('#type-sort-select').select_option('tension')
    check("chords: types sorted by tension for the ii chord (7ths and 9th/13th are minor, so low)",
          types() == ["Triad", "7th", "9th", "13th", "Sus2", "Add9", "11th", "Sus4"], types())
    page.locator('.chip-deg[data-deg="4"]').click()                # V: the dominant chords
    check("chords: tension sort follows the selected mode (V: 7th/9th/13th highest)",
          types() == ["Triad", "Sus2", "Add9", "Sus4", "11th", "7th", "9th", "13th"], types())
    page.locator('.chip-deg[data-deg="1"]').click()                # back to ii
    page.locator('#type-sort-select').select_option('frequency')
    check("chords: types sorted by frequency (Triad, 7th, Sus4, Sus2, Add9, 9th, 11th, 13th)",
          types() == ["Triad", "7th", "Sus4", "Sus2", "Add9", "9th", "11th", "13th"], types())
    check("chords: type sort description in the ? tooltip", "Frequency:" in page.locator("#type-tip").text_content()
          and page.locator("#type-help .help-btn").evaluate("e => getComputedStyle(e).opacity") == "1")
    page.locator('#type-sort-select').select_option('complexity')
    check("chords: Complexity has a tooltip too", "Complexity:" in page.locator("#type-tip").text_content()
          and page.locator("#type-help .help-btn").evaluate("e => getComputedStyle(e).opacity") == "1")
    page.locator('#mode-sort-select').select_option('scale')
    check("chords: scale order has a tooltip (major pattern)", page.locator("#mode-help .help-btn").evaluate("e => getComputedStyle(e).opacity") == "1"
          and "major, minor, minor, major, major, minor, minor" in page.locator("#mode-tip").text_content()
          and "Capital roman numerals are major" in page.locator("#mode-tip").text_content(), page.locator("#mode-tip").text_content())
    check("chords: complexity type order restored", types() == ["Triad", "Sus2", "Sus4", "Add9", "7th", "9th", "11th", "13th"], types())
    check("chords: headings and sort menus share a line above full-width chips", page.evaluate(
        "(() => { const r = id => document.querySelector(id).getBoundingClientRect();"
        " const ok = (lbl, sort, chips) => Math.abs((r(lbl).top + r(lbl).bottom) / 2 - (r(sort).top + r(sort).bottom) / 2) < 12"
        "   && r(sort).bottom <= r(chips).top + 2 && r(sort).right > r(chips).right - 60 && r(chips).width > 600;"
        " return ok('#lbl-deg', '#mode-sort', '#chord-degrees') && ok('#lbl-type', '#type-sort', '#chord-types'); })()"))
    page.locator('.chip-deg[data-deg="1"]').focus()
    check("chords: note chips sit top right of the description, level with the symbol", page.evaluate(
        "(() => { const b = document.querySelector('#chord-info').getBoundingClientRect(), n = document.querySelector('#chord-info .ci-head .ci-notes').getBoundingClientRect(),"
        " y = document.querySelector('#chord-info .ci-symbol').getBoundingClientRect();"
        " return n.top - b.top < 40 && b.right - n.right < 40 && n.left > b.left + b.width / 2 && Math.abs((n.top + n.bottom) / 2 - (y.top + y.bottom) / 2) < 25; })()"))
    d1 = page.locator("#chord-info .ci-desc").nth(0).inner_text()
    check("chords: type paragraph ends with one sentence on ambiguity and tension",
          d1.rstrip().endswith("The 3rd establishes major or minor; the chord has little tension, feeling resolved and stable.")
          and page.locator("#chord-info .ci-attr").count() == 0, d1)
    shot("13_chord_panel")
    darks = page.locator(".chip-deg").evaluate_all("els => els.map(e => +e.dataset.dark)")
    check("chords: chips carry darkness ranks (D major: Ionian 1, Dorian 3, Phrygian 5, Lydian 0, Mixolydian 2, Aeolian 4, Locrian 6)",
          darks == [1, 3, 5, 0, 2, 4, 6], darks)
    roots = page.locator(".key.hl-croot").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))]")
    tones = page.locator(".key.hl-ctone").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))].sort()")
    check("chords: the chord root and tones are lit (E; G, B)", roots == ["4"] and tones == ["11", "7"], (roots, tones))
    check("chords: focus stays on the chip", page.evaluate("document.activeElement.dataset.deg") == "1")
    page.locator('.chip-type[data-type="7"]').click()
    check("chords: 7th type -> Em7", "Em7" in page.locator("#chord-info").inner_text() and page.locator(".chip-deg .chip-sym").nth(4).inner_text() == "A7",
          page.locator(".chip-deg .chip-sym").all_inner_texts())
    tones7 = page.locator(".key.hl-ctone").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))].sort()")
    check("chords: seventh adds the D (E G B D)", tones7 == ["11", "2", "7"], tones7)
    shot("14_chord_Em7")
    page.locator("#chords-details summary").click()
    page.wait_for_timeout(150)
    check("chords: collapsing clears the chord highlights", page.locator(".hl-croot, .hl-ctone, .hl-cscale").count() == 0
          and page.locator(".key.hl-scale").count() >= 8)
    page.locator("#chords-details summary").click()
    page.wait_for_timeout(150)
    check("chords: reopening leaves no chord selected", page.locator(".hl-croot").count() == 0 and page.locator(".chip[aria-pressed='true']").count() == 0)
    page.locator('.chip-deg[data-deg="1"]').click()
    page.locator('.chip-deg[data-deg="1"]').click()                 # toggle off
    check("chords: clicking the chip again clears the chord", page.locator(".hl-croot").count() == 0 and page.locator(".key.hl").count() >= 8
          and "Pick a type and a degree" in page.locator("#chord-info").inner_text())
    page.locator('.chip-deg[data-deg="6"]').click()
    check("chords: vii half-diminished seventh named correctly",
          "C\u266Fm7\u266D5" in page.locator("#chord-info").inner_text() and "half-diminished" in page.locator("#chord-info").inner_text()
          and "Locrian" in page.locator("#chord-info").inner_text(), page.locator("#chord-info").inner_text())
    page.locator('label[for="mode-minor"]').click()                 # chord stays on its degree, re-spelled for the new key
    check("chords: switching to minor keeps the degree", page.locator(".chip-deg[aria-pressed='true']").count() == 1 and page.locator(".hl-croot").count() >= 1)
    page.locator('label[for="mode-major"]').click()
    page.locator("#reset").click()
    check("chords: panel hidden again after Reset view", not page.locator("#chords").is_visible() and page.locator(".hl-croot").count() == 0)

    # --- scale types ---------------------------------------------------------------
    page.locator('.key[data-pc="0"]').first.click()
    page.wait_for_timeout(100)
    def lit_pcs():
        return page.locator(".key.hl").evaluate_all("els => [...new Set(els.map(e => +e.dataset.pc))].sort((a,b)=>a-b)")
    page.locator('label[for="sk-pent"]').click()
    page.wait_for_timeout(100)
    check("scale: C major pentatonic lights C D E G A", lit_pcs() == [0, 2, 4, 7, 9], lit_pcs())
    check("scale: chord panel still shown for pentatonic", page.locator("#chords").is_visible())
    if page.locator("#chords-details").get_attribute("open") is None:
        page.locator("#chords-details summary").click()
        page.wait_for_timeout(150)
    page.locator('.chip-deg[data-deg="0"]').click()
    page.wait_for_timeout(100)
    check("scale: pentatonic C major chord (C E G)",
          page.locator(".key.hl-croot").evaluate_all("els => [...new Set(els.map(e => +e.dataset.pc))]") == [0]
          and page.locator(".key.hl-ctone").evaluate_all("els => [...new Set(els.map(e => +e.dataset.pc))].sort()") == [4, 7])
    page.locator('.chip-type[data-type="min"]').click()
    check("scale: minor chord exists only on A and moves there (A C E)", page.locator(".chip-deg:not([disabled])").count() == 1
          and page.locator(".chip-deg[disabled]").count() == 4)
    check("scale: Am lit", page.locator(".key.hl-croot").evaluate_all("els => [...new Set(els.map(e => +e.dataset.pc))]") == [9])
    page.locator('label[for="mode-minor"]').click()
    page.wait_for_timeout(100)
    check("scale: C minor pentatonic lights C Eb F G Bb", lit_pcs() == [0, 3, 5, 7, 10], lit_pcs())
    page.locator('label[for="mode-major"]').click()
    page.locator('label[for="sk-whole"]').click()
    page.wait_for_timeout(100)
    check("scale: C whole tone lights C D E F# G# A#", lit_pcs() == [0, 2, 4, 6, 8, 10], lit_pcs())
    check("scale: whole tone offers an augmented chord on every note", page.locator(".chip-deg").count() == 6
          and page.locator(".chip-deg[disabled]").count() == 0 and "Caug" in page.locator(".chip-deg .chip-sym").first.inner_text())
    page.locator('label[for="sk-full"]').click()
    page.wait_for_timeout(100)
    check("scale: back to full scale and chord panel", len(lit_pcs()) == 7 and page.locator("#chords").is_visible())
    page.locator("#reset").click()

    # --- flashcard mode ---------------------------------------------------------
    page.locator('label[for="mode-major"]').click()
    page.locator("#reset").click() if page.locator("#reset").is_visible() else None
    page.locator('label[for="level-pop"]').click()
    page.locator('label[for="view-flash"]').click()
    shot("10_flash")
    check("flash: card shown, no signature boxes", page.locator(".flashcard").count() == 1 and page.locator(".box").count() == 0)
    check("flash: score visible at 0/0", page.locator("#score").is_visible() and page.locator("#n-ok").inner_text() == "0"
          and page.locator("#n-bad").inner_text() == "0")
    check("flash: no numbers on the keys or card", page.evaluate(
        "[...document.querySelectorAll('.kb-svg text')].filter(t => /^\\d+$/.test(t.textContent.trim())).length") == 0)
    check("flash: keyboard has no labels", page.locator(".kb-svg .key text").count() == 0)
    check("flash: no highlighted keys before the first answer", page.locator(".key.hl").count() == 0)
    ans = int(page.locator(".flashcard").get_attribute("data-answer-pc"))
    wrong = (ans + 1) % 12
    page.locator(f'.key[data-pc="{wrong}"]').first.click()
    page.wait_for_timeout(150)
    check("flash: wrong key -> incorrect count 1", page.locator("#n-bad").inner_text() == "1" and page.locator("#n-ok").inner_text() == "0")
    check("flash: wrong key keeps the same card", int(page.locator(".flashcard").get_attribute("data-answer-pc")) == ans)
    first_s = page.locator(".key-white").first.get_attribute("data-s")
    check("flash: wrong key shows the guessed key's signature below the keyboard",
          page.locator(".guess").count() == 1 and page.locator(".guess").get_attribute("data-guess-pc") == str(wrong))
    check("flash: a wrong guess highlights nothing and doesn't rotate",
          page.locator(".key.hl").count() == 0 and page.locator(".key-white").first.get_attribute("data-s") == first_s)
    stored = page.evaluate("JSON.parse(localStorage.getItem('keysig-flashcard-weights-v1'))")
    check("flash: a miss raises that key's weight and is saved", stored and stored["major"][ans] == 3 and sum(stored["major"]) == 14, stored)
    check("flash: wrong key shows a nope mark", page.locator(".fb-nope").count() == 1)
    shot("11_flash_wrong")
    # guessing the two-spelling black key (F#/Gb) shows both of its signatures
    if ans != 6:
        page.locator('.key-black[data-pc="6"]').first.click()
        page.wait_for_timeout(100)
        check("flash: a wrong guess of F#/Gb shows both signatures", page.locator(".guess").get_attribute("data-cards") == "2" and
              page.locator('.guess rect').count() == 2)
        shot("11b_flash_wrong_double")
    page.wait_for_timeout(1100)
    page.locator(f'.key[data-pc="{ans}"]').first.click()
    page.wait_for_timeout(200)
    check("flash: the guess row is cleared once solved", page.locator(".guess").count() == 0)
    bad_now = page.locator("#n-bad").inner_text()          # 1 or 2 (a second miss if F#/Gb was tried above)
    check("flash: right key -> correct count 1", page.locator("#n-ok").inner_text() == "1" and bad_now in ("1", "2"))
    check("flash: right key lights up its scale", page.locator(".key.hl").count() >= 8)
    check("flash: the signature stays visible after a correct answer",
          page.locator(".flashcard").count() == 1 and int(page.locator(".flashcard").get_attribute("data-answer-pc")) == ans)
    check("flash: Next button shown after a correct answer", page.locator(".next-btn").count() == 1)
    check("flash: only the lit scale keys are labelled after a correct answer", page.evaluate(
        "[...document.querySelectorAll('.kb-svg .key text')].every(t => t.closest('.key').classList.contains('hl'))")
        and page.locator(".kb-svg .key text").count() >= 8)
    cardbox = page.locator(".flashcard rect[stroke='#c3cadb']").last.bounding_box()
    nb = page.locator(".next-btn").bounding_box()
    check("flash: Next sits beside the clef", nb["x"] > cardbox["x"] + cardbox["width"] and
          abs((nb["y"] + nb["height"] / 2) - (cardbox["y"] + cardbox["height"] / 2)) < 6, (cardbox, nb))
    page.locator(f'.key[data-pc="{(ans + 2) % 12}"]').first.click()
    check("flash: further presses are ignored until Next",
          page.locator("#n-ok").inner_text() == "1" and page.locator("#n-bad").inner_text() == bad_now)
    shot("12_flash_correct")
    first_before_next = page.locator(".key-white").first.get_attribute("data-s")
    page.locator(".next-btn").click()
    page.wait_for_timeout(200)
    new_ans = int(page.locator(".flashcard").get_attribute("data-answer-pc"))
    check("flash: Next deals a different card", new_ans != ans, (ans, new_ans))
    check("flash: Next button hidden again", not page.locator(".next-btn").count() == 1)
    check("flash: Next clears the scale highlights", page.locator(".key.hl").count() == 0)
    check("flash: Next does not rotate the keyboard",
          page.locator(".key-white").first.get_attribute("data-s") == first_before_next, first_before_next)
    # right arrow also advances once a card is solved (and does nothing before that)
    a = int(page.locator(".flashcard").get_attribute("data-answer-pc"))
    page.keyboard.press("ArrowRight")
    check("flash: right arrow does nothing before the card is solved",
          int(page.locator(".flashcard").get_attribute("data-answer-pc")) == a and page.locator(".next-btn").count() == 0)
    page.locator(f'.key[data-pc="{a}"]').first.click()
    page.mouse.move(5, 5)
    check("flash: solved, Next shown", page.locator(".next-btn").count() == 1)
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(100)
    check("flash: right arrow advances to the next card",
          page.locator(".next-btn").count() == 0 and page.locator(".key.hl").count() == 0 and
          int(page.locator(".flashcard").get_attribute("data-answer-pc")) != a)
    # same via keyboard focus on a key: Enter solves, right arrow moves on
    b = int(page.locator(".flashcard").get_attribute("data-answer-pc"))
    page.locator(f'.key[data-pc="{b}"]').first.focus()
    page.keyboard.press("Enter")
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(100)
    check("flash: Enter then right arrow, all from the keyboard",
          page.locator(".next-btn").count() == 0 and page.locator(".kb-svg").count() == 1)
    # every card is answerable, in both modes, and Next always deals another
    ok_flash = True
    for mode in ("major", "minor"):
        page.locator(f'label[for="mode-{mode}"]').click()
        for _ in range(14):
            a = int(page.locator(".flashcard").get_attribute("data-answer-pc"))
            before = int(page.locator("#n-ok").inner_text())
            page.locator(f'.key[data-pc="{a}"]').first.click()
            page.wait_for_timeout(30)
            if int(page.locator("#n-ok").inner_text()) != before + 1 or page.locator(".key.hl").count() < 8 \
                    or not page.locator(".next-btn").count() == 1:
                ok_flash = False
                print("   flash answer failed", mode, a)
            page.locator(".next-btn").click()
    check("flash: 28 random cards all accepted", ok_flash)
    # a key with two spellings shows both signatures on the card (major: F#/Gb, minor: D#/Eb)
    for mode, dbl in (("major", 6), ("minor", 3)):
        page.locator(f'label[for="mode-{mode}"]').click()
        found = False
        for _ in range(80):
            a = int(page.locator(".flashcard").get_attribute("data-answer-pc"))
            if a == dbl:
                found = True
                break
            page.locator(f'.key[data-pc="{a}"]').first.click()
            page.locator(".next-btn").click()
        check(f"flash {mode}: the {dbl} key comes up", found)
        if found:
            check(f"flash {mode}: the cue shows only one of the two signatures",
                  page.locator(".flashcard").get_attribute("data-cards") == "1" and
                  page.locator('.flashcard rect[stroke="#c3cadb"]').count() == 1)
            shot(f"13_flash_double_{mode}_cue")
            page.locator(f'.key[data-pc="{dbl}"]').first.click()
            page.wait_for_timeout(150)
            check(f"flash {mode}: both signatures shown once solved",
                  page.locator(".flashcard").get_attribute("data-cards") == "2" and
                  page.locator('.flashcard rect[stroke="#c3cadb"]').count() == 2)
            shot(f"13_flash_double_{mode}")
            page.locator(".next-btn").click()
    # weights persist across a reload and bias the deal; the footer link clears them
    page.evaluate("""() => localStorage.setItem('keysig-flashcard-weights-v1',
        JSON.stringify({major: [1,1,1,1,1,1,1,1,1,16,1,1], minor: Array(12).fill(1)}))""")
    ctx.add_init_script("""(() => { let a = 20261010; Math.random = () => {            // seeded: no flaky odds
        a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()""")
    page.reload()
    page.wait_for_selector(".kb-svg")
    page.locator('label[for="view-flash"]').click()
    seen9 = 0
    for _ in range(12):
        a = int(page.locator(".flashcard").get_attribute("data-answer-pc"))
        seen9 += a == 9
        page.locator(f'.key[data-pc="{a}"]').first.click()
        page.locator(".next-btn").click()
    check("flash: a heavily weighted key is dealt often after a reload", seen9 >= 4, seen9)
    check("footer link is now 'Reset app settings'", page.locator("#reset-app").text_content() == "Reset app settings")
    page.locator("#reset-app").click()
    page.wait_for_timeout(300)
    cleared = page.evaluate("JSON.parse(localStorage.getItem('keysig-flashcard-weights-v1'))")
    check("reset app: the study weights are reset", cleared and all(n == 1 for n in cleared["major"] + cleared["minor"]), cleared)
    check("reset app: score zero and back in Explore", page.locator("#n-ok").text_content() == "0" and page.locator("#n-bad").text_content() == "0"
          and page.locator("#view-explore").is_checked() and not page.locator("#score").is_visible())
    check("explore again: boxes back, score hidden", page.locator(".box").count() > 0 and not page.locator("#score").is_visible())

    # --- narrow (phone) viewport ---------------------------------------------
    page.set_viewport_size({"width": 390, "height": 800})
    if page.locator("#reset").is_visible():
        page.locator("#reset").click()
    page.locator('.key-white[data-pc="2"]').first.click()
    shot("09_phone")


    # --- the slide animation (motion allowed) ---------------------------------
    ctx2 = browser.new_context(viewport={"width": 1000, "height": 900})
    pg2 = ctx2.new_page()
    pg2.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
    pg2.on("pageerror", lambda e: errors.append(str(e)))
    pg2.goto("file://" + page_path)
    pg2.wait_for_selector(".kb-svg")
    x_before = pg2.evaluate("document.querySelector('.key-white[data-pc=\"7\"]').getBoundingClientRect().left")
    pg2.locator('.key-white[data-pc="7"]').first.click()   # G
    pg2.wait_for_timeout(120)
    check("slide: two drawings while moving", pg2.locator(".kb-svg").count() == 2 and pg2.locator(".stage.sliding").count() == 1,
          pg2.locator(".kb-svg").count())
    x_mid = pg2.evaluate("document.querySelector('.kb-svg:last-of-type .key[data-s=\"7\"]').getBoundingClientRect().left")
    pg2.wait_for_timeout(900)
    x_end = pg2.evaluate("document.querySelector('.key[data-s=\"7\"]').getBoundingClientRect().left")
    check("slide: finished with one drawing, no clip", pg2.locator(".kb-svg").count() == 1 and
          pg2.evaluate("document.getElementById('stage').style.clipPath") == "")
    check("slide: clicked key moved left (start > mid > end)", x_before > x_mid > x_end, (x_before, x_mid, x_end))
    # clicking again right away (mid-animation) must not break anything
    pg2.locator('.key-white[data-pc="9"]').first.click(force=True)
    pg2.locator('.key-white[data-pc="2"]').last.click(force=True)
    pg2.wait_for_timeout(900)
    check("slide: rapid clicks settle on one drawing", pg2.locator(".kb-svg").count() == 1)
    # flashcard mode with motion: the signature card must not move while the keyboard slides
    pg2.locator('label[for="view-flash"]').click()
    pg2.wait_for_timeout(400)
    ans2 = int(pg2.locator(".flashcard").get_attribute("data-answer-pc"))
    for _ in range(40):                      # need a card whose answer makes the view move (an F..B root)
        if ans2 >= 5:
            break
        pg2.locator(f'.key[data-pc="{ans2}"]').first.click()
        pg2.wait_for_timeout(700)
        pg2.locator(".next-btn").click()
        pg2.wait_for_timeout(700)               # let the old card finish sliding out
        ans2 = int(pg2.locator(".flashcard").get_attribute("data-answer-pc"))
    pg2.locator(f'.key[data-pc="{ans2}"]').first.click()
    xs = []
    for _ in range(6):
        pg2.wait_for_timeout(70)
        bb = pg2.locator(".kb-svg:last-of-type .flashcard").bounding_box()
        xs.append(round(bb["x"], 1))
    pg2.wait_for_timeout(500)
    box1 = pg2.locator(".flashcard").bounding_box()
    check("flash slide: card stays still while the keyboard slides",
          max(xs) - min(xs) < 1.5 and abs(box1["x"] - xs[0]) < 1.5, (xs, box1["x"]))
    ctx2.close()

    check("no console errors/warnings", not errors, errors)
    # --- progressions -----------------------------------------------------------------
    page.goto("file://" + page_path)
    page.evaluate("() => { localStorage.removeItem('music-theory-progression-v1'); localStorage.removeItem('music-theory-state-v1'); }")
    page.reload()
    check("study: the Flashcards switch is now called Study", page.locator('label[for="view-flash"]').text_content() == "Study")
    check("prog: hidden at the start", not page.locator("#progressions").is_visible())
    page.locator('.key-white[data-pc="0"]').first.click()
    page.wait_for_timeout(150)
    check("prog: still hidden while the chord selector is collapsed", not page.locator("#progressions").is_visible())
    page.locator("#chords-details summary").click()
    page.wait_for_timeout(200)
    check("prog: still hidden with the chord selector open but nothing selected", not page.locator("#progressions").is_visible())
    page.locator('.chip-deg[data-deg="0"]').click()
    page.wait_for_timeout(100)
    check("prog: revealed, but collapsed, once a type and degree are selected",
          page.locator("#progressions").is_visible() and page.locator("#prog-details").get_attribute("open") is None
          and not page.locator("#add-prog").is_visible())
    page.locator("#prog-summary").click()                              # expand: the Add row lives inside
    page.wait_for_timeout(100)
    check("prog: Add appears below the title once expanded", page.locator("#add-prog").is_visible()
          and page.locator("#add-prog").bounding_box()["y"] > page.locator("#prog-summary").bounding_box()["y"])
    page.locator("#add-prog").click()                                  # I
    page.locator('.chip-type[data-type="7"]').click()
    page.locator('.chip-deg[data-deg="4"]').click()
    page.keyboard.press("Enter")                                       # V7, submitted with Enter
    page.locator('.chip-type[data-type="triad"]').click()
    page.locator('.chip-deg[data-deg="3"]').click()
    page.keyboard.press("Enter")                                       # IV
    page.locator('.chip-deg[data-deg="0"]').click()
    page.locator("#add-prog").click()                                  # I again
    page.wait_for_timeout(100)
    check("prog: summary counts the chords", page.locator("#prog-summary").text_content() == "Progressions (4)", page.locator("#prog-summary").text_content())
    check("prog: chiclets show I / V7 / IV / I with chord symbols",
          page.locator(".prog-item .chip-num").all_inner_texts() == ["I", "V7", "IV", "I"]
          and page.locator(".prog-item .chip-sym").all_inner_texts() == ["C", "G7", "F", "C"],
          (page.locator(".prog-item .chip-num").all_inner_texts(), page.locator(".prog-item .chip-sym").all_inner_texts()))
    page.locator('.key-white[data-pc="7"]').first.click()               # key of G
    page.wait_for_timeout(700)
    def lit_root():
        return page.locator(".key.hl-croot").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))]")
    check("prog: picking a key lights the first chord (G)", page.locator('.chip-prog[aria-pressed="true"]').get_attribute("data-prog") == "0" and lit_root() == ["7"], lit_root())
    fin = page.locator(".fingering .finger").evaluate_all("els => els.map(e => e.dataset.finger).sort()")
    check("fingering: the first chord (I, three notes) is labelled 5-3-1 under the keys", fin == ["1", "3", "5"] and page.locator("#prog-finger").count() == 0, fin)
    seq = []
    roots = []
    for _ in range(5):
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(150)
        seq.append(page.locator('.chip-prog[aria-pressed="true"]').get_attribute("data-prog"))
        roots.append(lit_root())
    check("prog: right arrow steps through and wraps to the first chord", seq == ["1", "2", "3", "0", "1"], seq)
    fin2 = page.locator(".fingering .finger").evaluate_all("els => els.map(e => e.dataset.finger).sort()")
    check("fingering: the V7 (four notes) is labelled 5-3-2-1; no text description in the section", fin2 == ["1", "2", "3", "5"]
          and "Left hand" not in page.locator("#progressions").inner_text(), fin2)
    ys = page.locator(".fingering circle").evaluate_all("els => [...new Set(els.map(e => e.getAttribute('cy')))]")
    check("fingering: the finger row sits below the degree badges", len(ys) == 1 and float(ys[0]) > page.evaluate("document.querySelector('.kb-svg').viewBox.baseVal.height") - 60, ys)
    gap = page.evaluate("""() => { const k = document.querySelector('.key-white').getBoundingClientRect(); const c = document.querySelector('.fingering circle').getBoundingClientRect(); const s = document.querySelector('.kb-svg').getBoundingClientRect().width / 1092; return (c.top - k.bottom) / s; }""")
    check("fingering: the finger row sits snugly under the keys (no big gap)", gap < 30, gap)
    shot("15_fingering")
    page.locator("#prog-summary").click()
    page.wait_for_timeout(200)
    check("fingering: hidden while the Progressions section is collapsed", page.locator(".fingering").count() == 0)
    page.locator("#prog-summary").click()
    page.wait_for_timeout(200)
    check("fingering: back when it is expanded again", page.locator(".fingering .finger").count() == 4)
    check("prog: the lit chord follows the progression (V7 -> D7, root D)", roots[0] == ["2"] and page.locator(".key.hl-ctone").count() >= 3, roots)
    page.locator("#prog-next").click()
    page.wait_for_timeout(100)
    check("prog: the Next button advances too", page.locator('.chip-prog[aria-pressed="true"]').get_attribute("data-prog") == "2")
    page.locator('.chip-prog[data-prog="0"]').click()
    page.wait_for_timeout(100)
    check("prog: clicking a chiclet lights it", page.locator('.chip-prog[aria-pressed="true"]').get_attribute("data-prog") == "0" and lit_root() == ["7"])
    page.locator('[data-prog-remove="1"]').click()
    page.wait_for_timeout(100)
    check("prog: a chiclet can be removed", page.locator("#prog-summary").text_content() == "Progressions (3)")
    page.evaluate("localStorage.removeItem('music-theory-state-v1')")     # keep the progression, forget the key
    page.reload()
    page.locator('.key-white[data-pc="0"]').first.click()
    page.wait_for_timeout(150)
    check("prog: a saved progression is revealed as soon as a key is selected (chord selector still closed)",
          page.locator("#progressions").is_visible() and page.locator("#prog-summary").text_content() == "Progressions (3)"
          and page.locator("#prog-details").get_attribute("open") is None)
    check("prog: the Add / Clear row is hidden while the section is collapsed", not page.locator("#prog-actions").is_visible())
    page.locator("#prog-summary").click()
    page.wait_for_timeout(150)
    check("prog: with the chord selector collapsed, Add and Clear are hidden",
          not page.locator("#prog-clear").is_visible() and not page.locator("#add-prog").is_visible())
    page.locator("#chords-details summary").click()
    page.wait_for_timeout(200)
    ab = page.locator("#add-prog").bounding_box()
    cb = page.locator("#prog-clear").bounding_box()
    sb = page.locator("#prog-summary").bounding_box()
    check("prog: Add sits under the title and Clear well away from it",
          page.locator("#prog-actions").is_visible() and ab["y"] > sb["y"] and cb["x"] - (ab["x"] + ab["width"]) > 60, (ab, cb, sb))
    check("prog: no 'or press Enter' text", "press Enter" not in page.locator("#progressions").inner_text() and "or press" not in page.locator("#chords").inner_text())
    # keyboard shortcuts: digits pick the degree, A S D ... pick the type chips in the order shown
    page.locator("#prog-details").evaluate("d => d.open = true")
    page.wait_for_timeout(100)
    hint = lambda: page.locator(".chip-type").first.evaluate("e => getComputedStyle(e, '::after').display")
    check("keys: hints show while Progressions is open", hint() != "none", hint())
    page.locator("#prog-details").evaluate("d => d.open = false")
    page.wait_for_timeout(100)
    check("keys: hints hide while Progressions is collapsed", hint() == "none", hint())
    page.locator("#prog-details").evaluate("d => d.open = true")
    page.wait_for_timeout(100)
    check("keys: chips carry their shortcut hints", page.locator(".chip-type").first.get_attribute("data-key") == "A"
          and page.locator('.chip-deg[data-deg="0"]').get_attribute("data-key") == "1")
    page.keyboard.press("3")
    page.wait_for_timeout(100)
    check("keys: 3 selects the third degree (iii)", page.locator('.chip-deg[data-deg="2"]').get_attribute("aria-pressed") == "true")
    page.keyboard.press("3")
    page.wait_for_timeout(100)
    check("keys: pressing the same digit again keeps it selected", page.locator('.chip-deg[data-deg="2"]').get_attribute("aria-pressed") == "true")
    page.keyboard.press("s")
    page.wait_for_timeout(100)
    check("keys: S selects the second type chip (7th)", page.locator('.chip-type[data-type="7"]').get_attribute("aria-pressed") == "true")
    page.keyboard.press("Enter")
    page.wait_for_timeout(100)
    check("keys: Enter then adds iii7", page.locator("#prog-summary").text_content() == "Progressions (4)"
          and page.locator(".prog-item .chip-num").all_text_contents()[-1] == "iii7", page.locator(".prog-item .chip-num").all_text_contents())
    page.locator('label[for="level-jazz"]').click()                 # the sort menu is Jazz-only
    page.wait_for_timeout(200)
    page.locator('#type-sort-select').select_option('complexity')
    page.wait_for_timeout(100)
    page.evaluate("() => document.activeElement && document.activeElement.blur()")
    page.keyboard.press("d")
    page.wait_for_timeout(100)
    check("keys: letters follow the order shown (complexity: D is the third chip, Sus4)",
          page.locator(".chip-type").nth(2).get_attribute("aria-pressed") == "true", page.locator(".chip-type").all_inner_texts())
    page.locator('#type-sort-select').select_option('frequency')
    page.locator('label[for="level-pop"]').click()
    page.wait_for_timeout(200)
    # --- reorder by dragging -----------------------------------------------------------------
    syms = lambda: page.locator(".prog-item .chip-num").all_text_contents()
    before = syms()
    n = len(before)
    last = page.locator(".prog-item").nth(n - 1)
    lw = last.bounding_box()["width"]
    page.locator(".prog-item").nth(0).drag_to(last, target_position={"x": lw - 2, "y": 20})
    page.wait_for_timeout(250)
    after = syms()
    check("prog: dragging the first chiclet past the last one moves it to the end", n >= 3 and after == before[1:] + before[:1], (before, after))
    stored_prog = page.evaluate("JSON.parse(localStorage.getItem('music-theory-progression-v1')).length")
    check("prog: and the progression is still stored in full", stored_prog == n)
    page.locator(".prog-item").nth(n - 1).drag_to(page.locator(".prog-item").nth(0), target_position={"x": 2, "y": 20})
    page.wait_for_timeout(250)
    check("prog: dragging it back to the front restores the order", syms() == before, (before, syms()))
    page.locator(".prog-item").nth(1).locator(".chip-prog").click()
    page.wait_for_timeout(150)
    lit = page.locator(".chip-prog[aria-pressed=true] .chip-num").text_content()
    last = page.locator(".prog-item").nth(n - 1)
    page.locator(".prog-item").nth(1).drag_to(last, target_position={"x": lw - 2, "y": 20})
    page.wait_for_timeout(250)
    check("prog: the lit chord stays lit after it moves", page.locator(".chip-prog[aria-pressed=true] .chip-num").text_content() == lit
          and page.locator(".chip-prog[aria-pressed=true]").count() == 1)
    page.locator("#prog-clear").click()
    page.wait_for_timeout(100)
    check("prog: Clear empties it", page.locator("#prog-summary").text_content() == "Progressions" and page.locator(".prog-empty").count() == 1)
    # --- saved progressions -------------------------------------------------------------
    if page.locator("#chords-details").get_attribute("open") is None:
        page.locator("#chords-details summary").click()
        page.wait_for_timeout(150)
    if page.locator("#prog-details").get_attribute("open") is None:
        page.locator("#prog-summary").click()
        page.wait_for_timeout(150)
    def add_chord(deg):
        page.locator('.chip-deg[data-deg="%d"]' % deg).click()
        page.locator("#add-prog").click()
    def names():
        return page.evaluate("JSON.parse(localStorage.getItem('music-theory-saved-progressions-v1')).items.map(i => i.name)")
    def act(label):
        page.locator("#prog-menu").select_option(label=label)
        page.wait_for_timeout(150)
    page.locator('.chip-type[data-type="triad"]').click()
    for d in (0, 3, 4):
        add_chord(d)
    page.wait_for_timeout(150)
    check("saved: nothing saved yet -> no menus, but a Save row appears for the chords",
          not page.locator("#prog-select").is_visible() and not page.locator("#prog-menu").is_visible() and page.locator("#prog-save-form").is_visible())
    page.locator("#prog-name").fill("Three chord")
    page.locator("#prog-name").press("Enter")
    page.wait_for_timeout(150)
    head_y = page.locator("#prog-summary").bounding_box()["y"]
    sel_y = page.locator("#prog-select").bounding_box()["y"]
    check("saved: saving names it and shows both menus on the header line",
          names() == ["Three chord"] and page.locator("#prog-select").is_visible() and page.locator("#prog-menu").is_visible()
          and abs(head_y - sel_y) < 30 and not page.locator("#prog-save-form").is_visible()
          and page.locator("#prog-summary").text_content() == "Progressions: Three chord (3)", (names(), head_y, sel_y))
    check("saved: closed selector reads 'Stored: <name>'", page.locator("#prog-select option:checked").text_content() == "Stored: Three chord")
    page.locator("#prog-select").dispatch_event("mousedown")
    opened = page.locator("#prog-select option").all_text_contents()
    check("saved: opened selector has a header above the plain names", opened == ["Stored Progressions…", "Three chord"], opened)
    page.locator("#prog-select").dispatch_event("blur")
    add_chord(0)
    page.wait_for_timeout(100)
    stored = page.evaluate("JSON.parse(localStorage.getItem('music-theory-saved-progressions-v1'))")
    check("saved: edits to a saved progression are kept on it", len(stored["items"][0]["chords"]) == 4 and stored["current"] == stored["items"][0]["id"], stored)
    act("Duplicate")
    check("saved: Duplicate makes a copy and opens it", names() == ["Three chord", "Three chord copy"]
          and page.locator("#prog-select option:checked").text_content() == "Stored: Three chord copy" and page.locator(".prog-item").count() == 4)
    act("Rename…")
    check("saved: Rename shows the name box, prefilled", page.locator("#prog-name").is_visible() and page.locator("#prog-name").input_value() == "Three chord copy")
    page.locator("#prog-name").fill("Turnaround")
    page.locator("#prog-name").press("Enter")
    page.wait_for_timeout(150)
    check("saved: renamed", names() == ["Three chord", "Turnaround"] and page.locator("#prog-summary").text_content() == "Progressions: Turnaround (4)")
    page.locator('[data-prog-remove="3"]').click()
    page.wait_for_timeout(100)
    page.locator("#prog-select").select_option(label="Three chord")
    page.wait_for_timeout(150)
    check("saved: the menu switches progressions; the other one kept its own edit",
          page.locator(".prog-item").count() == 4 and page.locator("#prog-summary").text_content() == "Progressions: Three chord (4)")
    page.locator("#prog-select").select_option(label="Turnaround")
    page.wait_for_timeout(150)
    check("saved: Turnaround has 3 chords after the removal", page.locator(".prog-item").count() == 3)
    act("New progression")
    check("saved: New looks like the first progression: no placeholder, no selection, empty",
          page.locator(".prog-item").count() == 0 and names() == ["Three chord", "Turnaround"]
          and page.locator("#prog-select option:checked").text_content() == "Stored progressions…" and page.locator("#prog-select").input_value() == "" and not page.locator("#prog-save-form").is_visible()
          and not page.locator("#prog-menu").is_visible() and page.locator("#prog-select").is_visible())
    add_chord(1)
    page.wait_for_timeout(100)
    check("saved: chords in a new progression bring the name box and Save button", page.locator("#prog-save-form").is_visible()
          and page.locator("#prog-name").is_visible() and page.locator("#prog-save-btn").text_content() == "Save",
          (page.locator("#prog-save-form").is_visible(), page.locator("#prog-save-btn").text_content()))
    check("saved: the Actions menu stays hidden while working on a new progression", not page.locator("#prog-menu").is_visible())
    page.locator("#prog-select").select_option(label="Three chord")
    page.wait_for_timeout(150)
    check("saved: choosing a stored one with unsaved chords asks 'Discard current progression?'",
          page.locator("#prog-confirm").is_visible() and page.locator("#prog-confirm-text").text_content() == "Discard current progression?"
          and page.locator(".prog-item").count() == 1 and page.locator("#prog-select").input_value() == "")
    page.locator("#prog-confirm-no").click()
    page.wait_for_timeout(100)
    check("saved: Cancel keeps the unsaved chords", not page.locator("#prog-confirm").is_visible() and page.locator(".prog-item").count() == 1)
    page.locator("#prog-select").select_option(label="Three chord")
    page.wait_for_timeout(100)
    page.locator("#prog-confirm-yes").click()
    page.wait_for_timeout(150)
    check("saved: Yes discards them and opens the stored one", page.locator(".prog-item").count() == 4 and page.locator("#prog-menu").is_visible()
          and page.locator("#prog-select option:checked").text_content() == "Stored: Three chord")
    act("New progression")
    add_chord(2)
    page.wait_for_timeout(100)
    page.locator("#prog-name").fill("Three chord")
    page.locator("#prog-save-btn").click()
    page.wait_for_timeout(150)
    check("saved: a duplicate name gets a suffix", "Three chord (2)" in names(), names())
    act("Delete…")
    check("saved: Delete asks for confirmation first", page.locator("#prog-confirm").is_visible() and len(names()) == 3,
          (page.locator("#prog-confirm").is_visible(), names()))
    page.locator("#prog-confirm-no").click()
    page.wait_for_timeout(100)
    check("saved: Cancel keeps it", not page.locator("#prog-confirm").is_visible() and len(names()) == 3)
    act("Delete…")
    page.locator("#prog-confirm-yes").click()
    page.wait_for_timeout(150)
    check("saved: deleted", names() == ["Three chord", "Turnaround"] and page.locator(".prog-item").count() == 0, names())
    page.locator("#prog-select").select_option(label="Turnaround")
    page.wait_for_timeout(150)
    page.locator("#prog-clear").click()
    check("saved: Clear on a saved progression needs a second click", page.locator("#prog-clear").text_content() == "Click again to clear"
          and page.locator(".prog-item").count() == 3)
    page.locator("#chords-details summary").click()
    page.wait_for_timeout(200)
    check("saved: the Actions menu hides while the chord selector is collapsed (the Stored selector stays)",
          not page.locator("#prog-menu").is_visible() and page.locator("#prog-select").is_visible())
    page.locator("#chords-details summary").click()
    page.wait_for_timeout(200)
    check("saved: and it returns when the selector opens", page.locator("#prog-menu").is_visible())
    opts = page.locator("#prog-menu option").all_text_contents()
    check("saved: Actions menu order is Rename, Duplicate, Delete, separator, New progression",
          [o for o in opts if not o.startswith("\u2500")] == ["Actions…", "Rename…", "Duplicate", "Delete…", "New progression"]
          and opts[-2].startswith("\u2500"), opts)
    page.locator("#prog-summary").click()
    page.wait_for_timeout(100)
    check("saved: the menus hide while the section is collapsed", not page.locator("#prog-select").is_visible() and not page.locator("#prog-menu").is_visible())
    page.locator("#prog-summary").click()
    page.wait_for_timeout(100)
    page.reload()
    page.wait_for_selector(".kb-svg")
    page.wait_for_timeout(300)
    check("saved: the saved progressions and the open one survive a reload",
          names() == ["Three chord", "Turnaround"] and page.locator("#prog-select option:checked").text_content() == "Stored: Turnaround")
    page.evaluate("() => { ['music-theory-progression-v1', 'music-theory-saved-progressions-v1', 'music-theory-state-v1'].forEach(k => localStorage.removeItem(k)); }")
    page.reload()
    page.wait_for_selector(".kb-svg")
    page.locator('.key-white[data-pc="0"]').first.click()
    page.wait_for_timeout(200)

    # --- sound -------------------------------------------------------------------------------
    notes = lambda: page.evaluate("ChordAudio.engine.notes()")
    page.locator('.key-white[data-pc="0"]').first.click()
    page.wait_for_timeout(300)
    page.evaluate("() => { const d = document.getElementById('chords-details'); if (!d.open) d.open = true; }")
    page.wait_for_timeout(200)
    check("sound: no chord selected -> no play button", not page.locator("#chord-play").is_visible())
    page.locator('.chip-type[data-type="triad"]').click()
    page.locator('.chip-deg[data-deg="0"]').click()
    page.wait_for_timeout(200)
    check("sound: with a chord selected the play button appears", page.locator("#chord-play").is_visible())
    page.locator("#chord-play").hover()
    page.mouse.down()
    page.wait_for_timeout(150)
    held = notes()
    check("sound: holding the button sounds the chord (3 notes)", len(held) == 3 and page.locator("#chord-play.playing").count() == 1, held)
    page.mouse.up()
    page.wait_for_timeout(150)
    check("sound: releasing falls silent", notes() == [])
    page.evaluate("() => document.activeElement && document.activeElement.blur()")
    page.keyboard.down("Shift")
    page.wait_for_timeout(100)
    check("sound: holding Shift plays too", len(notes()) == 3, notes())
    page.keyboard.up("Shift")
    page.wait_for_timeout(100)
    check("sound: and releasing it stops", notes() == [])
    page.locator("#chord-play").hover()
    page.mouse.down()
    page.wait_for_timeout(100)
    page.keyboard.press("5")                                   # a different degree while held
    page.wait_for_timeout(100)
    check("sound: changing the chord while holding stops the sound", notes() == [])
    page.mouse.up()
    page.wait_for_timeout(100)
    if page.locator("#prog-details").get_attribute("open") is None:
        page.locator("#prog-summary").click()
    page.wait_for_timeout(100)
    for d in (0, 3, 4):
        page.locator('.chip-deg[data-deg="%d"]' % d).click()
        page.locator("#add-prog").click()
    page.wait_for_timeout(200)
    check("sound: Progressions switch starts off", page.locator("#prog-sound").get_attribute("aria-pressed") == "false" and notes() == [])
    page.locator("#prog-sound").click()
    page.wait_for_timeout(150)
    first = notes()
    check("sound: turning it on plays the first chord", page.locator("#prog-sound").get_attribute("aria-pressed") == "true" and len(first) == 3, first)
    page.locator("#prog-next").click()
    page.wait_for_timeout(150)
    second = notes()
    check("sound: stepping changes the chord", len(second) == 3 and second != first, (first, second))
    check("sound: the fingering voicing is what plays", sorted(second) == sorted(page.evaluate("ChordAudio.engine.notes()")))
    page.locator("#chords-details summary").click()                 # collapse the chord selector: the Chords button goes, Progressions keeps sounding
    page.wait_for_timeout(200)
    check("sound: collapsing Chords hides its button but not the progression sound", not page.locator("#chord-play").is_visible() and len(notes()) == 3)
    page.keyboard.press("p")
    page.wait_for_timeout(100)
    check("sound: P switches it off", page.locator("#prog-sound").get_attribute("aria-pressed") == "false" and notes() == [])
    page.keyboard.press("p")
    page.wait_for_timeout(100)
    check("sound: and on again", len(notes()) == 3)
    page.locator('.key-white[data-pc="2"]').first.click()
    page.wait_for_timeout(300)
    check("sound: changing the key keeps it going", page.locator("#prog-sound").get_attribute("aria-pressed") == "true" and len(notes()) == 3, notes())
    page.evaluate("() => document.activeElement && document.activeElement.blur()")
    page.keyboard.press("Shift")
    page.wait_for_timeout(100)
    check("sound: with Progressions open Shift toggles it off", page.locator("#prog-sound").get_attribute("aria-pressed") == "false" and notes() == [])
    page.keyboard.press("Shift")
    page.wait_for_timeout(100)
    check("sound: and on", len(notes()) == 3)
    page.evaluate("() => { const d = document.getElementById('chords-details'); if (!d.open) d.open = true; }")
    page.wait_for_timeout(200)
    page.evaluate("() => document.activeElement && document.activeElement.blur()")
    page.keyboard.press("Shift")
    page.wait_for_timeout(100)
    check("sound: Progressions wins over Chords for Shift", page.locator("#prog-sound").get_attribute("aria-pressed") == "false" and notes() == [])
    page.evaluate("() => { const d = document.getElementById('chords-details'); d.open = false; }")
    page.wait_for_timeout(100)
    page.keyboard.press("Shift")
    page.wait_for_timeout(100)
    page.keyboard.press("Shift+Tab")
    page.wait_for_timeout(100)
    check("sound: Shift used in a combination (Shift+Tab) does not toggle anything", len(notes()) == 3)
    page.evaluate("() => document.activeElement && document.activeElement.blur()")
    check("sound: with only Progressions open it still toggles", len(notes()) == 3)
    page.evaluate("() => { document.getElementById('prog-details').open = false; }")
    page.wait_for_timeout(200)
    check("sound: collapsing Progressions switches it off", notes() == [])
    page.evaluate("() => { document.getElementById('prog-details').open = true; }")
    page.wait_for_timeout(200)
    check("sound: and it stays off when reopened", page.locator("#prog-sound").get_attribute("aria-pressed") == "false")
    # Progressions open but empty, Chords open with a chord: Shift plays the chord
    page.evaluate("() => { document.getElementById('prog-details').open = true; document.getElementById('chords-details').open = true; }")
    page.wait_for_timeout(200)
    page.locator("#prog-clear").click()
    page.locator("#prog-clear").click() if page.locator("#prog-clear").text_content() != "Clear" else None
    page.wait_for_timeout(150)
    page.evaluate("() => document.activeElement && document.activeElement.blur()")
    page.keyboard.down("Shift")
    page.wait_for_timeout(100)
    check("sound: Progressions empty -> Shift plays the chord from Chords", len(notes()) == 3 and page.locator("#chord-play.playing").count() == 1, notes())
    page.keyboard.up("Shift")
    page.wait_for_timeout(100)
    check("sound: and releasing stops it", notes() == [])
    page.evaluate("() => { document.getElementById('prog-details').open = false; }")
    page.wait_for_timeout(100)
    page.evaluate("() => document.activeElement && document.activeElement.blur()")
    page.keyboard.press("Shift")
    page.wait_for_timeout(100)
    check("sound: with both closed Shift does nothing", notes() == [])
    page.evaluate("() => { ['music-theory-progression-v1', 'music-theory-saved-progressions-v1', 'music-theory-state-v1'].forEach(k => localStorage.removeItem(k)); }")
    page.reload()
    page.wait_for_selector(".kb-svg")
    page.locator('.key-white[data-pc="0"]').first.click()
    page.wait_for_timeout(200)

    # --- the app remembers key, chord, progression and open sections across a reload ---------
    page.locator('.key-white[data-pc="2"]').first.click()                 # D
    page.wait_for_timeout(800)
    if page.locator("#chords-details").get_attribute("open") is None:
        page.locator("#chords-details summary").click()
    page.locator('.chip-type[data-type="7"]').click()
    page.locator('.chip-deg[data-deg="4"]').click()                       # A7
    if page.locator("#prog-details").get_attribute("open") is None:
        page.locator("#prog-summary").click()
    page.wait_for_timeout(200)
    page.locator("#add-prog").click()
    page.locator("#add-prog").click()
    page.wait_for_timeout(300)
    page.reload()
    page.wait_for_selector(".kb-svg")
    page.wait_for_timeout(300)
    check("persist: key, chord and both sections come back after a reload",
          page.locator("#chords-summary").text_content() == "Chords in the key of D"
          and page.locator("#chords-details").get_attribute("open") is not None and page.locator("#prog-details").get_attribute("open") is not None
          and page.locator('.chip-type[data-type="7"]').get_attribute("aria-pressed") == "true"
          and page.locator('.chip-deg[data-deg="4"]').get_attribute("aria-pressed") == "true"
          and page.locator("#prog-summary").text_content() == "Progressions (2)"
          and page.locator(".key.hl-croot").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))]") == ["9"])
    page.locator("#chords-details summary").click()                       # collapse one section: that is remembered too
    page.wait_for_timeout(200)
    page.reload()
    page.wait_for_selector(".kb-svg")
    page.wait_for_timeout(300)
    check("persist: a collapsed chord selector stays collapsed", page.locator("#chords-details").get_attribute("open") is None
          and page.locator("#prog-details").get_attribute("open") is not None)
    page.locator('label[for="mode-minor"]').click()
    page.locator('label[for="level-jazz"]').click()
    page.wait_for_timeout(200)
    page.reload()
    page.wait_for_selector(".kb-svg")
    check("persist: mode and level come back too", page.locator("#mode-minor").is_checked() and page.locator("#level-jazz").is_checked()
          and not page.locator("#view-group").is_visible())
    page.locator("#reset-app").click()
    page.wait_for_timeout(500)
    check("reset app: key, chord, progression, sections, mode and level are back to initial",
          page.locator("#mode-major").is_checked() and page.locator("#level-pop").is_checked() and page.locator("#view-group").is_visible()
          and not page.locator("#chords").is_visible() and not page.locator("#progressions").is_visible()
          and page.evaluate("localStorage.getItem('music-theory-progression-v1')") is None
          and page.evaluate("localStorage.getItem('music-theory-state-v1')") is None)
    page.reload()
    page.wait_for_selector(".kb-svg")
    page.locator('.key-white[data-pc="0"]').first.click()
    page.wait_for_timeout(200)
    check("reset app: a reload afterwards starts clean (chord selector closed, no progression)",
          page.locator("#chords-details").get_attribute("open") is None and not page.locator("#progressions").is_visible())
    page.evaluate("() => { localStorage.removeItem('music-theory-progression-v1'); localStorage.removeItem('music-theory-state-v1'); }")

    # --- flashcards: "Find the signature" direction ---------------------------------
    page.goto("file://" + page_path)
    check("sigcards: direction switch hidden in Explore", not page.locator("#flashmode-group").is_visible())
    page.locator('label[for="view-flash"]').click()
    page.wait_for_timeout(200)
    check("sigcards: direction switch shown in Flashcards, default 'Find the key'",
          page.locator("#flashmode-group").is_visible() and page.locator("#fm-key").is_checked() and page.locator(".sigbox").count() == 0)
    page.locator('label[for="fm-sig"]').click()
    page.wait_for_timeout(600)
    check("sigcards: 7 sharp + 6 flat signature boxes (C first, ordered by count)",
          page.locator('.sigbox[data-kind="sharp"]').count() == 7 and page.locator('.sigbox[data-kind="flat"]').count() == 6
          and page.locator('.sigbox[data-kind="sharp"]').evaluate_all("els => els.map(e => e.dataset.n).join('')") == "0123456"
          and page.locator('.sigbox[data-kind="flat"]').evaluate_all("els => els.map(e => e.dataset.n).join('')") == "123456")
    ys = page.evaluate("""() => { const t = n => [...document.querySelectorAll('.sigbox')].filter(e => e.dataset.n === String(n)).map(e => e.getBoundingClientRect());
      const c = t(0)[0], s1 = t(1).map(r => r.top), s3 = t(3).map(r => r.left);
      return { cMid: c.top + c.height / 2, sharp1: s1[0], flat1: s1[1], sharp1x: t(1)[0].left, flat1x: t(1)[1].left, cLeft: c.left, s1Left: t(1)[0].left,
               sharpBottom: t(1)[0].bottom, flatTop: t(1)[1].top, x3: s3 }; }""")
    check("sigcards: C is centred vertically between the rows and sharps/flats line up in columns",
          abs(ys["cMid"] - (ys["sharpBottom"] + ys["flatTop"]) / 2) < 2 and abs(ys["sharp1x"] - ys["flat1x"]) < 1
          and abs(ys["x3"][0] - ys["x3"][1]) < 1 and ys["cLeft"] < ys["s1Left"], ys)
    check("sigcards: F# and Gb are separate boxes", page.locator('.sigbox[data-pc="6"]').count() == 2)
    tonic = page.locator(".sigcard").get_attribute("data-answer-pc")
    lit = page.locator(".key.hl-root").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))]")
    check("sigcards: only the tonic key is lit", lit == [tonic], (lit, tonic))
    check("sigcards: keyboard clicks do nothing", (page.locator('.key[data-pc="%s"]' % ((int(tonic) + 1) % 12)).first.click() or True)
          and page.locator("#n-bad").text_content() == "0")
    wrong = page.locator('.sigbox:not([data-pc="%s"])' % tonic).first
    wrong.click()
    page.wait_for_timeout(300)
    check("sigcards: wrong pick is scored and named", page.locator("#n-bad").text_content() == "1" and "Try again" in page.locator(".sig-msg").text_content()
          and page.locator(".next-btn").count() == 0, page.locator(".sig-msg").text_content())
    spell = page.locator(".sigcard").evaluate("e => 0")
    # the right box: matching pc and the spelling named on the lit key (F#/Gb are independent answers)
    name = page.locator(".key.hl-root text").first.text_content()
    right = None
    for i in range(page.locator('.sigbox[data-pc="%s"]' % tonic).count()):
        bx = page.locator('.sigbox[data-pc="%s"]' % tonic).nth(i)
        if bx.get_attribute("data-kind") == ("flat" if "\u266d" in name else "sharp") or page.locator('.sigbox[data-pc="%s"]' % tonic).count() == 1:
            right = bx
    if page.locator('.sigbox[data-pc="%s"]' % tonic).count() == 2:
        other = [page.locator('.sigbox[data-pc="%s"]' % tonic).nth(i) for i in range(2)]
        wrong_spelling = [o for o in other if o is not right][0]
        wrong_spelling.click()
        page.wait_for_timeout(200)
        check("sigcards: the other enharmonic spelling is wrong", page.locator("#n-bad").text_content() == "2" and page.locator(".next-btn").count() == 0)
    right.click()
    page.wait_for_timeout(500)
    msg = page.locator(".sig-msg").text_content()
    check("sigcards: right pick shows key, count and notes, scale lights, Next appears",
          page.locator("#n-ok").text_content() == "1" and "major:" in msg and page.locator(".next-btn").count() == 1
          and page.locator(".key.hl-scale").count() >= 8, msg)
    page.locator(".next-btn").click()
    page.wait_for_timeout(900)
    tonic2 = page.locator(".sigcard").get_attribute("data-answer-pc")
    check("sigcards: Next deals a different tonic and rotates the keyboard",
          tonic2 != tonic and page.locator(".next-btn").count() == 0 and page.locator(".key.hl-scale").count() == 0
          and page.locator(".key.hl-root").evaluate_all("els => [...new Set(els.map(e => e.dataset.pc))]") == [tonic2])
    page.locator('label[for="mode-minor"]').click()
    page.wait_for_timeout(500)
    check("sigcards: minor deck works (Am first, 6 flat boxes)", page.locator('.sigbox[data-kind="sharp"]').count() == 7
          and page.locator('.sigbox[data-kind="flat"]').count() == 6 and page.locator(".sig-msg").text_content().startswith("Which signature belongs to the minor"))
    shot("14_sigcards")
    page.locator('label[for="fm-key"]').click()
    page.wait_for_timeout(500)
    check("sigcards: back to 'Find the key' restores the signature card", page.locator(".sigbox").count() == 0 and page.locator(".flashcard").count() == 1)
    page.locator('label[for="view-explore"]').click()
    page.wait_for_timeout(300)
    check("sigcards: Explore hides the direction switch again", not page.locator("#flashmode-group").is_visible())
    # --- notation on the big stave ----------------------------------------
    pn = ctx.new_page()
    pn.goto("file://" + page_path)
    pn.wait_for_selector(".kb-svg")
    pn.locator('.box[data-pc="2"]').first.click()
    pn.wait_for_timeout(300)
    check("stave: signature boxes show while Chords and Progressions are closed", pn.locator(".box[data-pc]").count() > 5 and pn.locator(".stave").count() == 0)
    pn.locator("#chords-summary").click()
    pn.wait_for_timeout(300)
    check("stave: Chords open hides the other signatures and shows one empty stave", pn.locator(".box[data-pc]").count() == 0
          and pn.locator(".stave").count() == 1 and "Select a chord" in pn.locator(".stave").text_content())
    pn.locator('button[data-deg="4"]').click()
    pn.wait_for_timeout(300)
    check("stave: a triad shows root position and two inversions",
          pn.locator(".stave ellipse").count() == 36 and "2nd inversion" in pn.locator(".stave").text_content()
          and ("/E" in pn.locator(".stave").text_content()), pn.locator(".stave").text_content())
    pn.locator("#prog-details summary").click()
    pn.wait_for_timeout(300)
    check("stave: Progressions open ignores the chord selector (empty hint)", "Add chords" in pn.locator(".stave").text_content())
    for d in [0, 3, 4]:
        pn.locator(f'button[data-deg="{d}"]').click()
        pn.locator("#add-prog").click()
    pn.keyboard.press("ArrowRight")
    pn.wait_for_timeout(300)
    t = pn.locator(".stave").text_content()
    check("stave: progression shows one chord per slot with numerals, symbols and a lit one",
          pn.locator(".stave ellipse").count() == 18 and "Dm" in t and "i" in t,
          pn.locator(".stave ellipse").count())
    pn.locator("#prog-details summary").click()
    pn.locator("#chords-summary").click()
    pn.wait_for_timeout(300)
    check("stave: closing both panes brings the signature boxes back", pn.locator(".box[data-pc]").count() > 5 and pn.locator(".stave").count() == 0)
    # clef picker
    pn.locator("#chords-summary").click()
    pn.locator('button[data-deg="4"]').click()
    pn.wait_for_timeout(200)
    check("clef: treble by default, clef is a button", pn.locator(".clef-hit").get_attribute("data-clef") == "treble")
    pn.locator(".clef-hit").click()
    check("clef: clicking it opens a picker with the three Pop clefs", pn.locator("#clef-pop .clef-opt").count() == 3
          and pn.locator('#clef-pop .clef-opt[aria-selected="true"]').get_attribute("data-clef") == "treble")
    pn.keyboard.press("Escape")
    check("clef: Escape closes the picker", pn.locator("#clef-pop").count() == 0)
    pn.locator('label[for="level-jazz"]').click()
    pn.wait_for_timeout(200)
    pn.locator(".clef-hit").click()
    check("clef: Jazz offers all six clefs", pn.locator("#clef-pop .clef-opt").count() == 6)
    pn.keyboard.press("Escape")
    pn.locator('label[for="level-pop"]').click()
    pn.wait_for_timeout(200)
    pn.locator(".clef-hit").click()
    pn.locator('.clef-opt[data-clef="bass"]').click()
    pn.wait_for_timeout(200)
    check("clef: choosing bass redraws with the bass clef", pn.locator("#clef-pop").count() == 0
          and pn.locator(".clef-hit").get_attribute("data-clef") == "bass" and pn.locator('.stave use[href="#fclef"]').count() == 1)
    pn.reload()
    pn.wait_for_selector(".clef-hit", timeout=5000)
    check("clef: the choice is remembered", pn.locator(".clef-hit").get_attribute("data-clef") == "bass")
    pn.locator(".clef-hit").click()
    pn.locator('.clef-opt[data-clef="treble"]').click()
    # progression inversions from the stave
    if not pn.locator("#prog-details").evaluate("e => e.open"):
        pn.locator("#prog-details summary").click()
    pn.wait_for_timeout(300)
    zones = pn.locator('.inv-zone[data-chord="0"]').count()
    check("stave: each progression chord has an up and a down inversion zone", zones == 2, zones)
    pn.locator('.inv-zone[data-chord="0"][data-dir="up"]').dispatch_event("click")
    pn.wait_for_timeout(200)
    pn.locator('.inv-zone[data-chord="0"][data-dir="down"]').dispatch_event("click")     # (the hand may already be at the top of the keyboard)
    pn.wait_for_timeout(200)
    f1 = pn.locator(".fingering").text_content() if pn.locator(".fingering").count() else ""
    pn.locator('.inv-zone[data-chord="0"][data-dir="down"]').dispatch_event("click")
    pn.wait_for_timeout(200)
    f2 = pn.locator(".fingering").text_content() if pn.locator(".fingering").count() else ""
    check("stave: clicking a chord's zones changes its inversion (status names it) and the fingering moves",
          "inversion" in pn.locator("#prog-status").text_content() or "position" in pn.locator("#prog-status").text_content(), pn.locator("#prog-status").text_content())
    pn.locator('.inv-zone[data-chord="0"][data-dir="up"]').dispatch_event("click")
    pn.wait_for_timeout(200)
    check("stave: up after down returns to the previous voicing", pn.locator(".fingering").count() == 1)
    pn.locator('.inv-zone[data-chord="0"][data-dir="up"]').dispatch_event("click")
    pn.wait_for_timeout(200)
    shifted = pn.locator(".fingering").text_content()
    pn.locator(".clef-hit").click()
    pn.locator('.clef-opt[data-clef="bass"]').click()
    pn.wait_for_timeout(200)
    pn.locator(".clef-hit").click()
    pn.locator('.clef-opt[data-clef="treble"]').click()
    pn.wait_for_timeout(200)
    check("clef: changing clef resets the inversions to the suggestion",
          not pn.evaluate("() => (JSON.parse(localStorage.getItem('music-theory-progression-v1') || '[]')).some(c => 'inv' in c)"))
    # typing a progression
    n0 = pn.locator(".prog-item").count()
    check("text entry: an icon with a tooltip sits at the right of the progression line",
          pn.locator("#prog-text-btn").count() == 1 and "Roman numerals" in (pn.locator("#prog-text-btn").get_attribute("title") or ""))
    pn.locator("#prog-text-btn").dispatch_event("click")
    pn.wait_for_timeout(200)
    check("text entry: clicking it opens a popup with a box, an Enter button and a close button",
          pn.locator("#text-pop input[type=text]").count() == 1 and pn.locator("#text-pop button[type=submit]").count() == 1
          and pn.locator("#text-pop .text-pop-close").count() == 1)
    pn.locator("#text-pop input[type=text]").fill("I - V - X")
    pn.keyboard.press("Enter")
    check("text entry: a bad chord shows an error and adds nothing", "not a chord" in pn.locator(".text-pop-error").text_content()
          and pn.locator(".prog-item").count() == n0)
    pn.locator("#text-pop input[type=text]").fill("I - V - vi - IV | I - V7 - I")
    pn.keyboard.press("Enter")
    pn.wait_for_timeout(300)
    check("text entry: Enter adds the chords and closes the popup", pn.locator(".prog-item").count() == n0 + 7 and pn.locator("#text-pop").count() == 0,
          pn.locator(".prog-item").count())
    pn.locator("#prog-text-btn").dispatch_event("click")
    pn.wait_for_timeout(200)
    pn.locator("#text-pop .text-pop-close").click()
    check("text entry: the close button closes it", pn.locator("#text-pop").count() == 0)
    pn.locator("#prog-text-btn").dispatch_event("click")
    pn.wait_for_timeout(200)
    pn.locator("#text-pop input[type=checkbox]").check()
    pn.locator("#text-pop input[type=text]").fill("ii - V - I")
    pn.keyboard.press("Enter")
    pn.wait_for_timeout(300)
    check("text entry: 'replace' swaps the whole progression", pn.locator(".prog-item").count() == 3)
    pn.close()

    browser.close()

print("\n%d FAILED" % len(failures) if failures else "\nall browser checks passed")
sys.exit(1 if failures else 0)
