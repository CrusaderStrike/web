/**
 * web#38 /guilds browse index. The first page is pre-rendered with plain links (crawlable, works without JS).
 * With JS, filters and paging call GET /api/v1/public/guilds. Filter semantics (contract): class and role
 * are AND within one recruiting need; repeated values of one filter are OR. State lives in the URL.
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG, api = window.CSGuildsApi;
  var LABEL = { tank: 'Tank', healer: 'Healer', dps: 'DPS', alliance: 'Alliance', horde: 'Horde' };
  var $ = function (id) { return document.getElementById(id); };
  var form = $('gl-filters'), list = $('gl-list'), status = $('gl-status'), err = $('gl-error'), empty = $('gl-empty');
  var prev = $('gl-prev'), next = $('gl-next'), pageLbl = $('gl-page');
  var cursors = [null], pageIdx = 0, nextCursor = null, seq = 0;
  var staticPage = +document.querySelector('main.gl').getAttribute('data-page') || 1;

  function readForm() {
    var q = {};
    if ($('gl-region').value) q.region = $('gl-region').value;
    if ($('gl-realm').value) q.realm = $('gl-realm').value;
    if ($('gl-faction').value) q.faction = $('gl-faction').value;
    ['role', 'class'].forEach(function (k) {
      var v = Array.prototype.filter.call(form.querySelectorAll('input[name="' + k + '"]'), function (c) { return c.checked; }).map(function (c) { return c.value; });
      if (v.length) q[k] = v;
    });
    return q;
  }
  function writeForm(q) {
    $('gl-region').value = q.region || ''; $('gl-realm').value = q.realm || ''; $('gl-faction').value = q.faction || '';
    Array.prototype.forEach.call(form.querySelectorAll('input[type=checkbox]'), function (c) { c.checked = (q[c.name] || []).indexOf(c.value) >= 0; });
  }
  function fromUrl() {
    var p = new URLSearchParams(location.search), q = {};
    var realms = Array.prototype.map.call($('gl-realm').options, function (o) { return o.value; });
    if (cfg.GUILD_REGIONS[p.get('region')]) q.region = p.get('region');
    if (p.get('realm') && realms.indexOf(p.get('realm')) > 0) q.realm = p.get('realm');
    if (/^(alliance|horde)$/.test(p.get('faction') || '')) q.faction = p.get('faction');
    ['role', 'class'].forEach(function (k) {
      var ok = Array.prototype.map.call(form.querySelectorAll('input[name="' + k + '"]'), function (c) { return c.value; });
      var v = p.getAll(k).filter(function (x, i, a) { return ok.indexOf(x) >= 0 && a.indexOf(x) === i; });
      if (v.length) q[k] = v;
    });
    return q;
  }
  function toUrl(q) {
    var p = new URLSearchParams();
    if (q.region) p.set('region', q.region); if (q.realm) p.set('realm', q.realm); if (q.faction) p.set('faction', q.faction);
    (q.role || []).forEach(function (r) { p.append('role', r); }); (q['class'] || []).forEach(function (c) { p.append('class', c); });
    var s = p.toString(); history.replaceState(null, '', '/guilds/' + (s ? '?' + s : ''));
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function card(g) {
    var li = el('li', 'cs-card gl-card');
    var img = el('img', 'gl-crest'); img.src = '/assets/crest-' + (g.faction === 'horde' ? 'horde' : 'alliance') + '.svg'; img.width = 48; img.height = 48; img.alt = '';
    var box = el('div'), h = el('h3', 'gl-name'), a = el('a', null, g.name);
    a.href = '/g/' + encodeURIComponent(g.region) + '/' + encodeURIComponent(g.realm_slug) + '/' + encodeURIComponent(g.guild_slug) + '/';
    h.appendChild(a);
    var meta = el('p', 'gl-meta');
    meta.appendChild(window.csFactionBadge ? window.csFactionBadge(g.faction) : el('span', 'cs-badge', LABEL[g.faction] || ''));
    meta.appendChild(document.createTextNode(' '));
    meta.appendChild(el('span', null, g.realm_name + ' (' + (cfg.GUILD_REGIONS[g.region] || g.region) + ')'));
    meta.appendChild(document.createTextNode(' · '));
    meta.appendChild(el('span', null, g.recruiting ? (g.open_roles.length ? 'Recruiting ' + g.open_roles.map(function (r) { return LABEL[r] || r; }).join(', ') : 'Recruiting') : 'Not recruiting'));
    box.appendChild(h); box.appendChild(meta); li.appendChild(img); li.appendChild(box);
    return li;
  }
  function errorText(e) {
    if (e.status === 429) { var s = parseInt(e.retryAfter, 10); return 'Too many requests. Try again in ' + (s > 0 ? s + ' second' + (s === 1 ? '' : 's') : 'a moment') + '.'; }
    if (e.status === 400) return 'Those filters are not valid. Clear them and try again.';
    if (!e.status) return 'Could not reach Crusader Strike. Check your connection and try again.';
    return 'Something went wrong loading guilds. Please try again.';
  }
  function load() {
    var my = ++seq, q = readForm();
    q.limit = cfg.GUILDS_PAGE_SIZE; if (cursors[pageIdx]) q.cursor = cursors[pageIdx];
    list.setAttribute('aria-busy', 'true'); status.textContent = 'Loading guilds…'; err.hidden = true; empty.hidden = true;
    return api.listGuilds(q).then(function (r) {
      if (my !== seq) return;
      while (list.firstChild) list.removeChild(list.firstChild);
      r.items.forEach(function (g) { list.appendChild(card(g)); });
      nextCursor = r.next_cursor || null;
      empty.hidden = r.items.length > 0;
      prev.hidden = pageIdx === 0; next.hidden = !nextCursor;
      prev.removeAttribute('href'); next.removeAttribute('href');
      pageLbl.textContent = 'Page ' + (pageIdx + 1);
      status.textContent = r.items.length ? 'Showing ' + r.items.length + ' guild' + (r.items.length === 1 ? '' : 's') + ', page ' + (pageIdx + 1) + '.' : 'No guilds match these filters.';
    }, function (e) {
      if (my !== seq) return;
      while (list.firstChild) list.removeChild(list.firstChild);
      prev.hidden = next.hidden = true;
      $('gl-error-msg').textContent = errorText(e); err.hidden = false; status.textContent = '';
    }).then(function () { if (my === seq) list.setAttribute('aria-busy', 'false'); });
  }
  function restart() { cursors = [null]; pageIdx = 0; toUrl(readForm()); return load(); }
  form.addEventListener('submit', function (ev) { ev.preventDefault(); restart(); });
  form.addEventListener('change', function () { restart(); });
  $('gl-clear').addEventListener('click', function () { writeForm({}); restart(); });
  $('gl-retry').addEventListener('click', function () { load(); });
  function page(ev, d) {
    if (!enhanced) return;                    // unfiltered static pages keep their plain links
    ev.preventDefault();
    if (d > 0) { if (!nextCursor) return; cursors[pageIdx + 1] = nextCursor; pageIdx++; } else { if (!pageIdx) return; pageIdx--; }
    load().then(function () { $('gl-results-h').setAttribute('tabindex', '-1'); list.focus && $('gl-results-h').focus(); });
  }
  var enhanced = false;
  next.addEventListener('click', function (ev) { page(ev, 1); });
  prev.addEventListener('click', function (ev) { page(ev, -1); });
  var initial = fromUrl();
  writeForm(initial);
  // Unfiltered: keep the pre-rendered, crawlable page and its static pager. Filtered (or any interaction): go live.
  if (Object.keys(initial).length && staticPage === 1) { enhanced = true; load(); }
  form.addEventListener('change', function () { enhanced = true; }, true);
  form.addEventListener('submit', function () { enhanced = true; }, true);
  $('gl-clear').addEventListener('click', function () { enhanced = true; }, true);
  window.CSGuildsBrowse = { load: load };
})();
