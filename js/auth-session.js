/**
 * Shared sign-out. DELETE /api/v1/auth/session (CSProfileApi.deleteSession sends the CSRF header
 * and credentials the same way as the other mutations). 204 and 401 both mean the Crusader Strike
 * session is gone. Network errors and 5xx leave the session in place.
 */
(function () {
  'use strict';
  function clearClientSession() {
    try {
      sessionStorage.removeItem('cs_mock_session');
      sessionStorage.removeItem('cs_mock_oauth_state');
      sessionStorage.removeItem('cs_mock_return_to');
    } catch (e) { /* storage blocked */ }
    ['CSProfileApi', 'CSArmoryApi', 'CSGearListsApi'].forEach(function (name) {
      var api = window[name];
      if (api && typeof api.clearCsrf === 'function') api.clearCsrf();
    });
  }
  window.CSAuthSession = {
    signOut: function () {
      var api = window.CSProfileApi;
      if (!api || typeof api.deleteSession !== 'function') return Promise.resolve({ ok: false, status: 0, body: null });
      return api.deleteSession().then(function (r) {
        var success = !!(r && (r.status === 204 || r.status === 401));
        if (success) clearClientSession();
        return { ok: success, status: r ? r.status : 0, body: r ? r.body : null };
      }, function () { return { ok: false, status: 0, body: null }; });
    }
  };
})();
