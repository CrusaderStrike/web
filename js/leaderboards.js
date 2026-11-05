(function () {
  'use strict';

  var dungeon = [
    { rank: 1, name: 'Lightbringer', realm: 'Emberfall', faction: 'alliance', score: 3240, season: 'S1' },
    { rank: 2, name: 'Shadowrend', realm: 'Duskhollow', faction: 'horde', score: 3110, season: 'S1' },
    { rank: 3, name: 'Frostwhisper', realm: 'Emberfall', faction: 'alliance', score: 3055, season: 'S1' },
    { rank: 4, name: 'Bloodfury', realm: 'Stormwatch Keep', faction: 'horde', score: 2988, season: 'S1' },
    { rank: 5, name: 'Oakenshield', realm: 'Emberfall', faction: 'alliance', score: 2910, season: 'S1' },
    { rank: 6, name: 'Quickshot', realm: 'Duskhollow', faction: 'horde', score: 2844, season: 'S1' },
    { rank: 7, name: 'Dawnherald', realm: 'Emberfall', faction: 'alliance', score: 2799, season: 'S2' },
    { rank: 8, name: 'Grimtotem', realm: 'Stormwatch Keep', faction: 'horde', score: 2701, season: 'S2' }
  ];

  var pvp = [
    { rank: 1, name: 'Silentblade', realm: 'Duskhollow', faction: 'horde', score: 4120, season: 'S1' },
    { rank: 2, name: 'Stormpike', realm: 'Emberfall', faction: 'alliance', score: 4015, season: 'S1' },
    { rank: 3, name: 'Bonechewer', realm: 'Stormwatch Keep', faction: 'horde', score: 3960, season: 'S1' },
    { rank: 4, name: 'Lightbringer', realm: 'Emberfall', faction: 'alliance', score: 3888, season: 'S1' },
    { rank: 5, name: 'Hexweaver', realm: 'Duskhollow', faction: 'horde', score: 3750, season: 'S2' },
    { rank: 6, name: 'Shieldwall', realm: 'Emberfall', faction: 'alliance', score: 3699, season: 'S2' }
  ];

  var state = {
    board: 'dungeon',
    realm: '',
    faction: '',
    season: '',
    sortKey: 'rank',
    sortDir: 'asc'
  };

  var tbody = document.getElementById('lb-body');
  var tabs = document.querySelectorAll('[data-board]');
  var realmSel = document.getElementById('filter-realm');
  var factionSel = document.getElementById('filter-faction');
  var seasonSel = document.getElementById('filter-season');
  var caption = document.getElementById('lb-caption');
  if (!tbody) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function badgeFaction(f) {
    var cls = f === 'alliance' ? 'cs-badge-alliance' : 'cs-badge-horde';
    var label = f === 'alliance' ? 'Alliance' : 'Horde';
    return el('span', 'cs-badge ' + cls, label);
  }

  function rankBadge(rank) {
    return el('span', 'cs-badge cs-badge-rank' + (rank === 1 ? ' cs-badge-gold' : ''), rank);
  }

  function cell(child, cls) {
    var td = el('td', cls);
    if (child instanceof Node) td.appendChild(child); else td.textContent = String(child);
    return td;
  }

  function filtered() {
    var rows = (state.board === 'dungeon' ? dungeon : pvp).slice();
    rows = rows.filter(function (r) {
      if (state.realm && r.realm !== state.realm) return false;
      if (state.faction && r.faction !== state.faction) return false;
      if (state.season && r.season !== state.season) return false;
      return true;
    });
    rows.sort(function (a, b) {
      var ka = a[state.sortKey];
      var kb = b[state.sortKey];
      if (typeof ka === 'string') {
        ka = ka.toLowerCase();
        kb = String(kb).toLowerCase();
      }
      if (ka < kb) return state.sortDir === 'asc' ? -1 : 1;
      if (ka > kb) return state.sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }

  var sortBtns = document.querySelectorAll('button.cs-sort');

  function updateSortState() {
    sortBtns.forEach(function (btn) {
      var th = btn.closest('th');
      if (!th) return;
      var on = btn.getAttribute('data-sort') === state.sortKey;
      th.setAttribute('aria-sort', on ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }

  function render() {
    var rows = filtered();
    var frag = document.createDocumentFragment();
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(cell(rankBadge(r.rank)));
      tr.appendChild(cell(r.name));
      tr.appendChild(cell(r.realm));
      tr.appendChild(cell(badgeFaction(r.faction)));
      tr.appendChild(cell(r.season));
      tr.appendChild(cell(Number(r.score).toLocaleString(), 'lb-score'));
      frag.appendChild(tr);
    });
    if (!rows.length) {
      var tr = el('tr');
      var td = el('td', null, 'No entries match these filters.');
      td.colSpan = 6;
      tr.appendChild(td);
      frag.appendChild(tr);
    }
    tbody.replaceChildren(frag);
    updateSortState();

    if (caption) {
      caption.textContent = (state.board === 'dungeon' ? 'Dungeon Run' : 'World PvP') +
        ' leaderboard (mock data)';
    }
  }

  var tabList = Array.prototype.slice.call(tabs);
  var panel = document.getElementById('lb-panel');

  function selectTab(tab, focus) {
    state.board = tab.getAttribute('data-board');
    tabList.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    if (panel) panel.setAttribute('aria-labelledby', tab.id);
    if (focus) tab.focus();
    render();
  }

  tabList.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(tab, false); });
    tab.addEventListener('keydown', function (e) {
      var n = tabList.length, j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j === null) return;
      e.preventDefault();
      selectTab(tabList[j], true);
    });
  });

  function onFilter() {
    state.realm = realmSel.value;
    state.faction = factionSel.value;
    state.season = seasonSel.value;
    render();
  }
  realmSel.addEventListener('change', onFilter);
  factionSel.addEventListener('change', onFilter);
  seasonSel.addEventListener('change', onFilter);

  sortBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = key === 'score' ? 'desc' : 'asc';
      }
      render();
    });
  });

  render();
})();
