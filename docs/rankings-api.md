# Rankings page (web#20) and the rankings API

The page (`rankings.html`) calls `GET /api/v1/rankings` through `js/rankings-api.js`.
`CS_CONFIG.USE_MOCK_RANKINGS` (in `js/config.js`) picks the in-browser mock (`js/rankings-mock.js`)
or the real API (platform#25). Switching is a config change only.

Response shape (openapi/v1.yaml, platform#18): `{ next_cursor, refreshed_at, items: RankingEntry[] }`,
`RankingEntry = { rank, character_name, member_id|null, value, run_id|null }`.
Paging uses `cursor` and `limit` (max 100). Errors use `{ error: { code, message, request_id } }`.

## In the contract
- `board`: `fastest_clear` (value = seconds) and `runs_completed` (value = count).
- `dungeon_id` (instanceMapID).

## Proposed for platform#25 (not yet in openapi/v1.yaml)
- `board=world_pvp` (value = honorable kills). The contract has no World PvP ranking yet.
- `scope=guild|all` for per-guild and cross-guild ladders. Today `/rankings` is session-scoped to the active guild.
- `period=7d|30d|season` time filter.
- `bracket=solo|group` for World PvP.
- If cross-guild ladders are public, `/rankings` needs to allow anonymous access for `scope=all`.
- RankingEntry has no realm or guild name, so the page doesn't show them.

The mock accepts all of these. Until platform#25 adds them, the real API may return 400 for
the proposed params; the page shows its error state in that case.

Mock dev scenarios: `?mock_scenario=empty|error|unauthorized|slow`.
