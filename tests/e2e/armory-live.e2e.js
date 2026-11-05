// web#42 profile armory against a stubbed LIVE API (USE_MOCK_ARMORY=false), per /workspace/groom/gear-sets-and-items.md
// + web-armory-picker.md (later lines win: set cap is 409 list_limit_reached). Covers display PATCH, create with
// validation codes, per-slot autosave PUT with If-Match/ETag, 409/412 reload, 400 slot codes, 429 Retry-After,
// list_limit_reached, character_not_displayed, outgrown. Run with the repo served on :8765 (or CS_E2E_PORT).
const { chromium } = require('playwright');
const B = 'http://localhost:' + (process.env.CS_E2E_PORT || 8765) + '/';
const API = 'https://api.crusaderstrike.com';
const CSRF = 'csrf-armory-token';
const SLOTS = ['head', 'neck', 'shoulder', 'back', 'chest', 'shirt', 'tabard', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'main_hand', 'off_hand', 'ranged'];
(async () => {
  const b = require('./_test-config.js').withTestConfig(await chromium.launch(),
    { FEATURE_BNET_SIGNIN: true, USE_MOCK_AUTH: false, USE_MOCK_PROFILE: false, USE_MOCK_ARMORY: false });
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  let n = 0; const uuid = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
  const chars = [
    { id: 'ch_a', character_name: 'Lightbringer', surname: 'Dawn', realm: 'Emberfall', region: 'us', level: 60, class: 'Paladin', game: 'wow_forever', displayed: true },
    { id: 'ch_b', character_name: 'Wisp', surname: 'Wander', realm: 'Emberfall', region: 'us', level: 27, class: 'Druid', game: 'wow_forever', displayed: false }];
  const items = [
    { item_id: 16900, name: 'Stormrage Cover', slot: 'head', inventory_type: 'HEAD', quality: 'epic', item_level: 76, required_level: 60, armor_type: 'leather', stats: null, icon_url: null, source: 'blizzard_forever', verified: true },
    { item_id: 16921, name: 'Halo of Transcendence', slot: 'head', inventory_type: 'HEAD', quality: 'epic', item_level: 76, required_level: 60, armor_type: 'cloth', stats: null, icon_url: 'https://evil.example/x.png', source: 'blizzard_forever', verified: true },
    { item_id: 18814, name: 'Choker of the Fire Lord', slot: 'neck', inventory_type: 'NECK', quality: 'epic', item_level: 78, required_level: 60, armor_type: null, stats: null, icon_url: null, source: 'blizzard_forever', verified: true }];
  const S = { signedIn: true, sets: [], log: [], once: {} };
  const err = (code, details) => ({ error: Object.assign({ code, message: code, request_id: 'r' }, details ? { details } : {}) });
  const outgrown = s => s.type === 'leveling' && (chars.find(c => c.id === s.character_id) || {}).level >= s.until_level;
  const view = s => Object.assign({}, s, { outgrown: outgrown(s) });
  const ctx = await b.newContext();
  await ctx.route(API + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), m = rq.method(), h = rq.headers();
    const cors = { 'access-control-allow-origin': B.slice(0, -1), 'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'Content-Type, X-CSRF-Token, If-Match, Accept', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE',
      'access-control-expose-headers': 'Retry-After, ETag' };
    const J = (status, body, extra) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...(extra || {}) }, body: body == null ? '' : JSON.stringify(body) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = rq.postData() ? JSON.parse(rq.postData()) : null;
    S.log.push({ m, path: u.pathname, csrf: h['x-csrf-token'] || null, ifMatch: h['if-match'] || null, body, search: u.search });
    if (!S.signedIn) return J(401, err('unauthorized'));
    if (m !== 'GET' && h['x-csrf-token'] !== CSRF) return J(403, err('csrf_failed'));
    const p = u.pathname;
    if (p === '/api/v1/auth/session') return J(200, { battletag: 'Drew#1234', active_guild_id: null, memberships: [], csrf_token: CSRF });
    if (p === '/api/v1/me/profile') return J(200, { battletag: 'Drew#1234', preferred_region: 'us' });
    if (p === '/api/v1/me/characters') return J(200, { characters: chars });
    let mm;
    if ((mm = p.match(/^\/api\/v1\/me\/characters\/([^/]+)$/)) && m === 'PATCH') {
      const c = chars.find(x => x.id === mm[1]); if (!c) return J(404, err('not_found'));
      c.displayed = !!body.displayed; return J(200, c);
    }
    if ((mm = p.match(/^\/api\/v1\/characters\/([^/]+)\/gear-lists$/))) {
      const c = chars.find(x => x.id === mm[1]);
      if (!c.displayed) return J(409, err('character_not_displayed'));
      if (m === 'GET') return J(200, { items: S.sets.filter(s => s.character_id === c.id).map(view) });
      if (S.once.notDisplayed) { S.once.notDisplayed = false; return J(409, err('character_not_displayed')); }
      if (S.once.create400) { const d = S.once.create400; S.once.create400 = null; return J(400, err('validation_error', d)); }
      if (S.sets.filter(s => s.character_id === c.id).length >= 20) return J(409, err('list_limit_reached'));
      const slots = {}; SLOTS.forEach(k => slots[k] = null);
      const s = { id: uuid(), character_id: c.id, name: body.name, type: body.type, until_level: body.until_level, role_spec: body.role_spec, slots, version: 1, edited_at: '2026-11-05T06:00:00.000Z' };
      S.sets.push(s); return J(201, view(s), { etag: '"v1"' });
    }
    if ((mm = p.match(/^\/api\/v1\/gear-lists\/([^/]+)$/))) {
      const s = S.sets.find(x => x.id === mm[1]); if (!s) return J(404, err('not_found'));
      return J(200, view(s), { etag: '"v' + s.version + '"' });
    }
    if ((mm = p.match(/^\/api\/v1\/gear-lists\/([^/]+)\/slots\/([^/]+)$/)) && m === 'PUT') {
      const s = S.sets.find(x => x.id === mm[1]); if (!s) return J(404, err('not_found'));
      if (S.once.r429) { S.once.r429 = false; return J(429, err('rate_limited'), { 'retry-after': '7' }); }
      if (!SLOTS.includes(mm[2])) return J(400, err('validation_error', { slot: 'invalid_slot' }));
      if (h['if-match'] && h['if-match'] !== '"v' + s.version + '"') return J(S.once.use412 ? 412 : 409, err('version_mismatch'));
      const iid = body.item_id;
      if (iid != null) {
        const it = items.find(i => i.item_id === iid);
        if (!it) return J(400, err('validation_error', { item_id: 'item_not_forever' }));
        if (it.slot !== mm[2]) return J(400, err('validation_error', { item_id: 'item_not_in_slot' }));
      }
      s.slots[mm[2]] = iid; s.version++; s.edited_at = '2026-11-05T06:0' + s.version + ':00.000Z';
      return J(200, { slot: mm[2], item_id: iid, edited_at: s.edited_at }, { etag: '"v' + s.version + '"' });
    }
    if (p === '/api/v1/items') {
      const sl = u.searchParams.get('slot'), q = (u.searchParams.get('q') || '').toLowerCase();
      return J(200, { items: items.filter(i => (!sl || i.slot === sl) && (!q || i.name.toLowerCase().includes(q))), next_cursor: null }, { etag: '"i1"', 'cache-control': 'public, max-age=300' });
    }
    if ((mm = p.match(/^\/api\/v1\/items\/(\d+)$/))) { const it = items.find(i => i.item_id === +mm[1]); return it ? J(200, it) : J(404, err('not_found')); }
    return J(404, err('not_found'));
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const vis = (s, t) => p.waitForSelector(s + ':not([hidden])', { timeout: t || 5000 }).then(() => true, () => false);
  const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);
  const go = async () => { await p.goto(B + 'profile/'); await vis('#pf-ready'); await p.waitForTimeout(300); };
  const last = (m, re) => [...S.log].reverse().find(x => x.m === m && re.test(x.path));
  const pickFirst = async slot => { await p.click('#pf-slot-' + slot); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); await p.click('#pf-picker-list .pf-pick'); };
  const newBtn = id => p.locator(`.pf-pchar[data-char=${id}] .pf-new`);

  S.signedIn = false; await p.goto(B + 'profile/'); ok(await vis('#pf-signedout'), '401 -> sign-in prompt');
  S.signedIn = true; await go();
  ok(await p.evaluate(() => CS_CONFIG.USE_MOCK_ARMORY === false && CS_CONFIG.USE_MOCK_PROFILE === false), 'live flags in effect (USE_MOCK_ARMORY=false)');
  ok(await p.locator('#pf-list > li').count() === 2, 'characters from GET /me/characters');
  ok(await p.isChecked('#pf-show-ch_a') && !(await p.isChecked('#pf-show-ch_b')), 'displayed flag drives toggles');

  // display toggle: PATCH /me/characters/{id} {displayed} with CSRF
  await p.check('#pf-show-ch_b'); await until(() => /is displayed on your profile/.test(document.getElementById('pf-status').textContent));
  const pt = last('PATCH', /\/me\/characters\/ch_b$/);
  ok(pt && pt.csrf === CSRF && JSON.stringify(pt.body) === '{"displayed":true}', 'PATCH /me/characters/ch_b {displayed:true} + X-CSRF-Token');
  ok(await p.locator('#pf-panel .pf-pchar').count() === 2, 'panel lists both displayed characters');

  // create max-level set (level 60) -> POST body + ETag
  await newBtn('ch_a').click(); await p.fill('#pf-c-name', 'Tank'); await p.fill('#pf-c-role', 'Protection'); await p.click('#pf-c-save');
  ok(await until(() => !document.getElementById('pf-create').open), 'max-level set created');
  const cr = last('POST', /\/characters\/ch_a\/gear-lists$/);
  ok(cr && cr.csrf === CSRF && JSON.stringify(cr.body) === JSON.stringify({ name: 'Tank', type: 'max_level', until_level: null, role_spec: 'Protection' }), 'POST body snake_case: ' + (cr && JSON.stringify(cr.body)));
  ok((await p.textContent('#pf-set-h')) === 'Tank', 'armory opens for the new set');
  const setId = S.sets[0].id;

  // autosave: PUT /slots/head {item_id} with If-Match from the create ETag, then next ETag
  await p.click('#pf-slot-head'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length === 2);
  ok(await p.locator('#pf-picker-list .pf-icon.is-ph').count() === 2, 'null / non-Blizzard icon_url -> placeholder');
  ok(/slot=head/.test(last('GET', /\/api\/v1\/items$/).search), 'GET /items?slot=head');
  await p.click('#pf-picker-list .pf-pick');
  ok(await until(() => /Head saved: Stormrage Cover/.test(document.getElementById('pf-status').textContent)), 'pick autosaves');
  let put = last('PUT', /\/slots\/head$/);
  ok(put && put.ifMatch === '"v1"' && put.csrf === CSRF && JSON.stringify(put.body) === '{"item_id":16900}', 'PUT /gear-lists/{id}/slots/head {item_id} If-Match "v1" + CSRF');
  await pickFirst('neck'); await until(() => /Neck saved/.test(document.getElementById('pf-status').textContent));
  ok(last('PUT', /\/slots\/neck$/).ifMatch === '"v2"', 'next PUT uses the ETag from the previous response ("v2")');
  await p.click('#pf-slot-head'); await p.click('#pf-picker-clear');
  ok(await until(() => /Head cleared/.test(document.getElementById('pf-status').textContent)) && JSON.stringify(last('PUT', /\/slots\/head$/).body) === '{"item_id":null}', 'clear sends {item_id:null}');
  ok(S.sets[0].slots.neck === 18814 && S.sets[0].slots.head === null && S.sets[0].version === 4, 'server state after autosaves (v4)');
  await go(); await p.click(`.pf-set[data-set="${setId}"]`); await until(() => /Choker/.test(document.getElementById('pf-slot-neck').textContent));
  ok(/Choker of the Fire Lord/.test(await p.textContent('#pf-slot-neck')), 'reload resolves slot item via GET /items/{id}');

  // 409 / 412 on stale If-Match -> reload + banner, then fresh ETag saves
  for (const k of ['409', '412']) {
    S.once.use412 = k === '412'; S.sets[0].version++; S.sets[0].slots.neck = null;
    await pickFirst('head');
    ok(await vis('#pf-slot-banner') && /changed somewhere else/.test(await p.textContent('#pf-slot-banner')) && /Empty/.test(await p.textContent('#pf-slot-head')), k + ' stale If-Match -> reload + banner, pick not kept');
    await pickFirst('head'); ok(await until(() => /Head saved/.test(document.getElementById('pf-status').textContent)) && last('PUT', /\/slots\/head$/).ifMatch === '"v' + (S.sets[0].version - 1) + '"', k + ': retry uses the reloaded ETag');
    await p.click('#pf-slot-head'); await p.click('#pf-picker-clear'); await until(() => /Head cleared/.test(document.getElementById('pf-status').textContent));
  }

  // 400 slot validation codes
  await p.click('#pf-slot-head'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length === 2);
  items[1].slot = 'neck'; await p.click('#pf-picker-list .pf-pick[data-item="16921"]');
  ok(await vis('#pf-slot-banner') && /doesn.t fit this slot/.test(await p.textContent('#pf-slot-banner')) && /Empty/.test(await p.textContent('#pf-slot-head')), '400 item_not_in_slot -> rolled back + message');
  items[1].slot = 'head';
  const nf = await p.evaluate(id => CSArmoryApi.putSlot(id, 'head', 99999, null), setId);
  ok(nf.status === 400 && nf.body.error.code === 'validation_error' && nf.body.error.details.item_id === 'item_not_forever', '400 item_not_forever');
  const is = await p.evaluate(id => CSArmoryApi.putSlot(id, 'hat', null, null), setId);
  ok(is.status === 400 && is.body.error.details.slot === 'invalid_slot', '400 invalid_slot');
  ok(await p.evaluate(() => CSGearSetRules.message('item_not_forever')) === 'That item isn\u2019t a WoW Forever item.', 'item_not_forever has a user message');

  // 429 Retry-After
  S.once.r429 = true; await pickFirst('neck');
  ok(await vis('#pf-slot-banner') && /Wait 7 seconds/.test(await p.textContent('#pf-slot-banner')), '429 Retry-After: 7 -> message');

  // server-side create validation codes surface on the form
  for (const [d, field, re] of [
    [{ until_level: 'until_level_not_above_current_level' }, '#pf-c-until-err', /higher than/],
    [{ until_level: 'until_level_out_of_range' }, '#pf-c-until-err', /1 to 60/],
    [{ until_level: 'until_level_required' }, '#pf-c-until-err', /Enter the level/],
    [{ type: 'leveling_set_at_max_level' }, '#pf-c-type-err', /only have max-level/]]) {
    S.once.create400 = d; await newBtn('ch_b').click(); await p.fill('#pf-c-name', 'Lv'); await p.fill('#pf-c-until', '40'); await p.click('#pf-c-save');
    ok(await until(([s, r]) => new RegExp(r).test(document.querySelector(s).textContent), [field, re.source]), '400 ' + Object.values(d)[0] + ' shown');
    await p.click('#pf-c-cancel');
  }
  S.once.create400 = { until_level: 'until_level_must_be_null' }; await newBtn('ch_b').click(); await p.check('#pf-c-type-max'); await p.fill('#pf-c-name', 'Mx'); await p.click('#pf-c-save');
  ok(await until(() => /no level/.test(document.getElementById('pf-c-until-err').textContent)), '400 until_level_must_be_null mapped'); await p.click('#pf-c-cancel');

  // 409 character_not_displayed
  S.once.notDisplayed = true; await newBtn('ch_b').click(); await p.fill('#pf-c-name', 'X'); await p.fill('#pf-c-until', '40'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /Show this character on your profile/.test(await p.textContent('#pf-c-error')), '409 character_not_displayed message'); await p.click('#pf-c-cancel');

  // outgrown: leveling set until 20 for a level-27 character
  const slots = {}; SLOTS.forEach(k => slots[k] = null);
  S.sets.push({ id: uuid(), character_id: 'ch_b', name: 'Deadmines', type: 'leveling', until_level: 20, role_spec: null, slots, version: 1, edited_at: '2026-11-05T06:00:00.000Z' });
  await go(); const og = p.locator('.pf-pchar[data-char=ch_b] .pf-set.is-outgrown');
  ok(await og.count() === 1 && /Outgrown/.test(await og.textContent()), 'outgrown set greyed in panel');
  await og.click(); await until(() => !document.getElementById('pf-armory-view').hidden);
  ok(await p.evaluate(() => document.getElementById('pf-armory-view').classList.contains('is-outgrown')) && /Outgrown: Wisp Wander is level 27/.test(await p.textContent('#pf-set-outgrown')), 'outgrown armory note');

  // 409 list_limit_reached at 20 sets
  while (S.sets.filter(s => s.character_id === 'ch_a').length < 20) S.sets.push({ id: uuid(), character_id: 'ch_a', name: 'S' + n, type: 'max_level', until_level: null, role_spec: null, slots, version: 1, edited_at: 'x' });
  await go(); await newBtn('ch_a').click(); await p.fill('#pf-c-name', 'Twenty-first'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /already has 20 gear sets/.test(await p.textContent('#pf-c-error')), '409 list_limit_reached message'); await p.click('#pf-c-cancel');
  ok(await p.evaluate(() => CSGearSetRules.isListLimit('list_limit_reached') && !CSGearSetRules.isListLimit('list_limit')), 'only list_limit_reached is the cap code');

  // hiding keeps sets; listing a hidden character is 409 character_not_displayed (not shown in panel)
  await p.uncheck('#pf-show-ch_b'); await until(() => /is hidden/.test(document.getElementById('pf-status').textContent));
  ok(await p.locator('.pf-pchar[data-char=ch_b]').count() === 0 && S.sets.some(s => s.character_id === 'ch_b'), 'hidden character leaves the panel; sets kept');

  ok(!S.log.some(x => x.m !== 'GET' && x.csrf !== CSRF), 'every write carried X-CSRF-Token');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
