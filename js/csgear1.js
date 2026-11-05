/**
 * web#48 CSGEAR1 import (gear-list schema v1, groom/gear-list-schema.md; addon#26 morning check).
 * decode(): envelope + payload validation (§8), whole string rejected with one reason code, nothing applied.
 * plan(): per set, id -> existing list (last-edited-wins on edited_at vs updated_at), id null -> create with slots.
 * apply(): POST /characters/{id}/gear-lists, POST /gear-lists/{id}/ops (set_slot / clear_slot / remove_item, fresh op_id + base_version),
 * DELETE /gear-lists/{id} for deleted_lists; returns the local_id -> id mapping. encode() builds the string to paste back in game.
 * No import endpoint (schema §7). Strings are only ever rendered as text.
 */
(function () {
  'use strict';
  var PREFIX = 'CSGEAR1:', MAX_PASTE = 24 * 1024, MAX_JSON = 16 * 1024, MAX_SETS = 20, MAX_LEVEL = 60, INT_MAX = 2147483647;
  // Order matches addon GearSlots.BY_INV (addon#62). ammo is wire slot 20.
  var SLOTS = ['head', 'neck', 'shoulder', 'shirt', 'chest', 'waist', 'legs', 'feet', 'wrist', 'hands', 'finger1', 'finger2', 'trinket1', 'trinket2', 'back', 'main_hand', 'off_hand', 'ranged', 'tabard', 'ammo'];
  var REGIONS = ['us', 'eu', 'kr', 'tw'];
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, LOCAL_RE = /^[0-9a-f]{8}$/, NAME_RE = /^[A-Za-z0-9 _\-\u00C0-\u024F']{1,48}$/;
  var MOCK_ID_RE = /^gl_[a-z0-9_]{1,40}$/;  // in-browser mock ids (USE_MOCK_GEAR_LISTS only)
  var CTRL = /[\u0000-\u001f\u007f]/;
  var MSG = {
    bad_prefix: 'That isn\u2019t a CSGEAR1 gear string. In game, use /cs export and copy the line that starts with CSGEAR1:.',
    too_large: 'That gear string is too large.',
    bad_checksum: 'That gear string is damaged or incomplete (checksum mismatch). Copy it again from the game.',
    bad_json: 'That gear string could not be read. Copy it again from the game.',
    schema: 'That gear string uses a version or field this site doesn\u2019t support.',
    character_mismatch: 'That gear string is for a different character.',
    validation: 'A gear set in that string breaks the gear-set rules.',
    item_not_forever: 'An item in that string isn\u2019t a WoW Forever item.'
  };
  function fnv1a(bytes) { var h = 0x811c9dc5; for (var i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  function utf8(s) { return new TextEncoder().encode(s); }
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = sortKeys(v[k]); }); return o; }
    return v;
  }
  function encode(payload) {
    var json = JSON.stringify(sortKeys(payload)), b = utf8(json), bin = '';
    for (var i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return PREFIX + btoa(bin) + '|c=' + fnv1a(b);
  }
  function fail(code, detail) { return { ok: false, code: code, message: MSG[code] + (detail ? ' (' + detail + ')' : ''), detail: detail || '' }; }
  function isInt(n, lo, hi) { return typeof n === 'number' && Math.floor(n) === n && n >= lo && n <= hi; }
  function str(v, max, allowEmpty) { return typeof v === 'string' && !CTRL.test(v) && v.trim().length <= max && (allowEmpty || v.trim().length > 0); }
  function idOk(id) { return id === null || (typeof id === 'string' && (UUID_RE.test(id) || (window.CS_CONFIG && window.CS_CONFIG.USE_MOCK_GEAR_LISTS && MOCK_ID_RE.test(id)))); }
  /** Validates one set; returns '' or a short reason. Level vs the character is checked separately (levelCheck). */
  function badSet(s, i) {
    var at = 'lists[' + i + ']';
    if (!s || typeof s !== 'object' || Array.isArray(s)) return at;
    if (!idOk(s.id === undefined ? null : s.id)) return at + '.id';
    if (typeof s.local_id !== 'string' || !LOCAL_RE.test(s.local_id)) return at + '.local_id';
    if (!str(s.name, 64)) return at + '.name';
    if (s.type !== 'leveling' && s.type !== 'max_level') return at + '.type';
    if (s.type === 'leveling' && !isInt(s.until_level, 1, MAX_LEVEL)) return at + '.until_level';
    if (s.type === 'max_level' && s.until_level != null) return at + '.until_level';
    if (s.role_spec != null && !str(s.role_spec, 32, true)) return at + '.role_spec';
    if (s.edited_at != null && (typeof s.edited_at !== 'string' || isNaN(Date.parse(s.edited_at)))) return at + '.edited_at';
    if (s.edited_in != null && s.edited_in !== 'game' && s.edited_in !== 'web') return at + '.edited_in';
    var sl = s.slots == null ? {} : s.slots;
    if (typeof sl !== 'object' || Array.isArray(sl)) return at + '.slots';
    for (var k in sl) { if (SLOTS.indexOf(k) < 0) return at + '.slots.' + k; if (sl[k] !== null && !isInt(sl[k], 1, INT_MAX)) return at + '.slots.' + k; }
    var rm = s.removes == null ? [] : s.removes;
    if (!Array.isArray(rm) || rm.length > SLOTS.length) return at + '.removes';
    for (var j = 0; j < rm.length; j++) {
      var o = rm[j];
      if (!o || SLOTS.indexOf(o.slot) < 0 || (o.op !== 'clear_slot' && o.op !== 'remove_item') || (o.op === 'remove_item' && !isInt(o.item_id, 1, INT_MAX))) return at + '.removes[' + j + ']';
    }
    return '';
  }
  /** Envelope + payload. Returns {ok:true, payload} or {ok:false, code, message}. */
  function decode(raw) {
    var s = typeof raw === 'string' ? raw.trim() : '';
    if (s.length > MAX_PASTE) return fail('too_large');
    // A whole /cs export box may be pasted: pick the CSGEAR1 line, ignore CSRUN1.
    var line = s.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.indexOf(PREFIX) === 0; })[0];
    if (!line) return fail('bad_prefix');
    var m = /^CSGEAR1:([A-Za-z0-9+/]+={0,2})\|c=([0-9a-f]{8})$/.exec(line);
    if (!m) return fail(/\|c=/.test(line) ? 'bad_json' : 'bad_checksum', /\|c=/.test(line) ? 'base64' : 'no checksum');
    var bin; try { bin = atob(m[1]); } catch (e) { return fail('bad_json', 'base64'); }
    if (bin.length > MAX_JSON) return fail('too_large');
    var bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (fnv1a(bytes) !== m[2]) return fail('bad_checksum');
    var p; try { p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch (e) { return fail('bad_json'); }
    if (!p || typeof p !== 'object' || Array.isArray(p)) return fail('bad_json');
    if (p.schema_version !== 1 || p.game_version !== 'forever') return fail('schema', 'schema_version/game_version');
    if (p.region != null && REGIONS.indexOf(p.region) < 0) return fail('schema', 'region');
    if (typeof p.realm !== 'string' || !NAME_RE.test(p.realm) || typeof p.character !== 'string' || !NAME_RE.test(p.character)) return fail('schema', 'realm/character');
    if (p.character_id != null && (typeof p.character_id !== 'string' || CTRL.test(p.character_id) || p.character_id.length > 64)) return fail('schema', 'character_id');
    var lists = p.lists == null ? [] : p.lists;
    if (!Array.isArray(lists) || lists.length > MAX_SETS) return fail('validation', 'at most ' + MAX_SETS + ' sets');
    var seenL = {}, seenI = {};
    for (var j = 0; j < lists.length; j++) {
      var b = badSet(lists[j], j); if (b) return fail('validation', b);
      if (seenL[lists[j].local_id]) return fail('validation', 'duplicate local_id ' + lists[j].local_id); seenL[lists[j].local_id] = 1;
      if (lists[j].id) { if (seenI[lists[j].id]) return fail('validation', 'duplicate id'); seenI[lists[j].id] = 1; }
    }
    var del = p.deleted_lists == null ? [] : p.deleted_lists;
    if (!Array.isArray(del) || del.length > 100 || del.some(function (d) { return !d || (d.id == null && d.local_id == null) || (d.id != null && !idOk(d.id)) || (d.local_id != null && !LOCAL_RE.test(d.local_id)); })) return fail('validation', 'deleted_lists');
    p.lists = lists; p.deleted_lists = del;
    return { ok: true, payload: p };
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s'_-]/g, ''); }
  /** web: character_id must be this character, else realm + name must match it (schema §7/§8). */
  function matchCharacter(p, c) {
    if (!c) return false;
    if (p.character_id != null) return p.character_id === c.id;
    return norm(p.character) === norm(c.character_name) && (!c.realm || norm(p.realm) === norm(c.realm));
  }
  /** Same rules as the platform create (validateSetLevelRules) via CSGearSetRules; under 60 may create max_level. */
  function levelCheck(set, c) {
    var R = window.CSGearSetRules, e = R.validate({ name: set.name, type: set.type, until_level: set.until_level, role_spec: set.role_spec }, c);
    var k = Object.keys(e)[0]; return k ? { field: k, code: e[k], message: R.message(e[k]) } : null;
  }
  function slotOps(set) {
    var ops = [], taken = {}, sl = set.slots || {};
    SLOTS.forEach(function (k) { if (sl[k] != null) { ops.push({ type: 'set_slot', slot: k, item_id: sl[k] }); taken[k] = 1; } });  // null/omitted slot = no change (no silent wipe)
    (set.removes || []).forEach(function (o) {
      if (taken[o.slot]) return;  // one op per slot per batch; a set_slot already replaces the slot
      taken[o.slot] = 1;
      ops.push(o.op === 'clear_slot' ? { type: 'clear_slot', slot: o.slot } : { type: 'remove_item', slot: o.slot, item_id: o.item_id });
    });
    return ops;
  }
  /**
   * Builds the plan. server = current lists for the character. Returns {ok:false, code, message} when the whole string is rejected,
   * else {ok:true, creates, updates, skipped, deletes}.
   */
  function plan(p, c, server) {
    if (!matchCharacter(p, c)) return fail('character_mismatch', p.realm + ' / ' + p.character);
    var byId = {}; (server || []).forEach(function (l) { byId[l.id] = l; });
    var out = { ok: true, creates: [], updates: [], skipped: [], deletes: [] };
    for (var i = 0; i < p.lists.length; i++) {
      var s = p.lists[i];
      if (!s.id) {
        var lc = levelCheck(s, c);
        if (lc) return fail('validation', s.name + ': ' + lc.message);
        var slots = {}; Object.keys(s.slots || {}).forEach(function (k) { if (s.slots[k] != null) slots[k] = s.slots[k]; });
        out.creates.push({ local_id: s.local_id, body: { name: s.name.trim(), type: s.type, until_level: s.type === 'leveling' ? s.until_level : null, role_spec: s.role_spec ? s.role_spec.trim() || null : null, slots: slots, visibility: 'private' } });
        continue;
      }
      var l = byId[s.id];
      if (!l) { out.skipped.push({ local_id: s.local_id, id: s.id, name: s.name, reason: 'not_found' }); continue; }
      var srv = Date.parse(l.updated_at || l.edited_at || ''), mine = Date.parse(s.edited_at || '');
      if (!isNaN(srv) && !isNaN(mine) && srv > mine) { out.skipped.push({ local_id: s.local_id, id: s.id, name: l.name, reason: 'site_newer' }); continue; }
      var ops = slotOps(s);
      out.updates.push({ local_id: s.local_id, id: s.id, name: l.name, ops: ops });
    }
    p.deleted_lists.forEach(function (d) { if (d.id && byId[d.id]) out.deletes.push(d.id); });  // {local_id} only = never synced, nothing to delete
    return out;
  }
  /** Runs the plan through CSGearListsApi sequentially. Resolves {mapping, results, failures, status}; status = first auth/network status that stopped it. */
  function apply(api, charId, pl) {
    var mapping = {}, results = [], failures = [], stop = null;
    function code(r) { return (r && r.body && r.body.error && r.body.error.code) || ''; }
    // web#50: 429 during an import pauses for Retry-After (1..30 s) and retries the same call, up to 2 times.
    function call(f, n) {
      return f().then(function (r) {
        if (!r || r.status !== 429 || (n || 0) >= 2) return r;
        var ra = parseInt(r.headers && r.headers['retry-after'], 10); ra = ra > 0 ? Math.min(ra, 30) : 2;
        return new Promise(function (ok) { setTimeout(ok, ra * 1000); }).then(function () { return call(f, (n || 0) + 1); });
      });
    }
    function fatal(r) { return r.status === 0 || r.status === 401 || r.status >= 500 || (r.status === 403 && code(r) === 'csrf_failed'); }
    var steps = [];
    pl.creates.forEach(function (cr) {
      steps.push(function () {
        return call(function () { return api.create(charId, cr.body); }).then(function (r) {
          if (fatal(r)) { stop = r; return; }
          if (!r.ok) { var fc = window.CSGearSetRules.fieldCodes(r), k = Object.keys(fc)[0]; failures.push({ local_id: cr.local_id, name: cr.body.name, status: r.status, code: code(r) || (k ? fc[k] : ''), message: k ? window.CSGearSetRules.message(fc[k]) : ((r.body && r.body.error && r.body.error.message) || 'Not created.') }); return; }
          mapping[cr.local_id] = r.body.id; results.push({ local_id: cr.local_id, id: r.body.id, name: r.body.name, action: 'created' });
        });
      });
    });
    pl.updates.forEach(function (u) {
      steps.push(function () {
        if (!u.ops.length) { mapping[u.local_id] = u.id; results.push({ local_id: u.local_id, id: u.id, name: u.name, action: 'unchanged' }); return Promise.resolve(); }
        return api.get(u.id).then(function (g) {
          if (fatal(g)) { stop = g; return; }
          if (!g.ok) { failures.push({ local_id: u.local_id, name: u.name, status: g.status, code: code(g), message: 'Could not read the set.' }); return; }
          var v = g.body.version;
          var opsBody = u.ops.map(function (o) { var x = { op_id: api.opId(), type: o.type, slot: o.slot, base_version: v }; if (o.item_id != null) x.item_id = o.item_id; return x; });
          return call(function () { return api.ops(u.id, opsBody); }).then(function (r) {
            if (fatal(r)) { stop = r; return; }
            if (!r.ok) { failures.push({ local_id: u.local_id, name: u.name, status: r.status, code: code(r), message: 'Changes not saved.' }); return; }
            mapping[u.local_id] = u.id;
            var cf = (r.body && r.body.conflicts) || [];
            results.push({ local_id: u.local_id, id: u.id, name: u.name, action: 'updated', applied: (r.body.applied || []).length, conflicts: cf.map(function (x) { return x.reason; }) });
          });
        });
      });
    });
    pl.deletes.forEach(function (id) {
      steps.push(function () {
        return api.get(id).then(function (g) {
          if (fatal(g)) { stop = g; return; }
          if (g.status === 404) return;
          if (!g.ok) { failures.push({ id: id, status: g.status, code: code(g), message: 'Could not delete.' }); return; }
          return call(function () { return api.del(id, g.body.version); }).then(function (r) { if (fatal(r)) { stop = r; return; } if (r.ok) results.push({ id: id, name: g.body.name, action: 'deleted' }); else failures.push({ id: id, name: g.body.name, status: r.status, code: code(r), message: 'Could not delete.' }); });
        });
      });
    });
    return steps.reduce(function (pr, f) { return pr.then(function () { return stop ? null : f(); }); }, Promise.resolve()).then(function () {
      return { mapping: mapping, results: results, failures: failures, stopped: stop };
    });
  }
  function localFor(id) { return fnv1a(utf8(String(id))); }
  /**
   * Released addon v0.3.5 rejects ammo. A version after 0.3.5 (addon#62, slot 20) may receive it.
   * TODO(addon#62): CSGEAR1 has no version handshake, so callers pass no addon version and replies omit ammo.
   */
  function addonSupportsAmmo(v) {
    if (v == null || v === '') return false;
    var p = String(v).replace(/^v/i, '').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    var maj = p[0] || 0, min = p[1] || 0, pat = p[2] || 0;
    if (maj !== 0) return maj > 0;
    if (min !== 3) return min > 3;
    return pat > 5;
  }
  /** Import string for the game (§7): server lists as CSGEAR1 sets, local_id echoed via mapping, no equipped. */
  function reply(p, c, lists, mapping, addonVersion) {
    var allowAmmo = addonSupportsAmmo(addonVersion);
    var back = {}; Object.keys(mapping || {}).forEach(function (lid) { back[mapping[lid]] = lid; });
    return encode({
      schema_version: 1, game_version: 'forever', region: p && p.region || c.region || 'us', realm: p ? p.realm : (c.realm || ''), character: p ? p.character : c.character_name,
      character_id: c.id, exported_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), deleted_lists: [],
      lists: lists.map(function (l) {
        var slots = {};
        (l.items || []).forEach(function (i) {
          if (!allowAmmo && i.slot === 'ammo') return;  // v0.3.5 rejects ammo; see addon#62
          if (slots[i.slot] == null) slots[i.slot] = i.item_id;
        });
        return { id: l.id, local_id: back[l.id] || localFor(l.id), name: l.name, type: l.type === 'leveling' ? 'leveling' : 'max_level', until_level: l.type === 'leveling' ? l.until_level : null,
          role_spec: l.role_spec || null, slots: slots, removes: [], edited_at: l.updated_at || null, edited_in: 'web' };
      })
    });
  }
  window.CSGear1 = { PREFIX: PREFIX, SLOTS: SLOTS, MSG: MSG, fnv1a: fnv1a, encode: encode, decode: decode, plan: plan, apply: apply, reply: reply, matchCharacter: matchCharacter };
})();
