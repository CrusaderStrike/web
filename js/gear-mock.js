/**
 * web#18 mock for GET /characters/{id}/gear (contract confirmed by Platform Dev):
 * { character_id, updated_at, items: [{ slot, itemId, name, quality, ilvl, icon }] }
 * Fictional WoW Forever items. Dev scenarios: ?mock_scenario=gear_empty|gear_error|gear_upstream|slow
 */
(function () {
  'use strict';
  var I = '/assets/icons/item.svg';
  var GEAR = {
    ch_1001: [
      { slot: 'head', itemId: 910001, name: 'Helm of the Dawnward Vigil', quality: 'epic', ilvl: 66, icon: I },
      { slot: 'neck', itemId: 910002, name: 'Emberfall Signet Chain', quality: 'rare', ilvl: 60, icon: I },
      { slot: 'shoulder', itemId: 910003, name: 'Pauldrons of the Silver Hand Reborn', quality: 'epic', ilvl: 66, icon: I },
      { slot: 'chest', itemId: 910004, name: 'Breastplate of Hollow Light', quality: 'rare', ilvl: 58, icon: I },
      { slot: 'hands', itemId: 910005, name: 'Gauntlets of Quiet Resolve', quality: 'uncommon', ilvl: 52, icon: I },
      { slot: 'main_hand', itemId: 910006, name: 'Duskhollow Warhammer', quality: 'legendary', ilvl: 75, icon: I },
      { slot: 'shirt', itemId: 910007, name: 'Faded Linen Shirt', quality: 'common', ilvl: 1, icon: I },
      { slot: 'feet', itemId: 910008, name: 'Worn Marching Boots', quality: 'poor', ilvl: 12, icon: null }
    ],
    ch_1002: [
      { slot: 'head', itemId: 920001, name: 'Circlet of Stormwatch Keep', quality: 'rare', ilvl: 57, icon: I },
      { slot: 'main_hand', itemId: 920002, name: 'Staff of Gentle Embers', quality: 'epic', ilvl: 63, icon: I }
    ],
    ch_1003: [
      { slot: 'chest', itemId: 930001, name: 'Briarhide Vest', quality: 'uncommon', ilvl: 48, icon: I }
    ]
  };
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
      if (!/^ch_10\d\d$/.test(id)) return err(404, 'not_found', 'Character not found.');
      var items = sc === 'gear_empty' ? [] : (GEAR[id] || []);
      return res(200, { character_id: id, updated_at: '2026-11-04T18:00:00Z', items: JSON.parse(JSON.stringify(items)) });
    }
  };
})();
