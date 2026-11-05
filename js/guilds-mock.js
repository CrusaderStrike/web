/**
 * web#38 in-browser mock for the public guild API (see js/guilds-mock-data.js for shapes).
 * Dev scenarios: ?mock_scenario=empty|error|ratelimit|network|slow|notfound
 * CSGuildsMock.lastQuery holds the last list query (tests check what would be sent).
 */
(function () {
  'use strict';
  var D = window.CSGuildsMockData;
  function scenario() { try { return new URLSearchParams(location.search).get('mock_scenario') || ''; } catch (e) { return ''; } }
  function run(fn) {
    var sc = scenario();
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (sc === 'error') return reject(D.err(500, 'internal_error', 'Unexpected server error.'));
        if (sc === 'ratelimit') return reject(D.err(429, 'rate_limited', 'Too many requests.', '17'));
        if (sc === 'network') { var n = new Error('Failed to fetch'); n.status = 0; return reject(n); }
        if (sc === 'notfound') return reject(D.err(404, 'not_found', 'Guild not found.'));
        try { resolve(fn(sc)); } catch (e) { reject(e); }
      }, sc === 'slow' ? 1500 : 150);
    });
  }
  window.CSGuildsMock = {
    lastQuery: null,
    listGuilds: function (q) {
      this.lastQuery = JSON.parse(JSON.stringify(q || {}));
      return run(function (sc) { return sc === 'empty' ? { items: [], next_cursor: null } : D.list(q); });
    },
    getGuild: function (region, realm, guild) { return run(function () { return D.detail(region, realm, guild); }); }
  };
})();
