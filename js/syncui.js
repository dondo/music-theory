/* Sync across devices: the clock hook, the background syncing and the dialog. The engine is in sync.js. */
(function () {
  'use strict';
  var ls;
  try { ls = window.localStorage; ls.getItem('x'); } catch (e) { return; }
  var origSet = Storage.prototype.setItem, origRemove = Storage.prototype.removeItem;

  // ---- when did each saved key last change? (kept beside the data, so a merge knows which side is newer) ----
  var times = {};
  try { var tt = JSON.parse(ls.getItem(Sync.TIMES_KEY)); if (tt && typeof tt === 'object') times = tt; } catch (e) { /* none yet */ }
  var applying = false, timer = null;
  function saveTimes() { try { origSet.call(ls, Sync.TIMES_KEY, JSON.stringify(times)); } catch (e) { /* storage full or unavailable */ } }
  function touch(k) {
    if (applying || !Sync.tracked(k)) return;
    times[k] = Date.now(); saveTimes();
    schedule();
  }
  Storage.prototype.setItem = function (k, v) {
    var same = this === ls && Sync.tracked(k) && this.getItem(k) === String(v);
    origSet.call(this, k, v);
    if (this === ls && !same) touch(k);
  };
  Storage.prototype.removeItem = function (k) {
    var had = this === ls && this.getItem(k) !== null;
    origRemove.call(this, k);
    if (had) touch(k);
  };

  // ---- the saved sign-in (name and passphrase stay on this device so they can be shown again) ----
  function loadCreds() { try { var c = JSON.parse(ls.getItem(Sync.CRED_KEY)); return c && c.name && c.pass ? c : null; } catch (e) { return null; } }
  function saveCreds(c) { origSet.call(ls, Sync.CRED_KEY, JSON.stringify(c)); }
  var creds = loadCreds(), derived = null, busy = null, lastError = '';
  function keys() {
    if (!derived) derived = Sync.derive(creds.name, creds.pass);
    return derived;
  }

  // ---- one sync: pull, merge, push what the store lacks, adopt what this device lacks ----
  function syncNow(apply) {
    if (!creds) return Promise.resolve();
    if (busy) return busy;
    setStatus('Syncing…');
    busy = keys().then(function (d) {
      return Sync.pull(d).then(function (remote) {
        var local = Sync.snapshot(ls, times), now = Date.now();
        Object.keys(local).forEach(function (k) { if (!local[k].t) local[k].t = now; });         // never-changed data counts from now (first upload)
        var m = remote ? Sync.merge(local, remote.keys) : { keys: local, toLocal: [], toRemote: Object.keys(local) };
        return (m.toRemote.length ? Sync.push(d, m.keys) : Promise.resolve()).then(function () {
          if (apply && m.toLocal.length) {
            applying = true;
            try {
              m.toLocal.forEach(function (k) {
                var e = m.keys[k];
                if (e.v === null) origRemove.call(ls, k); else origSet.call(ls, k, e.v);
                times[k] = e.t;
              });
            } finally { applying = false; }
            saveTimes();
            return true;
          }
          return false;
        });
      });
    }).then(function (changed) {
      creds.last = Date.now(); saveCreds(creds); lastError = '';
      setStatus('');
      busy = null; refresh();
      if (changed) reloadOnce();
    }, function (e) {
      busy = null; lastError = e && e.message ? e.message : 'Sync failed.';
      setStatus(lastError); refresh();
    });
    return busy;
  }
  function reloadOnce() {                                          // the app reads its state at startup: reload to show what came in (never twice in a row)
    var last = 0; try { last = parseInt(sessionStorage.getItem('music-theory-sync-reload'), 10) || 0; } catch (e) { /* none */ }
    if (Date.now() - last < 15000) return;
    try { sessionStorage.setItem('music-theory-sync-reload', String(Date.now())); } catch (e) { /* none */ }
    location.reload();
  }
  function schedule() {                                            // changes are pushed a little after the last one
    if (!creds) return;
    clearTimeout(timer);
    timer = setTimeout(function () { syncNow(false); }, 15000);
  }
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (!creds) return;
    if (document.hidden) { hiddenAt = Date.now(); clearTimeout(timer); syncNow(false); }
    else if (hiddenAt && Date.now() - hiddenAt > 5 * 60000) syncNow(true);          // back after a while, maybe from another device
  });

  // ---- the dialog ----
  var dlg, body, statusEl, linkBtn;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function setStatus(t) { if (statusEl) statusEl.textContent = t || ''; }
  function when(t) {
    if (!t) return 'not yet';
    var s = Math.round((Date.now() - t) / 1000);
    return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString();
  }
  function btn(label, fn, cls) { var b = el('button', cls || 'btn-reset', label); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function row() { var r = el('div', 'sync-row'); for (var i = 0; i < arguments.length; i++) r.appendChild(arguments[i]); return r; }
  function field(label, type, hint) {
    var w = el('label', 'sync-field'), i = el('input'); i.type = type; i.autocomplete = 'off'; i.spellcheck = false; i.setAttribute('autocapitalize', 'off');
    w.appendChild(el('span', null, label)); w.appendChild(i);
    if (hint) w.appendChild(el('small', null, hint));
    return { wrap: w, input: i };
  }
  function show(nodes) { body.textContent = ''; nodes.forEach(function (n) { body.appendChild(n); }); statusEl = el('p', 'sync-status'); statusEl.setAttribute('aria-live', 'polite'); body.appendChild(statusEl); }
  // the dialog grows out of the Sync button and shrinks back into it
  function fly(opening, done) {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !dlg.animate || !linkBtn || linkBtn.hidden) { if (done) done(); return; }
    var b = linkBtn.getBoundingClientRect(), r = dlg.getBoundingClientRect();
    if (!r.width || !r.height) { if (done) done(); return; }
    var dx = (b.left + b.width / 2) - (r.left + r.width / 2), dy = (b.top + b.height / 2) - (r.top + r.height / 2);
    var from = { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + (b.width / r.width) + ',' + (b.height / r.height) + ')', opacity: 0, borderRadius: '999px' };
    var to = { transform: 'none', opacity: 1, borderRadius: '16px' };
    var a = dlg.animate(opening ? [from, to] : [to, from], { duration: opening ? 240 : 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    a.onfinish = function () { if (done) done(); };
  }
  var closing = false;
  function close() {
    if (closing || !dlg.open) return;
    closing = true;
    fly(false, function () { dlg.close(); closing = false; });
  }
  function refresh() {
    if (linkBtn) linkBtn.textContent = creds ? 'Sync (on)' : 'Sync across devices';
    if (dlg && dlg.open && view === 'home') home();
  }
  var view = 'home';

  function home() {
    view = 'home';
    if (creds) {
      var shown = false, pw = el('code', 'sync-secret', '•••••••••');
      var tog = btn('Show', function () { shown = !shown; pw.textContent = shown ? creds.pass : '•••••••••'; tog.textContent = shown ? 'Hide' : 'Show'; }, 'btn-reset sync-small');
      show([
        el('h2', null, 'Sync is on'),
        el('p', null, 'This device is saving its progress, saved progressions and settings to your sync store, and picks up changes made on your other devices.'),
        row(el('span', 'sync-k', 'Name'), el('code', 'sync-secret', creds.name)),
        row(el('span', 'sync-k', 'Passphrase'), pw, tog),
        el('p', 'sync-muted', 'Last synced: ' + when(creds.last) + (lastError ? '. ' + lastError : '')),
        row(btn('Sync now', function () { syncNow(true); }, 'btn-reset sync-primary'), btn('Disconnect this device', disconnect), btn('Close', close))
      ]);
      return;
    }
    show([
      el('h2', null, 'Sync across devices'),
      el('p', null, 'Keep your progress, saved progressions and settings on every device you use. They are encrypted on this device before they are stored, so only someone with your name and passphrase can read them. There is no account and no email.'),
      row(btn('Set up sync', createName, 'btn-reset sync-primary'), btn('Connect this device', connect), btn('Close', close))
    ]);
  }
  function disconnect() {
    show([
      el('h2', null, 'Disconnect this device?'),
      el('p', null, 'This device stops syncing and forgets your name and passphrase. What is already stored stays there, and you can connect again with the same name and passphrase.'),
      row(btn('Disconnect', function () { try { origRemove.call(ls, Sync.CRED_KEY); } catch (e) { /* none */ } creds = null; derived = null; refresh(); home(); }, 'btn-reset sync-primary'), btn('Cancel', home))
    ]);
  }

  // setting up: a name, then a passphrase chosen for you
  function createName() {
    view = 'create';
    var f = field('Your name for this account', 'text', 'At least ' + Sync.NAME_MIN + ' characters. Not case-sensitive. Pick something memorable!');
    var go = btn('Choose a passphrase', function () {
      if (!Sync.validName(f.input.value)) { setStatus('The name needs at least ' + Sync.NAME_MIN + ' characters (up to ' + Sync.NAME_MAX + ').'); return; }
      reroll(f.input.value);
    }, 'btn-reset sync-primary');
    f.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    show([el('h2', null, 'Set up sync'), f.wrap, row(go, btn('Back', home))]);
    f.input.focus();
  }
  function reroll(name) {
    show([el('h2', null, 'Set up sync'), el('p', null, 'Choosing a passphrase…')]);
    Sync.newAccount(name).then(function (acct) { review(acct); }, function (e) { createName(); setStatus(e.message); });
  }
  function review(acct) {
    var ok = el('input'); ok.type = 'checkbox';
    var create = btn('Create and upload', function () {
      create.disabled = true; setStatus('Uploading…');
      creds = { v: 1, name: acct.name, pass: acct.pass, last: 0 }; derived = Promise.resolve(acct.d);
      saveCreds(creds);
      syncNow(false).then(function () { if (lastError) { setStatus(lastError); create.disabled = false; return; } refresh(); home(); });
    }, 'btn-reset sync-primary');
    create.disabled = true;
    ok.addEventListener('change', function () { create.disabled = !ok.checked; });
    var warn = el('div', 'sync-warn');
    warn.appendChild(el('strong', null, 'Write these down now.'));
    warn.appendChild(el('p', null, 'The name and the passphrase cannot be recovered or reset. Nobody, including the app, can look them up. If you forget or lose either one, your synced data is gone for good. You need both to connect another device.'));
    var lab = el('label', 'sync-check'); lab.appendChild(ok); lab.appendChild(el('span', null, 'I have saved both the name and the passphrase.'));
    show([el('h2', null, 'Your sync name and passphrase'), warn,
      row(el('span', 'sync-k', 'Name'), el('code', 'sync-secret', acct.name)),
      row(el('span', 'sync-k', 'Passphrase'), el('code', 'sync-secret', acct.pass)),
      lab, row(create, btn('Choose another passphrase', function () { reroll(acct.name); }), btn('Cancel', home))]);
  }

  // connecting a device to an existing store
  function connect() {
    view = 'connect';
    var n = field('Name', 'text'), p = field('Passphrase', 'text', 'Two words joined by a dash.');
    var go = btn('Connect', function () {
      if (!Sync.validName(n.input.value) || !Sync.validPass(p.input.value)) { setStatus('Enter the name (5 or more characters) and the passphrase (two words with a dash).'); return; }
      go.disabled = true; setStatus('Checking…');
      Sync.derive(n.input.value, p.input.value).then(function (d) {
        return Sync.pull(d).then(function (remote) {
          if (!remote) { setStatus('Nothing is stored under that name and passphrase. Check the spelling.'); go.disabled = false; return; }
          creds = { v: 1, name: Sync.norm(n.input.value), pass: Sync.norm(p.input.value), last: 0 }; derived = Promise.resolve(d);
          saveCreds(creds);
          return syncNow(true).then(function () { refresh(); if (dlg.open) home(); });
        });
      }).catch(function (e) { setStatus(e.message); go.disabled = false; });
    }, 'btn-reset sync-primary');
    [n.input, p.input].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); }); });
    show([el('h2', null, 'Connect this device'), el('p', 'sync-muted', 'Progress on this device is merged with what is stored; where the two cannot be merged, the stored copy wins.'), n.wrap, p.wrap, row(go, btn('Back', home))]);
    n.input.focus();
  }

  function init() {
    linkBtn = document.getElementById('sync-link');
    dlg = document.getElementById('sync-dialog');
    if (!linkBtn || !dlg || !window.crypto || !crypto.subtle || !dlg.showModal) { if (linkBtn) linkBtn.hidden = true; return; }
    body = el('div', 'sync-body'); dlg.appendChild(body);
    linkBtn.addEventListener('click', function () { home(); dlg.showModal(); fly(true); });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    refresh();
    if (creds) syncNow(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
