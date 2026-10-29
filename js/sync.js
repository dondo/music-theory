/* Sync across devices: the app's whole saved state, encrypted in the browser, kept in a tiny Cloudflare Worker + KV store.
   Nothing here is a secret: the Worker only ever holds an encrypted blob. A name (5+ characters) and a two-word passphrase
   are joined and stretched (PBKDF2) into three things: the storage ID, a write token (the Worker lets only its holder
   in) and the AES-GCM key. Lose either the name or the passphrase and the data is unrecoverable.

   Formats are versioned so they can evolve:
     envelope  { v: 1, z: 1|0, iv, ct }        what the Worker stores (v: crypto layout; z: gzip before encrypting)
     payload   { schema: 1, savedAt, keys }    what is inside; keys: { storageKey: { t: ms, v: string|null } }
   An envelope or payload newer than this file understands is never overwritten; the app asks you to update instead.

   The engine (everything but the dialog at the bottom) has no DOM dependence and is tested in tools/test_theory.js. */
var Sync = (function () {
  'use strict';

  var ENVELOPE_V = 1, SCHEMA = 1;
  var WORKER = 'https://music-theory.dondo.workers.dev';
  var ITER = 600000, SALT = 'music-theory-sync/v1';
  var CRED_KEY = 'music-theory-sync-v1', TIMES_KEY = 'music-theory-sync-times-v1';
  var NAME_MIN = 5, NAME_MAX = 40, LOG_KEEP = 5000;
  var WORDS = 'able acorn actor adobe agile alder alley almond alpine amaze amber ample anchor angle anvil apex apple apron arbor arch aroma arrow aspen atlas attic aurora autumn axis badge bagel baker balsa bamboo banjo barn basil basin basket beach beacon beam beaver bell bench berry birch birdie bison blade blaze bloom bluff boat bonsai bonus boots brave bravo bread breeze brick bridge brook broom brush bugle bunny butter cabin cable cactus camel cameo candle candy canoe canvas canyon cargo carol carpet castle cedar cello chalk charm cherry chess chime chorus cider cinder circus clam cliff cloak clock cloud clover coast cobalt cobweb cocoa comet cookie copper coral cosmic cotton cover cradle crane crest crisp crown cuddle curry dagger daisy dance dapper dazzle delta denim desert dimple diner dipper dizzy donut dragon dream drift drum dusk eagle earth echo elbow ember engine fable falcon fancy farm fern ferry fiddle field fiesta finch fizz flame flint flora fluff flute forest fossil fresh frost gadget galaxy garden garnet geese gentle giant ginger glade globe glove glow gnome gold goose grain grape gravel grove guitar gummy hammer happy harbor harp hatch haven hazel heron hobby hollow honey hound humble icing igloo indigo island ivory jacket jade jasper jazz jelly jewel jolly juggle jumbo jungle kayak kettle kitten kiwi knit koala ladder lagoon lake lark laurel lemon lilac lily linen llama locket lotus lucky lunar lunch magic mango maple marble marsh meadow mellow melon merry mint mirror mocha moon moss motor muffin mural mystic napkin nectar needle nimble noble north novel nutmeg oasis ocean olive onyx opal orange orbit orchid otter oyster paddle palm panda paper pasta peach pearl pebble pecan penny pepper piano picnic pillow pilot pine pixel planet plum pocket polar pond poppy pretty puddle puzzle quail quartz quest quiet quill quilt rabbit radar radio rain raisin ranch raven reef rhythm ribbon ridge ripple river robin rocket rose ruby rustic saddle sage sailor salmon salsa sand sandal satin shadow shell silk silver sketch slate sleepy smile snow soda solar sonnet spark spice spoon sprout spruce squid star stone storm stream sugar summer sunny swan swift tablet tango teapot tidal tiger timber toast toffee tomato topaz trail tulip tundra turnip turtle umber umpire unity valley velvet violet vivid waffle wagon walnut water wave whale wheat whisk willow winter wizard wolf wonder yarn yellow yodel zebra zephyr zesty zigzag'.split(' ');

  // ---- keys and clocks ----------------------------------------------------------------------
  function tracked(k) { return typeof k === 'string' && k.indexOf('music-theory-') === 0 && k !== CRED_KEY && k !== TIMES_KEY; }

  // ---- bytes and text ---------------------------------------------------------------------
  function hex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16); return s; }
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
  function unb64(t) { var s = atob(t), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  var enc = new TextEncoder(), dec = new TextDecoder();
  function norm(s) { return String(s).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '); }

  // ---- credentials --------------------------------------------------------------------------
  function validName(name) { var n = norm(name); return n.length >= NAME_MIN && n.length <= NAME_MAX; }
  function validPass(p) { return /^[a-z]{4,6}-[a-z]{4,6}$/.test(norm(p)); }
  function randInt(n) {                                              // uniform in [0, n), no modulo bias
    var lim = Math.floor(4294967296 / n) * n, a = new Uint32Array(1);
    do { crypto.getRandomValues(a); } while (a[0] >= lim);
    return a[0] % n;
  }
  function randomPassphrase() {
    var a = WORDS[randInt(WORDS.length)], b = WORDS[randInt(WORDS.length)];
    return a + '-' + b;
  }
  // name + passphrase -> { id, token, key }. One PBKDF2 run; its output is split into three independent parts.
  function derive(name, pass) {
    var secret = norm(name) + '\n' + norm(pass);
    return crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']).then(function (km) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITER }, km, 768);
    }).then(function (bits) {
      var u = new Uint8Array(bits);
      return crypto.subtle.importKey('raw', u.slice(64, 96), 'AES-GCM', false, ['encrypt', 'decrypt']).then(function (key) {
        return { id: hex(u.slice(0, 32)), token: hex(u.slice(32, 64)), key: key };
      });
    });
  }

  // ---- the envelope: gzip (when available) + AES-GCM ---------------------------------------
  function pipe(bytes, stream) {
    var s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function seal(key, payload) {
    var raw = enc.encode(JSON.stringify(payload)), canZip = typeof CompressionStream !== 'undefined';
    return (canZip ? pipe(raw, new CompressionStream('gzip')) : Promise.resolve(raw)).then(function (body) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, body).then(function (ct) {
        return JSON.stringify({ v: ENVELOPE_V, z: canZip ? 1 : 0, iv: b64(iv), ct: b64(new Uint8Array(ct)) });
      });
    });
  }
  function open(key, text) {
    var env;
    try { env = JSON.parse(text); } catch (e) { return Promise.reject(new Error('The stored data is not readable.')); }
    if (!env || typeof env.v !== 'number') return Promise.reject(new Error('The stored data is not readable.'));
    if (env.v > ENVELOPE_V) return Promise.reject(Object.assign(new Error('The stored data was written by a newer version of the app. Update the app first.'), { newer: true }));
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.ct)).then(function (body) {
      var u = new Uint8Array(body);
      return env.z ? pipe(u, new DecompressionStream('gzip')) : u;
    }).then(function (u) {
      var p = JSON.parse(dec.decode(u));
      return migrate(p);
    }, function (e) { if (e && e.newer) throw e; throw new Error('Could not decrypt: wrong name or passphrase?'); });
  }
  // old payload layouts are brought forward here as the format evolves
  function migrate(p) {
    if (!p || typeof p !== 'object' || typeof p.schema !== 'number') throw new Error('The stored data is not readable.');
    if (p.schema > SCHEMA) throw Object.assign(new Error('The stored data was written by a newer version of the app. Update the app first.'), { newer: true });
    return p;                                       // (schema 1 is the only layout so far)
  }

  // ---- snapshots and merging -----------------------------------------------------------------
  // local snapshot: every tracked key with its last-change time (0 when never changed since clocks began)
  function snapshot(store, times, now) {
    var keys = {};
    for (var i = 0; i < store.length; i++) {
      var k = store.key(i);
      if (tracked(k)) keys[k] = { t: times[k] || 0, v: store.getItem(k) };
    }
    Object.keys(times).forEach(function (k) { if (tracked(k) && !(k in keys)) keys[k] = { t: times[k], v: null }; });      // deletions
    return keys;
  }
  function parse(v) { try { return JSON.parse(v); } catch (e) { return null; } }
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }

  // key-specific merges; each gets (localValue, remoteValue, localNewer) and returns the merged string, or null to fall back to newest-wins
  function mergeMem(a, b, aNewer) {                  // a half-life model: per item, the more recently seen one
    var x = parse(a), y = parse(b);
    if (!isObj(x) || !isObj(y) || !isObj(x.p) || !isObj(y.p)) return null;
    var out = { p: {}, seq: Math.max(x.seq | 0, y.seq | 0), tm: {} };
    [x.p, y.p].forEach(function (p) {
      Object.keys(p).forEach(function (k) {
        var m = p[k], o = out.p[k];
        if (!o || m.t > o.t || (m.t === o.t && (m.n | 0) > (o.n | 0))) out.p[k] = m;
      });
    });
    var xt = isObj(x.tm) ? x.tm : {}, yt = isObj(y.tm) ? y.tm : {};
    Object.keys(xt).concat(Object.keys(yt)).forEach(function (c) {
      var u = Array.isArray(xt[c]) ? xt[c] : [], w = Array.isArray(yt[c]) ? yt[c] : [];
      out.tm[c] = (aNewer ? u : w).length >= 1 ? (aNewer ? u : w) : (u.length >= w.length ? u : w);
    });
    return JSON.stringify(out);
  }
  function mergeLog(a, b) {                          // the answer log: everything from both, oldest first, capped
    var x = parse(a), y = parse(b);
    if (!Array.isArray(x) || !Array.isArray(y)) return null;
    var seen = {}, all = [];
    x.concat(y).forEach(function (r) { var s = JSON.stringify(r); if (!seen[s]) { seen[s] = 1; all.push(r); } });
    all.sort(function (p, q) { return (p[0] || 0) - (q[0] || 0); });
    return JSON.stringify(all.slice(-LOG_KEEP));
  }
  function mergeTrials(a, b) {                       // time trial bests: the faster one per level
    var x = parse(a), y = parse(b);
    if (!isObj(x) || !isObj(y)) return null;
    var out = {}, ms = function (v) { return typeof v === 'number' ? v : v && typeof v.ms === 'number' ? v.ms : Infinity; };
    Object.keys(x).concat(Object.keys(y)).forEach(function (k) {
      out[k] = ms(x[k]) <= ms(y[k]) ? (k in x ? x[k] : y[k]) : y[k];
    });
    return JSON.stringify(out);
  }
  function mergeSteps(a, b, aNewer) {                // Notes/Keys levels: per activity, the higher level (ties: the newer side)
    var x = parse(a), y = parse(b);
    if (!isObj(x) || !isObj(y)) return null;
    var out = {};
    Object.keys(x).concat(Object.keys(y)).forEach(function (m) {
      var p = x[m], q = y[m];
      if (!isObj(p)) { out[m] = q; return; }
      if (!isObj(q)) { out[m] = p; return; }
      var pick = (p.lv | 0) > (q.lv | 0) ? p : (q.lv | 0) > (p.lv | 0) ? q : (aNewer ? p : q);
      out[m] = Object.assign({}, pick, { ever: !!(p.ever || q.ever) });
    });
    return JSON.stringify(out);
  }
  function mergeFtc(a, b, aNewer) {                  // Find the chord progress: the higher level per mode, the rest from the newer side
    var x = parse(a), y = parse(b);
    if (!isObj(x) || !isObj(y)) return null;
    var out = Object.assign({}, aNewer ? x : y), lvl = {};
    [x.lvl, y.lvl].forEach(function (l) { if (isObj(l)) Object.keys(l).forEach(function (k) { lvl[k] = Math.max(lvl[k] | 0, l[k] | 0); }); });
    out.lvl = lvl; out.ever = !!(x.ever || y.ever);
    return JSON.stringify(out);
  }
  var MERGERS = {
    'music-theory-cards-mem-v1': mergeMem, 'music-theory-ftc-mem-v1': mergeMem, 'music-theory-ftc-log-v1': mergeLog,
    'music-theory-trials-v3': mergeTrials, 'music-theory-notes-v1': mergeSteps, 'music-theory-ftc-v1': mergeFtc
  };
  // two snapshots -> the merged one, and which keys differ from the local / remote side
  function merge(local, remote) {
    var out = {}, toLocal = [], toRemote = [];
    Object.keys(local).concat(Object.keys(remote)).forEach(function (k) {
      if (k in out) return;
      var a = local[k], b = remote[k], r;
      if (!a) r = b; else if (!b) r = a;
      else if (a.v === b.v) r = { t: Math.max(a.t, b.t), v: a.v };
      else {
        var f = MERGERS[k], aNewer = a.t >= b.t, mv = f && a.v !== null && b.v !== null ? f(a.v, b.v, aNewer) : null;
        r = mv !== null && mv !== undefined ? { t: Math.max(a.t, b.t), v: mv } : (aNewer ? a : b);
      }
      out[k] = r;
      if (!a || a.v !== r.v) toLocal.push(k);
      if (!b || b.v !== r.v) toRemote.push(k);
    });
    return { keys: out, toLocal: toLocal, toRemote: toRemote };
  }

  // ---- talking to the Worker ---------------------------------------------------------------
  function call(method, id, token, body, base) {
    return fetch((base || WORKER) + '/s/' + id, { method: method, headers: { 'Authorization': 'Bearer ' + token }, body: body }).then(function (r) {
      return r.text().then(function (t) { return { status: r.status, text: t }; });
    }, function () { throw new Error('Could not reach the sync service. Check the connection; if you are online, the service may not allow this page\u2019s address (' + (typeof location !== 'undefined' ? location.origin : '?') + ').'); });
  }
  function exists(d, base) {                                          // is this ID already taken? (404: free)
    return call('GET', d.id, d.token, undefined, base).then(function (r) {
      if (r.status === 404) return false;
      if (r.status === 200 || r.status === 403) return true;
      throw new Error('The sync service answered ' + r.status + '.');
    });
  }
  // a name + a fresh passphrase whose ID is free
  function newAccount(name, base, tries) {
    tries = tries === undefined ? 20 : tries;
    var pass = randomPassphrase();
    return derive(name, pass).then(function (d) {
      return exists(d, base).then(function (taken) {
        if (!taken) return { name: norm(name), pass: pass, d: d };
        if (tries <= 0) throw new Error('Could not find an unused passphrase. Try a different name.');
        return newAccount(name, base, tries - 1);
      });
    });
  }
  function pull(d, base) {
    return call('GET', d.id, d.token, undefined, base).then(function (r) {
      if (r.status === 404) return null;
      if (r.status === 403) throw new Error('The sync service refused the credentials.');
      if (r.status !== 200) throw new Error('The sync service answered ' + r.status + '.');
      return open(d.key, r.text);
    });
  }
  function push(d, keys, base) {
    var small = {};
    Object.keys(keys).forEach(function (k) { small[k] = keys[k]; });
    var payload = { schema: SCHEMA, savedAt: Date.now(), keys: small };
    return seal(d.key, payload).then(function (text) {
      return call('PUT', d.id, d.token, text, base).then(function (r) {
        if (r.status === 413) throw new Error('The saved state is too large for the sync service.');
        if (r.status !== 200) throw new Error('The sync service answered ' + r.status + '.');
      });
    });
  }

  return {
    ENVELOPE_V: ENVELOPE_V, SCHEMA: SCHEMA, WORKER: WORKER, CRED_KEY: CRED_KEY, TIMES_KEY: TIMES_KEY, NAME_MIN: NAME_MIN, NAME_MAX: NAME_MAX, WORDS: WORDS,
    tracked: tracked, norm: norm, validName: validName, validPass: validPass, randomPassphrase: randomPassphrase, derive: derive,
    seal: seal, open: open, migrate: migrate, snapshot: snapshot, merge: merge, exists: exists, newAccount: newAccount, pull: pull, push: push
  };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = Sync; }
