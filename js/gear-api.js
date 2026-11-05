/**
 * web#18 thin client: GET /characters/{id}/gear. Resolves { status, ok, body }.
 * Flip CS_CONFIG.USE_MOCK_GEAR for the real API. PUT (owner-only, X-CSRF-Token) is not used yet (read-only UI).
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG;
  window.CSGearApi = {
    gear: function (characterId) {
      if (cfg.USE_MOCK_GEAR) return window.CSGearMock.gear(characterId);
      var url = cfg.API_BASE + cfg.GEAR_PATH.replace('{id}', encodeURIComponent(characterId));
      return fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (b) { return { status: r.status, ok: r.ok, body: b, headers: {} }; });
      }, function () { return { status: 0, ok: false, body: null, headers: {} }; });
    }
  };
})();
