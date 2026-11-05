/**
 * web#42 armory client. Every call resolves { status, ok, body, headers }.
 * Contract: platform main openapi/v1.yaml + src/routes/{profile,gear-lists}.ts, and the gear-list schema v1.
 * Only shipped routes are used:
 *   display  -> PUT  /api/v1/me/characters/selection {main_id, alt_ids}   (displayed = main + alts)
 *   sets     -> GET/POST /api/v1/characters/{id}/gear-lists, GET /api/v1/gear-lists/{id}
 *   slots    -> POST /api/v1/gear-lists/{id}/ops [set_slot {slot, item_id} | clear_slot {slot}] with op_id (uuid v4) + base_version
 *   items    -> GET /api/v1/items, /api/v1/items/{id}
 * A list holds items[] {slot, item_id, priority}; the armory shows one item per slot (priority 1, else the first)
 * and normalizes each list to add a 19-key `slots` map.
 * CS_CONFIG.USE_MOCK_ARMORY = true -> js/armory-mock.js (same wire shapes).
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG, P = cfg.ARMORY_PATHS, m = cfg.USE_MOCK_ARMORY, csrf = null;
  function M() { return window.CSArmoryMock; }
  function url(t, a) { return cfg.API_BASE + t.replace('{id}', encodeURIComponent(a)); }
  function real(method, u, body) {
    var h = { Accept: 'application/json' };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (method !== 'GET' && csrf) h['X-CSRF-Token'] = csrf;
    return fetch(u, { method: method, credentials: 'include', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined }).then(function (r) {
      var hd = { 'retry-after': r.headers.get('Retry-After') || '', etag: r.headers.get('ETag') || '' };
      if (r.status === 204) return { status: 204, ok: true, body: null, headers: hd };
      return r.json().catch(function () { return null; }).then(function (b) { return { status: r.status, ok: r.ok, body: b, headers: hd }; });
    }, function () { return { status: 0, ok: false, body: null, headers: {} }; });
  }
  function call(name, args, method, u, body) { return m ? M()[name].apply(null, args) : real(method, u, body); }
  function qs(o) { return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ''; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  /** One item per slot: lowest priority wins (priority 1), ties -> first in list order. */
  function slotsOf(items) {
    var s = {}, best = {};
    cfg.ARMORY_SLOTS.forEach(function (k) { s[k] = null; });
    (items || []).forEach(function (i) {
      if (!i || !(i.slot in s)) return;
      var pr = typeof i.priority === 'number' ? i.priority : 1e9;
      if (best[i.slot] == null || pr < best[i.slot]) { best[i.slot] = pr; s[i.slot] = i.item_id; }
    });
    return s;
  }
  function norm(l) { if (l && typeof l === 'object') { l.items = Array.isArray(l.items) ? l.items : []; l.slots = slotsOf(l.items); } return l; }
  function normR(r) { if (r.ok && r.body) norm(r.body); return r; }
  /** GET /me/characters -> {characters, selection}; displayed = selection main or alt. */
  /** platform#44: an empty selection may come back as {main_id: null, alt_ids: [], updated_at: null}. Never yields Invalid Date. */
  function normSel(sel) {
    if (!sel || typeof sel !== 'object') return null;
    var d = sel.updated_at ? new Date(sel.updated_at) : null;
    sel.alt_ids = Array.isArray(sel.alt_ids) ? sel.alt_ids.filter(Boolean) : [];
    sel.main_id = sel.main_id || null;
    sel.updated_at = d && !isNaN(d) ? sel.updated_at : null;
    return sel;
  }
  function applySel(body) {
    var sel = body ? (body.selection = normSel(body.selection)) : null, ids = sel ? [sel.main_id].concat(sel.alt_ids).filter(Boolean) : [];
    (body && body.characters || []).forEach(function (c) { c.displayed = ids.indexOf(c.id) >= 0; });
    return body;
  }
  var lastSel = null;
  window.CSArmoryApi = {
    mock: m, uuid: uuid, slotsOf: slotsOf, normSel: normSel,
    /** 'Saved <local time>' for a selection, or '' when updated_at is null/invalid. */
    selectionTime: function (sel) { var s = normSel(sel); return s && s.updated_at ? new Date(s.updated_at).toLocaleString() : ''; },
    session: function () { return window.CSProfileApi.session().then(function (r) { if (r.ok && r.body) csrf = r.body.csrf_token || null; return r; }); },
    characters: function () {
      return call('characters', [], 'GET', cfg.API_BASE + cfg.PROFILE_PATHS.CHARACTERS).then(function (r) {
        if (r.ok && r.body) { applySel(r.body); lastSel = r.body.selection; }
        return r;
      });
    },
    /**
     * Display toggle via the shipped PUT /me/characters/selection {main_id, alt_ids}. The server requires a main,
     * so at least one live character must stay displayed (400 below without a request). Keeps the current main
     * when it stays displayed; otherwise the first displayed character becomes main.
     */
    setDisplayed: function (c, v, all) {
      var ids = all.filter(function (x) { return x.id === c.id ? v : x.displayed && !x.stale; }).map(function (x) { return x.id; });
      if (!ids.length) return Promise.resolve({ status: 400, ok: false, headers: {}, body: { errors: { main_id: 'Keep at least one character displayed.' } }, local: 'last_displayed' });
      var main = lastSel && ids.indexOf(lastSel.main_id) >= 0 ? lastSel.main_id : ids[0];
      var b = { main_id: main, alt_ids: ids.filter(function (i) { return i !== main; }) };
      return call('saveSelection', [b], 'PUT', cfg.API_BASE + cfg.PROFILE_PATHS.SELECTION, b).then(function (r) {
        if (r.ok) lastSel = normSel(r.body && r.body.selection) || { main_id: b.main_id, alt_ids: b.alt_ids, updated_at: null };
        return r;
      });
    },
    sets: function (c) { return call('sets', [c], 'GET', url(P.SETS, c.id)).then(function (r) { if (r.ok && r.body && Array.isArray(r.body.items)) r.body.items.forEach(norm); return r; }); },
    create: function (c, b) { return call('create', [c, b], 'POST', url(P.SETS, c.id), b).then(normR); },
    get: function (id) { return call('get', [id], 'GET', url(P.SET, id)).then(normR); },
    /**
     * Sets (itemId) or clears (null) one slot on list `l` as one ops batch at base_version = l.version:
     * one set_slot {slot, item_id} / clear_slot {slot} op (platform#45/#46); the server replaces/clears the whole slot.
     * Resolves the raw response; body.list is normalized. body.conflicts[] lists rejected ops.
     */
    setSlot: function (l, slot, itemId) {
      // One op per slot per batch. No priority/note/obtained on these ops. Clearing an already empty slot sends nothing.
      var inSlot = (l.items || []).filter(function (i) { return i.slot === slot; }), ops;
      if (itemId != null) ops = [{ op_id: uuid(), type: 'set_slot', slot: slot, item_id: itemId, base_version: l.version }];
      else ops = inSlot.length ? [{ op_id: uuid(), type: 'clear_slot', slot: slot, base_version: l.version }] : [];
      if (!ops.length) return Promise.resolve({ status: 200, ok: true, headers: {}, body: { version: l.version, applied: [], duplicates: [], conflicts: [], list: l } });
      var b = { ops: ops };
      return call('ops', [l.id, b], 'POST', url(P.OPS, l.id), b).then(function (r) { if (r.ok && r.body && r.body.list) norm(r.body.list); return r; });
    },
    items: function (q) { return call('items', [q], 'GET', cfg.API_BASE + P.ITEMS + '?' + qs(q)); },
    item: function (iid) { return call('item', [iid], 'GET', url(P.ITEM, iid)); }
  };
})();
