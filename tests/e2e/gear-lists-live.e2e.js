// web#40 gear lists against a stubbed LIVE API (USE_MOCK_GEAR_LISTS=false), shaped like platform main
// src/routes/gear-lists.ts + src/app.ts error handler. Run with the repo served on :8765.
const { chromium } = require('playwright');
const B = 'http://localhost:' + (process.env.CS_E2E_PORT || 8765) + '/';
const API = 'https://api.crusaderstrike.com';
const CSRF = 'csrf-test-token';
const CH = 'ch_us_1001';
(async () => {
  const b = require('./_test-config.js').withTestConfig(await chromium.launch(),
    { FEATURE_BNET_SIGNIN: true, USE_MOCK_AUTH: false, USE_MOCK_PROFILE: false, USE_MOCK_GEAR_LISTS: false });
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  let n = 0; const uuid = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
  const S = { signedIn: true, lists: [], log: [], next429: null, next400: false };
  const mk = (name, vis) => ({ id: uuid(), character_id: CH, owner_user_id: 'u1', name, visibility: vis || 'private', version: 1,
    updated_at: '2026-11-04T10:00:00.000Z', updated_source: 'web', items: [] });
  const ctx = await b.newContext();
  await ctx.route(API + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), m = rq.method(), h = rq.headers();
    const cors = { 'access-control-allow-origin': B.slice(0, -1), 'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'Content-Type, X-CSRF-Token, If-Match', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE',
      'access-control-expose-headers': 'Retry-After, ETag' };
    const J = (status, body, extra) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...(extra || {}) }, body: body == null ? '' : JSON.stringify(body) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    S.log.push({ m, path: u.pathname, csrf: h['x-csrf-token'] || null, ifMatch: h['if-match'] || null, body: rq.postData() });
    if (!S.signedIn) return J(401, { error: { code: 'unauthorized', message: 'Sign in required.', request_id: 'r' } });
    if (m !== 'GET' && h['x-csrf-token'] !== CSRF) return J(403, { error: { code: 'csrf_failed', message: 'Security check failed.', request_id: 'r' } });
    if (u.pathname === '/api/v1/auth/session') return J(200, { battletag: 'Drew#1234', active_guild_id: null, memberships: [], csrf_token: CSRF });
    if (u.pathname === '/api/v1/me/characters') return J(200, { characters: [{ id: CH, character_name: 'Lightbringer', surname: 'Dawnmantle', realm: 'Emberfall', region: 'us', level: 42, game: 'wow_forever', displayed: true }] });
    if (u.pathname === '/api/v1/characters/' + CH + '/gear-lists') {
      if (m === 'GET') return J(200, { items: S.lists });
      if (S.next429) { const s = S.next429; S.next429 = null; return J(429, { error: { code: 'rate_limited', message: 'Gear write is rate-limited. Try again shortly.', request_id: 'r' } }, { 'retry-after': String(s) }); }
      if (S.nextLimit) { S.nextLimit = false; return J(409, { error: { code: 'list_limit_reached', message: 'At most 20 lists.', request_id: 'r' } }); }
      if (S.next400body) { const b = S.next400body; S.next400body = null; return J(400, b); }
      if (S.next400) { S.next400 = false; return J(400, { errors: { name: '1..64 chars, no control characters.' } }); }
      if (S.next403) { S.next403 = false; return J(403, { errors: { character_id: 'Character is not displayed.' } }); }
      const body = JSON.parse(rq.postData() || '{}'); const l = mk(body.name, body.visibility); S.lists.push(l);
      return J(201, l, { etag: '"v1"' });
    }
    const mm = u.pathname.match(/^\/api\/v1\/gear-lists\/([^/]+)$/);
    if (mm) {
      const l = S.lists.find(x => x.id === mm[1]); if (!l) return J(404, { error: { code: 'not_found', message: 'List not found.', request_id: 'r' } });
      if (m === 'GET') return J(200, l, { etag: '"v' + l.version + '"' });
      if (!h['if-match']) return J(428, { error: { code: 'precondition_required', message: 'If-Match required.', request_id: 'r' } });
      if (h['if-match'] !== '"v' + l.version + '"') return J(409, { error: { code: 'version_mismatch', message: 'List was modified; reload and retry.', request_id: 'r' }, current: { version: l.version, list: l } });
      if (m === 'DELETE') { S.lists = S.lists.filter(x => x !== l); return J(204, null); }
      const body = JSON.parse(rq.postData() || '{}'); if (body.name) l.name = body.name; if (body.visibility) l.visibility = body.visibility; l.version++;
      return J(200, l, { etag: '"v' + l.version + '"' });
    }
    return J(404, { error: { code: 'not_found', message: 'nope', request_id: 'r' } });
  });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const vis = s => p.waitForSelector(s + ':not([hidden])', { timeout: 5000 }).then(() => true, () => false);
  const U = B + 'gear/lists/?character=' + CH;
  const count = () => p.$$eval('#gl-index button', x => x.length);
  const writes = () => S.log.filter(x => x.m !== 'GET');

  ok(await p.evaluate(() => 1) === 1, 'page boots');
  S.signedIn = false; await p.goto(U); ok(await vis('#gl-signedout'), '401 -> sign-in prompt');
  S.signedIn = true; await p.goto(U); ok(await vis('#gl-ready'), 'signed in -> ready');
  ok(await p.evaluate(() => !window.CS_CONFIG.USE_MOCK_GEAR_LISTS), 'live flag in effect');
  ok(S.log.some(x => x.path === '/api/v1/characters/' + CH + '/gear-lists'), 'GET /characters/{id}/gear-lists called');
  ok(await vis('#gl-none'), 'empty state: no gear lists yet');
  ok((await p.textContent('#gl-h')).startsWith('Lightbringer Dawnmantle'), 'heading from /me/characters');

  // web#42 level rule: level 42 -> leveling by default, until_level must be > 42
  ok(await p.isChecked('#gl-new-type-leveling') && await p.isVisible('#gl-new-until'), 'under 60 defaults to leveling with Up to level');
  await p.fill('#gl-new-name', 'Too low'); await p.fill('#gl-new-until', '42'); await p.click('#gl-new-btn');
  ok(/higher than/.test(await p.textContent('#gl-new-until-err')), 'until_level <= level rejected client-side');
  await p.check('#gl-new-type-max'); ok(await p.isHidden('#gl-new-until'), 'max-level hides Up to level'); await p.check('#gl-new-type-leveling');
  await p.fill('#gl-new-until', '50');
  // create (201, {name, type, until_level, role_spec, visibility}) with CSRF
  await p.fill('#gl-new-name', 'Emberfall BiS'); await p.selectOption('#gl-new-vis', 'guild'); await p.click('#gl-new-btn');
  await p.waitForFunction(() => document.getElementById('gl-detail-h').textContent === 'Emberfall BiS');
  const c = writes().find(x => x.m === 'POST');
  ok(c && c.csrf === CSRF, 'create sends X-CSRF-Token from /auth/session');
  ok(c && JSON.stringify(JSON.parse(c.body)) === JSON.stringify({ name: 'Emberfall BiS', type: 'leveling', until_level: 50, role_spec: null, visibility: 'guild' }), 'create body {name, type, until_level, role_spec, visibility}: ' + (c && c.body));
  ok(await count() === 1, 'one list after create');

  // rename (PATCH If-Match "v1")
  await p.fill('#gl-name', 'Emberfall raid'); await p.click('#gl-meta-form button[type=submit]');
  await p.waitForFunction(() => document.getElementById('gl-detail-h').textContent === 'Emberfall raid');
  const pa = writes().find(x => x.m === 'PATCH');
  ok(pa && pa.ifMatch === '"v1"' && pa.csrf === CSRF, 'rename PATCH with If-Match "v1" + CSRF');
  ok(S.lists[0].name === 'Emberfall raid' && S.lists[0].version === 2, 'server state renamed, v2');

  // 400 { errors: { name } } envelope -> field error
  S.next400 = true; await p.fill('#gl-new-name', 'x'); await p.click('#gl-new-btn');
  ok(await p.waitForFunction(() => /1\.\.64/.test(document.getElementById('gl-new-name-err').textContent), null, { timeout: 3000 }).then(() => true, () => false), '400 errors.name shown on field');

  // 429 Retry-After on create -> countdown banner, auto retry succeeds
  S.next429 = 1; await p.fill('#gl-new-name', 'Duskhollow pre-raid'); await p.click('#gl-new-btn');
  ok(await vis('#gl-banner') && /Retrying in 1 second/.test(await p.textContent('#gl-banner-msg')), '429 honours Retry-After: ' + await p.textContent('#gl-banner-msg'));
  ok(await p.waitForFunction(() => document.querySelectorAll('#gl-index button').length === 2, null, { timeout: 4000 }).then(() => true, () => false), 'auto-retry after Retry-After creates list');

  // 409 list_limit_reached (server owns the 20 cap; no client cap)
  ok(await p.isEnabled('#gl-new-btn') && (await p.textContent('#gl-count')) === '(2)', 'no client-side 5-list cap');
  S.nextLimit = true; await p.fill('#gl-new-name', 'Twenty-first'); await p.click('#gl-new-btn');
  ok(await p.waitForFunction(() => /already has 20 lists/.test(document.getElementById('gl-banner-msg').textContent), null, { timeout: 3000 }).then(() => true, () => false), '409 list_limit_reached banner');

  // web#50 / platform#56: 400 field-map banners use body.message when present, friendly copy otherwise, never the raw code
  const n400 = S.lists.length;
  const msg400 = async (body, re, label) => {
    await p.evaluate(() => { document.getElementById('gl-banner-msg').textContent = ''; });
    S.next400body = body; await p.fill('#gl-new-name', 'Bad body'); await p.click('#gl-new-btn');
    const ok1 = await p.waitForFunction(r => new RegExp(r).test(document.getElementById('gl-banner-msg').textContent), re.source, { timeout: 3000 }).then(() => true, () => false);
    const t = await p.textContent('#gl-banner-msg');
    ok(ok1 && !/invalid_json|weird_new_code/.test(t), label + ': ' + t);
  };
  await msg400({ message: 'Request body is not valid JSON.', errors: { body: 'invalid_json' } }, /^Request body is not valid JSON\.$/, '400 shows top-level body.message');
  await msg400({ errors: { body: 'invalid_json' } }, /couldn.t be read/, '400 invalid_json without message -> friendly copy');
  await msg400({ errors: { body: 'weird_new_code' } }, /wasn.t accepted/, '400 unknown field code -> generic copy');
  ok(S.lists.length === n400, '400s created nothing');

  // delete (DELETE If-Match, 204)
  await p.click('#gl-delete'); await p.click('#gl-delete-confirm');
  ok(await p.waitForFunction(() => document.querySelectorAll('#gl-index button').length === 1, null, { timeout: 3000 }).then(() => true, () => false), 'delete -> one list left');
  const d = writes().find(x => x.m === 'DELETE');
  ok(d && /^"v\d+"$/.test(d.ifMatch) && d.csrf === CSRF, 'DELETE with If-Match + CSRF');

  // 403 errors.character_id -> display-selection banner
  S.next403 = true; await p.fill('#gl-new-name', 'Hidden char'); await p.click('#gl-new-btn');
  ok(await p.waitForFunction(() => /no longer displayed on your profile/.test(document.getElementById('gl-banner-msg').textContent), null, { timeout: 3000 }).then(() => true, () => false), '403 character_id banner: ' + await p.textContent('#gl-banner-msg'));

  // session expires mid-use -> sign-in prompt
  await p.click('#gl-index button'); await vis('#gl-name'); S.signedIn = false; await p.fill('#gl-name', 'Again'); await p.click('#gl-meta-form button[type=submit]');
  ok(await vis('#gl-signedout'), 'write 401 -> sign-in prompt');

  ok(!errs.length, 'no page errors ' + errs.join('; '));
  await b.close();
})().catch(e => { console.log('FAIL crash ' + e.message); process.exit(1); });
