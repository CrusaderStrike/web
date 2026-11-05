/** web#18 gear page (read-only). API data is set with createElement + textContent only. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SLOTS = ['head', 'neck', 'shoulder', 'back', 'chest', 'shirt', 'tabard', 'wrist', 'hands', 'waist', 'legs', 'feet',
    'finger1', 'finger2', 'trinket1', 'trinket2', 'main_hand', 'off_hand', 'ranged'];
  var SLOT_LABEL = { head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Back', chest: 'Chest', shirt: 'Shirt', tabard: 'Tabard',
    wrist: 'Wrist', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet', finger1: 'Finger 1', finger2: 'Finger 2',
    trinket1: 'Trinket 1', trinket2: 'Trinket 2', main_hand: 'Main hand', off_hand: 'Off hand', ranged: 'Ranged' };
  var QUALITY = { poor: 'Poor', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', unknown: 'Unknown' };
  var charId = new URLSearchParams(location.search).get('character') || '';

  function txt(v) { return (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim() : ''; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function show(name) {
    ['loading', 'disabled', 'signedout', 'notfound', 'error', 'ready'].forEach(function (s) { $('gr-' + s).hidden = s !== name; });
    var h = $('gr-' + name + '-h'); if (h && name !== 'loading') h.focus();
  }
  function fullName(c) {
    var n = [txt(c.character_name), txt(c.surname)].filter(Boolean).join(' ') || 'your character';
    var where = [txt(c.realm), txt(c.region).toUpperCase()].filter(Boolean).join(' ');
    return where ? n + ' (' + where + ')' : n;
  }

  function render(body, ch) {
    var name = ch ? fullName(ch) : 'Character';
    $('gr-h').textContent = name + ' — gear';
    if (ch && ch.stale) {
      var sb = document.createElement('span');
      sb.className = 'cs-badge cs-badge-neutral gr-stale';
      sb.textContent = 'Stale';
      sb.setAttribute('aria-label', 'Stale: missing from the latest Battle.net refresh');
      $('gr-h').appendChild(document.createTextNode(' '));
      $('gr-h').appendChild(sb);
    }
    document.title = name + ' gear — Crusader Strike';
    var d = body.updated_at ? new Date(body.updated_at) : null;
    $('gr-updated').textContent = d && !isNaN(d) ? 'Last updated ' + d.toLocaleString() : 'Last updated: unknown';
    var items = (Array.isArray(body.items) ? body.items : []).filter(function (i) { return i && SLOTS.indexOf(i.slot) >= 0; });
    items.sort(function (a, b) { return SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot); });
    var tb = $('gr-body');
    while (tb.firstChild) tb.removeChild(tb.firstChild);
    $('gr-empty').hidden = items.length > 0;
    $('gr-table-wrap').hidden = !items.length;
    items.forEach(function (i) {
      var q = typeof i.quality === 'string' && Object.prototype.hasOwnProperty.call(QUALITY, i.quality) ? i.quality : 'unknown';
      var tr = el('tr');
      var s = el('td', null, SLOT_LABEL[i.slot]); s.setAttribute('data-label', 'Slot'); tr.appendChild(s);
      var it = el('td'); it.setAttribute('data-label', 'Item');
      var wrap = el('span', 'gr-item q-' + q);
      // Fixed 36x36 frame, border colored by quality; holds the allowlisted icon or the slot placeholder.
      var frame = el('span', 'gr-icon');
      frame.setAttribute('aria-hidden', 'true');
      var url = window.CSGearApi.iconFor(i);
      var usePlaceholder = function () {
        while (frame.firstChild) frame.removeChild(frame.firstChild);
        frame.classList.add('gr-icon-ph');
        frame.appendChild(window.CSGearIcons.placeholder(i.slot));
      };
      if (url) {
        var img = el('img'); img.alt = ''; img.width = 32; img.height = 32; img.loading = 'lazy';
        img.addEventListener('error', usePlaceholder);
        img.src = url;
        frame.appendChild(img);
      } else usePlaceholder();
      wrap.appendChild(frame);
      wrap.appendChild(el('span', 'gr-name', txt(i.name) || 'Unknown item'));
      it.appendChild(wrap); tr.appendChild(it);
      var qc = el('td', 'q-' + q, QUALITY[q]); qc.setAttribute('data-label', 'Quality'); tr.appendChild(qc);
      var il = el('td', 'gr-num', txt(i.ilvl) || '–'); il.setAttribute('data-label', 'Item level'); tr.appendChild(il);
      tb.appendChild(tr);
    });
    $('gr-caption').textContent = 'Equipped gear for ' + name + ', ' + items.length + ' items, ordered by slot';
    show('ready');
    $('gr-status').textContent = items.length + ' items loaded.';
  }

  function load() {
    show('loading');
    if (!charId) { show('notfound'); return; }
    var api = window.CSProfileApi;
    var ch = null;
    api.session().then(function (s) {
      if (s.status === 401) { show('signedout'); return null; }
      if (!s.ok) throw s;
      return api.characters().then(function (r) {
        if (r.ok && r.body && Array.isArray(r.body.characters)) ch = r.body.characters.filter(function (c) { return c.id === charId; })[0] || null;
        return window.CSGearApi.gear(charId);
      });
    }).then(function (r) {
      if (!r) return;
      if (r.status === 401) { show('signedout'); return; }
      if (r.status === 404 || r.status === 403) { show('notfound'); return; }
      if (!r.ok) throw r;
      render(r.body || {}, ch);
    }).catch(function (r) {
      var ra = parseInt(r && r.headers && r.headers['retry-after'], 10);
      var m = r && r.status === 502 ? 'Battle.net is unavailable, try again later' :
        r && r.status === 429 ? 'Too many requests. Try again in ' + (ra > 0 && ra < 3600 ? ra : 30) + ' seconds.' :
        (r && r.body && r.body.error && txt(r.body.error.message)) || 'Something went wrong. Please try again.';
      $('gr-error-msg').textContent = m;
      show('error');
    });
  }
  $('gr-retry').addEventListener('click', load);
  if (!window.csBnetEnabled()) { show('disabled'); return; }
  load();
})();
