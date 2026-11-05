/**
 * web#18 thin client: GET /characters/{character_id}/gear (platform#30 at ff99462). Resolves { status, ok, body }.
 * Flip CS_CONFIG.USE_MOCK_GEAR for the real API. PUT (owner-only, X-CSRF-Token) is not used yet (read-only UI).
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG;
  window.CSGearApi = {
    /**
     * Icon URL for an item: the platform's icon_url when it is an absolute https URL;
     * otherwise the TEMPORARY fallback below (GEAR_ICON_URL + icon asset name), or the local placeholder.
     */
    iconFor: function (item) {
      var u = item && item.icon_url;
      if (typeof u === 'string') {
        try { var p = new URL(u); if (p.protocol === 'https:') return p.href; } catch (e) { /* invalid -> fallback */ }
      }
      return this.iconUrl(item && item.icon);
    },
    /** TEMPORARY fallback until every item carries icon_url: Blizzard icon asset name -> GEAR_ICON_URL, or the placeholder. */
    iconUrl: function (name) {
      var ph = '/assets/icons/item.svg';
      if (cfg.USE_MOCK_GEAR || typeof name !== 'string' || !/^[a-z0-9_]{1,128}$/i.test(name)) return ph;
      return cfg.GEAR_ICON_URL.replace('{icon}', encodeURIComponent(name.toLowerCase()));
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
