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
  // true = in-browser mock (js/auth-mock.js); false = real API at API_BASE (platform#30).
  USE_MOCK_AUTH: true,
  // Profile page (/profile/): true = js/auth-mock.js; false = real API (platform main openapi/v1.yaml).
  USE_MOCK_PROFILE: true,
  // web#18 gear UI: true = js/gear-mock.js; false = real API GET /characters/{id}/gear.
  USE_MOCK_GEAR: true,
  GEAR_PATH: '/api/v1/characters/{id}/gear',      // platform#30 getCharacterGear
  PROFILE_PATHS: Object.freeze({
    SESSION: '/api/v1/auth/session',
    PROFILE: '/api/v1/me/profile',                   // GET/PUT UserProfile {battletag, main_character_id, preferred_region}
    CHARACTERS: '/api/v1/me/characters',              // spec listMyCharacters
    SELECTION: '/api/v1/me/characters/selection',     // setMyCharacterSelection
    REFRESH: '/api/v1/me/characters/refresh'          // refreshMyCharacters: POST, X-CSRF-Token, 60 s window (429 Retry-After)
  }),
  AUTH_PATHS: Object.freeze({
    // Paths per platform main openapi/v1.yaml (server base https://api.crusaderstrike.com/api/v1)
    START: '/api/v1/auth/blizzard/login',
    CALLBACK: '/api/v1/auth/blizzard/callback',
    SESSION: '/api/v1/auth/session',            // GET = session, DELETE = logout
    // Not yet in the spec; proposed in docs/auth-characters-api.md:
    CHARACTERS: '/api/v1/me/characters',
    SELECTION: '/api/v1/me/characters/selection'
  }),
  // web#20: rankings page. true = in-browser mock (js/rankings-mock.js) shaped like GET /rankings
  // in platform openapi/v1.yaml; false = real API at API_BASE (platform#25). Config flip only.
  USE_MOCK_RANKINGS: true,
  RANKINGS_PATH: '/api/v1/rankings'
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
