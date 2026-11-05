/** Site config. API_BASE is shared by the auth, profile, gear and rankings clients. */
window.CS_CONFIG = Object.freeze({
  API_BASE: 'https://api.crusaderstrike.com',
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
  RANKINGS_PATH: '/api/v1/rankings',
  // Off = the page shows and sends only what GET /rankings has today (board, dungeon_id, cursor, limit).
  // On = also the World PvP tab and scope/period/bracket from the platform rankings draft contract.
  RANKINGS_EXTENDED_FILTERS: false,
  // The one place rankings filter values live.
  RANKINGS_FILTERS: Object.freeze({
    // In openapi/v1.yaml getRankings today:
    board: Object.freeze(['fastest_clear', 'runs_completed']),
    limit: 25,                                   // 1-100 (PageMeta)
    // dungeon_id: any positive integer (instanceMapID); no client-side list, unknown ids pass through.
    // Draft contract only (platform rankings proposal); used only when RANKINGS_EXTENDED_FILTERS is true:
    extended: Object.freeze({
      tab_board: Object.freeze({ world_pvp: 'world_pvp' }),
      scope: Object.freeze(['guild', 'realm', 'global']),
      period: Object.freeze(['week', 'month', 'season', 'all']),
      bracket: Object.freeze({                   // dungeon difficulty / bg level band; not used for world_pvp
        dungeon: Object.freeze(['normal', 'heroic']),
        bg: Object.freeze(['10-19', '20-29', '30-39', '40-49', '50-59', '60'])
      })
    })
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
