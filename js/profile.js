/**
 * web#42 profile: per-character display toggles (PUT /me/characters/selection {main_id, alt_ids}; displayed = main + alts), gear-set side panel (drawer on mobile),
 * create form with the level-60 rules, armory view in the in-game character-window layout, per-slot Forever item
 * picker with search + paging, and autosave per slot (POST /gear-lists/{id}/ops remove_item + add_item, base_version; stale_base_version -> reload + retry). Contract: platform main openapi/v1.yaml + gear-list schema v1.
 * Main/alts are the platform selection; the UI just shows displayed on/off. API data is rendered with createElement + textContent only.
 */
(function () {
  'use strict';
  var api = window.CSProfileApi, R = window.CSGearSetRules, cfg = window.CS_CONFIG;
  // Wrap the armory client so <html data-pf-busy> counts in-flight requests (tests wait for "0" instead of sleeping).
  var A = {}, busy = 0;
  function mark(d) { busy += d; document.documentElement.setAttribute('data-pf-busy', String(busy)); }
  Object.keys(window.CSArmoryApi).forEach(function (k) {
    var f = window.CSArmoryApi[k];
    A[k] = typeof f !== 'function' ? f : function () {
      mark(1); var p = f.apply(null, arguments);
      p.then(function () { setTimeout(function () { mark(-1); }, 0); }, function () { setTimeout(function () { mark(-1); }, 0); });
      return p;
    };
  });
  mark(0);
  var $ = function (id) { return document.getElementById(id); };
  var REGIONS = ['us', 'eu', 'kr', 'tw'];
  var SLOT_LABEL = { head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Back', chest: 'Chest', shirt: 'Shirt', tabard: 'Tabard',
    wrist: 'Wrist', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet', finger1: 'Finger 1', finger2: 'Finger 2',
    trinket1: 'Trinket 1', trinket2: 'Trinket 2', main_hand: 'Main hand', off_hand: 'Off hand', ranged: 'Ranged' };
  // In-game character window: left column, right column, weapons along the bottom.
  var LEFT = ['head', 'neck', 'shoulder', 'back', 'chest', 'shirt', 'tabard', 'wrist'];
  var RIGHT = ['hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2'];
  var WEAPONS = ['main_hand', 'off_hand', 'ranged'];
  var st = { battletag: '', region: '', characters: [], sets: {}, setErr: {}, current: null, etag: null, items: {}, saving: {}, createFor: null, picker: null };

  function txt(v) { return (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim() : ''; }
  function fullName(c) { return [txt(c.character_name), txt(c.surname)].filter(Boolean).join(' ') || 'Unnamed character'; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function announce(msg) { var s = $('pf-status'); s.textContent = ''; setTimeout(function () { s.textContent = msg; }, 50); }
  function code(r) { return r && r.body && r.body.error && r.body.error.code || ''; }
  function retryAfter(r) { var ra = parseInt(r && r.headers && r.headers['retry-after'], 10); return ra > 0 && ra < 3600 ? ra : 30; }
  function errMsg(r, fallback) {
    var b = r && r.body;
    if (r && r.status === 0) return 'You appear to be offline.';
    if (r && r.status === 403 && code(r) === 'csrf_failed') return 'Security check failed. Reload the page and try again.';
    if (r && r.status === 429) return 'Too many requests. Try again in ' + retryAfter(r) + ' seconds.';
    if (r && r.status === 502) return 'Battle.net is unavailable, try again later';
    if (b && b.error && txt(b.error.message)) return txt(b.error.message);
    if (b && b.errors) return Object.keys(b.errors).map(function (k) { return txt(b.errors[k]); }).filter(Boolean).join(' ') || fallback;
    return fallback;
  }
  function show(name) {
    ['loading', 'disabled', 'signedout', 'error', 'ready'].forEach(function (s) { $('pf-' + s).hidden = s !== name; });
    var h = $('pf-' + name + '-h'); if (h && name !== 'loading') h.focus();
  }
  function charById(id) { return st.characters.filter(function (c) { return c.id === id; })[0] || null; }
  function displayed() { return st.characters.filter(function (c) { return c.displayed && !c.stale; }); }
  function level(c) { var n = parseInt(c && c.level, 10); return n > 0 ? n : 0; }
  function safeIcon(u) { try { var x = new URL(u); return x.protocol === 'https:' && x.hostname === 'render.worldofwarcraft.com' ? x.href : null; } catch (e) { return null; } }
  function iconFor(slot, item) {
    var f = el('span', 'pf-icon' + (item ? ' q-' + (txt(item.quality) || 'unknown') : ' is-empty'));
    var u = item && item.icon_url ? safeIcon(item.icon_url) : null;
    if (u) {
      var img = document.createElement('img'); img.src = u; img.alt = ''; img.width = 36; img.height = 36;
      img.addEventListener('error', function () { clear(f); f.classList.add('is-ph'); f.appendChild(window.CSGearIcons.placeholder(slot)); });
      f.appendChild(img);
    } else { f.classList.add('is-ph'); f.appendChild(window.CSGearIcons.placeholder(slot)); }
    return f;
  }
  function setLabel(s) {
    var bits = [s.type === 'leveling' ? 'Leveling to ' + s.until_level : 'Max level'];
    if (txt(s.role_spec)) bits.push(txt(s.role_spec));
    return bits.join(' · ');
  }

  // ---------- characters + display toggles ----------
  function renderChars() {
    $('pf-battletag').textContent = st.battletag;
    $('pf-region').value = st.region || 'us';
    var list = $('pf-list'); clear(list);
    var empty = !st.characters.length;
    $('pf-empty').hidden = !empty; $('pf-fieldset').hidden = empty;
    $('pf-choose').hidden = empty || displayed().length > 0;
    st.characters.forEach(function (c) {
      var li = el('li', 'cs-card pf-card' + (c.displayed ? ' is-displayed' : ''));
      li.setAttribute('data-id', c.id);
      var nameId = 'pf-name-' + c.id;
      var name = el('span', 'pf-name', fullName(c)); name.id = nameId; li.appendChild(name);
      var reg = txt(c.region) ? txt(c.region).toUpperCase() : '';
      var meta = [txt(c.realm), reg, txt(c.level) ? 'Level ' + txt(c.level) : '', [txt(c.race), txt(c.class)].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
      if (meta) li.appendChild(el('span', 'pf-meta', meta));
      var tags = el('div', 'pf-tags'); tags.appendChild(window.csFactionBadge(c.faction));
      if (c.stale) { var sb = el('span', 'cs-badge pf-stale', 'Stale'); sb.setAttribute('aria-label', 'Stale: missing from the latest Battle.net refresh'); tags.appendChild(sb); }
      li.appendChild(tags);
      var lab = el('label', 'pf-toggle');
      var cb = el('input'); cb.type = 'checkbox'; cb.setAttribute('role', 'switch'); cb.id = 'pf-show-' + c.id; cb.value = c.id; cb.name = 'displayed';
      cb.checked = !!c.displayed; cb.disabled = !!c.stale || !!st.saving[c.id];
      cb.setAttribute('aria-describedby', nameId);
      lab.appendChild(cb); lab.appendChild(el('span', 'pf-toggle-track')); lab.appendChild(el('span', null, 'Display on profile'));
      li.appendChild(lab);
      var gl = el('a', 'pf-gear-link', 'View equipped gear'); gl.href = '../gear/?character=' + encodeURIComponent(c.id);
      gl.setAttribute('aria-describedby', nameId); li.appendChild(gl);
      list.appendChild(li);
    });
    $('pf-refresh').disabled = false;
  }
  function applyList(body) {
    st.characters = (body && Array.isArray(body.characters) ? body.characters : []).filter(function (c) { return c && c.game === 'wow_forever' && txt(c.id); })
      .map(function (c) { c.displayed = c.displayed === true; return c; });
  }
  function toggle(id, v) {
    var c = charById(id); if (!c || st.saving[id]) return;
    st.saving[id] = true; c.displayed = v; $('pf-save-error').hidden = true;
    renderChars(); $('pf-show-' + id).focus();
    announce((v ? 'Showing ' : 'Hiding ') + fullName(c) + '…');
    A.setDisplayed(c, v, st.characters.map(function (x) { return x.id === id ? { id: x.id, displayed: !v, stale: x.stale } : x; })).then(function (r) {
      delete st.saving[id];
      if (r.status === 401) { show('signedout'); return; }
      if (!r.ok) {
        c.displayed = !v; renderChars(); $('pf-show-' + id).focus();
        $('pf-save-error').textContent = 'Could not update ' + fullName(c) + ': ' + (r.local === 'last_displayed' ? 'keep at least one character displayed.' : r.status === 404 ? 'that character is not one of your WoW Forever characters.' : errMsg(r, 'please try again.'));
        $('pf-save-error').hidden = false; return;
      }
      c.displayed = v;
      renderChars(); $('pf-show-' + id).focus();
      announce(fullName(c) + (c.displayed ? ' is displayed on your profile.' : ' is hidden. Its gear sets are kept.'));
      if (st.current && st.current.character_id === id && !c.displayed) closeSet(); else renderPanel();
      loadSets();
    });
  }

  // ---------- gear sets panel ----------
  function loadSets() {
    var ds = displayed();
    return Promise.all(ds.map(function (c) {
      return A.sets(c).then(function (r) {
        if (r.ok) { st.sets[c.id] = Array.isArray(r.body && r.body.items) ? r.body.items : []; delete st.setErr[c.id]; }
        else st.setErr[c.id] = errMsg(r, 'Gear sets could not load.');
      });
    })).then(renderPanel);
  }
  function renderPanel() {
    var ds = displayed(), body = $('pf-panel-body'); clear(body);
    $('pf-armory-wrap').hidden = !ds.length;
    ds.forEach(function (c) {
      var sec = el('section', 'pf-pchar'); var hid = 'pf-pchar-h-' + c.id;
      sec.setAttribute('aria-labelledby', hid); sec.setAttribute('data-char', c.id);
      var h = el('h4', 'pf-pchar-h', fullName(c)); h.id = hid; sec.appendChild(h);
      sec.appendChild(el('p', 'pf-pchar-sub', [txt(c.level) ? 'Level ' + txt(c.level) : '', txt(c.class)].filter(Boolean).join(' ')));
      var nb = el('button', 'cs-btn cs-btn-sm cs-btn-primary pf-new', 'Create new gear list'); nb.type = 'button';
      nb.setAttribute('aria-describedby', hid); nb.addEventListener('click', function () { openCreate(c, nb); });
      sec.appendChild(nb);
      if (st.setErr[c.id]) sec.appendChild(el('p', 'pf-inline-error', st.setErr[c.id]));
      var g = R.sort(st.sets[c.id] || []);
      [['leveling', 'Leveling'], ['max_level', 'Max level']].forEach(function (k) {
        var arr = g[k[0]];
        var gh = el('h5', 'pf-group-h', k[1]); sec.appendChild(gh);
        if (!arr.length) { sec.appendChild(el('p', 'pf-none', k[0] === 'leveling' ? 'No leveling sets.' : 'No max-level sets.')); return; }
        var ul = el('ul', 'pf-sets pf-sets-' + k[0]); ul.setAttribute('aria-label', fullName(c) + ' ' + k[1].toLowerCase() + ' sets');
        arr.forEach(function (s) {
          var out = R.outgrown(s, c);
          var li = el('li'), b = el('button', 'pf-set' + (out ? ' is-outgrown' : '')); b.type = 'button'; b.setAttribute('data-set', s.id);
          if (st.current && st.current.id === s.id) b.setAttribute('aria-current', 'true');
          b.appendChild(el('span', 'pf-set-name', txt(s.name) || 'Untitled set'));
          b.appendChild(el('span', 'pf-set-sub', setLabel(s) + (out ? ' · Outgrown' : '')));
          b.addEventListener('click', function () { openSet(s.id, c.id, true); });
          li.appendChild(b); ul.appendChild(li);
        });
        sec.appendChild(ul);
      });
      body.appendChild(sec);
    });
  }

  // ---------- mobile drawer ----------
  var mq = window.matchMedia('(max-width: 760px)');
  function drawer(open, returnFocus) {
    var p = $('pf-panel');
    p.classList.toggle('is-open', open); $('pf-scrim').hidden = !open;
    $('pf-drawer-btn').setAttribute('aria-expanded', String(open));
    $('pf-drawer-btn').textContent = open ? 'Hide gear sets' : 'Show gear sets';
    if (mq.matches) { if (open) { p.removeAttribute('inert'); p.focus(); } else { p.setAttribute('inert', ''); if (returnFocus) $('pf-drawer-btn').focus(); } }
  }
  function syncDrawer() { if (mq.matches) drawer($('pf-panel').classList.contains('is-open'), false); else { $('pf-panel').removeAttribute('inert'); $('pf-scrim').hidden = true; } }
  $('pf-drawer-btn').addEventListener('click', function () { drawer(!$('pf-panel').classList.contains('is-open'), true); });
  $('pf-drawer-close').addEventListener('click', function () { drawer(false, true); });
  $('pf-scrim').addEventListener('click', function () { drawer(false, true); });
  $('pf-panel').addEventListener('keydown', function (e) { if (e.key === 'Escape' && mq.matches) drawer(false, true); });
  if (mq.addEventListener) mq.addEventListener('change', syncDrawer);

  // ---------- create form ----------
  function fErr(id, m) { $(id + '-err').textContent = m || ''; var n = $(id); if (m) n.setAttribute('aria-invalid', 'true'); else n.removeAttribute('aria-invalid'); }
  function typeUi() {
    var c = st.createFor, can = R.canLevel(c);
    $('pf-c-type-lv').disabled = !can; $('pf-c-type-lv-l').hidden = !can;
    if (!can) $('pf-c-type-max').checked = true;
    var lv = $('pf-c-type-lv').checked;
    $('pf-c-until-wrap').hidden = !lv;
    $('pf-c-until').min = String(R.minUntil(c)); $('pf-c-until').max = String(R.MAX_LEVEL);
    $('pf-c-until-hint').textContent = 'From ' + R.minUntil(c) + ' to ' + R.MAX_LEVEL + ' (above current level ' + level(c) + ').';
  }
  var createOpener = null;
  function openCreate(c, opener) {
    st.createFor = c; createOpener = opener;
    $('pf-create-for').textContent = 'For ' + fullName(c) + (txt(c.level) ? ', level ' + txt(c.level) : '') +
      (R.canLevel(c) ? '.' : '. Level ' + R.MAX_LEVEL + ' characters can only have max-level sets.');
    $('pf-c-name').value = ''; $('pf-c-role').value = ''; $('pf-c-until').value = '';
    (R.defaultType(c) === 'leveling' ? $('pf-c-type-lv') : $('pf-c-type-max')).checked = true;
    ['pf-c-name', 'pf-c-type', 'pf-c-until', 'pf-c-role'].forEach(function (f) { if ($(f)) fErr(f, ''); else $(f + '-err').textContent = ''; });
    $('pf-c-error').hidden = true;
    typeUi();
    $('pf-create').showModal(); $('pf-c-name').focus();
  }
  function closeCreate() { $('pf-create').close(); if (createOpener && document.contains(createOpener)) createOpener.focus(); }
  document.querySelectorAll('input[name=pf-c-type]').forEach(function (i) { i.addEventListener('change', typeUi); });
  $('pf-c-cancel').addEventListener('click', closeCreate);
  $('pf-create').addEventListener('cancel', function (e) { e.preventDefault(); closeCreate(); });
  var FIELD = { name: 'pf-c-name', until_level: 'pf-c-until', role_spec: 'pf-c-role' };
  function showCodes(codes) {
    var first = null;
    Object.keys(codes).forEach(function (f) {
      var m = R.message(codes[f]);
      if (f === 'name' && codes[f] !== 'name_required') m = codes[f];
      if (FIELD[f]) { fErr(FIELD[f], m); first = first || FIELD[f]; }
      else if (f === 'type') { $('pf-c-type-err').textContent = m; first = first || 'pf-c-type-max'; }
      else { $('pf-c-error').textContent = m; $('pf-c-error').hidden = false; }
    });
    if (first) $(first).focus();
  }
  $('pf-create-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = st.createFor; if (!c) return;
    var tp = (document.querySelector('input[name=pf-c-type]:checked') || {}).value || R.defaultType(c);
    var b = R.body($('pf-c-name').value, tp, $('pf-c-until').value, $('pf-c-role').value);
    ['pf-c-name', 'pf-c-until', 'pf-c-role'].forEach(function (f) { fErr(f, ''); }); $('pf-c-type-err').textContent = ''; $('pf-c-error').hidden = true;
    var v = R.validate(b, c);
    if (Object.keys(v).length) { showCodes(v); return; }
    var btn = $('pf-c-save'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    A.create(c, b).then(function (r) {
      btn.disabled = false; btn.removeAttribute('aria-busy');
      if (r.status === 401) { $('pf-create').close(); show('signedout'); return; }
      if (r.status === 400) { var fc = R.fieldCodes(r); if (Object.keys(fc).length) { showCodes(fc); return; } }
      if (r.status === 409 && R.isListLimit(code(r))) { $('pf-c-error').textContent = R.limitMessage(r, 'gear sets'); $('pf-c-error').hidden = false; return; }  // server 409 is the truth (main caps at 5, platform#43 at 20)
      if ((r.status === 409 && code(r) === 'character_not_displayed') || (r.status === 403 && r.body && r.body.errors && r.body.errors.character_id)) { $('pf-c-error').textContent = R.MSG.character_not_displayed; $('pf-c-error').hidden = false; return; }
      if (!r.ok) { $('pf-c-error').textContent = 'Could not create the set: ' + errMsg(r, 'please try again.'); $('pf-c-error').hidden = false; return; }
      $('pf-create').close();
      (st.sets[c.id] = st.sets[c.id] || []).push(r.body);
      st.current = r.body; st.etag = r.headers && r.headers.etag || null;
      announce('Gear set ' + r.body.name + ' created. Pick items for each slot.');
      renderPanel(); renderSet(); drawer(false, false); $('pf-set-h').focus();
    });
  });

  // ---------- armory view ----------
  function closeSet() { st.current = null; st.etag = null; $('pf-armory-view').hidden = true; $('pf-armory-empty').hidden = false; renderPanel(); }
  function openSet(id, charId, focus) {
    var c = charById(charId);
    return A.get(id).then(function (r) {
      if (r.status === 401) { show('signedout'); return; }
      if (r.status === 404) { slotBanner('That gear set no longer exists.'); loadSets(); return; }
      if (!r.ok) { slotBanner('Could not open the set: ' + errMsg(r, 'please try again.')); return; }
      st.current = r.body; st.etag = r.headers && r.headers.etag || null;
      $('pf-slot-banner').hidden = true;
      return resolveItems(r.body).then(function () {
        renderPanel(); renderSet(); drawer(false, false);
        if (focus) $('pf-set-h').focus();
      });
    });
  }
  function resolveItems(s) {
    var ids = Object.keys(s.slots || {}).map(function (k) { return s.slots[k]; }).filter(function (v) { return v != null && !st.items[v]; });
    return Promise.all(ids.map(function (iid) { return A.item(iid).then(function (r) { if (r.ok && r.body) st.items[iid] = r.body; }); }));
  }
  function slotBanner(m) { var b = $('pf-slot-banner'); b.textContent = m; b.hidden = !m; }
  function renderSet() {
    var s = st.current; if (!s) return;
    var c = charById(s.character_id) || {};
    $('pf-armory-empty').hidden = true; $('pf-armory-view').hidden = false;
    $('pf-set-h').textContent = txt(s.name) || 'Untitled set';
    $('pf-set-meta').textContent = fullName(c) + ' · ' + setLabel(s);
    var out = R.outgrown(s, c);
    $('pf-armory-view').classList.toggle('is-outgrown', out);
    $('pf-set-outgrown').hidden = !out;
    $('pf-set-outgrown').textContent = out ? 'Outgrown: ' + fullName(c) + ' is level ' + level(c) + ', past this set\u2019s level ' + s.until_level + '. It is kept for reference.' : '';
    $('pf-model-name').textContent = fullName(c);
    $('pf-model-sub').textContent = ['Level ' + (level(c) || '?'), txt(c.race), txt(c.class)].filter(Boolean).join(' ');
    [['pf-col-left', LEFT], ['pf-col-right', RIGHT], ['pf-row-weapons', WEAPONS]].forEach(function (g) {
      var ul = $(g[0]); clear(ul);
      g[1].forEach(function (slot) {
        var iid = s.slots ? s.slots[slot] : null, it = iid != null ? st.items[iid] || { item_id: iid, name: 'Item ' + iid } : null;
        var li = el('li'), b = el('button', 'pf-slot' + (it ? ' is-filled' : '') + (st.saving[slot] ? ' is-saving' : ''));
        b.type = 'button'; b.setAttribute('data-slot', slot); b.id = 'pf-slot-' + slot;
        b.setAttribute('aria-label', SLOT_LABEL[slot] + ': ' + (it ? txt(it.name) : 'empty') + (st.saving[slot] ? ', saving' : '') + '. Choose item');
        b.appendChild(iconFor(slot, it));
        var tx = el('span', 'pf-slot-text');
        tx.appendChild(el('span', 'pf-slot-label', SLOT_LABEL[slot]));
        tx.appendChild(el('span', 'pf-slot-item' + (it ? ' q-' + (txt(it.quality) || 'unknown') : ''), it ? txt(it.name) : 'Empty'));
        b.appendChild(tx);
        b.addEventListener('click', function () { openPicker(slot, b); });
        li.appendChild(b); ul.appendChild(li);
      });
    });
  }

  // ---------- item picker ----------
  var pk = { slot: null, opener: null, cursor: null, q: '', seq: 0, timer: null };
  function openPicker(slot, opener) {
    pk.slot = slot; pk.opener = opener; pk.q = ''; $('pf-picker-q').value = '';
    $('pf-picker-h').textContent = 'Choose ' + SLOT_LABEL[slot].toLowerCase() + ' item';
    var cur = st.current.slots[slot]; var it = cur != null ? st.items[cur] : null;
    $('pf-picker-current').textContent = 'Current: ' + (it ? txt(it.name) : cur != null ? 'Item ' + cur : 'empty');
    $('pf-picker-clear').disabled = cur == null;
    $('pf-picker').showModal(); $('pf-picker-q').focus();
    fetchItems(false);
  }
  function closePicker() { $('pf-picker').close(); var o = pk.opener && $(pk.opener.id); if (o) o.focus(); }
  function fetchItems(more) {
    var seq = ++pk.seq, list = $('pf-picker-list');
    if (!more) { clear(list); pk.cursor = null; }
    $('pf-picker-status').textContent = 'Loading items…'; $('pf-picker-more').hidden = true;
    A.items({ slot: pk.slot, q: pk.q, max_required_level: null, cursor: more ? pk.cursor : null }).then(function (r) {
      if (seq !== pk.seq) return;
      if (!r.ok) { $('pf-picker-status').textContent = 'Items could not load: ' + errMsg(r, 'please try again.'); return; }
      var items = Array.isArray(r.body && r.body.items) ? r.body.items : [];
      var firstNew = null;
      items.forEach(function (i) {
        var iid = i.item_id != null ? i.item_id : i.id; if (iid == null) return;
        i.item_id = iid; st.items[iid] = i;
        var li = el('li'), b = el('button', 'pf-pick'); b.type = 'button'; b.setAttribute('data-item', iid);
        if (st.current.slots[pk.slot] === iid) b.setAttribute('aria-pressed', 'true');
        b.appendChild(iconFor(pk.slot, i));
        var t = el('span', 'pf-pick-text');
        t.appendChild(el('span', 'pf-pick-name q-' + (txt(i.quality) || 'unknown'), txt(i.name) || 'Item ' + iid));
        t.appendChild(el('span', 'pf-pick-sub', ['Item level ' + (txt(i.item_level) || '?'), txt(i.required_level) ? 'Requires level ' + txt(i.required_level) : '', txt(i.armor_type)].filter(Boolean).join(' · ')));
        b.appendChild(t);
        b.addEventListener('click', function () { pick(iid); });
        li.appendChild(b); list.appendChild(li); firstNew = firstNew || b;
      });
      pk.cursor = r.body && r.body.next_cursor || null;
      $('pf-picker-more').hidden = !pk.cursor;
      var n = list.children.length;
      $('pf-picker-status').textContent = n ? n + (n === 1 ? ' item' : ' items') + (pk.cursor ? ' shown, more available.' : ' found.') : 'No WoW Forever items match.';
      if (more && firstNew) firstNew.focus();
    });
  }
  $('pf-picker-search').addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(pk.timer); pk.q = $('pf-picker-q').value.trim(); fetchItems(false); });
  $('pf-picker-q').addEventListener('input', function () { clearTimeout(pk.timer); pk.timer = setTimeout(function () { pk.q = $('pf-picker-q').value.trim(); fetchItems(false); }, 250); });
  $('pf-picker-more').addEventListener('click', function () { fetchItems(true); });
  $('pf-picker-close').addEventListener('click', closePicker);
  $('pf-picker').addEventListener('cancel', function (e) { e.preventDefault(); closePicker(); });
  $('pf-picker-clear').addEventListener('click', function () { pick(null); });

  // ---------- autosave per slot ----------
  function pick(itemId) {
    var slot = pk.slot, s = st.current, prev = s.slots[slot];
    closePicker();
    if (prev === itemId) { announce('No change.'); return; }
    s.slots[slot] = itemId; st.saving[slot] = true; slotBanner('');
    renderSet(); $('pf-slot-' + slot).focus();
    announce('Saving ' + SLOT_LABEL[slot] + '…');
    save(s, slot, itemId, prev, true);
  }
  /** One POST /ops batch (remove old + add_item priority 1). Stale base_version -> reload, banner, retry once. */
  function save(s, slot, itemId, prev, mayRetry) {
    A.setSlot(s, slot, itemId).then(function (r) {
      if (st.current !== s && st.current && st.current.id !== s.id) { delete st.saving[slot]; return; }
      if (r.status === 401) { delete st.saving[slot]; show('signedout'); return; }
      var cf = r.ok && r.body && Array.isArray(r.body.conflicts) ? r.body.conflicts : [];
      if (r.ok && r.body && r.body.list) { st.current = r.body.list; st.etag = '"v' + r.body.version + '"'; }
      var stale = cf.some(function (x) { return x.reason === 'stale_base_version' || x.reason === 'item_removed' || x.reason === 'superseded_by_newer_edit'; });
      if (r.ok && !cf.length) {
        delete st.saving[slot];
        renderPanel(); renderSet(); $('pf-slot-' + slot).focus();
        var it = itemId != null ? st.items[itemId] : null;
        announce(SLOT_LABEL[slot] + (it ? ' saved: ' + txt(it.name) + '.' : ' cleared.'));
        return;
      }
      if (stale) {
        // Someone (another tab, the addon sync) changed the set: reload it, then retry this pick once at the fresh version.
        openSet(s.id, s.character_id, false).then(function () {
          var fresh = st.current;
          if (mayRetry && fresh && fresh.id === s.id) {
            slotBanner('This set changed somewhere else, so it was reloaded. Saving your ' + SLOT_LABEL[slot].toLowerCase() + ' pick again…');
            fresh.slots[slot] = itemId; renderSet();
            save(fresh, slot, itemId, prev, false);
            return;
          }
          delete st.saving[slot]; renderSet();
          slotBanner('This set changed somewhere else, so it was reloaded. Your ' + SLOT_LABEL[slot].toLowerCase() + ' pick was not saved; choose it again.');
          var b = $('pf-slot-' + slot); if (b) b.focus();
        });
        return;
      }
      delete st.saving[slot];
      if (r.ok) {  // other conflicts (item_not_forever, list_items_limit): server list is the truth
        renderSet(); $('pf-slot-' + slot).focus();
        slotBanner('Not saved: ' + R.message(cf[0].reason)); return;
      }
      s.slots[slot] = prev; renderSet(); $('pf-slot-' + slot).focus();
      if (r.status === 404) { slotBanner('That gear set no longer exists.'); loadSets(); return; }
      if (r.status === 403 && r.body && r.body.errors && r.body.errors.character_id) { slotBanner('Not saved: ' + R.MSG.character_not_displayed); return; }
      if (r.status === 400) { var fc = R.fieldCodes(r); var k = Object.keys(fc)[0]; slotBanner('Not saved: ' + (k ? R.message(fc[k]) : errMsg(r, 'please try again.'))); return; }
      if (r.status === 429) { slotBanner('Too many changes. Wait ' + retryAfter(r) + ' seconds, then pick again.'); return; }
      slotBanner('Not saved: ' + errMsg(r, 'please try again.'));
    });
  }

  // ---------- load / profile basics ----------
  function load() {
    show('loading');
    A.session().then(function (s) {
      if (s.status === 401) { show('signedout'); return null; }
      if (!s.ok) throw s;
      st.battletag = txt(s.body.battletag);
      return api.profile().then(function (pr) {
        if (pr.ok && pr.body) {
          st.battletag = txt(pr.body.battletag) || st.battletag;
          st.region = REGIONS.indexOf(pr.body.preferred_region) >= 0 ? pr.body.preferred_region : '';
        }
        return A.characters();
      });
    }).then(function (r) {
      if (!r) return;
      if (r.status === 401) { show('signedout'); return; }
      if (!r.ok) throw r;
      applyList(r.body);
      renderChars(); show('ready');
      if (st.characters.length && !displayed().length) $('pf-choose-h').focus();
      announce(st.characters.length + ' characters loaded, ' + displayed().length + ' displayed.');
      syncDrawer();
      return loadSets();
    }).catch(function (r) {
      $('pf-error-msg').textContent = errMsg(r, 'Something went wrong. Please try again.');
      show('error');
    });
  }
  $('pf-list').addEventListener('change', function (e) { if (e.target.name === 'displayed') toggle(e.target.value, e.target.checked); });
  $('pf-retry').addEventListener('click', load);
  $('pf-region').addEventListener('change', function (e) {
    var prev = st.region, v = e.target.value;
    if (REGIONS.indexOf(v) < 0) return;
    e.target.disabled = true; $('pf-region-error').hidden = true;
    api.updateProfile({ preferred_region: v }).then(function (r) {
      e.target.disabled = false;
      if (r.status === 401) { show('signedout'); return; }
      if (!r.ok) { e.target.value = prev || 'us'; $('pf-region-error').textContent = 'Could not save your region: ' + errMsg(r, 'please try again.'); $('pf-region-error').hidden = false; return; }
      st.region = r.body && r.body.preferred_region || v;
      announce('Preferred region saved.');
    });
  });
  var cooldown = null;
  function refreshIdle() { var b = $('pf-refresh'); b.disabled = false; b.removeAttribute('aria-busy'); b.textContent = 'Refresh characters'; }
  function startCooldown(sec) {
    var b = $('pf-refresh'), left = sec; clearInterval(cooldown); b.disabled = true;
    var tick = function () {
      if (left <= 0) { clearInterval(cooldown); cooldown = null; refreshIdle(); $('pf-refresh-error').hidden = true; return; }
      b.textContent = 'Refresh again in ' + left + 's'; left--;
    };
    tick(); cooldown = setInterval(tick, 1000);
  }
  function refreshError(m) { $('pf-refresh-error').textContent = m; $('pf-refresh-error').hidden = false; }
  $('pf-refresh').addEventListener('click', function () {
    var b = $('pf-refresh'); if (cooldown) return;
    b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = 'Refreshing…';
    $('pf-refresh-error').hidden = true; announce('Refreshing characters…');
    api.refresh().then(function (r) {
      refreshIdle();
      if (r.status === 401) { show('signedout'); return; }
      if (r.status === 429) { var sec = retryAfter(r); refreshError('Too many refreshes. You can refresh again in ' + sec + ' seconds.'); startCooldown(sec); return; }
      if (r.status === 502) { refreshError('Battle.net is unavailable, try again later'); return; }
      if (!r.ok) { refreshError('Refresh failed: ' + errMsg(r, 'please try again.')); return; }
      return A.characters().then(function (cr) {
        if (cr.ok) applyList(cr.body);
        renderChars(); announce('Characters refreshed.'); return loadSets();
      });
    });
  });
  if (!window.csBnetEnabled()) { show('disabled'); return; }
  load();
})();
