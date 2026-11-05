/**
 * web#18 mock for GET /characters/{character_id}/gear (platform#30 openapi/v1.yaml at ff99462, getCharacterGear):
 * { character_id, updated_at, items: [{ slot, itemId, name, quality, ilvl, icon }] }
 * icon = Blizzard icon asset name (no extension). Empty slots omitted. Ids are opaque; never parsed.
 * Fictional WoW Forever items. Dev scenarios: ?mock_scenario=gear_empty|gear_error|gear_upstream|gear_ratelimit|slow
 */
(function () {
  'use strict';
  var GEAR = {
    ch_us_1001: [
      { slot: 'head', itemId: 910001, name: 'Helm of the Dawnward Vigil', quality: 'epic', ilvl: 66, icon: 'inv_helmet_03' },
      { slot: 'neck', itemId: 910002, name: 'Emberfall Signet Chain', quality: 'rare', ilvl: 60, icon: 'inv_jewelry_necklace_07' },
      { slot: 'shoulder', itemId: 910003, name: 'Pauldrons of the Silver Hand Reborn', quality: 'epic', ilvl: 66, icon: 'inv_shoulder_22' },
      { slot: 'chest', itemId: 910004, name: 'Breastplate of Hollow Light', quality: 'rare', ilvl: 58, icon: 'inv_chest_plate03' },
      { slot: 'hands', itemId: 910005, name: 'Gauntlets of Quiet Resolve', quality: 'uncommon', ilvl: 52, icon: 'inv_gauntlets_10' },
      { slot: 'main_hand', itemId: 910006, name: 'Duskhollow Warhammer', quality: 'legendary', ilvl: 75, icon: 'inv_hammer_04' },
      { slot: 'shirt', itemId: 910007, name: 'Faded Linen Shirt', quality: 'common', ilvl: 1, icon: 'inv_shirt_white_01' },
      { slot: 'feet', itemId: 910008, name: 'Worn Marching Boots', quality: 'poor', ilvl: 12, icon: null },
      { slot: 'finger1', itemId: 910009, name: null, quality: null, ilvl: null, icon: null }
    ],
    ch_us_1002: [
      { slot: 'head', itemId: 920001, name: 'Circlet of Stormwatch Keep', quality: 'rare', ilvl: 57, icon: 'inv_boots_01' },
      { slot: 'main_hand', itemId: 920002, name: 'Staff of Gentle Embers', quality: 'epic', ilvl: 63, icon: 'inv_crown_01' }
    ],
    ch_us_1003: [
      { slot: 'chest', itemId: 930001, name: 'Briarhide Vest', quality: 'uncommon', ilvl: 48, icon: 'inv_staff_08' }
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
