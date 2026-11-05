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
  CONFIRM_PATH: '/api/v1/signups/confirm'
});
