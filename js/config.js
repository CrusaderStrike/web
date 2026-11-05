/**
 * Signup API config.
 * TODO(web#3): set USE_MOCK_SIGNUP to false and point API_BASE at the live API
 * once Platform Dev flips the endpoint on. Keep mock default for local/Pages demos.
 */
window.CS_CONFIG = Object.freeze({
  API_BASE: 'https://api.crusaderstrike.com',
  USE_MOCK_SIGNUP: true,
  CONSENT_VERSION: '2026-11-04',
  SIGNUP_PATH: '/api/v1/signups',
  CONFIRM_PATH: '/api/v1/signups/confirm'
});
