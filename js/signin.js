/**
 * web#17: Battle.net sign-in + main/alt character picker.
 * Contract: docs/auth-characters-api.md. Renders API data with DOM APIs only (createElement + textContent only).
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG;
  var mock = window.CSAuthMock;
  var useMock = cfg.USE_MOCK_AUTH;
  var $ = function (id) { return document.getElementById(id); };
  var status = $('si-status');
  var steps = ['disabled', 'start', 'authorize', 'loading', 'cancelled', 'error', 'empty', 'picker', 'confirm', 'saved'];
  var state = { csrf: null, battletag: '', characters: [], mainId: null, altIds: [], retry: null };

  // ---- API adapter: mock or real (same response shape) ----
  function real(method, path, body) {
    var headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && state.csrf) headers['X-CSRF-Token'] = state.csrf;
    return fetch(cfg.API_BASE + path, {
      method: method, credentials: 'include', headers: headers, body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 204) return { status: 204, ok: true, body: null };
      return r.json().catch(function () { return null; }).then(function (b) { return { status: r.status, ok: r.ok, body: b }; });
    });
  }
  var api = {
    session: function () { return useMock ? mock.session() : real('GET', cfg.AUTH_PATHS.SESSION); },
    characters: function () { return useMock ? mock.characters() : real('GET', cfg.AUTH_PATHS.CHARACTERS); },
    save: function (b) { return useMock ? mock.saveSelection(b, state.csrf) : real('PUT', cfg.AUTH_PATHS.SELECTION, b); },
    logout: function () { return useMock ? mock.logout() : real('DELETE', cfg.AUTH_PATHS.SESSION); }
  };

  function announce(msg) { status.textContent = ''; setTimeout(function () { status.textContent = msg; }, 50); }
  function show(name, msg) {
    steps.forEach(function (s) { $('si-' + s).hidden = s !== name; });
    var h = $('si-' + name + '-h');
    if (h) h.focus();
    if (msg) announce(msg);
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function byId(id) { return state.characters.filter(function (c) { return c.id === id; })[0]; }
  function txt(v) { return (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim() : ''; }
  function fullName(c) { return [txt(c.character_name), txt(c.surname)].filter(Boolean).join(' ') || 'Unnamed character'; }
  function label(c) { var r = txt(c.realm); return fullName(c) + (r ? ' — ' + r : ''); }
  function metaText(c) {
    var lvl = txt(c.level) ? 'Level ' + txt(c.level) : '';
    var main = [lvl, txt(c.race), txt(c.class)].filter(Boolean).join(' ');
    return [main, txt(c.realm)].filter(Boolean).join(' · ');
  }
  function fail(r, retry) {
    state.retry = retry;
    if (r && r.status === 401) { show('start', 'Your session ended. Please sign in again.'); return; }
    var b = r && r.body;
    var m = (b && b.error && b.error.message) ||
      (b && b.errors && Object.keys(b.errors).map(function (k) { return b.errors[k]; }).join(' ')) ||
      (r && r.status === 429 ? 'Too many requests. Please wait a moment and try again.' : '') ||
      'We couldn\'t reach the server. Please try again.';
    $('si-error-msg').textContent = m;
    show('error', 'Error: ' + m);
  }

  // ---- Flow ----
  function signIn() {
    var returnTo = '/signin.html'; // spec: relative path starting with a single '/'
    if (useMock) { location.assign(mock.start(returnTo)); return; }
    location.assign(cfg.API_BASE + cfg.AUTH_PATHS.START + '?return_to=' + encodeURIComponent(returnTo));
  }
  function loadCharacters() {
    state.retry = loadCharacters;
    show('loading', 'Loading your characters.');
    api.session().then(function (r) {
      if (!r.ok) return fail(r, loadCharacters);
      state.csrf = r.body.csrf_token;
      state.battletag = r.body.battletag;
      return api.characters().then(function (cr) {
        if (!cr.ok) return fail(cr, loadCharacters);
        var sel = cr.body.selection;
        state.characters = (cr.body.characters || []).filter(function (c) { return c.game === 'wow_forever'; });
        if (!state.characters.length) { show('empty', 'No World of Warcraft Forever characters found.'); return; }
        state.mainId = sel && byId(sel.main_id) ? sel.main_id : null;
        state.altIds = sel ? (sel.alt_ids || []).filter(function (id) { return byId(id) && id !== state.mainId; }) : [];
        renderPicker();
        show('picker', state.characters.length + ' characters loaded. Pick your main.');
      });
    }).catch(function () { fail(null, loadCharacters); });
  }

  function renderPicker() {
    $('si-battletag').textContent = state.battletag;
    var list = $('si-list');
    var frag = document.createDocumentFragment();
    state.characters.forEach(function (c) {
      var li = el('li', 'si-char' + (c.id === state.mainId ? ' is-main' : ''));
      var info = el('div', 'si-char-info');
      var nameId = 'si-name-' + c.id;
      var name = el('span', 'si-char-name', fullName(c)); name.id = nameId;
      info.appendChild(name);
      var meta = el('span', 'si-char-meta', metaText(c));
      info.appendChild(meta);
      var badge = window.csFactionBadge(c.faction);
      info.appendChild(badge);
      li.appendChild(info);

      var controls = el('div', 'si-char-controls');
      var r = el('input'); r.type = 'radio'; r.name = 'main'; r.value = c.id; r.id = 'si-main-' + c.id;
      r.checked = c.id === state.mainId;
      var rl = el('label', 'si-choice'); rl.htmlFor = r.id;
      rl.appendChild(r); rl.appendChild(el('span', null, 'Main'));
      rl.appendChild(el('span', 'si-sr-only', ': ' + label(c)));
      controls.appendChild(rl);

      var cb = el('input'); cb.type = 'checkbox'; cb.name = 'alt'; cb.value = c.id; cb.id = 'si-alt-' + c.id;
      cb.checked = state.altIds.indexOf(c.id) !== -1;
      cb.disabled = c.id === state.mainId;
      var cl = el('label', 'si-choice'); cl.htmlFor = cb.id;
      cl.appendChild(cb); cl.appendChild(el('span', null, 'Alt'));
      cl.appendChild(el('span', 'si-sr-only', ': ' + label(c)));
      controls.appendChild(cl);
      li.appendChild(controls);
      frag.appendChild(li);
    });
    list.replaceChildren(frag);
  }

  $('si-list').addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'main') {
      state.mainId = t.value;
      state.altIds = state.altIds.filter(function (id) { return id !== t.value; });
      document.querySelectorAll('#si-list input[name="alt"]').forEach(function (cb) {
        var isMain = cb.value === state.mainId;
        cb.disabled = isMain;
        if (isMain) cb.checked = false;
        cb.closest('.si-char').classList.toggle('is-main', isMain);
      });
      $('si-picker-error').hidden = true;
      announce(fullName(byId(t.value)) + ' is now your main.');
    } else if (t.name === 'alt') {
      if (t.checked) state.altIds.push(t.value);
      else state.altIds = state.altIds.filter(function (id) { return id !== t.value; });
      announce(fullName(byId(t.value)) + (t.checked ? ' marked as alt.' : ' is no longer an alt.') +
        ' ' + state.altIds.length + ' alts selected.');
    }
  });

  $('si-picker-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var errEl = $('si-picker-error');
    if (!state.mainId) {
      errEl.textContent = 'Choose a main before continuing.';
      errEl.hidden = false;
      announce('Error: choose a main before continuing.');
      var first = document.querySelector('#si-list input[name="main"]');
      if (first) first.focus();
      return;
    }
    errEl.hidden = true;
    $('si-confirm-main').textContent = label(byId(state.mainId));
    var ul = $('si-confirm-alts');
    var frag = document.createDocumentFragment();
    if (!state.altIds.length) frag.appendChild(el('li', 'cs-muted', 'None'));
    state.altIds.forEach(function (id) { frag.appendChild(el('li', null, label(byId(id)))); });
    ul.replaceChildren(frag);
    show('confirm', 'Review your choice, then save.');
  });

  function save() {
    var btn = $('si-save');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    announce('Saving…');
    api.save({ main_id: state.mainId, alt_ids: state.altIds.slice() }).then(function (r) {
      btn.disabled = false; btn.removeAttribute('aria-busy');
      if (!r.ok) return fail(r, save);
      var n = r.body.selection.alt_ids.length;
      $('si-saved-msg').textContent = 'Main: ' + label(byId(r.body.selection.main_id)) + '. ' +
        (n ? n + (n === 1 ? ' alt' : ' alts') + ' saved.' : 'No alts.');
      show('saved', 'Characters saved.');
    }).catch(function () { btn.disabled = false; btn.removeAttribute('aria-busy'); fail(null, save); });
  }

  $('si-signin').addEventListener('click', signIn);
  $('si-save').addEventListener('click', save);
  $('si-back').addEventListener('click', function () { show('picker', 'Back to character list.'); });
  $('si-edit').addEventListener('click', loadCharacters);
  $('si-logout').addEventListener('click', function () {
    api.logout().then(function () { history.replaceState(null, '', 'signin.html'); show('start', 'Signed out.'); });
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-action]');
    if (!a) return;
    if (a.getAttribute('data-action') === 'restart') { history.replaceState(null, '', 'signin.html'); show('start'); }
    if (a.getAttribute('data-action') === 'retry') (state.retry || loadCharacters)();
  });

  // ---- Entry ----
  if (!window.csBnetEnabled()) { show('disabled'); return; }
  if (useMock) $('si-mock-note').hidden = false;
  var q = new URLSearchParams(location.search);
  if (useMock && q.get('mock_authorize') === '1') {
    var st = q.get('state');
    $('si-authorize-ok').addEventListener('click', function () { location.replace(mock.callback(st, 'ok')); });
    $('si-authorize-cancel').addEventListener('click', function () { location.replace(mock.callback(st, 'access_denied')); });
    show('authorize');
    return;
  }
  var auth = q.get('auth');
  if (auth === 'cancelled') { show('cancelled', 'Sign-in was cancelled.'); return; }
  if (auth === 'error') {
    var reasons = {
      invalid_state: 'Your sign-in session expired or did not match. Please try again.',
      upstream_unavailable: 'Battle.net is not responding right now. Please try again shortly.',
      oauth_error: 'Battle.net could not complete the sign-in. Please try again.',
      internal_error: 'Something went wrong on our side. Please try again.'
    };
    $('si-error-msg').textContent = reasons[q.get('reason')] || 'Battle.net sign-in failed. Please try again.';
    state.retry = signIn;
    show('error', 'Error: Battle.net sign-in failed.');
    return;
  }
  // auth=ok or a returning visit: try the session; 401 falls back to the start step.
  api.session().then(function (r) {
    if (r.ok) loadCharacters(); else show('start');
  }).catch(function () { show('start'); });
})();
