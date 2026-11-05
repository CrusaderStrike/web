# Auth + characters API (mock contract, web#17)

Front-end contract for Battle.net sign-in and main/alt character selection.
Matches **CrusaderStrike/platform#11** and the OpenAPI v1 spec in
[platform PR #18](https://github.com/CrusaderStrike/platform/pull/18) (`openapi/v1.yaml` at `07c874a`). **The spec is the source of truth**; this page only summarizes what the web UI uses. The web UI ships against an in-browser
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

- Session: cookie `cs_session` (`HttpOnly; Secure; SameSite=Lax`), set by `/auth/blizzard/callback`. OAuth `state` + PKCE are server-side; the client secret never reaches the browser.
- CSRF: `GET /auth/session` returns `csrf_token`; the UI sends it as `X-CSRF-Token` on every non-GET request. Mismatch → `403` `csrf_failed`.
- Selections persist server-side, so they survive logout and re-login.

## Errors

`Error` / `ValidationErrors` as defined in the spec. The UI shows `error.message` (or joined `errors` values) via `textContent`: `401` → sign-in step; `400`, `403`, `429`, `500`, `502 upstream_unavailable` → error state (+ retry where applicable).

## Endpoints (server base `https://api.crusaderstrike.com/api/v1`)

### `GET /auth/blizzard/login?return_to=/signin.html` (spec `blizzardLogin`)
`return_to` is a relative same-site path starting with a single `/` (default `/signin.html`). The UI sends `/signin.html`.
*Mock:* navigates to `signin.html?mock_authorize=1&state=…`, a simulated consent screen.

### `GET /auth/blizzard/callback` (spec `blizzardCallback`)
Always `302`s to `{return_to}` with `auth=ok`, `auth=cancelled`, or `auth=error&reason=invalid_state|upstream_unavailable|oauth_error|internal_error`. The UI shows a reason-specific message. *Mock:* state mismatch → `auth=error&reason=invalid_state`.

### `GET /auth/session` (spec `getSession`)
`200` `Session`:
```json
{ "battletag": "Crusader#1234", "active_guild_id": null, "memberships": [], "csrf_token": "hex" }
```
`401` `Error` when signed out.

### `DELETE /auth/session` (spec `logout`)
`204`. Sends `X-CSRF-Token`.

### `GET /me/characters` (spec `listMyCharacters`)
`200` `CharacterList`:
```json
{
  "game": "wow_forever",
  "characters": [
    { "id": "ch_1001", "character_name": "Lightbringer", "surname": "Dawnmantle", "realm": "Emberfall", "faction": "ALLIANCE",
      "class": "Paladin", "race": "Human", "level": 60, "game": "wow_forever" },
    { "id": "ch_1003", "character_name": "Thornquill", "surname": "Briarhide", "realm": null, "faction": "HORDE",
      "class": "Druid", "race": "Tauren", "level": 52, "game": "wow_forever" }
  ],
  "selection": { "main_id": "ch_1001", "alt_ids": ["ch_1003"], "updated_at": "2026-11-04T18:00:00Z" }
}
```
- Schemas: `Character`, `CharacterList`, `CharacterSelection` / `CharacterSelectionInput` exactly as in the spec. `Character` requires `id`, `character_name`, `game: wow_forever`; `surname` and `realm` are `[string, null]`.
- WoW Forever characters have a name plus a surname and often no realm (see platform#15). `surname` is optional and nullable (`string | null`); `realm` is optional and nullable (`string | null`). Clients must treat a missing key, `null` and `""` the same.
- Display: `"Name Surname"`, with ` — Realm` appended only when a realm exists (e.g. `Lightbringer Dawnmantle — Emberfall`, `Thornquill Briarhide`, `Grimlantern`). The UI never renders `undefined`, `null` or a dangling separator.
- `id` is a stable opaque string. `selection` is `null` before the first save.
- WoW Forever only: the server filters, and the UI also drops anything with another `game` value.
- An empty `characters` list shows the empty state. Errors: `401`, `429`, `500`, `502`.

### `PUT /me/characters/selection` (spec `setMyCharacterSelection`, body `CharacterSelectionInput`)
Headers: `Content-Type: application/json`, `X-CSRF-Token`. Body:
```json
{ "main_id": "ch_1001", "alt_ids": ["ch_1003", "ch_1004"] }
```
Exactly one main, which must be one of the user's WoW Forever characters. `alt_ids` must be the user's characters, without `main_id` or duplicates, and may be empty.
The request is a full replace and idempotent. `200` `{ "selection": CharacterSelection }`.
Errors: `400` `ValidationErrors` (`main_id` / `alt_ids`), `401`, `403 csrf_failed`, `415`, `429`.
Relation to the spec: `Member.is_main` should be derived from this selection.

## Mock fixtures
Four fake characters covering every shape: name + surname + realm (Lightbringer Dawnmantle — Emberfall), name + realm with `surname: null` (Ashenvow — Emberfall), name + surname with `realm: null` (Thornquill Briarhide), and name only with both keys omitted (Grimlantern),
plus one non-Forever entry that the mock filters out. That entry proves the UI shows only WoW Forever characters.
Mock state: the session lives in `sessionStorage`, and the selection in `localStorage` (so it survives mock sign-out and sign-in).

## Profile page (`/profile/`)

`profile/index.html` + `js/profile.js`, through the thin client `js/profile-api.js`.
`CS_CONFIG.USE_MOCK_PROFILE` (default `true`) picks `js/auth-mock.js` or the real API; paths are in `CS_CONFIG.PROFILE_PATHS`.
Gated by the same `FEATURE_BNET_SIGNIN` / `csBnetEnabled()` flag as sign-in.

- Loads `GET /auth/session` (battletag, csrf_token) and `GET /me/characters`.
- Setting a main saves `PUT /me/characters/selection` with `{ main_id, alt_ids: <every other character> }`, optimistic, rolled back on error.
  Platform Dev confirmed this path (the slice-1 ticket's `PUT /me/main` is superseded).
- A signed-in user with characters but `selection: null` is sent to `signin.html` (the picker).
- `POST /me/characters/refresh` (confirmed by Platform Dev; X-CSRF-Token) re-syncs from Battle.net and returns `200` with the `GET /me/characters` body.
  `502 upstream_unavailable` → "Battle.net is unavailable, try again later". `429` → the button is disabled with a countdown from `Retry-After` (seconds; 30 if missing).

### Faction (web#26)
`Character.faction` is `"ALLIANCE" | "HORDE" | null` (confirmed by Platform Dev). Null, missing or unknown shows a neutral "No faction" badge (`aria-label="Faction: none"`), never Horde.
Fixture `ch_1005` (Wispwander — Duskhollow) has `faction: null`.

Mock-only profile scenarios: `mock_scenario=empty|error|upstream|nomain|save_error|refresh_error|refresh_ratelimit`.
