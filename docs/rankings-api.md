# Rankings page (web#20) and the rankings API

The page (`rankings.html`) calls `GET /api/v1/rankings` through `js/rankings-api.js`.
`CS_CONFIG.USE_MOCK_RANKINGS` picks the in-browser mock (`js/rankings-mock.js`) or the real API.

## What the page sends (default)
Only what `getRankings` in platform `openapi/v1.yaml` has today: `board=fastest_clear|runs_completed`,
`dungeon_id` (any positive integer, typed by the user or from the URL; unknown ids pass through and the
server returns an empty page), `cursor`, `limit`. Nothing else is sent and no defaults are added.

All filter values live in one block, `CS_CONFIG.RANKINGS_FILTERS` (`js/config.js`). There is no
client-side dungeon list.

## Behind `RANKINGS_EXTENDED_FILTERS` (default `false`)
From the platform rankings draft contract (not in openapi/v1.yaml yet). With the flag off these controls
are removed from the page and never sent:
- World PvP tab (`board=world_pvp`).
- `scope=guild|realm|global`, `period=week|month|season|all`, `bracket` = dungeon difficulty (`normal|heroic`);
  BG level bands are listed in config for a future BG tab.
- With the flag on, each one is sent only when the user picks a value ("Default" sends nothing).

## Sorting and states
Ranks come from the server; column sorting reorders only the loaded rows, and the page says so.
States: loading, empty, 400, 401, 429 (Retry-After seconds, 30 s fallback; needs
`Access-Control-Expose-Headers: Retry-After` cross-origin), 502/503 (temporarily unavailable), network error.

Mock scenarios: `?mock_scenario=empty|error|unauthorized|ratelimit|unavailable|network|slow`.
