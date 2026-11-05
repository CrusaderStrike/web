/**
 * web#18 thin client: GET /characters/{character_id}/gear (platform main openapi/v1.yaml). Resolves { status, ok, body }.
 * Flip CS_CONFIG.USE_MOCK_GEAR for the real API. PUT (owner-only, X-CSRF-Token) is not used yet (read-only UI).
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG;
  var ICON_HOST = 'render.worldofwarcraft.com';  // only host allowed for platform-provided icon_url
  window.CSGearApi = {
    /**
     * Icon URL for an item: the platform's icon_url only when it is https: on exactly
     * ICON_HOST; otherwise null, and the page draws its slot placeholder (js/gear-icons.js). Clients must not build
     * icon URLs themselves (platform#31).
     */
    iconFor: function (item) {
      var ph = null;
      var u = item && item.icon_url;
      if (typeof u !== 'string') return ph;
      try {
        var p = new URL(u);
        if (p.protocol === 'https:' && p.hostname === ICON_HOST) return p.href;
      } catch (e) { /* invalid URL -> placeholder */ }
      return ph;
    },
    gear: function (characterId) {
      if (cfg.USE_MOCK_GEAR) return window.CSGearMock.gear(characterId);
      var url = cfg.API_BASE + cfg.GEAR_PATH.replace('{id}', encodeURIComponent(characterId));
      return fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } }).then(function (r) {
        var hd = { 'retry-after': r.headers.get('Retry-After') || '' };
        return r.json().catch(function () { return null; }).then(function (b) { return { status: r.status, ok: r.ok, body: b, headers: hd }; });
      }, function () { return { status: 0, ok: false, body: null, headers: {} }; });
    }
  };
})();
