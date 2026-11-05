/**
 * web#42 in-browser mock with the shipped platform main wire shapes (openapi/v1.yaml, src/routes/{profile,gear-lists}.ts,
 * gear-list schema v1): GET /me/characters {characters, selection}; PUT /me/characters/selection {main_id, alt_ids}
 * (delegates to js/auth-mock.js); GET/POST /characters/{id}/gear-lists; GET /gear-lists/{id};
 * POST /gear-lists/{id}/ops (add_item | remove_item, op_id, base_version -> {version, applied, duplicates, conflicts, list});
 * GET /items, /items/{id}. A character not in the selection -> 403 {errors:{character_id}} like
 * requireOwnedCharacter. Items are FICTIONAL (icon_url null). State in localStorage (cs_mock_armory).
 * Scenarios: ?mock_armory=limit | notdisplayed | conflict | notforever | ratelimit | items500 | toggle500.
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG, KEY = 'cs_mock_armory', SLOTS = cfg.ARMORY_SLOTS, MAXSETS = cfg.ARMORY_MAX_SETS, MAXL = cfg.ARMORY_MAX_LEVEL;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function sc() { try { return new URLSearchParams(location.search).get('mock_armory') || ''; } catch (e) { return ''; } }
  function delay(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 60); }); }
  function res(status, body, headers) { return delay({ status: status, ok: status >= 200 && status < 300, body: body, headers: headers || {} }); }
  function err(status, code, message, details, headers) {
    var e = { code: code, message: message, request_id: 'req_mock' }; if (details) e.details = details;
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
  function groupOf(slot) { return GROUP[slot] || slot; }
  function fits(item, slot) { return item && item.slot_group === groupOf(slot); }
  function pub(i) { var o = JSON.parse(JSON.stringify(i)); delete o.slot_group; return o; }
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
      if (sc() === 'limit' || mine.length >= MAXSETS) return err(409, 'list_limit_reached', 'Maximum of ' + MAXSETS + ' gear lists per character.');
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
        if (!o || !UUID_RE.test(o.op_id) || ['add_item', 'remove_item', 'reprioritize_item', 'mark_obtained'].indexOf(o.type) < 0 || SLOTS.indexOf(o.slot) < 0 ||
          typeof o.item_id !== 'number' || o.item_id < 1 || typeof o.base_version !== 'number' || (o.type === 'add_item' && !(o.priority >= 1))) return fields(400, { ['ops.' + i]: 'Invalid.' });
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
      ops.forEach(function (o) {
        if (s.flags.seen.indexOf(o.op_id) >= 0) { out.duplicates.push(o.op_id); return; }
        s.flags.seen.push(o.op_id);
        if (o.type === 'add_item' && (sc() === 'notforever' || !findItem(o.item_id))) { l.version++; out.conflicts.push({ op_id: o.op_id, reason: 'item_not_forever', message: 'item_not_forever' }); return; }
        var key = o.slot + ':' + o.item_id, t = Math.max(l.touch[key] || 0, l.staleAll || 0);
        if (t > o.base_version) { l.version++; out.conflicts.push({ op_id: o.op_id, reason: 'stale_base_version', winning_version: t, message: 'Stale base_version.' }); return; }
        l.version++; l.touch[key] = l.version;
        if (o.type === 'remove_item') l.items = l.items.filter(function (x) { return !(x.slot === o.slot && x.item_id === o.item_id); });
        else if (o.type === 'add_item' && !l.items.some(function (x) { return x.slot === o.slot && x.item_id === o.item_id; }))
          l.items.push({ slot: o.slot, item_id: o.item_id, priority: o.priority, note: null, obtained: false, obtained_at: null, icon_url: null });
        out.applied.push(o.op_id);
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
})();
