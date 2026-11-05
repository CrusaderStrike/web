/**
 * web#20 thin client for GET /rankings. Flip CS_CONFIG.USE_MOCK_RANKINGS to use the real API (platform#25).
 * Resolves with the contract body; rejects with Error{status, code, message}.
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG;
  function normalize(e) {
    var b = e && e.body && e.body.error;
    var out = new Error((b && b.message) || (e && e.message) || 'Request failed');
    out.status = (e && e.status) || 0;
    out.code = (b && b.code) || (out.status ? 'http_' + out.status : 'network_error');
    return out;
  }
  window.CSRankingsApi = {
    getRankings: function (q) {
      q = q || {};
      if (cfg.USE_MOCK_RANKINGS) {
        return window.CSRankingsMock.getRankings(q).catch(function (e) { throw normalize(e); });
      }
      var params = new URLSearchParams();
      params.set('board', q.board);
      if (q.dungeon_id != null && q.dungeon_id !== '') params.set('dungeon_id', String(q.dungeon_id));
      // Proposed (not yet in openapi/v1.yaml): scope, period, bracket. See docs/rankings-api.md.
      ['scope', 'period', 'bracket'].forEach(function (k) { if (q[k]) params.set(k, q[k]); });
      if (q.cursor) params.set('cursor', q.cursor);
      if (q.limit) params.set('limit', String(q.limit));
      return fetch(cfg.API_BASE + cfg.RANKINGS_PATH + '?' + params.toString(), {
        credentials: 'include', headers: { Accept: 'application/json' }
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (body) {
          if (!res.ok) { var e = new Error(res.statusText); e.status = res.status; e.body = body; throw e; }
          return body;
        });
      }).catch(function (e) { throw normalize(e); });
    }
  };
})();
