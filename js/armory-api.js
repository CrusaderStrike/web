/**
 * web#42 armory client: display toggles, gear sets, per-slot autosave, Forever items. Resolves { status, ok, body, headers }.
 * CS_CONFIG.USE_MOCK_ARMORY = true -> js/armory-mock.js; false -> real API (snake_case, cs_session cookie + X-CSRF-Token).
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG, P = cfg.ARMORY_PATHS, M = window.CSArmoryMock, m = cfg.USE_MOCK_ARMORY, csrf = null;
  function url(t, a, b) { return cfg.API_BASE + t.replace('{id}', encodeURIComponent(a)).replace('{slot}', encodeURIComponent(b || '')); }
  function real(method, u, body, ifMatch) {
    var h = { Accept: 'application/json' };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (method !== 'GET' && csrf) h['X-CSRF-Token'] = csrf;
    if (ifMatch) h['If-Match'] = ifMatch;
    return fetch(u, { method: method, credentials: 'include', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined }).then(function (r) {
      var hd = { 'retry-after': r.headers.get('Retry-After') || '', etag: r.headers.get('ETag') || '' };
      if (r.status === 204) return { status: 204, ok: true, body: null, headers: hd };
      return r.json().catch(function () { return null; }).then(function (b) { return { status: r.status, ok: r.ok, body: b, headers: hd }; });
    }, function () { return { status: 0, ok: false, body: null, headers: {} }; });
  }
  function qs(o) { return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ''; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  window.CSArmoryApi = {
    mock: m,
    session: function () { return window.CSProfileApi.session().then(function (r) { if (r.ok && r.body) csrf = r.body.csrf_token || null; return r; }); },
    characters: function () { return window.CSProfileApi.characters().then(function (r) { return m ? M.overlay(r) : r; }); },
    setDisplayed: function (c, v) { return m ? M.setDisplayed(c, v) : real('PATCH', url(P.CHARACTER, c.id), { displayed: v }); },
    sets: function (c) { return m ? M.sets(c) : real('GET', url(P.SETS, c.id)); },
    create: function (c, b) { return m ? M.create(c, b) : real('POST', url(P.SETS, c.id), b); },
    get: function (id, c) { return m ? M.get(id, c) : real('GET', url(P.SET, id)); },
    putSlot: function (id, slot, itemId, etag) { return m ? M.putSlot(id, slot, itemId, etag) : real('PUT', url(P.SLOT, id, slot), { item_id: itemId }, etag); },
    items: function (q) { return m ? M.items(q) : real('GET', cfg.API_BASE + P.ITEMS + '?' + qs(q)); },
    item: function (iid) { return m ? M.item(iid) : real('GET', url(P.ITEM, iid)); }
  };
})();
