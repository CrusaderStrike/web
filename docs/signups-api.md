## Signup API contract (agreed: Platform Dev + Web Dev, 2026-11-04)

Base URL: `https://api.crusaderstrike.com`. No auth. Signups are global (not guild-scoped).

### POST /api/v1/signups
Body (JSON, `Content-Type: application/json`):
| field | type | rules |
|---|---|---|
| email | string | required, ≤254, stored trimmed + lowercased |
| character_name | string? | ≤48 |
| realm | string? | ≤48 |
| faction | string? | `alliance` \| `horde` |
| guild_name | string? | ≤48 |
| interests | string[]? | each in `guild_site`, `dungeon_run`, `world_pvp`, `addon`; unknown → 400 |
| consent | boolean | required, must be `true` |
| consent_version | string | required, version of privacy text shown |
| website | string | honeypot, must be empty |

Responses:
- `202 {"status":"pending"}` for new **and** duplicate emails (no id; no enumeration). Duplicates silently re-send the confirm email (rate-limited).
- `400 {"errors":{"field":"message"}}` validation failure.
- `415` non-JSON body.
- `429` rate-limited (per IP and per email), with `Retry-After`.
- Honeypot filled → fake `202 {"status":"pending"}`, nothing stored.

### Double opt-in
Email link → `https://crusaderstrike.com/confirm?token=...` (web page), which calls:

**POST /api/v1/signups/confirm** `{ "token": "..." }`. Token single-use, expires 48h.
- `200 {"status":"confirmed"}`
- `400 {"errors":{"token":"invalid or expired"}}`

(POST from the page, never GET, so mail scanners can't auto-confirm.)

### Later
**POST /api/v1/signups/unsubscribe** `{ "token": "..." }`.

### CORS
Allow origins `https://crusaderstrike.com`, `https://www.crusaderstrike.com`; methods `POST, OPTIONS`; header `Content-Type`; no credentials.
