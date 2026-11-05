/**
 * Mock for the Battle.net auth, characters and profile API (platform main openapi/v1.yaml; docs/auth-characters-api.md).
 * Character ids are opaque (ch_<region>_<id>); never parse them.
 * No network calls, no OAuth, no secrets. State lives in sessionStorage/localStorage.
 * Dev scenarios: ?mock_scenario=empty | error | upstream (characters endpoint).
 */
(function () {
  'use strict';
  var SESSION_KEY = 'cs_mock_session';
  var SELECTION_KEY = 'cs_mock_selection';
  var REGION_KEY = 'cs_mock_region';
  var STALE_KEY = 'cs_mock_stale';  // ids marked stale by a mock refresh
  var FIXTURES = [
    { id: 'ch_us_1001', region: 'us', character_name: 'Lightbringer', surname: 'Dawnmantle', realm: 'Emberfall', faction: 'alliance', class: 'Paladin', race: 'Human', level: 60, game: 'wow_forever' },
    { id: 'ch_us_1002', region: 'us', character_name: 'Ashenvow', surname: null, realm: 'Emberfall', faction: 'alliance', class: 'Priest', race: 'Dwarf', level: 60, game: 'wow_forever' },
    { id: 'ch_us_1003', region: 'us', character_name: 'Thornquill', surname: 'Briarhide', realm: null, faction: 'horde', class: 'Druid', race: 'Tauren', level: 52, game: 'wow_forever' },
    { id: 'ch_us_1004', region: 'us', character_name: 'Grimlantern', faction: 'horde', class: 'Warlock', race: 'Undead', level: 38, game: 'wow_forever' },
    // web#26: faction null (Forever profile may not return it) -> neutral badge, never Horde.
    { id: 'ch_us_1005', region: 'us', character_name: 'Wispwander', surname: null, realm: 'Duskhollow', faction: null, class: 'Rogue', race: 'Gnome', level: 27, game: 'wow_forever' },
    // Stale: missing from the latest Battle.net refresh (never hard-deleted). Not offered as main/alt.
    { id: 'ch_eu_2001', region: 'eu', character_name: 'Hollowpeak', surname: null, realm: 'Stormwatch Keep', faction: 'horde', class: 'Warrior', race: 'Orc', level: 44, game: 'wow_forever', stale: true },
    // Non-Forever entries the server must filter out; the mock filters too, to prove the UI never shows them.
    { id: 'ch_us_9001', region: 'us', character_name: 'Filtered', surname: null, realm: 'Emberfall', faction: 'alliance', class: 'Mage', race: 'Gnome', level: 10, game: 'other' }
  ];

  function scenario() {
    try { return new URLSearchParams(location.search).get('mock_scenario') || ''; } catch (e) { return ''; }
  }
  function delay(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 350); }); }
  function res(status, body, headers) { return delay({ status: status, ok: status >= 200 && status < 300, body: body, headers: headers || {} }); }
  // Error shapes per openapi/v1.yaml: Error {error:{code,message,request_id}} and ValidationErrors {errors:{field:msg}}.
  function err(status, code, message) { return res(status, { error: { code: code, message: message, request_id: 'req_mock' } }); }
  function invalid(field, message) { var e = {}; e[field] = message; return res(400, { errors: e }); }
  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function staleIds() { try { return JSON.parse(localStorage.getItem(STALE_KEY)) || []; } catch (e) { return []; } }
  function selection() { try { return JSON.parse(localStorage.getItem(SELECTION_KEY)); } catch (e) { return null; } }
  function randomToken() {
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // Same rule as the platform return_to helper: single leading '/', no '//', backslash, ':' or encoded forms.
  function safePath(v) {
    if (typeof v !== 'string' || v.charAt(0) !== '/') return null;
    var d; try { d = decodeURIComponent(v); } catch (e) { return null; }
    if (/^\/\//.test(v) || /^\/\//.test(d) || /[\\:]/.test(d.split('?')[0])) return null;
    try { var u = new URL(v, 'https://x.invalid'); if (u.origin !== 'https://x.invalid' || /^\/\//.test(u.pathname)) return null; } catch (e) { return null; }
    return v;
  }
  window.CSAuthMock = {
    /** Simulates GET START: stores return_to with the OAuth state (invalid/missing -> /profile/, never 400). */
    start: function (returnTo) {
      var state = randomToken();
      sessionStorage.setItem('cs_mock_oauth_state', state);
      sessionStorage.setItem('cs_mock_return_to', safePath(returnTo) || '/profile/');
      return 'signin.html?mock_authorize=1&state=' + encodeURIComponent(state);
    },
    /** Simulates GET CALLBACK, matching the live platform callback. Returns the absolute-path redirect target.
     *  outcome: 'ok' | 'access_denied' (cancelled) | 'no_code' | 'exchange_failed' | 'upstream_unavailable'.
     *  No stored return_to (or bad state): every result goes to /profile/. With a stored return_to, ok, cancelled
     *  and no-code go to that path; a failed exchange always goes to /profile/. A return_to on the callback is ignored. */
    callback: function (state, outcome) {
      var expected = sessionStorage.getItem('cs_mock_oauth_state');
      var stored = sessionStorage.getItem('cs_mock_return_to');
      sessionStorage.removeItem('cs_mock_oauth_state'); sessionStorage.removeItem('cs_mock_return_to');
      var to = function (path, q) { return path + (path.indexOf('?') >= 0 ? '&' : '?') + q; };
      if (!expected || expected !== state) return to('/profile/', 'auth=error&reason=invalid_state');
      var rt = safePath(stored) || '/profile/';
      if (outcome === 'access_denied') return to(rt, 'auth=cancelled');
      if (outcome === 'no_code') return to(rt, 'auth=error&reason=oauth_error');
      if (outcome === 'exchange_failed') return to('/profile/', 'auth=error&reason=oauth_error');
      if (outcome === 'upstream_unavailable') return to('/profile/', 'auth=error&reason=upstream_unavailable');
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ battletag: 'Crusader#1234', csrf_token: randomToken() }));
      return to(rt, 'auth=ok');
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
      var extra = staleIds();
      var list = sc === 'empty' ? [] : FIXTURES.filter(function (c) { return c.game === 'wow_forever'; }).map(function (c) {
        var o = JSON.parse(JSON.stringify(c)); if (extra.indexOf(c.id) >= 0) o.stale = true; return o;
      });
      var sel = null;
      try { sel = JSON.parse(localStorage.getItem(SELECTION_KEY)); } catch (e) { sel = null; }
      return res(200, { game: 'wow_forever', characters: list, selection: sel });
    },
    saveSelection: function (body, csrf) {
      var s = session();
      if (!s) return err(401, 'unauthenticated', 'Sign in required.');
      if (scenario() === 'save_error') return err(500, 'internal_error', 'Could not save. Try again.');
      if (!csrf || csrf !== s.csrf_token) return err(403, 'csrf_failed', 'Security check failed. Reload and try again.');
      if (scenario() === 'save_ratelimit') return res(429, { error: { code: 'rate_limited', message: 'Too many requests.', request_id: 'req_mock' } }, { 'retry-after': '5' });
      if (scenario() === 'save_body') return res(400, { errors: { body: 'invalid_json' } });
      var extra = staleIds();
      var ids = FIXTURES.filter(function (c) { return c.game === 'wow_forever' && !c.stale && extra.indexOf(c.id) < 0; }).map(function (c) { return c.id; });
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
      if (!csrf || csrf !== s.csrf_token) return err(403, 'csrf_failed', 'Security check failed. Reload and try again.');
      if (scenario() === 'refresh_error') return err(502, 'upstream_unavailable', 'Battle.net is not responding.');
      if (scenario() === 'refresh_ratelimit') {
        return res(429, { error: { code: 'rate_limited', message: 'Too many refreshes.', request_id: 'req_mock' } }, { 'retry-after': '3' });
      }
      if (scenario() === 'refresh_stale') {
        // The current main went missing on Battle.net: mark it stale and clear the selection (per platform#30).
        var sel = selection();
        if (sel && sel.main_id) {
          var st = staleIds(); st.push(sel.main_id);
          localStorage.setItem(STALE_KEY, JSON.stringify(st));
          localStorage.removeItem(SELECTION_KEY);
        }
      }
      return this.characters();
    },
    /** GET /me/profile -> UserProfile */
    profile: function () {
      var s = session();
      if (!s) return err(401, 'unauthenticated', 'Sign in required.');
      var sel = selection();
      return res(200, { battletag: s.battletag, main_character_id: sel ? sel.main_id : null,
        preferred_region: localStorage.getItem(REGION_KEY) || 'us', created_at: '2026-10-01T18:00:00Z', updated_at: new Date().toISOString() });
    },
    /** PUT /me/profile (UserProfileUpdate: { preferred_region? }) -> UserProfile */
    updateProfile: function (body, csrf) {
      var s = session();
      if (!s) return err(401, 'unauthenticated', 'Sign in required.');
      if (!csrf || csrf !== s.csrf_token) return err(403, 'csrf_failed', 'Security check failed. Reload and try again.');
      if (!body || typeof body !== 'object') return invalid('body', 'Request body is invalid.');
      var keys = Object.keys(body);
      for (var i = 0; i < keys.length; i++) if (keys[i] !== 'preferred_region') return invalid('body', 'Unknown field: ' + keys[i]);
      if ('preferred_region' in body) {
        if (['us', 'eu', 'kr', 'tw'].indexOf(body.preferred_region) < 0) return invalid('preferred_region', 'Region must be us, eu, kr or tw.');
        localStorage.setItem(REGION_KEY, body.preferred_region);
      }
      return this.profile();
    },
    /** Test helper: forget mock stale marks. */
    devReset: function () { localStorage.removeItem(STALE_KEY); localStorage.removeItem(SELECTION_KEY); localStorage.removeItem(REGION_KEY); },
    /** Test/dev helper: start a mock session without the OAuth screens. */
    devSignIn: function () {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ battletag: 'Crusader#1234', csrf_token: randomToken() }));
    },
    /** DELETE /auth/session */
    logout: function () { sessionStorage.removeItem(SESSION_KEY); return res(204, null); }
  };
})();
