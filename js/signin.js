/**
 * web#17/web#42: Battle.net sign-in. After sign-in the user lands on /profile/ (no main/alt picker).
 * Contract: docs/auth-characters-api.md. Renders API data with DOM APIs only (createElement + textContent only).
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG;
  var mock = window.CSAuthMock;
  var useMock = cfg.USE_MOCK_AUTH;
  var $ = function (id) { return document.getElementById(id); };
  var status = $('si-status');
  var steps = ['disabled', 'start', 'authorize', 'loading', 'cancelled', 'error', 'empty'];
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
    var returnTo = '/profile/'; // web#42: land on the profile after Battle.net (allowlisted relative path)
    if (useMock) { location.assign(mock.start(returnTo)); return; }
    location.assign(cfg.API_BASE + cfg.AUTH_PATHS.START + '?return_to=' + encodeURIComponent(returnTo));
  }
  // web#42: no main/alt picker any more. Once signed in, the profile page is where characters are chosen for display.
  function goProfile() { location.replace('profile/'); }
  $('si-signin').addEventListener('click', signIn);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-action]');
    if (!a) return;
    if (a.getAttribute('data-action') === 'restart') { history.replaceState(null, '', 'signin.html'); show('start'); }
    if (a.getAttribute('data-action') === 'retry') (state.retry || signIn)();
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
    if (r.ok) goProfile(); else show('start');
  }).catch(function () { show('start'); });
})();
