/**
 * Forces the e2e config regardless of what js/config.js ships with (e.g. the go-live flags on feat/bnet-go-live):
 * Battle.net sign-in flag OFF (suites turn it on per test with ?ff_bnet=1) and every USE_MOCK_* flag ON.
 * Set CS_E2E_SHIPPED_CONFIG=1 to run against the config as committed instead.
 */
const FORCED = { FEATURE_BNET_SIGNIN: false, USE_MOCK_AUTH: true, USE_MOCK_PROFILE: true, USE_MOCK_GEAR: true, USE_MOCK_GEAR_LISTS: true, USE_MOCK_RANKINGS: true };
async function forceTestConfig(target) {
  if (process.env.CS_E2E_SHIPPED_CONFIG === '1') return;
  await target.route('**/js/config.js', async route => {
    const res = await route.fetch();
    let body = await res.text();
    for (const [k, v] of Object.entries(FORCED)) {
      const re = new RegExp('(\\b' + k + ':\\s*)(true|false)');
      if (re.test(body)) body = body.replace(re, '$1' + v);
    }
    if (!/FEATURE_BNET_SIGNIN:\s*false/.test(body) || !/USE_MOCK_AUTH:\s*true/.test(body)) throw new Error('forceTestConfig: config.js shape changed');
    await route.fulfill({ response: res, body, headers: { ...res.headers(), 'cache-control': 'no-store' } });
  });
}
module.exports = { forceTestConfig };
/** Wraps browser.newContext/newPage so every page in the suite gets the forced config. */
function withTestConfig(browser) {
  const nc = browser.newContext.bind(browser);
  browser.newContext = async (...a) => { const c = await nc(...a); await forceTestConfig(c); return c; };
  browser.newPage = async (...a) => { const c = await browser.newContext(...a); const pg = await c.newPage(); return pg; };
  return browser;
}
module.exports.withTestConfig = withTestConfig;
