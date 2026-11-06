/**
 * web#18 in-browser mock of the platform#17 gear-list endpoints as finalized in platform#34 @ 1b5320e.
 * Enums and limits come from the generated js/gear-lists-spec.js (tools/gen-gear-lists-spec.js); nothing is hand-copied.
 * Per character (max 5), If-Match/ETag exactly "v<n>", 409 version_mismatch {error, current:{version, list}},
 * ops always 200 with conflicts[], undo = mark_obtained obtained:false, /events with typed payloads and
 * actor {user_id, display_name}, missing If-Match 428 precondition_required, client source ignored (server sets web), visibility private|guild, only the owner writes (everyone else 403 forbidden).
 * WoW Forever only; fictional realms (Emberfall, Duskhollow). State lives in sessionStorage.
 * ?mock= scenarios: conflict, stale, limit, ratelimit (&rl=N), csrf, offline, forbidden (officer persona), history403, char403, 500.
 */
(function () {
  'use strict';
  var KEY = 'cs_mock_gear_lists';
  var SPEC = window.CSGearListsSpec, L = SPEC.limits;
  var MAX = (window.CS_CONFIG && window.CS_CONFIG.ARMORY_MAX_SETS) || 20;  // web#42: platform cap 20 (409 list_limit_reached)
  var OWNED = ['ch_us_1001', 'ch_us_1002', 'ch_us_1003', 'ch_us_1004', 'ch_us_1005', 'ch_eu_2001'];
  var SLOTS = SPEC.slots;
  // CSGEAR1 import still sends type/until_level/role_spec. The website create always sends max_level / null / null.
  // Character levels from the js/auth-mock.js fixtures, for the platform level rules on those import creates.
  var LEVEL = { ch_us_1001: 60, ch_us_1002: 60, ch_us_1003: 52, ch_us_1004: 38, ch_us_1005: 27, ch_eu_2001: 44 };
  function levelRules(tp, until, lv) {
    if (tp === 'max_level') return until != null ? { until_level: 'until_level_must_be_null' } : null;
    var e = {};
    if (lv >= 60) e.type = 'leveling_set_at_max_level';
    if (until == null) e.until_level = 'until_level_required';
    else if (typeof until !== 'number' || until % 1 || until < 1 || until > 60) e.until_level = 'until_level_out_of_range';
    else if (until <= lv) e.until_level = 'until_level_not_above_current_level';
    return Object.keys(e).length ? e : null;
  }
  // Forever item fixtures (fictional). Unknown ids still pass; name comes back null.
  var NOT_FOREVER = [19019, 22691];  // fixture ids the mock treats as non-Forever (item_not_forever)
  var ITEMS = { 910001: 'Helm of the Dawnward Vigil', 910003: 'Pauldrons of the Silver Hand Reborn', 910006: 'Duskhollow Warhammer',
    940001: 'Emberfall Ward of Cinders', 940002: 'Duskhollow Nightcloak', 940003: 'Band of the Ember Vigil', 940004: 'Lantern of Duskhollow' };
  var OWNER = '6f1c2a90-0000-4000-8000-00000000c0de';
  var ME = { user_id: OWNER, display_name: 'Crusader#1234' };
  var OFFICER = { user_id: '6f1c2a90-0000-4000-8000-0000000off1', display_name: 'Ashguard#5678' };
  function now() { return new Date().toISOString(); }
  function uid() { return 'gl_' + Math.random().toString(36).slice(2, 10); }
  function item(slot, id, pr, note, obt) { return { slot: slot, item_id: id, name: ITEMS[id] || null, priority: pr, note: note || null, obtained: !!obt, obtained_at: obt ? '2026-11-03T21:10:00Z' : null, obtained_run_id: null, icon_url: null }; }
  function seed() {
    var a = { id: 'gl_emberfall_bis', character_id: 'ch_us_1001', owner_user_id: OWNER, name: 'Emberfall BiS', visibility: 'guild', version: 4,
      updated_at: '2026-11-04T02:15:00Z', updated_source: 'addon', type: 'leveling', until_level: 50, role_spec: 'Retribution',
      items: [item('head', 910001, 1, 'Dungeon Run drop'), item('back', 940002, 1, ''), item('finger1', 940003, 2, 'Swap for ring 1', true)] };
    var b = { id: 'gl_duskhollow_prep', character_id: 'ch_us_1001', owner_user_id: OWNER, name: 'Duskhollow pre-raid', visibility: 'private', version: 1,
      updated_at: '2026-11-03T18:00:00Z', updated_source: 'web', type: 'max_level', until_level: null, role_spec: 'Holy', items: [] };
    var ev = {};
    ev[a.id] = [
      { version: 1, event_type: 'GearListCreated', payload: { name: 'Emberfall BiS', character_id: 'ch_us_1001', visibility: 'guild' }, actor: ME, source: 'web', recorded_at: '2026-11-02T19:00:00Z' },
      { version: 2, event_type: 'GearItemAdded', payload: { slot: 'head', item_id: 910001, priority: 1 }, actor: ME, source: 'web', recorded_at: '2026-11-02T19:01:00Z' },
      { version: 3, event_type: 'GearItemObtained', payload: { slot: 'finger1', item_id: 940003, obtained: true, run_id: null }, actor: ME, source: 'addon', recorded_at: '2026-11-03T21:10:00Z' },
      { version: 4, event_type: 'GearOpRejected', payload: { op_id: '0b6c8c1e-3f1a-4d2e-9a77-5b1e2c3d4e5f', reason: 'stale_base_version', winning_seq: 3, slot: 'head', item_id: 910001 }, actor: ME, source: 'addon', recorded_at: '2026-11-04T02:15:00Z' }
    ];
    ev[b.id] = [{ version: 1, event_type: 'GearListCreated', payload: { name: 'Duskhollow pre-raid', character_id: 'ch_us_1001', visibility: 'private' }, actor: ME, source: 'web', recorded_at: '2026-11-03T18:00:00Z' }];
    return { lists: [a, b], events: ev, seen_ops: {}, flags: {} };
  }
  function load() { try { var s = JSON.parse(sessionStorage.getItem(KEY)); if (s && s.lists) return s; } catch (e) { /* reseed */ } return seed(); }
  function save(s) { sessionStorage.setItem(KEY, JSON.stringify(s)); }
  function mock() { try { return new URLSearchParams(location.search).get('mock') || ''; } catch (e) { return ''; } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function res(status, body, headers) {
    return new Promise(function (r) { setTimeout(function () { r({ status: status, ok: status >= 200 && status < 300, body: body, headers: headers || {} }); }, 120); });
  }
  function err(status, code, message, extra, headers) {
    var b = { error: { code: code, message: message, retryable: status === 429 || status >= 500 || code === 'version_mismatch', request_id: 'req_mock' } };
    if (extra) Object.keys(extra).forEach(function (k) { if (k === 'details') b.error.details = extra[k]; else b[k] = extra[k]; });
    return res(status, b, headers);
  }
  function etag(l) { return { etag: '"v' + l.version + '"' }; }
  function guard(write) {
    if (!sessionStorage.getItem('cs_mock_session')) return err(401, 'unauthenticated', 'Sign in required.');
    var m = mock();
    if (m === 'offline') return res(0, null);
    if (m === '500') return err(500, 'internal_error', 'Something went wrong.');
    // ?mock=forbidden: viewer is a guild officer, not the owner. Reads allowed, every write 403.
    if (write && m === 'forbidden') return err(403, 'forbidden', 'Only the list owner can change this list.');
    return null;
  }
  function ops0(b) { return b && Array.isArray(b.ops) ? b.ops : []; }
  function strip(l) { var c = clone(l); c.items.forEach(function (i) { delete i._v; }); return c; }
  function find(s, id) { for (var i = 0; i < s.lists.length; i++) if (s.lists[i].id === id) return s.lists[i]; return null; }
  function bump(s, l, type, payload, source) {
    l.version += 1; l.updated_at = now(); l.updated_source = source || 'web';
    if (SPEC.event_types.indexOf(type) < 0) throw new Error('mock: event type not in spec: ' + type);
    (s.events[l.id] = s.events[l.id] || []).push({ version: l.version, event_type: type, payload: payload, actor: ME, source: source || 'web', op_id: (payload && payload.op_id) || null, recorded_at: l.updated_at });
  }
  function validName(n) { return typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= L.name_max && !/[\u0000-\u001f]/.test(n); }
  function ifMatch(s, l, version) {
    // ?mock=stale: an in-game (addon) edit lands first, so the client's If-Match is now behind.
    if (typeof version !== 'number' || !(version >= 0)) return err(428, 'precondition_required', 'If-Match "v<n>" is required.');
    if (mock() === 'stale' && !s.flags['stale_' + l.id]) { s.flags['stale_' + l.id] = 1; l.name += ' (in game)'; bump(s, l, 'GearListRenamed', { name: l.name }, 'addon'); save(s); }
    if ('"v' + version + '"' !== etag(l).etag) return err(409, 'version_mismatch', 'This list changed somewhere else.', { current: { version: l.version, list: strip(l) } }, etag(l));
    return null;
  }

  window.CSGearListsMock = {
    reset: function () { sessionStorage.removeItem(KEY); },
    lists: function (charId) {
      var g = guard(false); if (g) return g;
      if (mock() === 'char403') return err(403, 'forbidden', 'That character is not in your selection.');
      if (OWNED.indexOf(charId) < 0) return err(404, 'not_found', 'Character not found.');
      var s = load(); save(s);
      return res(200, { items: s.lists.filter(function (l) { return l.character_id === charId; }).map(strip) });
    },
    create: function (charId, body) {
      var g = guard(true); if (g) return g;
      if (OWNED.indexOf(charId) < 0) return err(404, 'not_found', 'Character not found.');
      // web#50 test hooks: cs_mock_create_budget=N -> the (N+1)th create answers 500 (partial import stop);
      // cs_mock_create_429=S -> the next create answers 429 rate_limited with Retry-After S.
      var bud = sessionStorage.getItem('cs_mock_create_budget');
      if (bud != null) { var nb = parseInt(bud, 10) || 0; if (nb <= 0) { sessionStorage.removeItem('cs_mock_create_budget'); return err(500, 'internal_error', 'Something went wrong.'); } sessionStorage.setItem('cs_mock_create_budget', String(nb - 1)); }
      var r429 = sessionStorage.getItem('cs_mock_create_429');
      if (r429 != null) { sessionStorage.removeItem('cs_mock_create_429'); return err(429, 'rate_limited', 'Gear write is rate-limited. Try again shortly.', null, { 'retry-after': r429 }); }
      var s = load();
      var mine = s.lists.filter(function (l) { return l.character_id === charId; });
      if (mock() === 'limit' || mine.length >= MAX) return err(409, 'list_limit_reached', 'You already have ' + MAX + ' lists for this character.', { details: { limit: MAX } });
      if (!body || !validName(body.name)) return err(400, 'validation_error', 'Check the highlighted fields.', { errors: { name: 'invalid_name' } });
      var vis = body.visibility === 'guild' ? 'guild' : 'private';
      var tp = body.type === 'leveling' ? 'leveling' : 'max_level';
      if (body.type != null && body.type !== 'leveling' && body.type !== 'max_level') return err(400, 'validation_error', 'Invalid list.', { errors: { type: 'invalid_type' } });
      var lr = levelRules(tp, body.until_level, LEVEL[charId] || 0);
      if (lr) return err(400, 'validation_error', 'Invalid list.', { errors: lr });
      // web#48: create accepts slots (platform create: slot -> item_id|null); item_not_forever rejects the whole create.
      var sl = body.slots == null ? {} : body.slots;
      if (typeof sl !== 'object' || Array.isArray(sl)) return err(400, 'validation_error', 'Invalid slots.', { errors: { slots: 'invalid_slots' } });
      for (var sk in sl) {
        if (SLOTS.indexOf(sk) < 0) return err(400, 'validation_error', 'Unknown slot: ' + sk + '.', { errors: { slot: 'invalid_slot' } });
        if (sl[sk] != null && NOT_FOREVER.indexOf(sl[sk]) >= 0) return err(400, 'validation_error', 'Item is not in the Forever catalog.', { errors: { item_id: 'item_not_forever' } });
      }
      var l = { id: uid(), character_id: charId, owner_user_id: OWNER, name: body.name.trim(), visibility: vis, type: tp,
        until_level: tp === 'leveling' ? body.until_level : null, role_spec: body.role_spec || null, outgrown: false,
        version: 0, updated_at: now(), edited_at: now(), updated_source: 'web', items: [] };
      s.lists.push(l); s.events[l.id] = [];
      bump(s, l, 'GearListCreated', { name: l.name, character_id: charId, visibility: vis });
      Object.keys(sl).forEach(function (k) { if (sl[k] != null) { l.items.push(item(k, sl[k], 1)); bump(s, l, 'GearItemAdded', { slot: k, item_id: sl[k], priority: 1, note: null }); l.items[l.items.length - 1]._v = l.version; } });
      save(s);
      return res(201, strip(l), etag(l));
    },
    get: function (id) {
      var g = guard(false); if (g) return g;
      var s = load(), l = find(s, id);
      return l ? res(200, strip(l), etag(l)) : err(404, 'not_found', 'List not found.');
    },
    patch: function (id, body, version) {
      var g = guard(true); if (g) return g;
      var s = load(), l = find(s, id); if (!l) return err(404, 'not_found', 'List not found.');
      var c = ifMatch(s, l, version); if (c) return c;
      if (body.name != null && !validName(body.name)) return err(400, 'validation_error', 'Check the highlighted fields.', { errors: { name: 'invalid_name' } });
      if (body.visibility != null && SPEC.visibility.indexOf(body.visibility) < 0) return err(400, 'validation_error', 'Check the highlighted fields.', { errors: { visibility: 'invalid_visibility' } });
      var pl = {};
      if (body.name != null && body.name.trim() !== l.name) { l.name = body.name.trim(); pl.name = l.name; }
      if (body.visibility && body.visibility !== l.visibility) { l.visibility = body.visibility; pl.visibility = l.visibility; }
      if (pl.name || pl.visibility) bump(s, l, 'GearListRenamed', pl);
      save(s); return res(200, strip(l), etag(l));
    },
    del: function (id, version) {
      var g = guard(true); if (g) return g;
      var s = load(), l = find(s, id); if (!l) return err(404, 'not_found', 'List not found.');
      var c = ifMatch(s, l, version); if (c) return c;
      bump(s, l, 'GearListDeleted', {});
      s.lists = s.lists.filter(function (x) { return x !== l; }); save(s);
      return res(204, null);
    },
    ops: function (id, body) {
      var g = guard(true); if (g) return g;
      var s = load(), l = find(s, id); if (!l) return err(404, 'not_found', 'List not found.');
      // ?mock=ratelimit: the first N op requests (?rl=N, default 1) get 429 Retry-After 3.
      var rlN = parseInt(new URLSearchParams(location.search).get('rl'), 10) || 1;
      if (mock() === 'ratelimit' && (s.flags.rl || 0) < rlN) { s.flags.rl = (s.flags.rl || 0) + 1; save(s); return err(429, 'rate_limited', 'Too many changes.', null, { 'retry-after': '3' }); }
      // ?mock=csrf: the first write gets 403 csrf_failed (client refreshes the session and retries once).
      if (mock() === 'csrf' && !s.flags.csrf) { s.flags.csrf = 1; save(s); return err(403, 'csrf_failed', 'Security check failed.'); }
      // ?mock=ops422: ops rejected as a whole (non-200), so the client reports how many changes were dropped.
      if (mock() === 'ops422') return err(422, 'validation_failed', 'The request was invalid.');
      (window.__glOpsLog = window.__glOpsLog || []).push(JSON.parse(JSON.stringify(ops0(body))));
      (window.__glOpsLists = window.__glOpsLists || []).push(id);
      var ops = body && Array.isArray(body.ops) ? body.ops : [];
      if (ops.length < 1 || ops.length > L.ops_per_request) return err(400, 'validation_error', 'Send 1–200 ops.');
      var out = { applied: [], duplicates: [], conflicts: [], ignored: [] }, bad = false;
      function reject(o, reason, msg) {
        bump(s, l, 'GearOpRejected', { op_id: o.op_id, reason: reason, winning_seq: l.version, slot: o.slot, item_id: o.item_id });
        out.conflicts.push({ op_id: o.op_id, reason: reason, message: msg || reason, winning_version: l.version });
      }
      ops.forEach(function (o) {
        if (s.seen_ops[o.op_id]) { out.duplicates.push(o.op_id); return; }
        var slotOp = o.type === 'set_slot' || o.type === 'clear_slot';  // platform#46 (armory model), used by the CSGEAR1 import
        if ((SPEC.op_types.indexOf(o.type) < 0 && !slotOp) || SLOTS.indexOf(o.slot) < 0 || (o.type !== 'clear_slot' && !(o.item_id >= 1 && o.item_id === Math.floor(o.item_id))) || typeof o.base_version !== 'number') {  // client source is soft-ignored, as on platform /ops
          bad = true; return;
        }
        if (mock() === 'conflict' && !s.flags.cf) { s.flags.cf = 1; reject(o, 'superseded_by_newer_edit'); return; }
        if (slotOp) {
          var cur = l.items.filter(function (x) { return x.slot === o.slot; });
          if (cur.some(function (x) { return (x._v || 0) > o.base_version; })) { reject(o, 'stale_base_version'); return; }
          if (o.type === 'set_slot' && NOT_FOREVER.indexOf(o.item_id) >= 0) { reject(o, 'item_not_forever', 'Not a WoW Forever item.'); return; }
          var noop = o.type === 'clear_slot' ? !cur.length : cur.length === 1 && cur[0].item_id === o.item_id;
          s.seen_ops[o.op_id] = 1; out.applied.push(o.op_id);
          if (noop) return;
          l.items = l.items.filter(function (x) { return x.slot !== o.slot; });
          cur.forEach(function (x) { bump(s, l, 'GearItemRemoved', { slot: x.slot, item_id: x.item_id }); });
          if (o.type === 'set_slot') { var ni = item(o.slot, o.item_id, 1); l.items.push(ni); bump(s, l, 'GearItemAdded', { slot: o.slot, item_id: o.item_id, priority: 1, note: null }); ni._v = l.version; }
          return;
        }
        var idx = -1; l.items.forEach(function (it, i) { if (it.slot === o.slot && it.item_id === o.item_id) idx = i; });
        var it = idx >= 0 ? l.items[idx] : null;
        if (o.type !== 'add_item' && !it) { reject(o, 'item_removed'); return; }
        // Same item edited after the version this op was based on -> the older op loses.
        if (it && (it._v || 0) > o.base_version) { reject(o, 'stale_base_version'); return; }
        if (o.type === 'add_item') {
          if (NOT_FOREVER.indexOf(o.item_id) >= 0) { reject(o, 'item_not_forever', 'Not a WoW Forever item.'); return; }
          if (it) { reject(o, 'superseded_by_newer_edit'); return; }
          if (l.items.length >= L.items_per_list) { reject(o, 'list_items_limit', 'A list holds at most ' + L.items_per_list + ' items.'); return; }
          var pr = Math.max(L.priority_min, Math.min(L.priority_max, Math.floor(o.priority) || 1));
          var note = o.note ? String(o.note).slice(0, L.note_max) : null;
          l.items.push(item(o.slot, o.item_id, pr, note));
          bump(s, l, 'GearItemAdded', { slot: o.slot, item_id: o.item_id, priority: pr, note: note });
        } else if (o.type === 'remove_item') {
          l.items.splice(idx, 1); bump(s, l, 'GearItemRemoved', { slot: o.slot, item_id: o.item_id });
        } else if (o.type === 'reprioritize_item') {
          var fp = it.priority; it.priority = Math.max(L.priority_min, Math.min(L.priority_max, Math.floor(o.priority) || 1));
          bump(s, l, 'GearItemReprioritized', { slot: o.slot, item_id: o.item_id, from_priority: fp, priority: it.priority });
        } else if (o.type === 'mark_obtained') {
          it.obtained = o.obtained !== false; it.obtained_at = it.obtained ? now() : null;
          bump(s, l, 'GearItemObtained', { slot: o.slot, item_id: o.item_id, obtained: it.obtained, run_id: null });
        }
        var touched = o.type === 'add_item' ? l.items[l.items.length - 1] : it;
        if (touched && o.type !== 'remove_item') touched._v = l.version;
        s.seen_ops[o.op_id] = 1; out.applied.push(o.op_id);
      });
      if (bad) return err(400, 'validation_error', 'Invalid op.');
      save(s);
      out.version = l.version; out.list = strip(l);
      return res(200, out, etag(l));
    },
    events: function (id, after, limit) {
      var g = guard(false); if (g) return g;
      if (mock() === 'history403') return err(403, 'forbidden', 'You can\u2019t view this list\u2019s history.');
      var s = load(), l = find(s, id); if (!l) return err(404, 'not_found', 'List not found.');
      var lim = Math.max(1, Math.min(100, limit || 25));
      var all = (s.events[id] || []).filter(function (e) { return e.version > (after || 0); });
      var ev = all.slice(0, lim);
      return res(200, { items: clone(ev), next_cursor: all.length > lim ? ev[ev.length - 1].version : null });
    }
  };
})();
