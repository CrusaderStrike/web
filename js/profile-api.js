/**
 * Thin client for the profile page. Shapes follow platform openapi/v1.yaml
 * platform#30 at ff99462
 * (getSession, getMyProfile/updateMyProfile, listMyCharacters, setMyCharacterSelection, refreshMyCharacters).
 * Every call resolves { status, ok, body }. Flip CS_CONFIG.USE_MOCK_PROFILE to use the real API.
 * When Platform Dev's profile OpenAPI lands, adapt only PROFILE_PATHS and setMain() here.
 */
(function () {
  'use strict';
  var cfg = window.CS_CONFIG;
  var P = cfg.PROFILE_PATHS;
  var mock = window.CSAuthMock;
  var csrf = null;
  function real(method, path, body) {
    var h = { Accept: 'application/json' };
    if (body) h['Content-Type'] = 'application/json';
    if (method !== 'GET' && csrf) h['X-CSRF-Token'] = csrf;
    return fetch(cfg.API_BASE + path, { method: method, credentials: 'include', headers: h, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.status === 204) return { status: 204, ok: true, body: null };
        var hd = { 'retry-after': r.headers.get('Retry-After') || '' };
        return r.json().catch(function () { return null; }).then(function (b) { return { status: r.status, ok: r.ok, body: b, headers: hd }; });
      }, function () { return { status: 0, ok: false, body: null }; });
  }
  var m = cfg.USE_MOCK_PROFILE;
  window.CSProfileApi = {
    session: function () {
      return (m ? mock.session() : real('GET', P.SESSION)).then(function (r) {
        if (r.ok && r.body) csrf = r.body.csrf_token || null;
        return r;
      });
    },
    profile: function () { return m ? mock.profile() : real('GET', P.PROFILE); },
    updateProfile: function (body) { return m ? mock.updateProfile(body, csrf) : real('PUT', P.PROFILE, body); },
    characters: function () { return m ? mock.characters() : real('GET', P.CHARACTERS); },
    /** Sets the main; every other character becomes an alt. Body = CharacterSelectionInput. */
    setMain: function (mainId, altIds) {
      var b = { main_id: mainId, alt_ids: altIds };
      return m ? mock.saveSelection(b, csrf) : real('PUT', P.SELECTION, b);
    },
    refresh: function () { return m ? mock.refresh(csrf) : real('POST', P.REFRESH); }
  };
})();
