# End-to-end tests (Playwright)

Run from the repo root with a static server on port 8765:

```sh
python3 -m http.server 8765 &        # serve the repo
npm i -D playwright && npx playwright install chromium
node tests/e2e/gear.e2e.js           # also gear-lists.e2e.js, profile.e2e.js, signin.e2e.js, rankings.e2e.js
```

Suites force a flag-off, all-mock config through `tests/e2e/_test-config.js` (set `CS_E2E_SHIPPED_CONFIG=1` to test the committed config). Each script prints PASS/FAIL lines and exits non-zero on any failure. All data comes from the in-browser mocks; no network or credentials are needed. `gear.e2e.js` writes screenshots to `/workspace/gear-placeholder-*.png`.

`gear-lists.e2e.js` (web#18) drives the gear-lists mock through every `?mock=` scenario (conflict, stale, limit, ratelimit, offline, forbidden, history403, char403, 500) and writes `/workspace/gear-lists-{desktop,mobile}.png`. The mock's enums and limits come from `js/gear-lists-spec.js`, generated from the vendored platform spec by `tools/gen-gear-lists-spec.js`.

`armory-live.e2e.js` (web#42) runs the profile armory with `USE_MOCK_ARMORY=false` against a Playwright-stubbed API per the gear-sets-and-items contract: display PATCH, create validation codes, per-slot autosave PUT with If-Match/ETag (409/412 reload), item_not_in_slot/item_not_forever/invalid_slot, 429 Retry-After, 409 list_limit_reached, 409 character_not_displayed, outgrown.

`gear-lists-live.e2e.js` (web#40) runs the gear-lists page with `USE_MOCK_GEAR_LISTS=false` against a Playwright-stubbed API shaped like platform main `src/routes/gear-lists.ts` (401 sign-in prompt, empty state, create/rename/delete with X-CSRF-Token and If-Match, `{errors:{field}}` 400s, 429 Retry-After).

Set `CS_E2E_PORT` to serve on a port other than 8765.
