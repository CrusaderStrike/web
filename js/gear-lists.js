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
  $('gl-banner-dismiss').addEventListener('click', hideBanner);
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
      var tr = el('tr', i.obtained ? 'gl-obtained' : null), nm = itemName(i);
      var c1 = el('td', null, SLOT_LABEL[i.slot]); c1.setAttribute('data-label', 'Slot'); tr.appendChild(c1);
      var c2 = el('td'); c2.setAttribute('data-label', 'Item');
      c2.appendChild(el('span', 'gl-itemname gr-name', nm));
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
      btn('Raise', 'Raise priority of ' + nm, function () { send(op('reprioritize_item', i, { priority: i.priority - 1 })); }, i.priority <= L.priority_min).setAttribute('data-act', 'up');
      btn('Lower', 'Lower priority of ' + nm, function () { send(op('reprioritize_item', i, { priority: i.priority + 1 })); }, i.priority >= L.priority_max).setAttribute('data-act', 'down');
      btn(i.obtained ? 'Undo obtained' : 'Mark obtained', (i.obtained ? 'Undo obtained for ' : 'Mark obtained: ') + nm,
        function () { send(op('mark_obtained', i, { obtained: !i.obtained })); }).setAttribute('data-act', 'obtain');
      btn('Remove', 'Remove ' + nm, function () { send(op('remove_item', i, {})); }).setAttribute('data-act', 'remove');
      c5.appendChild(box); tr.appendChild(c5);
      tr.setAttribute('data-slot', i.slot); tr.setAttribute('data-item', String(i.item_id));
      tb.appendChild(tr);
    });
    $('gl-hist').hidden = true; $('gl-hist-btn').setAttribute('aria-expanded', 'false'); $('gl-hist-btn').textContent = 'Show history';
    if (readOnly) setReadOnly(true);
  }

  function op(type, i, extra) {
    var o = { op_id: api.opId(), type: type, slot: i.slot, item_id: i.item_id, base_version: current.version, client_ts: new Date().toISOString() };  // source is server-set
    Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  /** Sends one op. Network/429 retries keep the same op_id (idempotent); re-apply after a conflict uses a new op_id. */
  function send(o) {
    var listId = current.id;
    var retry = function () { send(o); };
    return api.ops(listId, [o]).then(function (r) {
      if (failed(r, retry)) return;
      var b = r.body || {};
      if (b.list) { upsert(b.list); if (current && current.id === listId) { renderIndex(); renderDetail(); } }
      var cf = (Array.isArray(b.conflicts) ? b.conflicts : []).filter(function (c) { return c && c.op_id === o.op_id; })[0];
      if (cf) {
        var m = txt(cf.message);
        // list_items_limit is not a reason code in platform#34 @ e2a5bb0; matched by reason or message until it is.
        var why = cf.reason === 'item_not_forever' ? REASON.item_not_forever :
          (cf.reason === 'list_items_limit' || /list_items_limit/.test(m)) ? 'this list already has ' + L.items_per_list + ' items' : (REASON[cf.reason] || 'it conflicted with another edit');
        var again = /^(item_not_forever|item_removed|list_items_limit)$/.test(cf.reason) || /list_items_limit/.test(m) ? null : function () {
          var n = {}; Object.keys(o).forEach(function (k) { n[k] = o[k]; });
          n.op_id = api.opId(); n.base_version = typeof b.version === 'number' ? b.version : current.version; send(n);
        };
        banner('1 change didn\u2019t apply: ' + why + '.', again);
        say('Change not applied.');
        return;
      }
      hideBanner(); say('Saved.');
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
        upsert(r.body.current.list); renderIndex(); renderDetail();
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
        upsert(r.body.current.list); renderIndex(); renderDetail();
        banner('This list changed somewhere else (now \u201c' + (txt(r.body.current.list.name) || 'Untitled') + '\u201d). Your change was not saved.',
          function () { doPatch(body, r.body.current.version); });
        return;
      }
      if (r.status === 400 && r.body && r.body.errors && r.body.errors.name) { fieldErr('gl-name', r.body.errors.name); return; }
      if (failed(r, function () { doPatch(body, version); })) return;
      upsert(r.body); renderIndex(); renderDetail(); hideBanner(); say('List saved.');
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
    send(op('add_item', { slot: $('gl-add-slot').value, item_id: id }, extra)).then(function () {
      if ($('gl-banner').hidden) { $('gl-add-id').value = ''; $('gl-add-note').value = ''; }
    });
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
      lists = (r.body && Array.isArray(r.body.items) ? r.body.items : []).slice(0, L.lists_per_character);
      show('ready');
      var keep = selectId || (current && current.id);
      current = null;
      select(lists.some(function (l) { return l.id === keep; }) ? keep : (lists[0] && lists[0].id), false);
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
