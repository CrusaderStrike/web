/**
 * web#42 in-browser mock with the shipped platform main wire shapes (openapi/v1.yaml, src/routes/{profile,gear-lists}.ts,
 * gear-list schema v1): GET /me/characters {characters, selection}; PUT /me/characters/selection {main_id, alt_ids}
 * (delegates to js/auth-mock.js); GET/POST /characters/{id}/gear-lists; GET /gear-lists/{id};
 * POST /gear-lists/{id}/ops (platform#46 set_slot | clear_slot only; op_id, base_version -> {version, applied, duplicates, conflicts, list});
 * GET /items, /items/{id}. A character not in the selection -> 403 {errors:{character_id}} like
 * requireOwnedCharacter. Items are FICTIONAL (icon_url null). State in localStorage (cs_mock_armory).
 * Scenarios: ?mock_armory=limit | notdisplayed | conflict | notforever | ratelimit | items500 | toggle500 | down | api503 (web#48); every route 401 without a session.
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG, KEY = 'cs_mock_armory', SLOTS = cfg.ARMORY_SLOTS, MAXSETS = cfg.ARMORY_MAX_SETS, MAXL = cfg.ARMORY_MAX_LEVEL;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function sc() { try { return new URLSearchParams(location.search).get('mock_armory') || ''; } catch (e) { return ''; } }
  function delay(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 60); }); }
  function res(status, body, headers) { return delay({ status: status, ok: status >= 200 && status < 300, body: body, headers: headers || {} }); }
  function err(status, code, message, details, headers) {
    var e = { code: code, message: message, retryable: status === 429 || status >= 500 || code === 'version_mismatch', request_id: 'req_mock' }; if (details) e.details = details;
    return res(status, { error: e }, headers);
  }
  function invalid(details) { return err(400, 'validation_error', 'Check the highlighted fields.', details); }
  function fields(status, f) { return res(status, { errors: f }); }  // platform AppError with fields -> { errors: {field: msg} }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function st() { var s = load(); if (!s) s = { sets: [], n: 0, flags: {} }; s.flags = s.flags || {}; return s; }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function now() { return new Date().toISOString(); }
  function etag(l) { return { etag: '"v' + l.version + '"' }; }
  function lvl(c) { var n = parseInt(c && c.level, 10); return n > 0 ? n : 0; }
  function selected(id) { var x = null; try { x = JSON.parse(localStorage.getItem('cs_mock_selection')); } catch (e) { x = null; } return !!x && (x.main_id === id || (x.alt_ids || []).indexOf(id) >= 0); }
  function notSelected() { return fields(403, { character_id: 'Must be your selected main or an alt.' }); }
  function view(l, c) {
    var o = JSON.parse(JSON.stringify(l)); delete o.touch; delete o.staleAll;
    o.outgrown = o.type === 'leveling' && !!lvl(c) && lvl(c) >= o.until_level;
    return o;
  }
  function csrf() { var s = null; try { s = JSON.parse(sessionStorage.getItem('cs_mock_session')); } catch (e) { s = null; } return s && s.csrf_token; }

  // ---- fictional Forever catalog ----
  var GROUP = { finger1: 'finger', finger2: 'finger', trinket1: 'trinket', trinket2: 'trinket' };
  var INV = { head: 'HEAD', neck: 'NECK', shoulder: 'SHOULDER', back: 'CLOAK', chest: 'CHEST', shirt: 'BODY', tabard: 'TABARD', wrist: 'WRIST',
    hands: 'HAND', waist: 'WAIST', legs: 'LEGS', feet: 'FEET', finger: 'FINGER', trinket: 'TRINKET', main_hand: 'WEAPON', off_hand: 'SHIELD', ranged: 'RANGED' };
  var NOUN = { head: 'Helm', neck: 'Pendant', shoulder: 'Pauldrons', back: 'Cloak', chest: 'Breastplate', shirt: 'Shirt', tabard: 'Tabard', wrist: 'Bracers',
    hands: 'Gauntlets', waist: 'Girdle', legs: 'Legguards', feet: 'Sabatons', finger: 'Band', trinket: 'Talisman', main_hand: 'Blade', off_hand: 'Aegis', ranged: 'Longbow' };
  var ADJ = ['Emberwrought', 'Duskhollow', 'Thornquill', 'Ashen', 'Gloomforged', 'Sunveil', 'Briarbound', 'Stormwatch', 'Hollowpeak', 'Wispwoven',
    'Lanternlit', 'Grimtide', 'Dawnmantle', 'Frostvein', 'Cindersworn', 'Mossgrave', 'Ironbark', 'Starfall', 'Bramblehide', 'Runecut', 'Sablewind', 'Highmoor'];
  var ARMOR = ['cloth', 'leather', 'mail', 'plate'], QUAL = ['common', 'uncommon', 'rare', 'epic'];
  var ITEMS = [], id = 90001;
  Object.keys(NOUN).forEach(function (g) {
    ADJ.forEach(function (a, i) {
      var armorSlot = ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'].indexOf(g) >= 0;
      var req = Math.min(MAXL, 5 + i * 3);
      ITEMS.push({ item_id: id++, name: a + ' ' + NOUN[g], slot: g === 'finger' ? 'finger1' : g === 'trinket' ? 'trinket1' : g,
        slot_group: g, inventory_type: INV[g], quality: QUAL[i % 4], item_level: req + 5 + (i % 4) * 3, required_level: req,
        armor_type: armorSlot ? ARMOR[i % 4] : null, stats: i % 5 === 0 ? null : [{ type: 'stamina', value: 2 + i }],
        icon_url: null, source: 'blizzard_forever', verified: true });
    });
  });
  // platform#74: ranged weapons and ammo the planner can tell apart. 19082 and 19286 are dropped in the ammo picker.
  [
    { item_id: 91001, name: 'Testwood Bow', slot: 'ranged', slot_group: 'ranged', inventory_type: 'RANGED', item_class: 2, subclass: 2 },
    { item_id: 91002, name: 'Testwood Crossbow', slot: 'ranged', slot_group: 'ranged', inventory_type: 'RANGED', item_class: 2, subclass: 18 },
    { item_id: 91003, name: 'Testwood Gun', slot: 'ranged', slot_group: 'ranged', inventory_type: 'RANGED', item_class: 2, subclass: 3 },
    { item_id: 91004, name: 'Testwood Thrown', slot: 'ranged', slot_group: 'ranged', inventory_type: 'THROWN', item_class: 2, subclass: 16 },
    { item_id: 91020, name: 'Misfiled Quiver', slot: 'ranged', slot_group: 'ranged', inventory_type: 'AMMO', item_class: 6, subclass: 2 },
    { item_id: 91011, name: 'Testwood Arrow', slot: 'ammo', slot_group: 'ammo', inventory_type: 'AMMO', item_class: 6, subclass: 2 },
    { item_id: 91012, name: 'Testwood Bullet', slot: 'ammo', slot_group: 'ammo', inventory_type: 'AMMO', item_class: 6, subclass: 3 },
    { item_id: 19082, name: 'Jagged Arrow', slot: 'ammo', slot_group: 'ammo', inventory_type: 'AMMO', item_class: 6, subclass: 2 },
    { item_id: 19286, name: 'Deadly Poison', slot: 'ammo', slot_group: 'ammo', inventory_type: 'AMMO', item_class: 0, subclass: 0 }
  ].forEach(function (extra) {
    ITEMS.push({ item_id: extra.item_id, name: extra.name, slot: extra.slot, slot_group: extra.slot_group, inventory_type: extra.inventory_type,
      item_class: extra.item_class, subclass: extra.subclass, quality: 'common', item_level: 10, required_level: 1, armor_type: null,
      stats: null, icon_url: null, source: 'blizzard_forever', verified: true });
  });
  function groupOf(slot) { return GROUP[slot] || slot; }
  function fits(item, slot) { return item && item.slot_group === groupOf(slot); }
  function pub(i) { var o = JSON.parse(JSON.stringify(i)); delete o.slot_group; return o; }
  var ITEMS_MAX = (window.CSGearListsSpec && window.CSGearListsSpec.limits && window.CSGearListsSpec.limits.items_per_list) || 100;
  function findItem(iid) { return ITEMS.filter(function (i) { return i.item_id === iid; })[0] || null; }

  window.CSArmoryMock = {
    ITEMS: ITEMS,
    characters: function () { return window.CSAuthMock.characters(); },
    saveSelection: function (b) {
      if (sc() === 'toggle500') return err(500, 'internal_error', 'Could not save. Try again.');
      return window.CSAuthMock.saveSelection(b, csrf());
    },
    sets: function (c) {
      if (!selected(c.id)) return notSelected();
      var s = st();
      return res(200, { items: s.sets.filter(function (l) { return l.character_id === c.id && !l.deleted; }).map(function (l) { return view(l, c); }) });
    },
    create: function (c, b) {
      var s = st();
      if (sc() === 'notdisplayed' || !selected(c.id)) return notSelected();
      var mine = s.sets.filter(function (l) { return l.character_id === c.id && !l.deleted; });
      if (sc() === 'limit' || mine.length >= MAXSETS) return err(409, 'list_limit_reached', 'Maximum of ' + MAXSETS + ' gear lists per character.', { limit: MAXSETS });
      b = b || {};
      var d = {}, L = lvl(c);
      var name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name || name.length > 64) d.name = 'name_required';
      if (b.type !== 'leveling' && b.type !== 'max_level') d.type = 'invalid_type';
      if (b.type === 'leveling') {
        if (L >= MAXL) d.type = 'leveling_set_at_max_level';
        else if (b.until_level == null) d.until_level = 'until_level_required';
        else if (typeof b.until_level !== 'number' || b.until_level % 1 || b.until_level < 1 || b.until_level > MAXL) d.until_level = 'until_level_out_of_range';
        else if (b.until_level <= L) d.until_level = 'until_level_not_above_current_level';
      }
      if (b.type === 'max_level' && b.until_level != null) d.until_level = 'until_level_must_be_null';
      var role = b.role_spec == null ? null : String(b.role_spec).trim() || null;
      if (role && role.length > 32) d.role_spec = 'role_spec_too_long';
      if (Object.keys(d).length) return invalid(d);
      var l = { id: '00000000-0000-4000-8000-' + String(++s.n).padStart(12, '0'), character_id: c.id, owner_user_id: 'u_mock', name: name,
        visibility: 'private', type: b.type, until_level: b.type === 'leveling' ? b.until_level : null, role_spec: role,
        version: 1, updated_at: now(), updated_source: 'web', items: [], touch: {} };
      s.sets.push(l); save(s);
      return res(201, view(l, c), etag(l));
    },
    get: function (setId) {
      var l = st().sets.filter(function (x) { return x.id === setId && !x.deleted; })[0];
      return l ? res(200, view(l), etag(l)) : err(404, 'not_found', 'List not found.');
    },
    /** POST /gear-lists/{id}/ops, mirroring platform gear/store.ts applyOps (per-op version bump, stale -> GearOpRejected). */
    ops: function (setId, b) {
      var s = st(), l = s.sets.filter(function (x) { return x.id === setId && !x.deleted; })[0];
      if (sc() === 'ratelimit' && !s.flags.rl) { s.flags.rl = 1; save(s); return err(429, 'rate_limited', 'Gear write is rate-limited. Try again shortly.', null, { 'retry-after': '2' }); }
      var ops = b && b.ops;
      if (!Array.isArray(ops) || ops.length < 1 || ops.length > 50) return fields(400, { ops: 'Array of 1..50 ops required.' });
      for (var i = 0; i < ops.length; i++) {
        var o = ops[i];
        // The armory only sends set_slot / clear_slot (platform#46); the mock models just those.
        if (!o || !UUID_RE.test(o.op_id) || ['set_slot', 'clear_slot'].indexOf(o.type) < 0 || SLOTS.indexOf(o.slot) < 0 ||
          (o.type === 'set_slot' && (typeof o.item_id !== 'number' || o.item_id < 1 || o.item_id % 1)) || typeof o.base_version !== 'number') return fields(400, { ['ops.' + i]: 'Invalid.' });
        // platform#46: known-but-irrelevant fields (clear_slot item_id; set_slot priority/note/obtained) are ignored silently.
      }
      if (!l) return err(404, 'not_found', 'List not found.');
      l.touch = l.touch || {}; s.flags.seen = s.flags.seen || [];
      // Simulate another tab editing this slot once, so this batch's base_version is stale.
      if (sc() === 'conflict' && !s.flags.cf) {
        s.flags.cf = 1; var nk = ITEMS.filter(function (x) { return x.slot_group === 'neck'; })[1].item_id;
        l.items = l.items.filter(function (x) { return x.slot !== 'neck'; }).concat([{ slot: 'neck', item_id: nk, priority: 1, note: null, obtained: false, obtained_at: null, icon_url: null }]);
        l.version++; l.staleAll = l.version;
      }
      var out = { applied: [], duplicates: [], conflicts: [], ignored: [] };
      // platform#46: stale checks use touches from BEFORE this request; ops in the same batch never make each other stale.
      var pre = JSON.parse(JSON.stringify(l.touch)), preAll = l.staleAll || 0;
      var KNOWN = ['op_id', 'type', 'slot', 'item_id', 'base_version', 'priority', 'note', 'obtained', 'client_ts'];
      var slotT = function (slot) { return Math.max.apply(null, [preAll].concat(Object.keys(pre).filter(function (k) { return k.indexOf(slot + ':') === 0; }).map(function (k) { return pre[k]; }))); };
      ops.forEach(function (o) {
        var unk = Object.keys(o).filter(function (k) { return KNOWN.indexOf(k) < 0; });
        if (unk.length) out.ignored.push({ op_id: o.op_id, keys: unk });
        if (s.flags.seen.indexOf(o.op_id) >= 0) { out.duplicates.push(o.op_id); return; }
        s.flags.seen.push(o.op_id);
        {
          var cur = l.items.filter(function (x) { return x.slot === o.slot; });
          if (o.type === 'set_slot') {
            var it = sc() === 'notforever' ? null : findItem(o.item_id);
            if (!it) { l.version++; out.conflicts.push({ op_id: o.op_id, reason: 'item_not_forever', message: 'item_not_forever' }); return; }
            if (!fits(it, o.slot)) { l.version++; out.conflicts.push({ op_id: o.op_id, reason: 'item_not_in_slot', message: 'item_not_in_slot' }); return; }
          }
          var ts = slotT(o.slot);  // stale check runs BEFORE the no-op check; a rejection bumps the version
          if (ts > o.base_version) { l.version++; out.conflicts.push({ op_id: o.op_id, reason: 'stale_base_version', winning_version: ts, message: 'Stale base_version.' }); return; }
          var noop = o.type === 'clear_slot' ? !cur.length : cur.length === 1 && cur[0].item_id === o.item_id;
          if (o.type === 'set_slot' && !cur.length && l.items.length >= ITEMS_MAX) { l.version++; out.conflicts.push({ op_id: o.op_id, reason: 'list_items_limit', message: 'list_items_limit' }); return; }
          if (!noop) {
            l.version++; cur.forEach(function (x) { l.touch[o.slot + ':' + x.item_id] = l.version; });
            l.items = l.items.filter(function (x) { return x.slot !== o.slot; });
            if (o.type === 'set_slot') { l.touch[o.slot + ':' + o.item_id] = l.version; l.items.push({ slot: o.slot, item_id: o.item_id, priority: 1, note: null, obtained: false, obtained_at: null, icon_url: null }); }
          }
          out.applied.push(o.op_id);  // a no-op is accepted with no version bump
        }
      });
      l.updated_at = now(); save(s);
      out.version = l.version; out.list = view(l);
      return res(200, out);
    },
    items: function (q) {
      if (sc() === 'items500') return err(500, 'internal_error', 'Items are unavailable.');
      if (SLOTS.indexOf(q.slot) < 0) return invalid({ slot: 'invalid_slot' });
      var term = String(q.q || '').trim().toLowerCase();
      var all = ITEMS.filter(function (i) { return fits(i, q.slot) && (!term || i.name.toLowerCase().indexOf(term) >= 0); });
      var start = parseInt(q.cursor, 10) || 0, size = 10;
      var page = all.slice(start, start + size).map(pub);
      return res(200, { items: page, next_cursor: start + size < all.length ? String(start + size) : null }, { etag: '"items-1"' });
    },
    item: function (iid) { var i = findItem(iid); return i ? res(200, pub(i)) : err(404, 'not_found', 'Item not found.'); },
    devReset: function () { localStorage.removeItem(KEY); }
  };
  // web#48: like platform requireSession, every armory route answers 401 once the session is gone (expired token);
  // ?mock_armory=down -> no response (status 0), ?mock_armory=api503 -> 503, for the API-down error states.
  ['sets', 'create', 'get', 'ops', 'items', 'item'].forEach(function (k) {
    var f = window.CSArmoryMock[k];
    window.CSArmoryMock[k] = function () {
      if (!csrf()) return err(401, 'unauthenticated', 'Sign in required.');
      if (sc() === 'down') return delay({ status: 0, ok: false, body: null, headers: {} });
      if (sc() === 'api503') return err(503, 'upstream_unavailable', 'Battle.net is not responding.');
      return f.apply(this, arguments);
    };
  });
})();
