/**
 * web#38 thin client for the anonymous public guild API (platform draft, /api/v1/public/guilds).
 * Flip CS_CONFIG.USE_MOCK_GUILDS to use the real API. Rejects with Error{status, code, message, retryAfter}.
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG;
  function normalize(e) {
    var b = e && e.body && e.body.error;
    var out = new Error((b && b.message) || (e && e.message) || 'Request failed');
    out.status = (e && e.status) || 0;
    out.retryAfter = (e && e.retryAfter) || '';
    out.code = (b && b.code) || (out.status ? 'http_' + out.status : 'network_error');
    return out;
  }
  function get(path) {
    // Anonymous: no credentials, so responses stay CDN-cacheable.
    return fetch(cfg.API_BASE + path, { credentials: 'omit', headers: { Accept: 'application/json' } }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        if (!res.ok) { var e = new Error(res.statusText); e.status = res.status; e.body = body; e.retryAfter = res.headers.get('Retry-After') || ''; throw e; }
        return body;
      });
    });
  }
  window.CSGuildsApi = {
    listGuilds: function (q) {
      q = q || {};
      if (cfg.USE_MOCK_GUILDS) return window.CSGuildsMock.listGuilds(q).catch(function (e) { throw normalize(e); });
      var p = new URLSearchParams();
      ['region', 'realm', 'faction', 'cursor', 'limit'].forEach(function (k) { if (q[k] != null && q[k] !== '') p.set(k, String(q[k])); });
      (q.role || []).forEach(function (r) { p.append('role', r); });
      (q['class'] || []).forEach(function (c) { p.append('class', c); });
      return get(cfg.GUILDS_PATHS.LIST + '?' + p.toString()).catch(function (e) { throw normalize(e); });
    },
    getGuild: function (region, realm, guild) {
      if (cfg.USE_MOCK_GUILDS) return window.CSGuildsMock.getGuild(region, realm, guild).catch(function (e) { throw normalize(e); });
      var path = cfg.GUILDS_PATHS.DETAIL.replace('{region}', encodeURIComponent(region)).replace('{realm_slug}', encodeURIComponent(realm)).replace('{guild_slug}', encodeURIComponent(guild));
      return get(path).catch(function (e) { throw normalize(e); });
    }
  };
})();
