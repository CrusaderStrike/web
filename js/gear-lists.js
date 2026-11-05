/**
 * web#18 gear list management (platform#34 spec). All API data is set with createElement + textContent only.
 * Lists: create (max 5) / rename / visibility / delete with If-Match "v<n>"; 409 version_mismatch -> current list + re-apply.
 * Items: ops batch, always 200; conflicts[] shown with a re-apply. Undo = mark_obtained obtained:false.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SPEC = window.CSGearListsSpec, L = SPEC.limits, api = window.CSGearListsApi;
  var SLOT_LABEL = { head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Back', chest: 'Chest', shirt: 'Shirt', tabard: 'Tabard',
    wrist: 'Wrist', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet', finger1: 'Finger 1', finger2: 'Finger 2',
    trinket1: 'Trinket 1', trinket2: 'Trinket 2', main_hand: 'Main hand', off_hand: 'Off hand', ranged: 'Ranged' };
  var VIS_LABEL = { private: 'Only me', guild: 'My guild (view only)' };
  var SOURCE_LABEL = { web: 'web', addon: 'in game', companion: 'companion app', export: 'export', system: 'system' };
  var REASON = { superseded_by_newer_edit: 'a newer edit to this item won', item_removed: 'the item was removed from the list',
    stale_base_version: 'the list had changed since you loaded it', item_not_forever: 'that item ID is not a WoW Forever item' };
  var charId = new URLSearchParams(location.search).get('character') || '';
  var lists = [], current = null, readOnly = false, pendingRetry = null;

  function txt(v) { return (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim() : ''; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function say(m) { $('gl-status').textContent = ''; setTimeout(function () { $('gl-status').textContent = m; }, 30); }
  function show(name) {
    ['loading', 'disabled', 'signedout', 'notfound', 'error', 'ready'].forEach(function (s) { $('gl-' + s).hidden = s !== name; });
    var h = $('gl-' + name + '-h'); if (h && name !== 'loading' && name !== 'ready') h.focus();
  }
  function when(iso) { var d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleString() : 'unknown time'; }
  function errMsg(r) { return (r && r.body && r.body.error && txt(r.body.error.message)) || 'Something went wrong. Please try again.'; }
  function code(r) { return r && r.body && r.body.error && r.body.error.code; }
  function itemName(i) { return txt(i.name) || 'Item ' + i.item_id; }
  function retryAfter(r) { var n = parseInt(r && r.headers && r.headers['retry-after'], 10); return n > 0 && n < 3600 ? n : 30; }

  function banner(msg, onReapply, label) {
    $('gl-banner-msg').textContent = msg;
    $('gl-banner-reapply').hidden = !onReapply;
    $('gl-banner-reapply').textContent = label || 'Re-apply my change';
    pendingRetry = onReapply || null;
    $('gl-banner').hidden = false;
  }
  function hideBanner() { $('gl-banner').hidden = true; pendingRetry = null; }
  $('gl-banner-dismiss').addEventListener('click', function () { $('gl-banner').hidden = true; });  // hides only; queued writes keep going
  $('gl-banner-reapply').addEventListener('click', function () { var f = pendingRetry; hideBanner(); if (f) f(); });

  function setReadOnly(on) {
    readOnly = on; $('gl-ready').classList.toggle('gl-readonly', on); $('gl-readonly').hidden = !on;
    Array.prototype.forEach.call(document.querySelectorAll('.gl-edit input, .gl-edit select, .gl-edit button'), function (b) { b.disabled = on; });
    if (!on) limitState();
  }
  /** Shared failure handling for writes. Returns true when handled. */
  function failed(r, retry) {
    if (r.ok) return false;
    if (r.status === 401) { show('signedout'); return true; }
    if (r.status === 403 && code(r) === 'csrf_failed' && retry && !retry._csrf) {
      retry._csrf = true; api.session().then(function () { retry(); }); return true;  // refresh the token, retry once
    }
    if (r.status === 403 && code(r) === 'forbidden') { setReadOnly(true); banner('Only the list owner can change this list. Your change was not saved.'); return true; }
    if (r.status === 404) { banner('That list no longer exists. It may have been deleted elsewhere.'); reloadLists(null); return true; }
    if (r.status === 429) {
      var s = retryAfter(r);
      banner('Too many changes. Retrying in ' + s + ' seconds.', retry, 'Retry now');
      setTimeout(function () { if (pendingRetry === retry) { hideBanner(); retry(); } }, s * 1000);
      return true;
    }
    if (r.status === 0) { banner('You appear to be offline. Your change was kept.', retry, 'Retry'); return true; }
    banner(errMsg(r), r.status >= 500 ? retry : null, 'Retry');
    return true;
  }

  function fillVis(sel) { clear(sel); SPEC.visibility.forEach(function (v) { var o = el('option', null, VIS_LABEL[v] || v); o.value = v; sel.appendChild(o); }); }
  function limitState() {
    var full = lists.length >= L.lists_per_character;
    $('gl-new-btn').disabled = full || readOnly; $('gl-new-name').disabled = full || readOnly;
    $('gl-limit').hidden = !full;
    $('gl-limit').textContent = 'You already have ' + L.lists_per_character + ' lists for this character. Delete one to make another.';
    $('gl-count').textContent = '(' + lists.length + ' of ' + L.lists_per_character + ')';
  }

  function renderIndex() {
    var ul = $('gl-index'); clear(ul);
    $('gl-none').hidden = lists.length > 0;
    lists.forEach(function (l) {
      var li = el('li'), b = el('button');
      b.type = 'button'; b.setAttribute('data-id', l.id);
      if (current && current.id === l.id) b.setAttribute('aria-current', 'true');
      b.appendChild(el('span', 'gl-name', txt(l.name) || 'Untitled list'));
      var n = Array.isArray(l.items) ? l.items.length : 0;
      b.appendChild(el('span', 'gl-sub', (n === 1 ? '1 item' : n + ' items') + ' · ' + (VIS_LABEL[l.visibility] || l.visibility)));
      b.addEventListener('click', function () { select(l.id, true); });
      li.appendChild(b); ul.appendChild(li);
    });
    limitState();
  }
  function serverUpdate(l) { var Q = queues[l.id]; if (Q) { Q.server = l; l = project(l, queuedOps(Q)); } upsert(l); }
  function upsert(l) {
    var i = lists.map(function (x) { return x.id; }).indexOf(l.id);
    if (i >= 0) lists[i] = l; else lists.push(l);
    if (current && current.id === l.id) current = l;
  }
  function select(id, focus) {
    current = lists.filter(function (l) { return l.id === id; })[0] || null;
    renderIndex(); renderDetail();
    if (focus && current) $('gl-detail-h').focus();
  }

  function renderDetail() {
    var d = $('gl-detail');
    if (!current) { d.hidden = true; return; }
    d.hidden = false;
    $('gl-detail-h').textContent = txt(current.name) || 'Untitled list';
    $('gl-meta').textContent = (VIS_LABEL[current.visibility] || current.visibility) + ' · Last updated ' + when(current.updated_at) +
      (current.updated_source ? ' from ' + (SOURCE_LABEL[current.updated_source] || current.updated_source) : '');
    $('gl-name').value = current.name || ''; $('gl-vis').value = current.visibility;
    $('gl-name-err').textContent = ''; $('gl-name').removeAttribute('aria-invalid');
    deleteConfirm(false);
    var items = (Array.isArray(current.items) ? current.items : []).filter(function (i) { return i && SLOT_LABEL[i.slot]; });
    items.sort(function (a, b) { return SPEC.slots.indexOf(a.slot) - SPEC.slots.indexOf(b.slot) || a.priority - b.priority; });
    var tb = $('gl-items'); clear(tb);
    $('gl-items-empty').hidden = items.length > 0; $('gl-items-wrap').hidden = !items.length;
    $('gl-caption').textContent = 'Wishlist items (' + items.length + ' of ' + L.items_per_list + ')';
    items.forEach(function (i) {
      var tr = el('tr', (i.obtained ? 'gl-obtained' : '') + (i._pending ? ' gl-pending' : '')), nm = itemName(i);
      var c1 = el('td', null, SLOT_LABEL[i.slot]); c1.setAttribute('data-label', 'Slot'); tr.appendChild(c1);
      var c2 = el('td'); c2.setAttribute('data-label', 'Item');
      // icon_url is always null for now (platform#34): slot placeholder in a quality-neutral frame.
      var wrap = el('span', 'gr-item q-unknown'), frame = el('span', 'gr-icon gr-icon-ph');
      frame.setAttribute('aria-hidden', 'true');
      var url = window.CSGearApi && window.CSGearApi.iconFor(i);
      if (url) { var img = document.createElement('img'); img.src = url; img.alt = ''; img.width = 32; img.height = 32; frame.classList.remove('gr-icon-ph'); frame.appendChild(img); }
      else frame.appendChild(window.CSGearIcons.placeholder(i.slot));
      wrap.appendChild(frame); wrap.appendChild(el('span', 'gl-itemname gr-name', nm)); c2.appendChild(wrap);
      c2.appendChild(el('span', 'cs-muted', ' #' + i.item_id));
      if (txt(i.note)) { c2.appendChild(el('br')); c2.appendChild(el('span', 'cs-hint', i.note)); }
      tr.appendChild(c2);
      var c3 = el('td', 'gr-num', String(i.priority)); c3.setAttribute('data-label', 'Priority'); tr.appendChild(c3);
      var c4 = el('td', null, i.obtained ? 'Obtained' : 'Wanted'); c4.setAttribute('data-label', 'Status'); tr.appendChild(c4);
      var c5 = el('td', 'gl-edit'); c5.setAttribute('data-label', 'Actions');
      var box = el('div', 'gl-actions');
      function btn(label, aria, fn, dis) {
        var b = el('button', 'cs-btn cs-btn-sm cs-btn-ghost', label); b.type = 'button'; b.setAttribute('aria-label', aria);
        b.disabled = !!dis || readOnly; b.addEventListener('click', fn); box.appendChild(b); return b;
      }
      btn('Raise', 'Raise priority of ' + nm, function () { enqueue(op('reprioritize_item', i, { priority: i.priority - 1 })); }, i.priority <= L.priority_min).setAttribute('data-act', 'up');
      btn('Lower', 'Lower priority of ' + nm, function () { enqueue(op('reprioritize_item', i, { priority: i.priority + 1 })); }, i.priority >= L.priority_max).setAttribute('data-act', 'down');
      btn(i.obtained ? 'Undo obtained' : 'Mark obtained', (i.obtained ? 'Undo obtained for ' : 'Mark obtained: ') + nm,
        function () { enqueue(op('mark_obtained', i, { obtained: !i.obtained })); }).setAttribute('data-act', 'obtain');
      btn('Remove', 'Remove ' + nm, function () { enqueue(op('remove_item', i, {})); }).setAttribute('data-act', 'remove');
      c5.appendChild(box); tr.appendChild(c5);
      tr.setAttribute('data-slot', i.slot); tr.setAttribute('data-item', String(i.item_id));
      tb.appendChild(tr);
    });
    $('gl-hist').hidden = true; $('gl-hist-btn').setAttribute('aria-expanded', 'false'); $('gl-hist-btn').textContent = 'Show history';
    if (readOnly) setReadOnly(true);
  }

  /* ---- Per-list serialized write queue ----
   * Ops wait in queue.pending until sent; one request per list is in flight at a time. Pending (never-sent) ops on the
   * same item coalesce. base_version is stamped at send time from the latest server version. A 429 pauses the queue
   * until Retry-After; offline/5xx keep ops queued with a Retry button. Nothing queued is dropped except on 403 forbidden
   * (the user is told). Dismissing the banner only hides it.
   */
  var queues = {};      // listId -> { pending: [], inflight: null, pausedUntil: 0, timer: 0, server: GearList }
  function q(listId) { return queues[listId] || (queues[listId] = { pending: [], inflight: null, pausedUntil: 0, timer: 0, server: null }); }
  function op(type, i, extra) {
    var o = { op_id: api.opId(), type: type, slot: i.slot, item_id: i.item_id };  // base_version stamped at send; source is server-set
    Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function same(a, b) { return a.slot === b.slot && a.item_id === b.item_id; }
  /** Coalesce a new op into never-sent pending ops for the same item. */
  function coalesce(pending, o) {
    for (var k = pending.length - 1; k >= 0; k--) {
      var p = pending[k];
      if (p._sent || !same(p, o)) continue;
      if (o.type === p.type && (o.type === 'reprioritize_item' || o.type === 'mark_obtained')) {
        if (o.type === 'reprioritize_item') p.priority = o.priority; else p.obtained = o.obtained;
        return;
      }
      if (o.type === 'remove_item' && p.type === 'add_item') {
        // Added and removed before it was ever sent: drop the add and every pending edit of it.
        for (var j = pending.length - 1; j >= 0; j--) if (!pending[j]._sent && same(pending[j], o)) pending.splice(j, 1);
        return;
      }
      if (o.type === 'remove_item') { pending.splice(k, 1); continue; }  // edits before a remove are moot
      break;
    }
    pending.push(o);
  }
  /** Local projection: server list + still-pending ops, so repeated clicks build on each other. */
  function project(list, ops) {
    var l = JSON.parse(JSON.stringify(list));
    ops.forEach(function (o) {
      var idx = -1; (l.items || []).forEach(function (it, n) { if (same(it, o)) idx = n; });
      var it = idx >= 0 ? l.items[idx] : null;
      if (o.type === 'add_item' && !it) l.items.push({ slot: o.slot, item_id: o.item_id, name: null, priority: o.priority, note: o.note || null, obtained: false, icon_url: null, _pending: true });
      else if (o.type === 'remove_item' && it) l.items.splice(idx, 1);
      else if (o.type === 'reprioritize_item' && it) { it.priority = o.priority; it._pending = true; }
      else if (o.type === 'mark_obtained' && it) { it.obtained = o.obtained; it._pending = true; }
    });
    return l;
  }
  function queuedOps(Q) { return (Q.inflight || []).concat(Q.pending); }
  function refreshView(listId) {
    var Q = q(listId);
    if (!Q.server) return;
    var view = project(Q.server, queuedOps(Q));
    upsert(view);
    if (current && current.id === listId) { renderIndex(); renderDetail(); }
    var n = queuedOps(Q).length;
    persist(listId);
    $('gl-queue').textContent = current && current.id === listId && n ? (n === 1 ? '1 change saving…' : n + ' changes saving…') : '';
  }
  /* Persistence: queued ops survive leaving/reloading the page (localStorage, keyed by user + list). Same op_ids are
   * kept, so a request that did reach the server before the page closed dedupes on retry. */
  var userKey = '';
  function storeKey(listId) { return 'cs_gl_queue:' + userKey + ':' + listId; }
  function persist(listId) {
    if (!userKey) return;
    var ops = queuedOps(q(listId));
    try { if (ops.length) localStorage.setItem(storeKey(listId), JSON.stringify(ops)); else localStorage.removeItem(storeKey(listId)); } catch (e) { /* storage full/blocked: in-memory only */ }
  }
  function restore(listId) {
    var Q = q(listId);
    if (Q.restored || !userKey) return; Q.restored = true;
    try {
      var ops = JSON.parse(localStorage.getItem(storeKey(listId)) || '[]');
      if (Array.isArray(ops) && ops.length) Q.pending = ops.filter(function (o) { return o && o.op_id && o.type; }).concat(Q.pending);
    } catch (e) { /* corrupt entry: ignore */ }
  }
  function anyQueued() { return Object.keys(queues).some(function (k) { return queuedOps(queues[k]).length > 0; }); }
  var LEAVE_MSG = 'Some gear list changes are still saving. If you leave now they will be sent the next time you open this page.';
  window.addEventListener('beforeunload', function (e) { if (anyQueued()) { e.preventDefault(); e.returnValue = LEAVE_MSG; return LEAVE_MSG; } });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.getAttribute('href').charAt(0) === '#' || !anyQueued()) return;
    if (!window.confirm(LEAVE_MSG + ' Leave anyway?')) { e.preventDefault(); e.stopPropagation(); }
    else window.__glLeaveOk = true;
  }, true);

  function enqueue(o, targetId) {
    var listId = targetId || current.id, Q = q(listId);
    if (!Q.server) Q.server = lists.filter(function (l) { return l.id === listId; })[0] || current;
    coalesce(Q.pending, o);
    refreshView(listId);
    pump(listId);
  }
  function pump(listId) {
    var Q = q(listId);
    if (Q.inflight || !Q.pending.length || readOnly) return;
    var wait = Q.pausedUntil - Date.now();
    if (wait > 0) { clearTimeout(Q.timer); Q.timer = setTimeout(function () { pump(listId); }, wait + 50); return; }
    // One op per item per request, so every op in a request is based on the version it will actually be applied to.
    var n = 0, seen = [];
    while (n < Q.pending.length && n < L.ops_per_request && !seen.some(function (x) { return same(x, Q.pending[n]); })) seen.push(Q.pending[n++]);
    var chunk = Q.pending.splice(0, n);
    var base = Q.server.version;
    chunk.forEach(function (o) { o.base_version = base; o.client_ts = new Date().toISOString(); o._sent = true; });
    Q.inflight = chunk;
    sendChunk(listId, chunk, false);
  }
  function wire(o) { var w = {}; Object.keys(o).forEach(function (k) { if (k.charAt(0) !== '_') w[k] = o[k]; }); return w; }
  function requeue(Q, chunk) { Q.inflight = null; Q.pending = chunk.concat(Q.pending); }
  function sendChunk(listId, chunk, csrfRetried) {
    var Q = q(listId);
    api.ops(listId, chunk.map(wire)).then(function (r) {
      if (r.status === 403 && code(r) === 'csrf_failed' && !csrfRetried) {
        api.session().then(function () { sendChunk(listId, chunk, true); }); return;
      }
      if (r.status === 429) {
        var sec = retryAfter(r);
        // 429 means nothing was applied: the ops may coalesce again with newer edits.
        chunk.forEach(function (o) { o._sent = false; });
        var back = Q.pending; Q.inflight = null; Q.pending = [];
        chunk.concat(back).forEach(function (o) { coalesce(Q.pending, o); });
        Q.pausedUntil = Date.now() + sec * 1000;
        banner('Too many changes. Your ' + queuedOps(Q).length + ' queued change(s) will be sent in ' + sec + ' seconds.',
          function () { Q.pausedUntil = 0; pump(listId); }, 'Send now');
        refreshView(listId); pump(listId); return;
      }
      if (r.status === 0 || r.status >= 500) {
        requeue(Q, chunk); refreshView(listId);
        banner(r.status === 0 ? 'You appear to be offline. Your changes are kept and will be sent when you retry.' : errMsg(r) + ' Your changes are kept.',
          function () { pump(listId); }, 'Retry');
        return;
      }
      if (!r.ok) {
        var dropped = chunk.length + Q.pending.length;
        Q.inflight = null; Q.pending = [];
        refreshView(listId);
        failed(r, null);
        var lost = dropped === 1 ? '1 change was not saved.' : dropped + ' changes were not saved.';
        if (r.status === 403 && code(r) === 'forbidden') banner('Only the list owner can change this list. ' + lost);
        else if ($('gl-ready') && !$('gl-ready').hidden) banner(errMsg(r) + ' ' + lost);
        return;
      }
      var b = r.body || {};
      Q.inflight = null;
      if (b.list) Q.server = b.list;
      var cfs = (Array.isArray(b.conflicts) ? b.conflicts : []).filter(function (c) { return c && chunk.some(function (o) { return o.op_id === c.op_id; }); });
      refreshView(listId);
      if (cfs.length) {
        var cf = cfs[0], o = chunk.filter(function (x) { return x.op_id === cf.op_id; })[0], m = txt(cf.message);
        var why = cf.reason === 'item_not_forever' ? REASON.item_not_forever :
          (cf.reason === 'list_items_limit' || /list_items_limit/.test(m)) ? 'this list already has ' + L.items_per_list + ' items' : (REASON[cf.reason] || 'it conflicted with another edit');
        var again = /^(item_not_forever|item_removed|list_items_limit)$/.test(cf.reason) || /list_items_limit/.test(m) ? null : function () {
          var n = wire(o); delete n.base_version; n.op_id = api.opId(); enqueue(n, listId);  // the list the conflict came from
        };
        banner((cfs.length === 1 ? '1 change' : cfs.length + ' changes') + ' didn\u2019t apply: ' + why + '.', again);
        say('Change not applied.');
      } else if (!Q.pending.length) { hideBanner(); say('Saved.'); }
      pump(listId);
    });
  }

  function deleteConfirm(on) {
    $('gl-delete').hidden = on; $('gl-delete-confirm').hidden = !on; $('gl-delete-cancel').hidden = !on;
    if (on) $('gl-delete-confirm').focus();
  }
  $('gl-delete').addEventListener('click', function () { deleteConfirm(true); });
  $('gl-delete-cancel').addEventListener('click', function () { deleteConfirm(false); $('gl-delete').focus(); });
  function doDelete(version) {
    var l = current;
    api.del(l.id, version).then(function (r) {
      if (r.status === 409 && r.body && r.body.current && r.body.current.list) {
        serverUpdate(r.body.current.list); renderIndex(); renderDetail();
        banner('This list changed somewhere else. It was not deleted. Review the latest version.', function () { doDelete(r.body.current.version); }, 'Delete anyway');
        return;
      }
      if (failed(r, function () { doDelete(version); })) return;
      lists = lists.filter(function (x) { return x.id !== l.id; }); current = null;
      renderIndex(); renderDetail(); hideBanner(); say('List deleted.');
      var first = document.querySelector('#gl-index button'); (first || $('gl-new-name')).focus();
    });
  }
  $('gl-delete-confirm').addEventListener('click', function () { doDelete(current.version); });

  function doPatch(body, version) {
    api.patch(current.id, body, version).then(function (r) {
      if (r.status === 409 && r.body && r.body.current && r.body.current.list) {
        serverUpdate(r.body.current.list); renderIndex(); renderDetail();
        banner('This list changed somewhere else (now \u201c' + (txt(r.body.current.list.name) || 'Untitled') + '\u201d). Your change was not saved.',
          function () { doPatch(body, r.body.current.version); });
        return;
      }
      if (r.status === 400 && r.body && r.body.errors && r.body.errors.name) { fieldErr('gl-name', r.body.errors.name); return; }
      if (failed(r, function () { doPatch(body, version); })) return;
      serverUpdate(r.body); renderIndex(); renderDetail(); hideBanner(); say('List saved.');
    });
  }
  function fieldErr(id, m) { $(id + '-err').textContent = m; if (m) { $(id).setAttribute('aria-invalid', 'true'); $(id).focus(); } else $(id).removeAttribute('aria-invalid'); }
  function validName(v) { return v.length >= 1 && v.length <= L.name_max && !/[\u0000-\u001f]/.test(v); }
  $('gl-meta-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = $('gl-name').value.trim();
    if (!validName(n)) { fieldErr('gl-name', 'Name must be 1\u2013' + L.name_max + ' characters.'); return; }
    fieldErr('gl-name', '');
    var body = {};
    if (n !== current.name) body.name = n;
    if ($('gl-vis').value !== current.visibility) body.visibility = $('gl-vis').value;
    if (!Object.keys(body).length) { say('No changes to save.'); return; }
    doPatch(body, current.version);
  });

  $('gl-create').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = $('gl-new-name').value.trim();
    if (!validName(n)) { fieldErr('gl-new-name', 'Name must be 1\u2013' + L.name_max + ' characters.'); return; }
    fieldErr('gl-new-name', '');
    var body = { name: n, visibility: $('gl-new-vis').value };
    var go = function () {
      api.create(charId, body).then(function (r) {
        if (r.status === 409 && code(r) === 'list_limit_reached') {
          banner('You already have ' + L.lists_per_character + ' lists for this character. Delete one to make another.'); return;
        }
        if (r.status === 400 && r.body && r.body.errors && r.body.errors.name) { fieldErr('gl-new-name', r.body.errors.name); return; }
        if (failed(r, go)) return;
        upsert(r.body); $('gl-new-name').value = ''; hideBanner(); say('List created.');
        select(r.body.id, true);
      });
    };
    go();
  });

  $('gl-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = $('gl-add-id').value.trim(), id = /^[0-9]{1,9}$/.test(raw) ? parseInt(raw, 10) : 0;
    var pr = parseInt($('gl-add-pr').value, 10);
    var okId = id >= 1, okPr = pr >= L.priority_min && pr <= L.priority_max;
    $('gl-add-pr-err').textContent = okPr ? '' : 'Priority must be ' + L.priority_min + '\u2013' + L.priority_max + '.';
    $('gl-add-id-err').textContent = okId ? '' : 'Enter a WoW Forever item ID (numbers only).';
    ['gl-add-id', 'gl-add-pr'].forEach(function (f, k) { if ([okId, okPr][k]) $(f).removeAttribute('aria-invalid'); else $(f).setAttribute('aria-invalid', 'true'); });
    if (!okId) { $('gl-add-id').focus(); return; }
    if (!okPr) { $('gl-add-pr').focus(); return; }
    if ((current.items || []).length >= L.items_per_list) { banner('This list already has ' + L.items_per_list + ' items.'); return; }
    var note = $('gl-add-note').value.trim().slice(0, L.note_max);
    var extra = { priority: pr }; if (note) extra.note = note;
    enqueue(op('add_item', { slot: $('gl-add-slot').value, item_id: id }, extra));
    $('gl-add-id').value = ''; $('gl-add-note').value = '';
  });

  function describe(e) {
    var p = e.payload || {}, it = p.item_id ? (SLOT_LABEL[p.slot] || p.slot) + ' item ' + p.item_id : '';
    switch (e.event_type) {
      case 'GearListCreated': return 'Created list \u201c' + txt(p.name) + '\u201d';
      case 'GearListRenamed': return [p.name ? 'Renamed to \u201c' + txt(p.name) + '\u201d' : '', p.visibility ? 'Visibility: ' + (VIS_LABEL[p.visibility] || p.visibility) : ''].filter(Boolean).join('; ');
      case 'GearListDeleted': return 'Deleted list';
      case 'GearItemAdded': return 'Added ' + it + ' at priority ' + p.priority;
      case 'GearItemRemoved': return 'Removed ' + it;
      case 'GearItemReprioritized': return 'Priority of ' + it + (p.from_priority ? ' from ' + p.from_priority : '') + ' to ' + p.priority;
      case 'GearItemObtained': return p.obtained === false ? 'Undid obtained for ' + it : 'Obtained ' + it;
      case 'GearOpRejected': return 'Change not applied' + (it ? ' to ' + it : '') + ': ' + (REASON[p.reason] || txt(p.reason) || 'conflict');
      default: return txt(e.event_type) || 'Change';
    }
  }
  function loadHistory() {
    var all = [], listId = current.id, msg = $('gl-hist-msg'), ol = $('gl-hist-list');
    clear(ol); msg.textContent = 'Loading history\u2026';
    (function page(after) {
      api.events(listId, after).then(function (r) {
        if (r.status === 403) { msg.textContent = 'History for this list is only visible to its owner.'; return; }
        if (!r.ok) { msg.textContent = errMsg(r); return; }
        all = all.concat(Array.isArray(r.body.items) ? r.body.items : []);
        if (r.body.next_cursor != null && all.length < 1000) { page(r.body.next_cursor); return; }
        msg.textContent = all.length ? '' : 'No history yet.';
        all.slice().reverse().forEach(function (e) {
          var li = el('li', e.event_type === 'GearOpRejected' ? 'gl-rej' : null);
          li.appendChild(el('span', null, describe(e)));
          var by = e.actor && txt(e.actor.display_name);
          li.appendChild(el('span', 'cs-muted', ' \u2014 ' + (by ? by + ', ' : '') + (SOURCE_LABEL[e.source] || txt(e.source) || '') + ', ' + when(e.recorded_at)));
          ol.appendChild(li);
        });
      });
    })(0);
  }
  $('gl-hist-btn').addEventListener('click', function () {
    var open = $('gl-hist').hidden;
    $('gl-hist').hidden = !open; this.setAttribute('aria-expanded', String(open)); this.textContent = open ? 'Hide history' : 'Show history';
    if (open) loadHistory();
  });

  function reloadLists(selectId) {
    return api.lists(charId).then(function (r) {
      if (r.status === 401) { show('signedout'); return; }
      if (r.status === 404) { show('notfound'); return; }
      if (!r.ok) throw r;
      lists = [];
      var got = (r.body && Array.isArray(r.body.items) ? r.body.items : []).slice(0, L.lists_per_character);
      got.forEach(function (l) { restore(l.id); var Q = q(l.id); if (!queuedOps(Q).length) delete queues[l.id]; serverUpdate(l); });
      show('ready');
      var keep = selectId || (current && current.id);
      current = null;
      select(lists.some(function (l) { return l.id === keep; }) ? keep : (lists[0] && lists[0].id), false);
      Object.keys(queues).forEach(function (id) { if (queuedOps(queues[id]).length) { refreshView(id); pump(id); } });
    });
  }
  function load() {
    show('loading');
    if (!charId) { show('notfound'); return; }
    $('gl-back').href = '../?character=' + encodeURIComponent(charId);
    $('gl-back').textContent = '\u2190 Back to equipped gear';
    api.session().then(function (s) {
      if (s.status === 401) { show('signedout'); return null; }
      if (!s.ok) throw s;
      userKey = (s.body && (s.body.user_id || s.body.battletag)) || '';
      return window.CSProfileApi.characters().then(function (r) {
        var ch = r.ok && r.body && Array.isArray(r.body.characters) ? r.body.characters.filter(function (c) { return c.id === charId; })[0] : null;
        var nm = ch ? [txt(ch.character_name), txt(ch.surname)].filter(Boolean).join(' ') : '';
        $('gl-h').textContent = (nm ? nm + ' \u2014 ' : '') + 'gear lists';
        document.title = (nm ? nm + ' gear lists' : 'Gear lists') + ' \u2014 Crusader Strike';
        return reloadLists(null);
      });
    }).catch(function (r) {
      $('gl-error-msg').textContent = r && r.status === 0 ? 'You appear to be offline.' :
        r && r.status === 429 ? 'Too many requests. Try again in ' + retryAfter(r) + ' seconds.' : errMsg(r);
      show('error');
    });
  }
  fillVis($('gl-new-vis')); fillVis($('gl-vis'));
  SPEC.slots.forEach(function (s) { var o = el('option', null, SLOT_LABEL[s] || s); o.value = s; $('gl-add-slot').appendChild(o); });
  $('gl-add-pr').max = String(L.priority_max);
  $('gl-retry').addEventListener('click', load);
  if (!window.csBnetEnabled()) { show('disabled'); return; }
  load();
})();
