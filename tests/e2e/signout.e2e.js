// web#59: sign out ends the Crusader Strike session; switching Battle.net accounts
// confirms, calls DELETE /auth/session, then opens start-auth with prompt=login.
const { chromium } = require('playwright');
const B = 'http://localhost:' + (process.env.CS_E2E_PORT || 8765) + '/';
const API = 'https://api.crusaderstrike.com';
const START = API + '/api/v1/auth/blizzard/login';
const CSRF = 'csrf-signout-token';
const NOTE = 'If Battle.net signs you straight back in as the same account, log out at battle.net first, then try again';
(async () => {
  const b = require('./_test-config.js').withTestConfig(await chromium.launch());
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const ctx = await b.newContext();
  await ctx.route(API + '/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>login</p>' }));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const vis = (s, t) => p.waitForSelector(s + ':not([hidden])', { timeout: t || 8000 }).then(() => true, () => false);
  const sess = () => p.evaluate(() => sessionStorage.getItem('cs_mock_session'));
  const signIn = async (q) => {
    await p.goto(B + 'profile/?ff_bnet=1' + (q || ''));
    await p.waitForFunction(() => window.CSAuthMock && window.CSAuthSession, null, { timeout: 8000 });
    await p.evaluate(() => CSAuthMock.devSignIn());
    await p.goto(B + 'profile/?ff_bnet=1' + (q || ''));
    ok(await vis('#pf-ready'), 'profile ready ' + (q || ''));
  };

  for (const f of ['profile/index.html', 'gear/index.html', 'gear/lists/index.html', 'index.html']) {
    const html = await (await p.request.get(B + f)).text();
    ok(!html.includes('Change sign-in') && !/signin\.html/.test(html), f + ': no Change sign-in / signin.html link');
  }

  await p.goto(B + 'profile/?ff_bnet=1');
  ok(await vis('#pf-signedout'), 'signed out shows the sign-in card');
  ok(await p.isHidden('#pf-signout') && await p.isHidden('#pf-account-actions'), 'sign-out controls hidden while signed out');
  const signedOutHref = await p.getAttribute('#pf-signin', 'href');
  ok(await p.locator('#pf-signin').innerText() === 'Sign in with Battle.net' && signedOutHref && !/[?&]prompt=/.test(signedOutHref), 'signed-out users keep the Battle.net button, no prompt');
  const built = await p.evaluate(() => ({ plain: csBnetLoginUrl('/profile/'), prompted: csBnetLoginUrl('/profile/', 'login') }));
  ok(built.plain === START + '?return_to=%2Fprofile%2F', 'default login URL has no prompt: ' + built.plain);
  ok(built.prompted === START + '?return_to=%2Fprofile%2F&prompt=login', 'prompt=login login URL: ' + built.prompted);

  await signIn();
  ok(await p.isVisible('#pf-signout') && await p.isVisible('#pf-signout-footer') && await p.isVisible('#pf-switch'), 'header and footer sign-out controls visible');
  ok(await p.locator('a', { hasText: 'Change sign-in' }).count() === 0, 'Change sign-in link is gone');
  await p.evaluate(() => {
    const orig = CSAuthMock.logout.bind(CSAuthMock);
    window.__logouts = [];
    CSAuthMock.logout = function (csrf) { window.__logouts.push(csrf || ''); return orig(csrf); };
  });

  await p.click('#pf-switch');
  ok(await p.evaluate(() => document.getElementById('pf-switch-dialog').open && document.activeElement.id === 'pf-switch-h'), 'switch dialog opens, focus on heading');
  ok((await p.getAttribute('#pf-switch-dialog', 'role') || 'dialog') === 'dialog' || await p.evaluate(() => document.getElementById('pf-switch-dialog') instanceof HTMLDialogElement), 'dialog role');
  const note = (await p.textContent('#pf-switch-note')).replace(/\s+/g, ' ').trim();
  ok(note === NOTE, 'switch note: ' + note);
  ok(await p.getAttribute('#pf-switch-note a', 'href') === 'https://account.battle.net/' && await p.getAttribute('#pf-switch-note a', 'target') === '_blank', 'battle.net link, new tab');
  await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.activeElement.closest('#pf-switch-dialog') !== null), 'Tab stays in the dialog');
  const before = await sess();
  await p.keyboard.press('Escape');
  ok(await p.evaluate(() => !document.getElementById('pf-switch-dialog').open && document.activeElement.id === 'pf-switch'), 'Escape closes dialog, focus returns');
  ok(await sess() === before && (await p.evaluate(() => window.__logouts.length)) === 0, 'Escape does not sign out');
  await p.click('#pf-switch');
  await p.click('#pf-switch-cancel');
  ok(await p.evaluate(() => !document.getElementById('pf-switch-dialog').open && document.activeElement.id === 'pf-switch'), 'Cancel closes dialog, focus returns');

  await p.click('#pf-signout');
  await p.waitForURL(u => u.searchParams.get('signed_out') === '1', { timeout: 8000 });
  ok((await p.textContent('#home-status')).trim() === 'Signed out' && await p.getAttribute('#home-status', 'role') === 'status', 'home shows Signed out');
  ok(await sess() === null, 'sign out clears the mock session');
  ok(await p.evaluate(() => document.activeElement.id === 'home-status'), 'Signed out status is focused');
  await p.goto(B + 'profile/?ff_bnet=1');
  ok(await vis('#pf-signedout') && await p.isHidden('#pf-signout'), 'profile then shows the signed-out state');
  ok(/cs-btn-bnet/.test(await p.getAttribute('#pf-signin', 'class')) && !/[?&]prompt=/.test(await p.getAttribute('#pf-signin', 'href')), 'signed-out Battle.net button unchanged');

  await signIn();
  await p.click('#pf-signout-footer');
  await p.waitForURL(u => u.searchParams.get('signed_out') === '1', { timeout: 8000 });
  ok((await p.textContent('#home-status')).trim() === 'Signed out', 'footer Sign out also lands on home');

  await signIn();
  const marks = [];
  const onConsole = msg => { const t = msg.text(); if (t.indexOf('LOGOUT_') === 0) marks.push(t); };
  p.on('console', onConsole);
  await p.evaluate(() => {
    const orig = CSAuthMock.logout.bind(CSAuthMock);
    CSAuthMock.logout = function (csrf) {
      console.log('LOGOUT_CALL');
      return orig(csrf).then(function (r) {
        console.log('LOGOUT_DONE ' + r.status + ' ' + String(sessionStorage.getItem('cs_mock_session')));
        return r;
      });
    };
  });
  await p.click('#pf-switch');
  let tabs = 0;
  while (tabs < 6 && await p.evaluate(() => document.activeElement.id !== 'pf-switch-continue')) { await p.keyboard.press('Tab'); tabs++; }
  ok(await p.evaluate(() => document.activeElement.id === 'pf-switch-continue'), 'keyboard reaches Continue');
  await p.keyboard.press('Enter');
  await p.waitForURL(u => u.pathname === '/api/v1/auth/blizzard/login', { timeout: 8000 });
  const switched = new URL(p.url());
  ok(switched.searchParams.get('prompt') === 'login' && switched.searchParams.get('return_to') === '/profile/', 'switch navigates with prompt=login and return_to=/profile/');
  ok(marks.filter(t => t === 'LOGOUT_CALL').length === 1 && marks.indexOf('LOGOUT_DONE 204 null') >= 0, 'switch calls DELETE (mock logout) once and clears the session: ' + marks.join(','));
  p.off('console', onConsole);

  await signIn('&mock_scenario=logout_error');
  const stayed = p.url();
  await p.click('#pf-signout');
  ok(await vis('#pf-auth-error') && /HTTP 500|trouble/.test(await p.textContent('#pf-auth-error')), '5xx shows an error');
  await p.waitForTimeout(500);
  ok(p.url() === stayed && await sess() !== null, '5xx does not redirect or clear the session');

  await signIn('&mock_scenario=logout_down');
  const stayed2 = p.url();
  await p.click('#pf-switch');
  await p.click('#pf-switch-continue');
  ok(await vis('#pf-switch-error') && /offline|reached/.test(await p.textContent('#pf-switch-error')), 'network failure shows an error in the dialog');
  await p.waitForTimeout(500);
  ok(p.url() === stayed2 && await p.evaluate(() => document.getElementById('pf-switch-dialog').open) && await sess() !== null, 'network failure does not redirect');

  // Live API: DELETE with the CSRF header and the session cookie, then the login URL.
  const live = await b.newContext();
  await require('./_test-config.js').forceTestConfig(live, { FEATURE_BNET_SIGNIN: true, USE_MOCK_AUTH: false, USE_MOCK_PROFILE: false, USE_MOCK_ARMORY: false });
  await live.addCookies([{ name: 'cs_session', value: 'sess-test', domain: 'api.crusaderstrike.com', path: '/', secure: true, sameSite: 'None' }]);
  const S = { signedIn: true, logout: 204, log: [] };
  const origin = B.slice(0, -1);
  await live.route(API + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), m = rq.method(), h = rq.headers();
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'Content-Type, X-CSRF-Token, Accept', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE' };
    const J = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: body == null ? '' : JSON.stringify(body) });
    S.log.push({ method: m, path: u.pathname, search: u.search, csrf: h['x-csrf-token'] || '', cookie: h.cookie || '' });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    if (u.pathname === '/api/v1/auth/blizzard/login') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>login</title>' });
    if (u.pathname === '/api/v1/auth/session' && m === 'GET') {
      if (!S.signedIn) return J(401, { error: { code: 'unauthenticated', message: 'Sign in required.' } });
      return J(200, { battletag: 'Crusader#1234', active_guild_id: null, memberships: [], csrf_token: CSRF });
    }
    if (u.pathname === '/api/v1/auth/session' && m === 'DELETE') {
      if (S.logout === 'abort') return route.abort('failed');
      if (S.logout === 401) { S.signedIn = false; return J(401, { error: { code: 'unauthenticated', message: 'Sign in required.' } }); }
      if (S.logout >= 500) return J(S.logout, { error: { code: 'internal_error', message: 'Could not sign out.' } });
      if (h['x-csrf-token'] !== CSRF) return J(403, { error: { code: 'csrf_failed', message: 'Security check failed.' } });
      S.signedIn = false;
      return route.fulfill({ status: 204, headers: cors, body: '' });
    }
    if (u.pathname === '/api/v1/me/profile') return J(200, { battletag: 'Crusader#1234', main_character_id: null, preferred_region: 'us', created_at: '2026-10-01T18:00:00Z', updated_at: '2026-11-05T00:00:00Z' });
    if (u.pathname === '/api/v1/me/characters') return J(200, { game: 'wow_forever', characters: [], selection: null });
    return J(404, { error: { code: 'not_found', message: 'no' } });
  });
  const lp = await live.newPage();
  const lerrs = [];
  lp.on('pageerror', e => lerrs.push(e.message));
  const lvis = s => lp.waitForSelector(s + ':not([hidden])', { timeout: 8000 }).then(() => true, () => false);
  const ready = async () => { S.signedIn = true; S.log = []; await lp.goto(B + 'profile/'); ok(await lvis('#pf-ready'), 'live profile ready'); };
  S.signedIn = false;
  await lp.goto(B + 'profile/');
  ok(await lvis('#pf-signedout') && !/[?&]prompt=/.test(await lp.getAttribute('#pf-signin', 'href')), 'live signed-out button has no prompt');
  await ready();
  const delBefore = () => S.log.filter(e => e.method === 'DELETE' && e.path === '/api/v1/auth/session');
  await lp.click('#pf-signout');
  await lp.waitForURL(u => u.searchParams.get('signed_out') === '1', { timeout: 8000 });
  const del = delBefore();
  ok(del.length === 1 && del[0].csrf === CSRF, 'live DELETE sends X-CSRF-Token');
  ok(/cs_session=sess-test/.test(del[0].cookie), 'live DELETE sends the session cookie: ' + del[0].cookie);
  ok((await lp.textContent('#home-status')).trim() === 'Signed out', 'live sign out shows Signed out');

  S.logout = 204;
  await ready();
  await lp.click('#pf-switch');
  await lp.click('#pf-switch-continue');
  await lp.waitForURL(u => u.pathname === '/api/v1/auth/blizzard/login', { timeout: 8000 });
  const liveUrl = new URL(lp.url());
  ok(liveUrl.searchParams.get('prompt') === 'login' && liveUrl.searchParams.get('return_to') === '/profile/', 'live switch URL ' + lp.url());
  const calls = S.log.filter(e => e.method !== 'OPTIONS');
  const di = calls.findIndex(e => e.method === 'DELETE' && e.path === '/api/v1/auth/session');
  const li = calls.findIndex(e => e.path === '/api/v1/auth/blizzard/login');
  ok(di >= 0 && li > di && calls[di].csrf === CSRF, 'live switch calls DELETE, then navigates');

  S.logout = 500;
  await ready();
  const at = lp.url();
  await lp.click('#pf-signout');
  ok(await lvis('#pf-auth-error') && /HTTP 500|trouble/.test(await lp.textContent('#pf-auth-error')), 'live 500 shows an error');
  await lp.waitForTimeout(400);
  ok(lp.url() === at && !S.log.some(e => e.path === '/api/v1/auth/blizzard/login'), 'live 500 does not redirect');

  S.logout = 'abort';
  await ready();
  const at2 = lp.url();
  await lp.click('#pf-switch');
  await lp.click('#pf-switch-continue');
  ok(await lvis('#pf-switch-error') && /offline|reached/.test(await lp.textContent('#pf-switch-error')), 'live network failure shows an error');
  await lp.waitForTimeout(400);
  ok(lp.url() === at2 && await lp.evaluate(() => document.getElementById('pf-switch-dialog').open) && !callsToLogin(), 'live network failure does not redirect');
  function callsToLogin() { return S.log.some(e => e.method === 'GET' && e.path === '/api/v1/auth/blizzard/login'); }

  S.logout = 401;
  await ready();
  await lp.click('#pf-signout');
  await lp.waitForURL(u => u.searchParams.get('signed_out') === '1', { timeout: 8000 });
  ok((await lp.textContent('#home-status')).trim() === 'Signed out', 'live 401 is treated as signed out');

  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  ok(lerrs.length === 0, 'no live page errors ' + lerrs.join('|'));
  await b.close();
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exitCode = 1; process.exit(1); });
