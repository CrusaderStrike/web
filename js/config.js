/** Site config. API_BASE is shared by the auth, profile, gear and rankings clients. */
/** Production hosts: the armory/auth/profile/gear-lists mocks never run here, whatever the flags below say (see csProdGuard). */
window.CS_PROD_HOSTS = Object.freeze(['crusaderstrike.com', 'www.crusaderstrike.com']);
/** Mock flags forced off on CS_PROD_HOSTS (Product scope). USE_MOCK_GEAR and USE_MOCK_RANKINGS are NOT forced: they stay as configured (on) in prod today. */
window.CS_PROD_FORCED_OFF = Object.freeze(['USE_MOCK_ARMORY', 'USE_MOCK_AUTH', 'USE_MOCK_PROFILE', 'USE_MOCK_GEAR_LISTS']);
function csProdGuard(c) {
  var h = ''; try { h = String(location.hostname || '').toLowerCase(); } catch (e) {}
  c.IS_PROD_HOST = window.CS_PROD_HOSTS.indexOf(h) >= 0;
  if (c.IS_PROD_HOST) window.CS_PROD_FORCED_OFF.forEach(function (k) { c[k] = false; });  // gear + rankings mocks intentionally keep their configured value on prod
  return c;
}
window.CS_CONFIG = Object.freeze(csProdGuard({
  API_BASE: 'https://api.crusaderstrike.com',
  // web#17: Battle.net sign-in + main/alt picker. OFF in production.
  // Dev/preview override (non-production hosts only): ?ff_bnet=1 or localStorage cs_ff_bnet=1.
  FEATURE_BNET_SIGNIN: true,
  // true = in-browser mock (js/auth-mock.js); false = real API at API_BASE (platform#30).
  USE_MOCK_AUTH: false,
  // Profile page (/profile/): true = js/auth-mock.js; false = real API (platform main openapi/v1.yaml).
  USE_MOCK_PROFILE: false,
  // web#18 gear UI: true = js/gear-mock.js; false = real API GET /characters/{id}/gear.
  USE_MOCK_GEAR: true,
  GEAR_PATH: '/api/v1/characters/{id}/gear',      // platform#30 getCharacterGear
  // web#18 gear lists (platform#17, per character; server cap answers 409 list_limit_reached, no client cap). true = js/gear-lists-mock.js (?mock= scenarios); false = real API.
  // web#40: live against platform main src/routes/gear-lists.ts (signed-in only; cs_session cookie + X-CSRF-Token on writes).
  USE_MOCK_GEAR_LISTS: false,
  GEAR_LISTS_PATHS: Object.freeze({
    LISTS: '/api/v1/characters/{id}/gear-lists',     // GET, POST {name, type:'max_level', until_level:null, role_spec:null}
    LIST: '/api/v1/gear-lists/{id}',                  // GET, PATCH/DELETE with If-Match "v<version>"
    OPS: '/api/v1/gear-lists/{id}/ops',               // POST {ops[]} -> 200 {version, applied, duplicates, conflicts, list}
    EVENTS: '/api/v1/gear-lists/{id}/events'          // GET ?after_version=&limit=
  }),
  // web#42 profile display toggles + armory gear sets. Contract: platform main openapi/v1.yaml + src/routes/{profile,gear-lists}.ts,
  // gear-list schema v1. Display = PUT selection; slot edits = POST ops.
  // true = js/armory-mock.js (fictional Forever items, ?mock_armory= scenarios); false = real API at API_BASE.
  USE_MOCK_ARMORY: false,  // forced false on CS_PROD_HOSTS regardless (CS_PROD_FORCED_OFF); e2e suites force true via _test-config.js
  ARMORY_PATHS: Object.freeze({
    SETS: '/api/v1/characters/{id}/gear-lists',       // GET, POST {name, type:'max_level', until_level:null, role_spec:null}
    SET: '/api/v1/gear-lists/{id}',                   // GET (ETag "v<version>")
    OPS: '/api/v1/gear-lists/{id}/ops',               // POST {ops:[set_slot {op_id, slot, item_id, base_version} | clear_slot {op_id, slot, base_version}]} -> {version, applied, duplicates, conflicts, list}
    ITEMS: '/api/v1/items',                           // GET ?slot=&q=&max_required_level=&cursor= -> {items, next_cursor}
    ITEM: '/api/v1/items/{id}'
  }),
  ARMORY_MAX_SETS: 20,  // UI hint only; never blocks a create. The server's 409 list_limit_reached is the source of truth.
  ARMORY_MAX_LEVEL: 60,
  ARMORY_SLOTS: Object.freeze(['head', 'neck', 'shoulder', 'back', 'chest', 'shirt', 'tabard', 'wrist', 'hands', 'waist', 'legs', 'feet',
    'finger1', 'finger2', 'trinket1', 'trinket2', 'main_hand', 'off_hand', 'ranged']),
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
}));

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
