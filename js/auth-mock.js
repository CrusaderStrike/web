/**
 * web#17 mock for the Battle.net auth + characters API (docs/auth-characters-api.md).
 * No network calls, no OAuth, no secrets. State lives in sessionStorage/localStorage.
 * Dev scenarios: ?mock_scenario=empty | error | upstream (characters endpoint).
 */
(function () {
  'use strict';
  var SESSION_KEY = 'cs_mock_session';
  var SELECTION_KEY = 'cs_mock_selection';
  var FIXTURES = [
    { id: 'ch_1001', character_name: 'Lightbringer', surname: 'Dawnmantle', realm: 'Emberfall', faction: 'alliance', class: 'Paladin', race: 'Human', level: 60, game: 'wow_forever' },
    { id: 'ch_1002', character_name: 'Ashenvow', surname: null, realm: 'Emberfall', faction: 'alliance', class: 'Priest', race: 'Dwarf', level: 60, game: 'wow_forever' },
    { id: 'ch_1003', character_name: 'Thornquill', surname: 'Briarhide', realm: null, faction: 'horde', class: 'Druid', race: 'Tauren', level: 52, game: 'wow_forever' },
    { id: 'ch_1004', character_name: 'Grimlantern', faction: 'horde', class: 'Warlock', race: 'Undead', level: 38, game: 'wow_forever' },
    // web#26: faction omitted (Forever profile may not return it) -> neutral badge, never Horde.
    { id: 'ch_1005', character_name: 'Wispwander', surname: null, realm: 'Duskhollow', class: 'Rogue', race: 'Gnome', level: 27, game: 'wow_forever' },
    // Non-Forever entries the server must filter out; the mock filters too, to prove the UI never shows them.
    { id: 'ch_9001', character_name: 'Filtered', surname: null, realm: 'Emberfall', faction: 'alliance', class: 'Mage', race: 'Gnome', level: 10, game: 'other' }
  ];

  function scenario() {
    try { return new URLSearchParams(location.search).get('mock_scenario') || ''; } catch (e) { return ''; }
  }
  function delay(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 350); }); }
  function res(status, body) { return delay({ status: status, ok: status >= 200 && status < 300, body: body }); }
  // Error shapes per openapi/v1.yaml: Error {error:{code,message,request_id}} and ValidationErrors {errors:{field:msg}}.
  function err(status, code, message) { return res(status, { error: { code: code, message: message, request_id: 'req_mock' } }); }
  function invalid(field, message) { var e = {}; e[field] = message; return res(400, { errors: e }); }
  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function randomToken() {
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  window.CSAuthMock = {
    /** Simulates GET START: returns the URL the browser would be redirected to. */
    start: function (returnTo) {
      var state = randomToken();
      sessionStorage.setItem('cs_mock_oauth_state', state);
      return 'signin.html?mock_authorize=1&state=' + encodeURIComponent(state) +
        '&return_to=' + encodeURIComponent(returnTo || '/signin.html');
    },
    /** Simulates GET CALLBACK. outcome: 'ok' | 'access_denied'. Returns redirect target. */
    callback: function (state, outcome) {
      var expected = sessionStorage.getItem('cs_mock_oauth_state');
      sessionStorage.removeItem('cs_mock_oauth_state');
      if (outcome === 'access_denied') return 'signin.html?auth=cancelled';
      if (!expected || expected !== state) return 'signin.html?auth=error&reason=invalid_state';
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ battletag: 'Crusader#1234', csrf_token: randomToken() }));
      return 'signin.html?auth=ok';
    },
    /** GET /auth/session -> Session (incl. csrf_token). */
    session: function () {
      var s = session();
      if (!s) return err(401, 'unauthenticated', 'Sign in required.');
      return res(200, { battletag: s.battletag, active_guild_id: null, memberships: [], csrf_token: s.csrf_token });
    },
    /** GET /me/characters -> CharacterList. */
    characters: function () {
      if (!session()) return err(401, 'unauthenticated', 'Sign in required.');
      var sc = scenario();
      if (sc === 'error') return err(500, 'internal_error', 'Something went wrong.');
      if (sc === 'nomain') { localStorage.removeItem(SELECTION_KEY); }
      if (sc === 'upstream') return err(502, 'upstream_unavailable', 'Battle.net is not responding.');
      var list = sc === 'empty' ? [] : FIXTURES.filter(function (c) { return c.game === 'wow_forever'; });
      var sel = null;
      try { sel = JSON.parse(localStorage.getItem(SELECTION_KEY)); } catch (e) { sel = null; }
      return res(200, { game: 'wow_forever', characters: list, selection: sel });
    },
    saveSelection: function (body, csrf) {
      var s = session();
      if (!s) return err(401, 'unauthenticated', 'Sign in required.');
      if (scenario() === 'save_error') return err(500, 'internal_error', 'Could not save. Try again.');
      if (!csrf || csrf !== s.csrf_token) return err(403, 'csrf_failed', 'Security check failed. Reload and try again.');
      var ids = FIXTURES.filter(function (c) { return c.game === 'wow_forever'; }).map(function (c) { return c.id; });
      if (!body || ids.indexOf(body.main_id) === -1) return invalid('main_id', 'Pick a main from your characters.');
      var alts = Array.isArray(body.alt_ids) ? body.alt_ids : [];
      for (var i = 0; i < alts.length; i++) {
        if (ids.indexOf(alts[i]) === -1 || alts[i] === body.main_id) return invalid('alt_ids', 'Alts must be your other characters.');
      }
      var sel = { main_id: body.main_id, alt_ids: alts, updated_at: new Date().toISOString() };
      localStorage.setItem(SELECTION_KEY, JSON.stringify(sel));
      return res(200, { selection: sel });
    },
    /** POST /me/characters/refresh (proposed, not in spec): re-sync from Battle.net, returns CharacterList. */
    refresh: function (csrf) {
      var s = session();
      if (!s) return err(401, 'unauthenticated', 'Sign in required.');
      if (scenario() === 'refresh_error') return err(502, 'upstream_unavailable', 'Battle.net is not responding.');
      if (!csrf || csrf !== s.csrf_token) return err(403, 'csrf_failed', 'Security check failed. Reload and try again.');
      return this.characters();
    },
    /** Test/dev helper: start a mock session without the OAuth screens. */
    devSignIn: function () {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ battletag: 'Crusader#1234', csrf_token: randomToken() }));
    },
    /** DELETE /auth/session */
    logout: function () { sessionStorage.removeItem(SESSION_KEY); return res(204, null); }
  };
})();
