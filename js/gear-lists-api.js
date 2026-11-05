/**
 * web#18 gear-lists client (platform#17, final spec pending). Resolves { status, ok, body, headers }.
 * Flip CS_CONFIG.USE_MOCK_GEAR_LISTS for the real API. Mutations send X-CSRF-Token from GET /auth/session.
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG, P = cfg.GEAR_LISTS_PATHS, M = window.CSGearListsMock, csrf = null;
  function path(t, id) { return cfg.API_BASE + t.replace('{id}', encodeURIComponent(id)); }
  function real(method, url, body, ifMatch) {
    var h = { Accept: 'application/json' };
    if (body) h['Content-Type'] = 'application/json';
    if (method !== 'GET' && csrf) h['X-CSRF-Token'] = csrf;
    if (ifMatch != null) h['If-Match'] = '"v' + ifMatch + '"';
    return fetch(url, { method: method, credentials: 'include', headers: h, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      var hd = { 'retry-after': r.headers.get('Retry-After') || '', etag: r.headers.get('ETag') || '' };
      if (r.status === 204) return { status: 204, ok: true, body: null, headers: hd };
      return r.json().catch(function () { return null; }).then(function (b) { return { status: r.status, ok: r.ok, body: b, headers: hd }; });
    }, function () { return { status: 0, ok: false, body: null, headers: {} }; });
  }
  var m = cfg.USE_MOCK_GEAR_LISTS;
  function opId() {
    // platform validates op_id as a UUID, so always produce an RFC 4122 v4 string.
    var c = window.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    var b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  window.CSGearListsApi = {
    opId: opId,
    session: function () { return window.CSProfileApi.session().then(function (r) { if (r.ok && r.body) csrf = r.body.csrf_token || null; return r; }); },
    lists: function (c) { return m ? M.lists(c) : real('GET', path(P.LISTS, c)); },
    create: function (c, b) { return m ? M.create(c, b) : real('POST', path(P.LISTS, c), b); },
    get: function (id) { return m ? M.get(id) : real('GET', path(P.LIST, id)); },
    patch: function (id, b, v) { return m ? M.patch(id, b, v) : real('PATCH', path(P.LIST, id), b, v); },
    del: function (id, v) { return m ? M.del(id, v) : real('DELETE', path(P.LIST, id), null, v); },
    ops: function (id, ops) { return m ? M.ops(id, { ops: ops }) : real('POST', path(P.OPS, id), { ops: ops }); },
    events: function (id, after) {
      return m ? M.events(id, after, 25) : real('GET', path(P.EVENTS, id) + '?limit=25' + (after ? '&after_version=' + encodeURIComponent(after) : ''));
    }
  };
})();
