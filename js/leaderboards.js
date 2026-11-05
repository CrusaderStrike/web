(function () {
  'use strict';

  var dungeon = [
    { rank: 1, name: 'Lightbringer', realm: 'Whitemane', faction: 'alliance', score: 3240, season: 'S1' },
    { rank: 2, name: 'Shadowrend', realm: 'Faerlina', faction: 'horde', score: 3110, season: 'S1' },
    { rank: 3, name: 'Frostwhisper', realm: 'Whitemane', faction: 'alliance', score: 3055, season: 'S1' },
    { rank: 4, name: 'Bloodfury', realm: 'Grobbulus', faction: 'horde', score: 2988, season: 'S1' },
    { rank: 5, name: 'Oakenshield', realm: 'Whitemane', faction: 'alliance', score: 2910, season: 'S1' },
    { rank: 6, name: 'Quickshot', realm: 'Faerlina', faction: 'horde', score: 2844, season: 'S1' },
    { rank: 7, name: 'Dawnherald', realm: 'Whitemane', faction: 'alliance', score: 2799, season: 'S2' },
    { rank: 8, name: 'Grimtotem', realm: 'Grobbulus', faction: 'horde', score: 2701, season: 'S2' }
  ];

  var pvp = [
    { rank: 1, name: 'Silentblade', realm: 'Faerlina', faction: 'horde', score: 4120, season: 'S1' },
    { rank: 2, name: 'Stormpike', realm: 'Whitemane', faction: 'alliance', score: 4015, season: 'S1' },
    { rank: 3, name: 'Bonechewer', realm: 'Grobbulus', faction: 'horde', score: 3960, season: 'S1' },
    { rank: 4, name: 'Lightbringer', realm: 'Whitemane', faction: 'alliance', score: 3888, season: 'S1' },
    { rank: 5, name: 'Hexweaver', realm: 'Faerlina', faction: 'horde', score: 3750, season: 'S2' },
    { rank: 6, name: 'Shieldwall', realm: 'Whitemane', faction: 'alliance', score: 3699, season: 'S2' }
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

  function badgeFaction(f) {
    var cls = f === 'alliance' ? 'cs-badge-alliance' : 'cs-badge-horde';
    var label = f === 'alliance' ? 'Alliance' : 'Horde';
    return '<span class="cs-badge ' + cls + '">' + label + '</span>';
  }

  function rankBadge(rank) {
    var extra = rank === 1 ? ' cs-badge-gold' : '';
    return '<span class="cs-badge cs-badge-rank' + extra + '">' + rank + '</span>';
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

  function render() {
    var rows = filtered();
    tbody.innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td>' + rankBadge(r.rank) + '</td>' +
        '<td>' + r.name + '</td>' +
        '<td>' + r.realm + '</td>' +
        '<td>' + badgeFaction(r.faction) + '</td>' +
        '<td>' + r.season + '</td>' +
        '<td class="lb-score">' + r.score.toLocaleString() + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="6">No entries match these filters.</td></tr>';

    if (caption) {
      caption.textContent = (state.board === 'dungeon' ? 'Dungeon Run' : 'World PvP') +
        ' leaderboard (mock data)';
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      state.board = tab.getAttribute('data-board');
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      render();
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

  document.querySelectorAll('button.cs-sort').forEach(function (btn) {
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
