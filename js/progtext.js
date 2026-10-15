/* Parse a typed chord progression such as "I - V - vi - IV | I - V - I". Pure functions, no DOM.
 *
 * Chords are Roman numerals (or the digits 1-7), optionally followed by a chord type: 7, maj7, 9, 11, 13,
 * sus2, sus4, add9. Hyphens, bars, commas, arrows and spaces all just separate chords. Upper or lower case
 * makes no difference: the key decides whether a chord on a degree is major, minor or diminished.
 * Returns { chords: [{ deg, type }], errors: [message] }.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ProgText = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NUMERALS = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
  var TYPES = { '': 'triad', '7': '7', 'maj7': '7', 'm7': '7', '9': '9', 'maj9': '9', 'm9': '9', '11': '11', '13': '13',
                'sus2': 'sus2', 'sus4': 'sus4', 'sus': 'sus4', 'add9': 'add9' };

  // allowedTypes: optional array of chord type ids the current level offers
  function parse(text, allowedTypes) {
    var chords = [], errors = [];
    String(text || '').split(/[\s,;|\-–—→>]+/).forEach(function (tok) {
      if (!tok) return;
      var m = /^([b♭#♯]?)(vii|vi|iv|v|iii|ii|i|[1-7])(.*)$/i.exec(tok);
      if (!m) { errors.push('“' + tok + '” is not a chord (try a Roman numeral such as IV or vi7)'); return; }
      if (m[1]) { errors.push('“' + tok + '”: altered and borrowed chords are not supported yet'); return; }
      var deg = /^[1-7]$/.test(m[2]) ? parseInt(m[2], 10) - 1 : NUMERALS[m[2].toLowerCase()];
      var suffix = m[3].toLowerCase().replace(/[°ø⌀+]|dim|aug|^o/g, '');   // quality marks: the key decides
      var type = TYPES[suffix];
      if (type === undefined) { errors.push('“' + tok + '”: unknown chord type “' + m[3] + '” (try 7, 9, sus4, sus2 or add9)'); return; }
      if (allowedTypes && allowedTypes.indexOf(type) < 0) { errors.push('“' + tok + '”: that chord type is only available in Jazz'); return; }
      chords.push({ deg: deg, type: type });
    });
    if (!chords.length && !errors.length) errors.push('Type some chords first, for example I - V - vi - IV');
    return { chords: chords, errors: errors };
  }

  return { parse: parse };
});
