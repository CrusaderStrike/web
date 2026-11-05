/**
 * web#42 in-browser mock for the armory contract (platform gear-sets-and-items.md, snake_case):
 * PATCH /me/characters/{id} {displayed}; GET/POST /characters/{id}/gear-lists; GET /gear-lists/{id};
 * PUT /gear-lists/{id}/slots/{slot} {item_id|null} with If-Match; GET /items?slot=&q=&cursor=; GET /items/{id}.
 * Items are FICTIONAL WoW Forever-style items (names invented here), icon_url always null -> placeholder.
 * State in localStorage (cs_mock_armory). Scenarios: ?mock_armory=limit | notdisplayed | conflict | stale412 |
 * badslot | ratelimit | items500.
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG, KEY = 'cs_mock_armory', SLOTS = cfg.ARMORY_SLOTS, MAXSETS = cfg.ARMORY_MAX_SETS, MAXL = cfg.ARMORY_MAX_LEVEL;
  function sc() { try { return new URLSearchParams(location.search).get('mock_armory') || ''; } catch (e) { return ''; } }
  function delay(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 120); }); }
  function res(status, body, headers) { return delay({ status: status, ok: status >= 200 && status < 300, body: body, headers: headers || {} }); }
  function err(status, code, message, details, headers) {
    var e = { code: code, message: message, request_id: 'req_mock' }; if (details) e.details = details;
    return res(status, { error: e }, headers);
  }
  function invalid(details) { return err(400, 'validation_error', 'Check the highlighted fields.', details); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function st() { var s = load(); if (!s) s = { displayed: {}, sets: [], n: 0, flags: {} }; s.flags = s.flags || {}; return s; }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function now() { return new Date().toISOString(); }
  function etag(l) { return { etag: '"v' + l.version + '"' }; }
  function lvl(c) { var n = parseInt(c && c.level, 10); return n > 0 ? n : 0; }
  function view(l, c) {
    var o = JSON.parse(JSON.stringify(l));
    o.outgrown = o.type === 'leveling' && !!lvl(c) && lvl(c) >= o.until_level;
    return o;
  }

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
    /** Overlays displayed:boolean (default false, opt-in) onto the /me/characters list. */
    overlay: function (r) {
      if (!r || !r.ok || !r.body) return r;
      var s = st();
      (r.body.characters || []).forEach(function (c) { c.displayed = s.displayed[c.id] === true; delete c.is_main; });
      return r;
    },
    setDisplayed: function (c, displayed) {
      if (sc() === 'toggle500') return err(500, 'internal_error', 'Could not save. Try again.');
      if (!c || c.game !== 'wow_forever') return err(404, 'not_found', 'Character not found.');
      if (typeof displayed !== 'boolean') return invalid({ displayed: 'must be boolean' });
      var s = st(); s.displayed[c.id] = displayed; save(s);
      var o = JSON.parse(JSON.stringify(c)); o.displayed = displayed; return res(200, o);
    },
    sets: function (c) {
      var s = st();
      if (s.displayed[c.id] !== true) return err(409, 'character_not_displayed', 'Show this character on your profile first.');
      return res(200, { items: s.sets.filter(function (l) { return l.character_id === c.id && !l.deleted; }).map(function (l) { return view(l, c); }) });
    },
    create: function (c, b) {
      var s = st();
      if (sc() === 'notdisplayed' || s.displayed[c.id] !== true) return err(409, 'character_not_displayed', 'Show this character on your profile first.');
      var mine = s.sets.filter(function (l) { return l.character_id === c.id && !l.deleted; });
      if (sc() === 'limit' || mine.length >= MAXSETS) return err(409, 'list_limit_reached', 'A character can have at most ' + MAXSETS + ' gear sets.');
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
      if (mine.some(function (l) { return l.name === name; })) d.name = 'A set with this name already exists.';
      if (Object.keys(d).length) return invalid(d);
      var slots = {}; SLOTS.forEach(function (k) { slots[k] = null; });
      var l = { id: 'gs_' + (++s.n) + '_' + Math.random().toString(36).slice(2, 8), character_id: c.id, name: name, type: b.type,
        until_level: b.type === 'leveling' ? b.until_level : null, role_spec: role, edited_at: now(), version: 1, slots: slots };
      s.sets.push(l); save(s);
      return res(201, view(l, c), etag(l));
    },
    get: function (setId, c) {
      var l = st().sets.filter(function (x) { return x.id === setId && !x.deleted; })[0];
      return l ? res(200, view(l, c), etag(l)) : err(404, 'not_found', 'Gear set not found.');
    },
    putSlot: function (setId, slot, itemId, ifMatch) {
      var s = st(), l = s.sets.filter(function (x) { return x.id === setId && !x.deleted; })[0];
      if (!l) return err(404, 'not_found', 'Gear set not found.');
      if (SLOTS.indexOf(slot) < 0) return invalid({ slot: 'invalid_slot' });
      if (sc() === 'ratelimit' && !s.flags.rl) { s.flags.rl = 1; save(s); return err(429, 'rate_limited', 'Too many changes.', null, { 'retry-after': '2' }); }
      // Simulate another tab editing the set: bump the version once, so this If-Match is stale.
      if ((sc() === 'conflict' || sc() === 'stale412') && !s.flags.cf) {
        s.flags.cf = 1; l.version++; l.slots.neck = ITEMS.filter(function (i) { return i.slot_group === 'neck'; })[1].item_id; l.edited_at = now(); save(s);
        return sc() === 'conflict' ? err(409, 'version_mismatch', 'This set changed elsewhere.') : err(412, 'precondition_failed', 'If-Match does not match.');
      }
      if (ifMatch && ifMatch !== '"v' + l.version + '"') return err(412, 'precondition_failed', 'If-Match does not match.');
      if (itemId !== null) {
        if (typeof itemId !== 'number') return invalid({ item_id: 'item_not_forever' });
        var it = findItem(itemId);
        if (!it) return invalid({ item_id: 'item_not_forever' });
        if (sc() === 'badslot' || !fits(it, slot)) return invalid({ item_id: 'item_not_in_slot' });
      }
      if (l.slots[slot] !== itemId) { l.slots[slot] = itemId; l.version++; l.edited_at = now(); }  // idempotent
      save(s);
      return res(200, { slot: slot, item_id: itemId, edited_at: l.edited_at }, etag(l));
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
