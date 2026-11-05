# End-to-end tests (Playwright)

Run from the repo root with a static server on port 8765:

```sh
python3 -m http.server 8765 &        # serve the repo
npm i -D playwright && npx playwright install chromium
node tests/e2e/gear.e2e.js           # also profile.e2e.js, signin.e2e.js, rankings.e2e.js
```

Each script prints PASS/FAIL lines and exits non-zero on any failure. All data comes from the in-browser mocks; no network or credentials are needed. `gear.e2e.js` writes screenshots to `/workspace/gear-placeholder-*.png`.
