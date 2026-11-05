// web#51: every .cs-btn-bnet passes return_to = this page's same-origin path (pathname + search), so the platform
// callback brings the user back here. The static href already carries return_to=/profile/ (works with JS off).
// Built only from location.pathname/search, never location.href. auth= / reason= are stripped first. Home and the
// signin.html stub use /profile/. Per platform auth-contract: a ':' or backslash in the path, or a leading '//',
// sends /profile/ instead (the server would reject it and fall back anyway).
// Optional prompt (web#59): csBnetLoginUrl(returnTo, prompt) appends &prompt= only when prompt is passed.
// Default sign-in links have no data-prompt, so their href stays return_to only.
(function () {
  var FALLBACK = '/profile/';
  var DEFAULT_START = 'https://api.crusaderstrike.com/api/v1/auth/blizzard/login';
  function returnTo() {
    var path = location.pathname || '';
    if (!path || path.charAt(0) !== '/') return FALLBACK;
    var dec = path; try { dec = decodeURIComponent(path); } catch (e) { return FALLBACK; }
    if (path.indexOf('//') === 0 || dec.indexOf('//') === 0 || /[:\\]/.test(dec)) return FALLBACK;
    if (/^\/(index\.html)?$/.test(path) || /\/signin\.html$/.test(path)) return FALLBACK;
    var q = new URLSearchParams(location.search); q.delete('auth'); q.delete('reason');
    var s = q.toString();
    return path + (s ? '?' + s : '');
  }
  function loginUrl(base, rt, prompt) {
    var href = base + '?return_to=' + encodeURIComponent(rt);
    if (prompt) href += '&prompt=' + encodeURIComponent(prompt);
    return href;
  }
  /** Start-auth URL. prompt is omitted unless passed, so the default sign-in link is unchanged. */
  function bnetLoginUrl(rt, prompt) {
    var base = DEFAULT_START;
    var cfg = window.CS_CONFIG;
    if (cfg && cfg.API_BASE && cfg.AUTH_PATHS && cfg.AUTH_PATHS.START) base = cfg.API_BASE + cfg.AUTH_PATHS.START;
    return loginUrl(base, rt || FALLBACK, prompt);
  }
  function apply() {
    var rt = returnTo();
    var links = document.querySelectorAll('a.cs-btn-bnet[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i], u;
      try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { continue; }
      if (!/\/api\/v1\/auth\/blizzard\/login$/.test(u.pathname)) continue;
      a.setAttribute('href', loginUrl(u.origin + u.pathname, rt, a.getAttribute('data-prompt')));
    }
  }
  window.csBnetReturnTo = returnTo;
  window.csBnetLoginUrl = bnetLoginUrl;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
