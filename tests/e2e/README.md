# End-to-end tests (Playwright)

Run from the repo root with a static server on port 8765:

```sh
python3 -m http.server 8765 &        # serve the repo
npm i -D playwright && npx playwright install chromium
node tests/e2e/gear.e2e.js           # also gear-lists.e2e.js, profile.e2e.js, signin.e2e.js, rankings.e2e.js
```

Suites force a flag-off, all-mock config through `tests/e2e/_test-config.js` (set `CS_E2E_SHIPPED_CONFIG=1` to test the committed config). Each script prints PASS/FAIL lines and exits non-zero on any failure. All data comes from the in-browser mocks; no network or credentials are needed. `gear.e2e.js` writes screenshots to `$CS_E2E_SHOTS` (default: the OS temp dir) as `gear-placeholder-*.png`.

`gear-lists.e2e.js` (web#18) drives the gear-lists mock through every `?mock=` scenario (conflict, stale, limit, ratelimit, offline, forbidden, history403, char403, 500) and writes `gear-lists-{desktop,mobile}.png` to `$CS_E2E_SHOTS`. The mock's enums and limits come from `js/gear-lists-spec.js`, generated from the vendored platform spec by `tools/gen-gear-lists-spec.js`.

`armory-live.e2e.js` (web#42) runs the profile armory with `USE_MOCK_ARMORY=false` against a Playwright-stubbed API that mirrors routes shipped on platform main (`src/routes/profile.ts`, `src/routes/gear-lists.ts`, `openapi/v1.yaml`) and gear-list schema v1: display via `PUT /me/characters/selection {main_id, alt_ids}`, slot edits via `POST /gear-lists/{id}/ops` (`remove_item` + `add_item` priority 1, uuid v4 `op_id`, `base_version`), `conflicts[]` (`stale_base_version` -> reload + retry, `item_not_forever`), 400 `{errors:{ops.N}}`, 403 `{errors:{character_id}}`, 409 `list_limit_reached`, 429 Retry-After, outgrown, and create bodies that always carry `type` (+ `until_level` when leveling). Items use main's `GET /items`. Prod-host cases load the site as crusaderstrike.com / www (and staging as a control) and assert `USE_MOCK_ARMORY`, `USE_MOCK_AUTH`, `USE_MOCK_PROFILE` and `USE_MOCK_GEAR_LISTS` are forced off while `USE_MOCK_GEAR` and `USE_MOCK_RANKINGS` keep their configured value (on in prod today); a null `selection.updated_at` (platform#44) is covered too.

`gear-lists-live.e2e.js` (web#40) runs the gear-lists page with `USE_MOCK_GEAR_LISTS=false` against a Playwright-stubbed API shaped like platform main `src/routes/gear-lists.ts` (401 sign-in prompt, empty state, create/rename/delete with X-CSRF-Token and If-Match, `{errors:{field}}` 400s, 429 Retry-After).

Set `CS_E2E_PORT` to serve on a port other than 8765. Preferred: `node tests/e2e/run-all.js` serves this checkout on a free port and runs every suite (`CS_E2E_RUNS=2` to repeat). Suites fail fast if the server on the port is serving a different checkout.

`armory-live.e2e.js` runs in the shipped default `ARMORY_SLOT_OPS='set_slot'` (Option B, platform#45, live via platform#46 17f16b0) against a stub that implements `set_slot {op_id, type, slot, item_id, base_version}` (replaces the slot with one row: priority 1, note null, obtained false) and `clear_slot {op_id, type, slot, base_version}`: per-slot stale check before the no-op check (stale no-op -> conflict + bump; current no-op -> applied, no bump, op_id deduped), rejections bump the version, known extra fields ignored silently, unknown keys reported as `ignored[]` `{op_id, keys}`, `list_items_limit` only when setting into an empty slot, and ops in one request never make each other stale. The client sends at most one op per slot per batch. `armory-legacy.e2e.js` reruns it with the `'legacy'` rollback switch (Option A remove_item + add_item) against a pre-#46 stub that rejects set_slot. `forceTestConfig` accepts string flags (e.g. `ARMORY_SLOT_OPS`).
## hardening.e2e.js (web#48)
Covers CSGEAR1 import (decode → create/apply → local_id→id reply), until_level / under-60 edge cases
(an under-60 character may create max_level), and API-down / expired-session states on armory,
gear lists and character selection. Mock switches: `?mock_armory=down|api503`; both mocks return 401 without
`sessionStorage.cs_mock_session` and enforce platform level rules on create.
