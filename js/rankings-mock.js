/**
 * web#20 mock for GET /rankings (platform openapi/v1.yaml, platform#18 contract).
 * Response: { next_cursor: string|null, refreshed_at: date-time, items: RankingEntry[] }
 * RankingEntry: { rank, character_name, member_id: uuid|null, value: number, run_id: uuid|null }
 * Fictional data only. Dev scenarios: ?mock_scenario=empty|error|unauthorized|slow
 */
(function () {
  'use strict';
  function uuid(n) { return '00000000-0000-4000-8000-' + ('000000000000' + n).slice(-12); }
  var names = ['Lightbringer', 'Shadowrend', 'Frostwhisper', 'Bloodfury', 'Oakenshield', 'Quickshot',
    'Dawnherald', 'Grimtotem', 'Silentblade', 'Stormpike', 'Bonechewer', 'Hexweaver', 'Shieldwall',
    'Ashenvow', 'Thornquill', 'Grimlantern', 'Emberkin', 'Duskmantle', 'Ironbrand', 'Moonquill',
    'Cinderfang', 'Brightwater', 'Ravencrest', 'Stonehoof', 'Wildmane', 'Gloomweaver', 'Sunstrider',
    'Hollowpeak'];
  // value units: fastest_clear = seconds; runs_completed = count; world_pvp (proposed) = honorable kills
  function build(board, dungeonId, q) {
    var seed = ((dungeonId || 0) + (q.scope === 'all' ? 3 : 0) + ({ '30d': 1, season: 2 }[q.period] || 0) + ({ solo: 1, group: 2 }[q.bracket] || 0)) % 7;
    var count = board === 'world_pvp' ? 14 : 28;
    var out = [];
    for (var i = 0; i < count; i++) {
      var v;
      if (board === 'fastest_clear') v = 1080 + i * 47 + seed * 31;
      else if (board === 'runs_completed') v = 64 - i * 2 - seed;
      else v = 4120 - i * 85;
      out.push({
        rank: i + 1,
        character_name: names[(i + seed) % names.length],
        member_id: i % 9 === 8 ? null : uuid(1000 + i),
        value: v,
        run_id: board === 'fastest_clear' ? uuid(5000 + i + seed * 100) : null
      });
    }
    return out;
  }
  function scenario() {
    try { return new URLSearchParams(location.search).get('mock_scenario') || ''; } catch (e) { return ''; }
  }
  function err(status, code, message) {
    var e = new Error(message); e.status = status; e.body = { error: { code: code, message: message, request_id: 'mock-req' } };
    return e;
  }
  window.CSRankingsMock = {
    getRankings: function (q) {
      var sc = scenario();
      var delay = sc === 'slow' ? 1500 : 250;
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if (sc === 'error') return reject(err(500, 'internal_error', 'Unexpected server error.'));
          if (sc === 'unauthorized') return reject(err(401, 'unauthenticated', 'No or invalid session.'));
          if (['fastest_clear', 'runs_completed', 'world_pvp'].indexOf(q.board) < 0) {
            return reject(err(400, 'validation_failed', 'board is invalid'));
          }
          var all = sc === 'empty' ? [] : build(q.board, q.dungeon_id, q);
          var limit = Math.min(Math.max(q.limit || 25, 1), 100);
          var start = q.cursor ? parseInt(atob(q.cursor), 10) || 0 : 0;
          var page = all.slice(start, start + limit);
          var next = start + limit < all.length ? btoa(String(start + limit)) : null;
          resolve({ next_cursor: next, refreshed_at: '2026-11-04T18:00:00Z', items: page });
        }, delay);
      });
    }
  };
})();
