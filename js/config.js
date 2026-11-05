/**
 * Signup API config — see /workspace/contracts/signups-api.md (also mirrored in repo docs later).
 * TODO(web#3): set USE_MOCK_SIGNUP to false when Platform Dev enables the live endpoint.
 * CORS allows crusaderstrike.com / www; methods POST, OPTIONS; Content-Type; no credentials.
 */
window.CS_CONFIG = Object.freeze({
  API_BASE: 'https://api.crusaderstrike.com',
  USE_MOCK_SIGNUP: true,
  CONSENT_VERSION: '2026-11-04',
  SIGNUP_PATH: '/api/v1/signups',
  CONFIRM_PATH: '/api/v1/signups/confirm',
  // web#17: Battle.net sign-in + main/alt picker. OFF in production.
  // Dev/preview override (non-production hosts only): ?ff_bnet=1 or localStorage cs_ff_bnet=1.
  FEATURE_BNET_SIGNIN: false,
  // true = in-browser mock (js/auth-mock.js); false = real API at API_BASE (platform#11).
  USE_MOCK_AUTH: true,
  // Profile page (/profile/): true = js/auth-mock.js; false = real API. Paths in PROFILE_PATHS.
  USE_MOCK_PROFILE: true,
  PROFILE_PATHS: Object.freeze({
    SESSION: '/api/v1/auth/session',
    CHARACTERS: '/api/v1/me/characters',              // spec listMyCharacters
    SELECTION: '/api/v1/me/characters/selection',     // spec setMyCharacterSelection (confirmed)
    REFRESH: '/api/v1/me/characters/refresh'          // POST, X-CSRF-Token; confirmed by Platform Dev
  }),
  AUTH_PATHS: Object.freeze({
    // Paths per platform PR #18 openapi/v1.yaml (server base https://api.crusaderstrike.com/api/v1)
    START: '/api/v1/auth/blizzard/login',
    CALLBACK: '/api/v1/auth/blizzard/callback',
    SESSION: '/api/v1/auth/session',            // GET = session, DELETE = logout
    // Not yet in the spec; proposed in docs/auth-characters-api.md:
    CHARACTERS: '/api/v1/me/characters',
    SELECTION: '/api/v1/me/characters/selection'
  })
});

/** Resolves the Battle.net sign-in flag. Production hosts ignore overrides. */
window.csBnetEnabled = function () {
  var cfg = window.CS_CONFIG;
  if (cfg.FEATURE_BNET_SIGNIN) return true;
  var host = location.hostname;
  if (/(^|\.)crusaderstrike\.com$/.test(host)) return false;
  try {
    if (new URLSearchParams(location.search).get('ff_bnet') === '1') {
      localStorage.setItem('cs_ff_bnet', '1');
    }
    return localStorage.getItem('cs_ff_bnet') === '1';
  } catch (e) { return false; }
};
