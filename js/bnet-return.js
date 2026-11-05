// web#51: every .cs-btn-bnet passes return_to = this page's same-origin path (pathname + search), so the platform
// callback brings the user back here. The static href already carries return_to=/profile/ (works with JS off).
// Built only from location.pathname/search, never location.href. auth= / reason= are stripped first. Home and the
// signin.html stub use /profile/. Per platform auth-contract: a ':' or backslash in the path, or a leading '//',
// sends /profile/ instead (the server would reject it and fall back anyway).
(function () {
  var FALLBACK = '/profile/';
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
  function apply() {
    var rt = encodeURIComponent(returnTo());
    var links = document.querySelectorAll('a.cs-btn-bnet[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i], u;
      try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { continue; }
      if (!/\/api\/v1\/auth\/blizzard\/login$/.test(u.pathname)) continue;
      a.setAttribute('href', u.origin + u.pathname + '?return_to=' + rt);
    }
  }
  window.csBnetReturnTo = returnTo;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
