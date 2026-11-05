/** web#20 rankings page. Safe DOM only: data is set with textContent. */
(function () {
  'use strict';
  var api = window.CSRankingsApi;
  var $ = function (id) { return document.getElementById(id); };
  var cfg = window.CS_CONFIG, F = cfg.RANKINGS_FILTERS, EXT = !!cfg.RANKINGS_EXTENDED_FILTERS;
  var DEFAULTS = { tab: 'dungeon', board: F.board[0], dungeon_id: '', scope: '', bracket: '', period: '', sort: 'rank', dir: 'asc' };
  var EXT_KEYS = ['scope', 'bracket', 'period'];
  // Allowed values come from CS_CONFIG.RANKINGS_FILTERS only. '' = not set (nothing is sent; server default applies).
  function allowed(k, v) {
    if (k === 'dungeon_id') return v === '' || /^[1-9][0-9]{0,9}$/.test(v);
    if (k === 'board') return F.board.indexOf(v) >= 0;
    if (k === 'sort') return ['rank', 'character_name', 'value'].indexOf(v) >= 0;
    if (k === 'dir') return v === 'asc' || v === 'desc';
    if (!EXT) return v === DEFAULTS[k];
    if (k === 'tab') return v === 'dungeon' || v === 'pvp';
    if (k === 'bracket') return v === '' || F.extended.bracket.dungeon.indexOf(v) >= 0;
    return v === '' || F.extended[k].indexOf(v) >= 0;
  }
  // Presentation labels only (values live in config).
  var LABELS = {
    board: { fastest_clear: 'Fastest clear', runs_completed: 'Runs completed' },
    scope: { guild: 'My guild', realm: 'My realm', global: 'All realms' },
    period: { week: 'This week', month: 'This month', season: 'This season', all: 'All time' },
    sort: { rank: 'rank', character_name: 'character', value: null }
  };
  function cap(v) { return v.charAt(0).toUpperCase() + v.slice(1); }
  function label(k, v) { return (LABELS[k] && LABELS[k][v]) || cap(v); }
  var state = {}, items = [], nextCursor = null, reqSeq = 0;

  function fillSelect(id, k, values, withDefault) {
    var sel = $(id);
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    if (withDefault) { var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Default'; sel.appendChild(o0); }
    values.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = label(k, v); sel.appendChild(o); });
  }
  fillSelect('rk-board', 'board', F.board, false);
  if (EXT) {
    $('rk-tabs').hidden = false;
    document.querySelectorAll('[data-ext]:not([data-for])').forEach(function (n) { n.hidden = false; });
    fillSelect('rk-scope', 'scope', F.extended.scope, true);
    fillSelect('rk-period', 'period', F.extended.period, true);
    fillSelect('rk-bracket', 'bracket', F.extended.bracket.dungeon, true);
  } else {
    // Flag off: remove the unspecced controls entirely so none of their labels can show.
    document.querySelectorAll('[data-ext]').forEach(function (n) { n.parentNode.removeChild(n); });
    var tabs0 = $('rk-tabs'); tabs0.parentNode.removeChild(tabs0);
  }

  function readUrl() {
    var p = new URLSearchParams(location.search);
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = p.get(k);
      state[k] = v !== null && allowed(k, v) ? v : DEFAULTS[k];
    });
  }
  function writeUrl() {
    var p = new URLSearchParams(location.search);
    Object.keys(DEFAULTS).forEach(function (k) { if (state[k] === DEFAULTS[k]) p.delete(k); else p.set(k, state[k]); });
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }
  function board() { return EXT && state.tab === 'pvp' ? F.extended.tab_board.world_pvp : state.board; }
  function valueLabel() { return { fastest_clear: 'Time', runs_completed: 'Runs', world_pvp: 'Honorable kills' }[board()]; }
  function fmtValue(v) {
    if (board() !== 'fastest_clear') return String(v);
    var s = Math.round(v), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h ? h + ':' + pad(m) : m) + ':' + pad(sec);
  }

  function captionText() {
    var parts = [state.tab === 'pvp' ? 'World PvP' : 'Dungeon Runs'];
    if (state.tab === 'dungeon') {
      parts.push(label('board', state.board).toLowerCase());
      parts.push(state.dungeon_id ? 'dungeon ' + state.dungeon_id : 'all dungeons');
      if (EXT && state.bracket) parts.push(label('bracket', state.bracket).toLowerCase());
    }
    if (EXT && state.scope) parts.push(label('scope', state.scope).toLowerCase());
    if (EXT && state.period) parts.push(label('period', state.period).toLowerCase());
    var col = LABELS.sort[state.sort] || valueLabel().toLowerCase();
    var sortTxt = state.sort === 'rank' && state.dir === 'asc' ? 'by rank' :
      'loaded rows sorted by ' + col + ' ' + (state.dir === 'asc' ? 'ascending' : 'descending');
    return parts.join(', ') + ', ' + sortTxt;
  }

  function syncControls() {
    ['board', 'dungeon_id'].concat(EXT ? EXT_KEYS : []).forEach(function (k) {
      $('rk-' + (k === 'dungeon_id' ? 'dungeon' : k)).value = state[k];
    });
    document.querySelectorAll('[role=tab]').forEach(function (t) {
      var on = t.getAttribute('data-tab') === state.tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on) $('rk-panel').setAttribute('aria-labelledby', t.id);
    });
    if (!EXT) { $('rk-panel').removeAttribute('role'); $('rk-panel').removeAttribute('aria-labelledby'); $('rk-panel').removeAttribute('tabindex'); }
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
    if (e.status === 429) {
      var ra = parseInt(e.retryAfter, 10);
      return 'Too many requests. Try again in ' + (ra > 0 && ra < 3600 ? ra : 30) + ' seconds.';
    }
    if (e.status === 502 || e.status === 503) return 'Rankings are temporarily unavailable. Please try again in a few minutes.';
    if (!e.status) return 'Could not reach Crusader Strike. Check your connection and try again.';
    return 'Something went wrong on our side. Please try again.';
  }

  function load(append) {
    var seq = ++reqSeq;
    if (!append) { items = []; nextCursor = null; renderRows(); }
    $('rk-more').hidden = true;
    show('loading');
    // Only spec params by default; extended ones only when the flag is on AND the user set them.
    var q = { board: board(), limit: F.limit };
    if (state.tab === 'dungeon' && state.dungeon_id) q.dungeon_id = parseInt(state.dungeon_id, 10);
    if (EXT) EXT_KEYS.forEach(function (k) {
      if (state[k] && (k !== 'bracket' || state.tab === 'dungeon')) q[k] = state[k];
    });
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
    var k = e.target.name, v = String(e.target.value).trim();
    if (!k || !allowed(k, v)) { if (k === 'dungeon_id') syncControls(); return; }
    var c = {}; c[k] = v; update(c, true);
  });
  document.querySelectorAll('.cs-sort').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-sort');
      var dir = state.sort === k ? (state.dir === 'asc' ? 'desc' : 'asc') : (k === 'value' && board() !== 'fastest_clear' ? 'desc' : 'asc');
      update({ sort: k, dir: dir }, false);
    });
  });
  var tabs = EXT ? Array.prototype.slice.call(document.querySelectorAll('[role=tab]')) : [];
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
