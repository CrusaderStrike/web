<p align="center"><img src="assets/logo.svg" alt="Crusader Strike logo" width="160"></p>

# web
crusaderstrike.com website and guild sites

Static site deployed to GitHub Pages via Actions on every push to `main`.
Custom domain: `crusaderstrike.com`.

## Tests

Playwright end-to-end tests live in `tests/e2e/`; see `tests/e2e/README.md` with the site served on http://localhost:8765. Suites: `guilds.e2e.js`, `gear-lists.e2e.js`, `gear.e2e.js`, `profile.e2e.js`, `rankings.e2e.js`, `signin.e2e.js`. Regenerate the gear-lists spec with `node tools/gen-gear-lists-spec.js` (needs js-yaml).

## Guild recruiting pages (web#38)

`/g/<region>/<realm>/<guild>/`, `/guilds/` (+ `/guilds/page/<n>/`), `sitemap.xml`, `robots.txt` and `404.html` are **generated static files**: `node tools/build-guild-pages.js`. The Pages workflow runs it on every deploy and hourly, reading the public guild API (`/api/v1/public/guilds…`, looping the sitemap cursor) or the mock while `USE_MOCK_GUILDS` is true (mock output is `noindex`). The committed copies are mock output for local preview; rerun the script after changing guild templates. Generator tests: `node tests/guilds-build.test.js`.
