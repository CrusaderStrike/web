# Auth + characters API (mock contract, web#17)

Front-end contract for Battle.net sign-in and main/alt character selection.
Matches **CrusaderStrike/platform#11** and the OpenAPI v1 spec in
[platform PR #18](https://github.com/CrusaderStrike/platform/pull/18) (`openapi/v1.yaml`, branch `docs/openapi-v1`, version `1.0.0-draft`).
The auth endpoints below are taken from that spec. Endpoints marked **PROPOSED** aren't in the spec yet, and Platform Dev needs to add them. The web UI ships against an in-browser
mock (`js/auth-mock.js`); Platform Dev's real API should match this document so
switching is a config change only. **World of Warcraft Forever only.** The API
must never return characters from any other game version.

## Feature flag and mock/real switch (`js/config.js`)

| Key | Default | Meaning |
|---|---|---|
| `FEATURE_BNET_SIGNIN` | `false` | Shows the "Sign in with Battle.net" entry point (home nav) and enables `signin.html`. When off, `signin.html` shows a "coming soon" state. |
| `USE_MOCK_AUTH` | `true` | `true`: calls go to `window.CSAuthMock` (no network, no OAuth, no secrets). `false`: `fetch(API_BASE + path, { credentials: 'include' })`. |
| `AUTH_PATHS` | see below | Endpoint paths. |

`window.csBnetEnabled()` returns `FEATURE_BNET_SIGNIN`. On **non-production hosts
only** (anything not `*.crusaderstrike.com`), `?ff_bnet=1` (remembered in
`localStorage.cs_ff_bnet`) turns it on for previews and tests. Production ignores overrides.

Mock-only dev scenarios (via query string on `signin.html`): `mock_scenario=empty`
(no characters), `error` (500), `upstream` (502).

## Session and CSRF

- Session (spec `securitySchemes.session`): cookie `cs_session`, set by `/auth/blizzard/callback`. We assume `HttpOnly; Secure; SameSite=Lax`.
- CORS (spec): `https://crusaderstrike.com` and `https://www.crusaderstrike.com`. Credentialed requests also need `Access-Control-Allow-Credentials: true`, methods `GET, PUT, DELETE, OPTIONS`, and headers `Content-Type, X-CSRF-Token`.
- OAuth `state` + PKCE are handled server-side (spec: login "redirect ... with state and PKCE"). The client secret never reaches the browser.
- **PROPOSED, gap:** the spec defines no CSRF mechanism. The UI expects `Session` to carry an extra `csrf_token` string and sends it as `X-CSRF-Token` on every non-GET request. A mismatch returns `403` with `Error` code `csrf_failed`.
- Selections persist server-side on the user profile, so they survive logout and re-login.

## Error formats (from the spec)

- `Error`: `{ "error": { "code": "…", "message": "…", "request_id": "…" } }` for 401, 403, 404, 409, 412, 415, 429 and 5xx.
- `ValidationErrors` (400): `{ "errors": { "<field>": "message" } }`.
- Every response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`. A 429 adds `Retry-After`.

The UI shows `error.message`, or the joined `errors` values, through `textContent`.

| Status | Body | UI |
|---|---|---|
| 400 | `ValidationErrors` (`main_id` / `alt_ids`) | Error state with message |
| 401 | `Error` `unauthenticated` | Back to sign-in step |
| 403 | `Error` `csrf_failed` / forbidden | Error state |
| 429 | `Error` `rate_limited` | Error state + retry |
| 500 | `Error` `internal_error` | Error state + retry |
| 502 | `Error` `upstream_unavailable` (PROPOSED code, Battle.net down) | Error state + retry |

## Endpoints (server base `https://api.crusaderstrike.com/api/v1`)

### `GET /auth/blizzard/login?return_to=<uri>` (spec `blizzardLogin`)
Browser navigation. `302` to Battle.net authorize (state + PKCE). `400` (ValidationErrors) for a bad `return_to`.
The UI sends `return_to=signin.html`. The server should allowlist crusaderstrike.com origins.
*Mock:* navigates to `signin.html?mock_authorize=1&state=…`, a simulated consent screen with Authorize and Cancel.

### `GET /auth/blizzard/callback?code=…&state=…` (spec `blizzardCallback`)
Sets `cs_session` and `302`s to `return_to`. The UI expects that redirect to land on `signin.html?auth=ok`.
**PROPOSED, gap:** the spec requires `code` and only defines `400` for failures. Battle.net sends
`?error=access_denied&state=…` when the user cancels. The UI needs the server to redirect to
`signin.html?auth=cancelled` (on cancel) or `signin.html?auth=error&reason=<code>` (on other failures)
instead of returning a JSON 400 to a browser navigation.

### `GET /auth/session` (spec `getSession`)
`200` `Session`:
```json
{ "battletag": "Crusader#1234", "active_guild_id": null, "memberships": [], "csrf_token": "hex (PROPOSED)" }
```
`401` `Error` when signed out.

### `DELETE /auth/session` (spec `logout`)
`204`. Sends `X-CSRF-Token` (PROPOSED).

### `GET /me/characters`: **PROPOSED**
`200` `CharacterList`:
```json
{
  "game": "wow_forever",
  "characters": [
    { "id": "ch_1001", "character_name": "Lightbringer", "realm": "Emberfall", "faction": "alliance",
      "class": "Paladin", "race": "Human", "level": 60, "game": "wow_forever" }
  ],
  "selection": { "main_id": "ch_1001", "alt_ids": ["ch_1003"], "updated_at": "2026-11-04T18:00:00Z" }
}
```
- `Character` uses spec naming (`character_name`, `realm`, `class`, `Faction` enum, `game: const wow_forever`, like `Guild.game`).
- `id` is a stable opaque string. `selection` is `null` before the first save.
- WoW Forever only: the server filters, and the UI also drops anything with another `game` value.
- An empty `characters` list shows the empty state. Errors: `401`, `429`, `500`, `502`.

### `PUT /me/characters/selection`: **PROPOSED**
Headers: `Content-Type: application/json`, `X-CSRF-Token`. Body:
```json
{ "main_id": "ch_1001", "alt_ids": ["ch_1003", "ch_1004"] }
```
Exactly one main, which must be one of the user's WoW Forever characters. `alt_ids` must be the user's characters, without `main_id` or duplicates, and may be empty.
The request is a full replace and idempotent. `200` `{ "selection": { "main_id", "alt_ids", "updated_at" } }`.
Errors: `400` `ValidationErrors` (`main_id` / `alt_ids`), `401`, `403 csrf_failed`, `415`, `429`.
Relation to the spec: `Member.is_main` should be derived from this selection.

## Gaps to add to openapi/v1.yaml (platform PR #18)
1. `GET /me/characters` and `PUT /me/characters/selection`, plus `Character`, `CharacterList` and `CharacterSelection` schemas.
2. A CSRF mechanism. Proposed: `Session.csrf_token` plus an `X-CSRF-Token` header on unsafe methods.
3. Callback cancel/error handling (`error=access_denied`, which has no `code`), done as a browser redirect, not JSON.
4. An error code for a Battle.net upstream outage (`502 upstream_unavailable`).
5. `return_to` is `format: uri`, but the UI sends a relative path. Allow relative paths or document the allowlist.

## Mock fixtures
Four fake characters on the fictional realms Emberfall, Duskhollow and Stormwatch Keep,
plus one non-Forever entry that the mock filters out. That entry proves the UI shows only WoW Forever characters.
Mock state: the session lives in `sessionStorage`, and the selection in `localStorage` (so it survives mock sign-out and sign-in).
