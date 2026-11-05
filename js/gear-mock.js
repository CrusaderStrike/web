/**
 * web#18 mock for GET /characters/{character_id}/gear (platform main openapi/v1.yaml, getCharacterGear):
 * { character_id, updated_at, items: [{ slot, itemId, name, quality, ilvl, icon, icon_url }] }
 * icon = Blizzard icon asset name (no extension); icon_url is null by default, as platform#31 sends today; only the first head item has an allowlisted URL (tests that path); shirt omits icon_url. Empty slots omitted. Ids are opaque; never parsed.
 * Fictional WoW Forever items. Dev scenarios: ?mock_scenario=gear_empty|gear_error|gear_upstream|gear_ratelimit|slow
 */
(function () {
  'use strict';
  var GEAR = {
    ch_us_1001: [
      { slot: 'head', itemId: 910001, name: 'Helm of the Dawnward Vigil', quality: 'epic', ilvl: 66, icon: 'inv_helmet_03', icon_url: 'https://render.worldofwarcraft.com/us/icons/56/inv_helmet_03.jpg' },
      { slot: 'neck', itemId: 910002, name: 'Emberfall Signet Chain', quality: 'rare', ilvl: 60, icon: 'inv_jewelry_necklace_07', icon_url: null },
      { slot: 'shoulder', itemId: 910003, name: 'Pauldrons of the Silver Hand Reborn', quality: 'epic', ilvl: 66, icon: 'inv_shoulder_22', icon_url: null },
      { slot: 'chest', itemId: 910004, name: 'Breastplate of Hollow Light', quality: 'rare', ilvl: 58, icon: 'inv_chest_plate03', icon_url: null },
      { slot: 'hands', itemId: 910005, name: 'Gauntlets of Quiet Resolve', quality: 'uncommon', ilvl: 52, icon: 'inv_gauntlets_10', icon_url: null },
      { slot: 'main_hand', itemId: 910006, name: 'Duskhollow Warhammer', quality: 'legendary', ilvl: 75, icon: 'inv_hammer_04', icon_url: null },
      { slot: 'shirt', itemId: 910007, name: 'Faded Linen Shirt', quality: 'common', ilvl: 1, icon: 'inv_shirt_white_01' },
      { slot: 'feet', itemId: 910008, name: 'Worn Marching Boots', quality: 'poor', ilvl: 12, icon: null },
      { slot: 'finger1', itemId: 910009, name: null, quality: null, ilvl: null, icon: null }
    ],
    ch_us_1002: [
      { slot: 'head', itemId: 920001, name: 'Circlet of Stormwatch Keep', quality: 'rare', ilvl: 57, icon: 'inv_boots_01', icon_url: null },
      { slot: 'main_hand', itemId: 920002, name: 'Staff of Gentle Embers', quality: 'epic', ilvl: 63, icon: 'inv_crown_01', icon_url: null }
    ],
    ch_us_1003: [
      { slot: 'chest', itemId: 930001, name: 'Briarhide Vest', quality: 'uncommon', ilvl: 48, icon: 'inv_staff_08', icon_url: null }
    ]
  };
  var OWNED = ['ch_us_1001', 'ch_us_1002', 'ch_us_1003', 'ch_us_1004', 'ch_us_1005', 'ch_eu_2001'];
  function scenario() { try { return new URLSearchParams(location.search).get('mock_scenario') || ''; } catch (e) { return ''; } }
  function res(status, body) {
    return new Promise(function (r) {
      setTimeout(function () { r({ status: status, ok: status >= 200 && status < 300, body: body, headers: {} }); }, scenario() === 'slow' ? 1500 : 250);
    });
  }
  function err(status, code, message) { return res(status, { error: { code: code, message: message, request_id: 'req_mock' } }); }
  window.CSGearMock = {
    gear: function (id) {
      if (!sessionStorage.getItem('cs_mock_session')) return err(401, 'unauthenticated', 'Sign in required.');
      var sc = scenario();
      if (sc === 'gear_error') return err(500, 'internal_error', 'Something went wrong.');
      if (sc === 'gear_upstream') return err(502, 'upstream_unavailable', 'Battle.net is not responding.');
      if (sc === 'gear_ratelimit') {
        return new Promise(function (r) { setTimeout(function () { r({ status: 429, ok: false, headers: { 'retry-after': '7' }, body: { error: { code: 'rate_limited', message: 'Too many requests.', request_id: 'req_mock' } } }); }, 250); });
      }
      // Owner's characters only (non-owners / unknown ids -> 404). Lookup by exact id; ids are never parsed.
      if (OWNED.indexOf(id) < 0) return err(404, 'not_found', 'Character not found.');
      var items = sc === 'gear_empty' ? [] : (GEAR[id] || []);
      return res(200, { character_id: id, updated_at: '2026-11-04T18:00:00Z', items: JSON.parse(JSON.stringify(items)) });
    }
  };
})();
