/**
 * Forces the e2e config regardless of what js/config.js ships with (e.g. the go-live flags on feat/bnet-go-live):
 * Battle.net sign-in flag OFF (suites turn it on per test with ?ff_bnet=1) and every USE_MOCK_* flag ON.
 * Set CS_E2E_SHIPPED_CONFIG=1 to run against the config as committed instead.
 */
const FORCED = { FEATURE_BNET_SIGNIN: false, USE_MOCK_AUTH: true, USE_MOCK_PROFILE: true, USE_MOCK_GEAR: true, USE_MOCK_GEAR_LISTS: true, USE_MOCK_RANKINGS: true, USE_MOCK_ARMORY: true };
async function forceTestConfig(target, overrides) {
  if (process.env.CS_E2E_SHIPPED_CONFIG === '1' && !overrides) return;
  const flags = Object.assign({}, FORCED, overrides || {});
  await target.route('**/js/config.js', async route => {
    const res = await route.fetch();
    let body = await res.text();
    // Guard against a stale server on the port (e.g. another checkout on :8765): the served config must be this checkout's.
    const local = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'js', 'config.js'), 'utf8');
    if (body !== local) throw new Error('forceTestConfig: the server on this port is serving a different checkout than ' + require('path').resolve(__dirname, '..', '..') + '. Use tests/e2e/run-all.js or set CS_E2E_PORT.');
    for (const [k, v] of Object.entries(flags)) {
      const re = new RegExp('(\\b' + k + ':\\s*)(true|false)');
      if (re.test(body)) body = body.replace(re, '$1' + v);
    }
    if (!new RegExp('FEATURE_BNET_SIGNIN:\\s*' + flags.FEATURE_BNET_SIGNIN).test(body) || !new RegExp('USE_MOCK_AUTH:\\s*' + flags.USE_MOCK_AUTH).test(body)) throw new Error('forceTestConfig: config.js shape changed');
    await route.fulfill({ response: res, body, headers: { ...res.headers(), 'cache-control': 'no-store' } });
  });
}
module.exports = { forceTestConfig };
/** Wraps browser.newContext/newPage so every page in the suite gets the forced config (plus optional flag overrides). */
function withTestConfig(browser, overrides) {
  const nc = browser.newContext.bind(browser);
  browser.newContext = async (...a) => { const c = await nc(...a); await forceTestConfig(c, overrides); return c; };
  browser.newPage = async (...a) => { const c = await browser.newContext(...a); const pg = await c.newPage(); return pg; };
  return browser;
}
module.exports.withTestConfig = withTestConfig;
