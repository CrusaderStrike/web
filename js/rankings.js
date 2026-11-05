/** web#20 rankings page. Safe DOM only: data is set with textContent. */
(function () {
  'use strict';
  var api = window.CSRankingsApi;
  var $ = function (id) { return document.getElementById(id); };
  var DEFAULTS = { tab: 'dungeon', scope: 'guild', board: 'fastest_clear', dungeon_id: '', bracket: '', period: '7d', sort: 'rank', dir: 'asc' };
  var ALLOWED = {
    tab: ['dungeon', 'pvp'], scope: ['guild', 'all'], board: ['fastest_clear', 'runs_completed'],
    dungeon_id: ['', '36', '43', '33', '189', '230'], bracket: ['', 'solo', 'group'],
    period: ['7d', '30d', 'season'], sort: ['rank', 'character_name', 'value'], dir: ['asc', 'desc']
  };
  var LABELS = {
    scope: { guild: 'my guild', all: 'all guilds' },
    period: { '7d': 'last 7 days', '30d': 'last 30 days', season: 'this season' },
    sort: { rank: 'rank', character_name: 'character', value: null },
    bracket: { solo: 'solo bracket', group: 'group bracket' }
  };
  var state = {}, items = [], nextCursor = null, reqSeq = 0;

  function readUrl() {
    var p = new URLSearchParams(location.search);
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = p.get(k);
      state[k] = v !== null && ALLOWED[k].indexOf(v) >= 0 ? v : DEFAULTS[k];
    });
  }
  function writeUrl() {
    var p = new URLSearchParams(location.search);
    Object.keys(DEFAULTS).forEach(function (k) { if (state[k] === DEFAULTS[k]) p.delete(k); else p.set(k, state[k]); });
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }
  function board() { return state.tab === 'pvp' ? 'world_pvp' : state.board; }
  function valueLabel() { return { fastest_clear: 'Time', runs_completed: 'Runs', world_pvp: 'Honorable kills' }[board()]; }
  function fmtValue(v) {
    if (board() !== 'fastest_clear') return String(v);
    var s = Math.round(v), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h ? h + ':' + pad(m) : m) + ':' + pad(sec);
  }
  function optText(id) { var s = $(id); return s.options[s.selectedIndex].text; }

  function captionText() {
    var parts = [state.tab === 'pvp' ? 'World PvP' : 'Dungeon Runs'];
    if (state.tab === 'dungeon') {
      parts.push(optText('rk-board').toLowerCase());
      if (state.dungeon_id) parts.push(optText('rk-dungeon'));
    } else if (state.bracket) parts.push(LABELS.bracket[state.bracket]);
    parts.push(LABELS.scope[state.scope]);
    parts.push(LABELS.period[state.period]);
    var col = LABELS.sort[state.sort] || valueLabel().toLowerCase();
    return parts.join(', ') + ', sorted by ' + col + ' ' + (state.dir === 'asc' ? 'ascending' : 'descending');
  }

  function syncControls() {
    ['scope', 'board', 'dungeon_id', 'bracket', 'period'].forEach(function (k) {
      $('rk-' + (k === 'dungeon_id' ? 'dungeon' : k)).value = state[k];
    });
    document.querySelectorAll('[role=tab]').forEach(function (t) {
      var on = t.getAttribute('data-tab') === state.tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on) $('rk-panel').setAttribute('aria-labelledby', t.id);
    });
    document.querySelectorAll('[data-for]').forEach(function (f) { f.hidden = f.getAttribute('data-for') !== state.tab; });
    $('rk-value-h').textContent = valueLabel();
    document.querySelectorAll('th[aria-sort]').forEach(function (th) {
      var key = th.querySelector('button').getAttribute('data-sort');
      th.setAttribute('aria-sort', key === state.sort ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
    $('rk-caption').textContent = captionText();
  }

  function sorted() {
    var k = state.sort, d = state.dir === 'asc' ? 1 : -1;
    return items.slice().sort(function (a, b) {
      var x = a[k], y = b[k];
      if (typeof x === 'string') { x = x.toLowerCase(); y = String(y).toLowerCase(); }
      return x < y ? -d : x > y ? d : a.rank - b.rank;
    });
  }
  function td(text, cls) { var c = document.createElement('td'); if (cls) c.className = cls; c.textContent = text; return c; }
  function renderRows() {
    var body = $('rk-body');
    while (body.firstChild) body.removeChild(body.firstChild);
    sorted().forEach(function (r) {
      var tr = document.createElement('tr');
      var rc = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'cs-badge cs-badge-rank' + (r.rank === 1 ? ' cs-badge-gold' : '');
      badge.textContent = String(r.rank);
      rc.appendChild(badge);
      tr.appendChild(rc);
      tr.appendChild(td(String(r.character_name)));
      tr.appendChild(td(fmtValue(r.value), 'lb-score'));
      body.appendChild(tr);
    });
  }

  function show(which, msg) {
    $('rk-error').hidden = which !== 'error';
    $('rk-empty').hidden = which !== 'empty';
    $('rk-table-wrap').hidden = which === 'error' || which === 'empty';
    $('rk-table').setAttribute('aria-busy', which === 'loading' ? 'true' : 'false');
    if (which === 'error') $('rk-error-msg').textContent = msg;
    $('rk-status').textContent = which === 'loading' ? 'Loading rankings…' : which === 'ready' ? items.length + ' characters shown.' : '';
  }
  function errorMessage(e) {
    if (e.status === 401) return 'Sign in with Battle.net to see guild rankings.';
    if (e.status === 400) return 'Those filters are not supported yet. Try different filters.';
    if (e.status === 429) return 'Too many requests. Wait a moment and try again.';
    return 'Something went wrong on our side. Please try again.';
  }

  function load(append) {
    var seq = ++reqSeq;
    if (!append) { items = []; nextCursor = null; renderRows(); }
    $('rk-more').hidden = true;
    show('loading');
    var q = { board: board(), scope: state.scope, period: state.period, limit: 25 };
    if (state.tab === 'dungeon' && state.dungeon_id) q.dungeon_id = parseInt(state.dungeon_id, 10);
    if (state.tab === 'pvp' && state.bracket) q.bracket = state.bracket;
    if (append && nextCursor) q.cursor = nextCursor;
    api.getRankings(q).then(function (res) {
      if (seq !== reqSeq) return;
      items = items.concat(Array.isArray(res.items) ? res.items : []);
      nextCursor = res.next_cursor || null;
      if (!items.length) { show('empty'); $('rk-refreshed').textContent = ''; return; }
      renderRows();
      show('ready');
      $('rk-more').hidden = !nextCursor;
      var d = res.refreshed_at ? new Date(res.refreshed_at) : null;
      $('rk-refreshed').textContent = d && !isNaN(d) ? 'Updated ' + d.toLocaleString() : '';
    }, function (e) {
      if (seq !== reqSeq) return;
      show('error', errorMessage(e));
    });
  }

  function update(changes, refetch) {
    Object.keys(changes).forEach(function (k) { state[k] = changes[k]; });
    writeUrl(); syncControls();
    if (refetch) load(false); else renderRows();
  }

  readUrl(); writeUrl(); syncControls(); load(false);

  $('rk-filters').addEventListener('change', function (e) {
    var k = e.target.name, v = e.target.value;
    if (!k || ALLOWED[k].indexOf(v) < 0) return;
    var c = {}; c[k] = v; update(c, true);
  });
  document.querySelectorAll('.cs-sort').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-sort');
      var dir = state.sort === k ? (state.dir === 'asc' ? 'desc' : 'asc') : (k === 'value' && board() !== 'fastest_clear' ? 'desc' : 'asc');
      update({ sort: k, dir: dir }, false);
    });
  });
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role=tab]'));
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { if (state.tab !== t.getAttribute('data-tab')) update({ tab: t.getAttribute('data-tab'), sort: 'rank', dir: 'asc' }, true); });
    t.addEventListener('keydown', function (e) {
      var j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length :
        e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); tabs[j].focus(); tabs[j].click();
    });
  });
  $('rk-retry').addEventListener('click', function () { load(false); });
  $('rk-more').addEventListener('click', function () { load(true); });
})();
