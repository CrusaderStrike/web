# End-to-end tests (Playwright)

Run from the repo root with a static server on port 8765:

```sh
python3 -m http.server 8765 &        # serve the repo
npm i -D playwright && npx playwright install chromium
node tests/e2e/gear.e2e.js           # also gear-lists.e2e.js, profile.e2e.js, signin.e2e.js, rankings.e2e.js
```

Each script prints PASS/FAIL lines and exits non-zero on any failure. All data comes from the in-browser mocks; no network or credentials are needed. `gear.e2e.js` writes screenshots to `/workspace/gear-placeholder-*.png`.

`gear-lists.e2e.js` (web#18) drives the gear-lists mock through every `?mock=` scenario (conflict, stale, limit, ratelimit, offline, forbidden, history403, char403, 500) and writes `/workspace/gear-lists-{desktop,mobile}.png`. The mock's enums and limits come from `js/gear-lists-spec.js`, generated from the vendored platform spec by `tools/gen-gear-lists-spec.js`.
