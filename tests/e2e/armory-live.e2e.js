// web#42 profile armory against a stubbed LIVE API (USE_MOCK_ARMORY=false). The stub mirrors routes that are SHIPPED on
// platform main (src/routes/profile.ts, src/routes/gear-lists.ts, src/app.ts error handler, openapi/v1.yaml) and the
// gear-list schema v1: GET /me/characters {characters, selection}; PUT /me/characters/selection {main_id, alt_ids};
// GET/POST /characters/{id}/gear-lists (403 {errors:{character_id}} when not selected, 409 list_limit_reached);
// GET /gear-lists/{id}; POST /gear-lists/{id}/ops (add_item|remove_item, uuid op_id, base_version -> conflicts[]);
// 429 Retry-After. Items (GET /items, /items/{id}) are live on main. Run with the repo served on CS_E2E_PORT.
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
    { id: 'ch_a', character_name: 'Lightbringer', surname: 'Dawn', realm: 'Emberfall', region: 'us', level: 60, class: 'Paladin', game: 'wow_forever', stale: false },
    { id: 'ch_b', character_name: 'Wisp', surname: 'Wander', realm: 'Emberfall', region: 'us', level: 27, class: 'Druid', game: 'wow_forever', stale: false }];
  const items = [
    { item_id: 16900, name: 'Stormrage Cover', slot: 'head', inventory_type: 'HEAD', quality: 'epic', item_level: 76, required_level: 60, armor_type: 'leather', stats: null, icon_url: null, source: 'blizzard_forever', verified: true },
    { item_id: 16921, name: 'Halo of Transcendence', slot: 'head', inventory_type: 'HEAD', quality: 'epic', item_level: 76, required_level: 60, armor_type: 'cloth', stats: null, icon_url: 'https://evil.example/x.png', source: 'blizzard_forever', verified: true },
    { item_id: 18814, name: 'Choker of the Fire Lord', slot: 'neck', inventory_type: 'NECK', quality: 'epic', item_level: 78, required_level: 60, armor_type: null, stats: null, icon_url: null, source: 'blizzard_forever', verified: true }];
  const S = { signedIn: true, sets: [], log: [], once: {}, sel: { main_id: 'ch_a', alt_ids: [], updated_at: '2026-11-04T00:00:00.000Z' }, seen: new Set() };
  const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const err = code => ({ error: { code, message: code, request_id: 'r' } });
  const selected = id => S.sel && (S.sel.main_id === id || S.sel.alt_ids.includes(id));
  const outgrown = s => s.type === 'leveling' && (chars.find(c => c.id === s.character_id) || {}).level >= s.until_level;
  const view = s => { const o = JSON.parse(JSON.stringify(s)); delete o.touch; delete o.staleAll; o.outgrown = outgrown(s); return o; };
  const mkSet = (cid, name, extra) => Object.assign({ id: uuid(), character_id: cid, owner_user_id: 'u1', name, visibility: 'private', version: 1,
    updated_at: '2026-11-05T06:00:00.000Z', updated_source: 'web', items: [], touch: {}, type: 'max_level', until_level: null, role_spec: null }, extra || {});
  const ctx = await b.newContext();
  await ctx.route(API + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), m = rq.method(), h = rq.headers();
    const cors = { 'access-control-allow-origin': B.slice(0, -1), 'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'Content-Type, X-CSRF-Token, If-Match, Accept', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE',
      'access-control-expose-headers': 'Retry-After, ETag' };
    const J = (status, body, extra) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...(extra || {}) }, body: body == null ? '' : JSON.stringify(body) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = rq.postData() ? JSON.parse(rq.postData()) : null;
    S.log.push({ m, path: u.pathname, csrf: h['x-csrf-token'] || null, body, search: u.search });
    if (!S.signedIn) return J(401, err('unauthenticated'));
    if (m !== 'GET' && h['x-csrf-token'] !== CSRF) return J(403, err('csrf_failed'));
    const p = u.pathname; let mm;
    if (p === '/api/v1/auth/session') return J(200, { battletag: 'Drew#1234', active_guild_id: null, memberships: [], csrf_token: CSRF });
    if (p === '/api/v1/me/profile') return J(200, { battletag: 'Drew#1234', main_character_id: S.sel && S.sel.main_id, preferred_region: 'us' });
    if (p === '/api/v1/me/characters' && m === 'GET') return J(200, { game: 'wow_forever', characters: chars, selection: S.sel });
    if (p === '/api/v1/me/characters/selection' && m === 'PUT') {
      const live = chars.filter(c => !c.stale).map(c => c.id);
      if (!body || typeof body.main_id !== 'string' || !live.includes(body.main_id)) return J(400, { errors: { main_id: 'Pick a main from your characters.' } });
      if (!Array.isArray(body.alt_ids) || body.alt_ids.some(a => !live.includes(a) || a === body.main_id)) return J(400, { errors: { alt_ids: 'Alts must be your other characters.' } });
      S.sel = { main_id: body.main_id, alt_ids: body.alt_ids, updated_at: '2026-11-05T07:00:00.000Z' }; return J(200, { selection: S.sel });
    }
    if (/^\/api\/v1\/me\/characters\/[^/]+$/.test(p)) return J(404, err('not_found'));  // no PATCH /me/characters/{id} on platform main
    if ((mm = p.match(/^\/api\/v1\/characters\/([^/]+)\/gear-lists$/))) {
      const c = chars.find(x => x.id === mm[1]);
      if (!selected(c.id) || (m === 'POST' && S.once.notSelected)) { S.once.notSelected = false; return J(403, { errors: { character_id: 'Must be your selected main or an alt.' } }); }
      if (m === 'GET') return J(200, { items: S.sets.filter(s => s.character_id === c.id).map(view) });
      if (S.once.create400) { const d = S.once.create400; S.once.create400 = null; return J(400, { error: { code: 'validation_error', message: 'x', request_id: 'r', details: d } }); }
      if (S.sets.filter(s => s.character_id === c.id).length >= (S.cap || 20)) return J(409, { error: Object.assign({ code: 'list_limit_reached', message: S.capMsg !== undefined ? S.capMsg : 'Maximum of ' + (S.cap || 20) + ' gear lists per character.', request_id: 'r' }, S.capDetails ? { details: S.capDetails } : {}) });
      const s = mkSet(c.id, body.name, { type: body.type, until_level: body.until_level, role_spec: body.role_spec });
      S.sets.push(s); return J(201, view(s), { etag: '"v1"' });
    }
    if ((mm = p.match(/^\/api\/v1\/gear-lists\/([^/]+)$/))) {
      const s = S.sets.find(x => x.id === mm[1]); if (!s) return J(404, err('not_found'));
      return J(200, view(s), { etag: '"v' + s.version + '"' });
    }
    if ((mm = p.match(/^\/api\/v1\/gear-lists\/([^/]+)\/slots\/[^/]+$/))) return J(404, err('not_found'));  // no PUT /slots on platform main
    if ((mm = p.match(/^\/api\/v1\/gear-lists\/([^/]+)\/ops$/)) && m === 'POST') {
      if (S.once.r429) { S.once.r429 = false; return J(429, { error: { code: 'rate_limited', message: 'Gear write is rate-limited. Try again shortly.', request_id: 'r' } }, { 'retry-after': '7' }); }
      const ops = body && body.ops;
      if (!Array.isArray(ops) || ops.length < 1 || ops.length > 50) return J(400, { errors: { ops: 'Array of 1..50 ops required.' } });
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i];
        if (!UUID4.test(o.op_id) || !['add_item', 'remove_item', 'reprioritize_item', 'mark_obtained'].includes(o.type) || !SLOTS.includes(o.slot) ||
          !Number.isInteger(o.item_id) || o.item_id < 1 || !Number.isInteger(o.base_version) || (o.type === 'add_item' && !(o.priority >= 1))) return J(400, { errors: { ['ops.' + i]: 'Invalid.' } });
      }
      const s = S.sets.find(x => x.id === mm[1]); if (!s) return J(404, err('not_found'));
      if (!selected(s.character_id)) return J(403, { errors: { character_id: 'Must be your selected main or an alt.' } });
      if (S.once.stale) { S.once.stale = false; s.version++; s.staleAll = s.version;
        s.items = s.items.filter(i => i.slot !== 'neck').concat([{ slot: 'neck', item_id: 18814, priority: 1, note: null, obtained: false, obtained_at: null, icon_url: null }]); }
      const out = { applied: [], duplicates: [], conflicts: [], ignored: [] };
      for (const o of ops) {
        if (S.seen.has(o.op_id)) { out.duplicates.push(o.op_id); continue; }
        S.seen.add(o.op_id);
        if (o.type === 'add_item' && !items.some(i => i.item_id === o.item_id)) { s.version++; out.conflicts.push({ op_id: o.op_id, reason: 'item_not_forever', message: 'item_not_forever' }); continue; }
        const key = o.slot + ':' + o.item_id, t = Math.max(s.touch[key] || 0, s.staleAll || 0);
        if (t > o.base_version) { s.version++; out.conflicts.push({ op_id: o.op_id, reason: 'stale_base_version', winning_version: t, message: 'Stale base_version.' }); continue; }
        s.version++; s.touch[key] = s.version;
        if (o.type === 'remove_item') s.items = s.items.filter(i => !(i.slot === o.slot && i.item_id === o.item_id));
        else if (o.type === 'add_item') s.items.push({ slot: o.slot, item_id: o.item_id, priority: o.priority, note: null, obtained: false, obtained_at: null, icon_url: null });
        out.applied.push(o.op_id);
      }
      out.version = s.version; out.list = view(s); return J(200, out);
    }
    if (p === '/api/v1/items') {
      const sl = u.searchParams.get('slot'), q = (u.searchParams.get('q') || '').toLowerCase();
      return J(200, { items: items.filter(i => (!sl || i.slot === sl) && (!q || i.name.toLowerCase().includes(q))), next_cursor: null }, { etag: '"i1"', 'cache-control': 'public, max-age=300' });
    }
    if ((mm = p.match(/^\/api\/v1\/items\/(\d+)$/))) { const it = items.find(i => i.item_id === +mm[1]); return it ? J(200, it) : J(404, err('not_found')); }
    return J(404, err('not_found'));
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); if (process.env.DBG) p.on('console', m => console.log('CONSOLE', m.text()));
  const vis = (s, t) => p.waitForSelector(s + ':not([hidden])', { timeout: t || 5000 }).then(() => true, () => false);
  const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 8000 }).then(() => true, () => false);
  const idle = () => p.waitForFunction(() => document.documentElement.getAttribute('data-pf-busy') === '0', null, { timeout: 8000 }).catch(() => {});
  const go = async () => { await p.goto(B + 'profile/'); await vis('#pf-ready'); await idle(); };
  const last = (m, re) => [...S.log].reverse().find(x => x.m === m && re.test(x.path));
  const status = re => until(r => new RegExp(r).test(document.getElementById('pf-status').textContent), re.source);
  const openPick = async slot => { await p.click('#pf-slot-' + slot); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); };
  const pickFirst = async slot => { await openPick(slot); await p.click('#pf-picker-list .pf-pick'); };
  const newBtn = id => p.locator(`.pf-pchar[data-char=${id}] .pf-new`);
  const closeCreate = async () => { await p.click('#pf-c-cancel'); await until(() => !document.getElementById('pf-create').open); };

  S.signedIn = false; await p.goto(B + 'profile/'); ok(await vis('#pf-signedout'), '401 -> sign-in prompt');
  S.signedIn = true; await go();
  ok(await p.evaluate(() => CS_CONFIG.USE_MOCK_ARMORY === false && CS_CONFIG.USE_MOCK_PROFILE === false), 'live flags in effect (USE_MOCK_ARMORY=false)');
  ok(await p.locator('#pf-list > li').count() === 2, 'characters from GET /me/characters');
  ok(await p.isChecked('#pf-show-ch_a') && !(await p.isChecked('#pf-show-ch_b')), 'displayed = selection main/alts');

  // display toggle -> PUT /me/characters/selection {main_id, alt_ids} with CSRF (the shipped route)
  await p.check('#pf-show-ch_b'); await status(/is displayed on your profile/); await idle();
  const ps = last('PUT', /\/me\/characters\/selection$/);
  ok(ps && ps.csrf === CSRF && JSON.stringify(ps.body) === '{"main_id":"ch_a","alt_ids":["ch_b"]}', 'PUT /me/characters/selection {main_id:ch_a, alt_ids:[ch_b]} + CSRF: ' + (ps && JSON.stringify(ps.body)));
  ok(!S.log.some(x => x.m === 'PATCH'), 'no PATCH /me/characters/{id} (not on platform main)');
  ok(await p.locator('#pf-panel .pf-pchar').count() === 2, 'panel lists both displayed characters');

  // create: always sends type; leveling sends until_level, level 60 sends max_level + null
  await newBtn('ch_a').click(); await p.fill('#pf-c-name', 'Tank'); await p.fill('#pf-c-role', 'Protection'); await p.click('#pf-c-save');
  ok(await until(() => !document.getElementById('pf-create').open), 'max-level set created'); await idle();
  let cr = last('POST', /\/characters\/ch_a\/gear-lists$/);
  ok(cr && cr.csrf === CSRF && cr.body.type === 'max_level' && cr.body.until_level === null && JSON.stringify(cr.body) === JSON.stringify({ name: 'Tank', type: 'max_level', until_level: null, role_spec: 'Protection' }), 'level 60 create body has type max_level: ' + (cr && JSON.stringify(cr.body)));
  await newBtn('ch_b').click(); await p.fill('#pf-c-name', 'Questing'); await p.fill('#pf-c-until', '40'); await p.click('#pf-c-save');
  ok(await until(() => !document.getElementById('pf-create').open), 'leveling set created'); await idle();
  cr = last('POST', /\/characters\/ch_b\/gear-lists$/);
  ok(cr && cr.body.type === 'leveling' && cr.body.until_level === 40, 'leveling create body has type leveling + until_level 40: ' + (cr && JSON.stringify(cr.body)));
  const lvId = S.sets[1].id;
  await p.click(`.pf-set[data-set="${S.sets[0].id}"]`); await until(() => document.getElementById('pf-set-h').textContent === 'Tank'); await idle();
  ok((await p.textContent('#pf-set-h')) === 'Tank', 'armory opens the set');
  const setId = S.sets[0].id;

  // autosave: one POST /ops batch, uuid v4 op_id, base_version = list version
  await openPick('head'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length === 2);
  ok(await p.locator('#pf-picker-list .pf-icon.is-ph').count() === 2, 'null / non-Blizzard icon_url -> placeholder');
  ok(/slot=head/.test(last('GET', /\/api\/v1\/items$/).search), 'GET /items?slot=head');
  await p.click('#pf-picker-list .pf-pick[data-item="16900"]');
  ok(await status(/Head saved: Stormrage Cover/), 'pick autosaves'); await idle();
  let op = last('POST', /\/ops$/);
  ok(op && op.csrf === CSRF && op.body.ops.length === 1 && op.body.ops[0].type === 'add_item' && op.body.ops[0].slot === 'head' && op.body.ops[0].item_id === 16900 &&
    op.body.ops[0].priority === 1 && op.body.ops[0].base_version === 1 && UUID4.test(op.body.ops[0].op_id), 'POST /gear-lists/{id}/ops add_item {priority 1, base_version 1, uuid v4 op_id}');
  ok(!S.log.some(x => /\/slots\//.test(x.path)), 'no PUT /slots (not on platform main)');
  await openPick('head'); await p.click('#pf-picker-list .pf-pick[data-item="16921"]'); await status(/Head saved: Halo/); await idle();
  op = last('POST', /\/ops$/);
  ok(op.body.ops.map(o => o.type + ':' + o.item_id).join() === 'remove_item:16900,add_item:16921' && op.body.ops.every(o => o.base_version === 2) && op.body.ops[0].op_id !== op.body.ops[1].op_id,
    'replace = one batch remove_item old + add_item new at base_version 2 ' + JSON.stringify(op.body.ops));
  ok(S.sets[0].items.filter(i => i.slot === 'head').length === 1, 'one item per slot on the server');
  await pickFirst('neck'); await status(/Neck saved/); await idle();
  await p.click('#pf-slot-head'); await p.click('#pf-picker-clear'); await status(/Head cleared/); await idle();
  op = last('POST', /\/ops$/);
  ok(op.body.ops.length === 1 && op.body.ops[0].type === 'remove_item' && op.body.ops[0].item_id === 16921 && op.body.ops[0].base_version === 5, 'clear = remove_item {slot, item_id} at base_version 5 ' + JSON.stringify(op.body.ops));
  ok(S.sets[0].items.length === 1 && S.sets[0].items[0].item_id === 18814 && S.sets[0].version === 6, 'server state after autosaves (v6)');
  await go(); await p.click(`.pf-set[data-set="${setId}"]`); await until(() => /Choker/.test(document.getElementById('pf-slot-neck').textContent)); await idle();
  ok(/Choker of the Fire Lord/.test(await p.textContent('#pf-slot-neck')), 'reload derives slots from items[] and resolves via GET /items/{id}');

  // stale base_version -> conflicts[] -> reload (GET), banner, retry at the fresh version
  S.once.stale = true; const before = S.log.length;
  await pickFirst('head');
  ok(await status(/Head saved/), 'stale_base_version: retried and saved'); await idle();
  const opsAfter = S.log.slice(before).filter(x => x.m === 'POST' && /\/ops$/.test(x.path));
  ok(opsAfter.length === 2 && opsAfter[1].body.ops.every(o => o.base_version === S.sets[0].version - 1) && opsAfter[1].body.ops[0].op_id !== opsAfter[0].body.ops[0].op_id, 'retry uses the reloaded base_version and fresh op_ids');
  ok(S.log.slice(before).some(x => x.m === 'GET' && x.path === '/api/v1/gear-lists/' + setId), 'stale -> GET /gear-lists/{id} reload');
  ok(/changed somewhere else, so it was reloaded/.test(await p.textContent('#pf-slot-banner')), 'stale -> banner');
  await p.click('#pf-slot-head'); await p.click('#pf-picker-clear'); await status(/Head cleared/); await idle();

  // conflicts[] item_not_forever (server catalog check) and 400 {errors:{ops.N}}
  const nfItem = items[1]; const keep = nfItem.item_id; await openPick('head'); nfItem.item_id = 99999;
  await p.click('#pf-picker-list .pf-pick[data-item="16921"]'); nfItem.item_id = keep;
  ok(await vis('#pf-slot-banner') && /isn.t a WoW Forever item/.test(await p.textContent('#pf-slot-banner')) && /Empty/.test(await p.textContent('#pf-slot-head')), 'conflicts[] item_not_forever -> message, slot from server list'); await idle();
  const bad = await p.evaluate(async id => { const r = await fetch('https://api.crusaderstrike.com/api/v1/gear-lists/' + id + '/ops', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-armory-token' },
    body: JSON.stringify({ ops: [{ op_id: 'x', type: 'set_slot', slot: 'hat', item_id: 1, base_version: 0 }] }) }); return { s: r.status, b: await r.json() }; }, setId);
  ok(bad.s === 400 && bad.b.errors['ops.0'], 'set_slot / bad slot / non-uuid op_id -> 400 {errors:{ops.0}}');

  // 429 Retry-After
  S.once.r429 = true; await p.click('#pf-slot-neck'); await p.click('#pf-picker-clear');
  ok(await vis('#pf-slot-banner') && /Wait 7 seconds/.test(await p.textContent('#pf-slot-banner')), '429 Retry-After: 7 -> message ' + await p.textContent('#pf-slot-banner')); await idle();

  // server-side create validation codes (platform#43 shape {error:{code:validation_error, details}}) surface on the form
  for (const [d, field, re] of [
    [{ until_level: 'until_level_not_above_current_level' }, '#pf-c-until-err', /higher than/],
    [{ until_level: 'until_level_out_of_range' }, '#pf-c-until-err', /1 to 60/],
    [{ until_level: 'until_level_required' }, '#pf-c-until-err', /Enter the level/],
    [{ type: 'leveling_set_at_max_level' }, '#pf-c-type-err', /only have max-level/]]) {
    S.once.create400 = d; await newBtn('ch_b').click(); await p.fill('#pf-c-name', 'Lv'); await p.fill('#pf-c-until', '40'); await p.click('#pf-c-save');
    ok(await until(([s, r]) => new RegExp(r).test(document.querySelector(s).textContent), [field, re.source]), '400 ' + Object.values(d)[0] + ' shown');
    await closeCreate();
  }
  S.once.create400 = { until_level: 'until_level_must_be_null' }; await newBtn('ch_b').click(); await p.check('#pf-c-type-max'); await p.fill('#pf-c-name', 'Mx'); await p.click('#pf-c-save');
  ok(await until(() => /no level/.test(document.getElementById('pf-c-until-err').textContent)), '400 until_level_must_be_null mapped'); await closeCreate();

  // shipped "not displayed": 403 {errors:{character_id}} from requireOwnedCharacter
  S.once.notSelected = true; await newBtn('ch_b').click(); await p.fill('#pf-c-name', 'X'); await p.fill('#pf-c-until', '40'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /Show this character on your profile/.test(await p.textContent('#pf-c-error')), '403 {errors:{character_id}} -> character_not_displayed message'); await closeCreate();

  // outgrown: leveling set until 20 for a level-27 character
  S.sets.push(mkSet('ch_b', 'Deadmines', { type: 'leveling', until_level: 20 }));
  await go(); const og = p.locator('.pf-pchar[data-char=ch_b] .pf-set.is-outgrown');
  ok(await og.count() === 1 && /Outgrown/.test(await og.textContent()), 'outgrown set greyed in panel');
  await og.click(); await until(() => !document.getElementById('pf-armory-view').hidden); await idle();
  ok(await p.evaluate(() => document.getElementById('pf-armory-view').classList.contains('is-outgrown')) && /Outgrown: Wisp Wander is level 27/.test(await p.textContent('#pf-set-outgrown')), 'outgrown armory note');
  ok(!(await p.locator(`.pf-set[data-set="${lvId}"]`).evaluate(e => e.classList.contains('is-outgrown'))), 'leveling set above current level not outgrown');

  // 409 list_limit_reached at 20 sets
  while (S.sets.filter(s => s.character_id === 'ch_a').length < 20) S.sets.push(mkSet('ch_a', 'S' + n));
  await go(); await newBtn('ch_a').click(); await p.fill('#pf-c-name', 'Twenty-first'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /already has 20 gear sets \(the maximum\)/.test(await p.textContent('#pf-c-error')), '409 list_limit_reached message'); await closeCreate();
  ok(await p.evaluate(() => CSGearSetRules.isListLimit('list_limit_reached') && !CSGearSetRules.isListLimit('list_limit')), 'only list_limit_reached is the cap code');
  // server is the source of truth: UI hint 20 never blocks a create the server accepts
  S.cap = 25; await go(); await newBtn('ch_a').click(); await p.fill('#pf-c-name', 'Twenty-first'); await p.click('#pf-c-save');
  ok(await until(() => !document.getElementById('pf-create').open) && S.sets.filter(s => s.character_id === 'ch_a').length === 21, 'create past the 20 UI hint goes through when the server accepts');
  // main's cap of 5: 409 with a 5 in the message -> message says 5, no crash
  S.cap = 5; await go(); await newBtn('ch_a').click(); await p.fill('#pf-c-name', 'Main cap'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /already has 5 gear sets/.test(await p.textContent('#pf-c-error')), '409 from main cap 5 -> limit read from response message'); await closeCreate();
  S.capDetails = { limit: 7 }; S.capMsg = 'Maximum of 5 gear lists'; await newBtn('ch_a').click(); await p.fill('#pf-c-name', 'Details cap'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /already has 7 gear sets/.test(await p.textContent('#pf-c-error')), '409 error.details.limit preferred over message'); await closeCreate();
  S.capDetails = null; S.capMsg = 'Too many lists.'; await newBtn('ch_a').click(); await p.fill('#pf-c-name', 'No number'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /maximum number of gear sets/.test(await p.textContent('#pf-c-error')) && !/20/.test(await p.textContent('#pf-c-error')), '409 without a limit -> generic message, not the 20 hint'); await closeCreate();
  S.cap = 0; S.capMsg = undefined;
  ok(await until(() => !document.getElementById('pf-c-save').disabled), 'create button not left disabled after 409');
  S.sets = S.sets.filter(s => !(s.character_id === 'ch_a' && /^Twenty-first$/.test(s.name)));

  // prod hosts: mocks forced off even if config says true (here forced true via overrides)
  for (const host of ['crusaderstrike.com', 'www.crusaderstrike.com', 'staging.crusaderstrike.com']) {
    const ctx = await b.newContext();
    await ctx.route('https://' + host + '/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<script src="/js/config.js"></script>' }));
    await ctx.route('https://' + host + '/js/config.js', async r => { const res = await ctx.request.get(B + 'js/config.js'); r.fulfill({ status: 200, contentType: 'text/javascript', body: (await res.text()).replace(/(USE_MOCK_\w+:\s*)false/g, '$1true') }); });
    const pp = await ctx.newPage(); await pp.goto('https://' + host + '/profile/');
    const v = await pp.evaluate(() => ({ flags: Object.keys(CS_CONFIG).filter(k => /^USE_MOCK_/.test(k)).map(k => [k, CS_CONFIG[k]]), prodHost: CS_CONFIG.IS_PROD_HOST }));
    const prod = host !== 'staging.crusaderstrike.com';
    ok(v.flags.length === (require('fs').readFileSync(require('path').join(__dirname, '../../js/config.js'), 'utf8').match(/^\s*USE_MOCK_\w+:/mg) || []).length && v.flags.length >= 6, host + ': sees every USE_MOCK_* flag (' + v.flags.map(f => f[0]).join(',') + ')');
    for (const [k, val] of v.flags) ok(val === !prod, host + ': ' + k + (prod ? ' forced off on prod host' : ' keeps configured true on non-prod host'));
    ok(v.prodHost === prod, host + ': IS_PROD_HOST ' + prod);
    await ctx.close();
  }
  ok(await p.evaluate(() => CS_CONFIG.IS_PROD_HOST === false), 'localhost is not a prod host');

  // platform#44: empty selection with updated_at null -> no crash, no Invalid Date, nothing displayed, toggle sets a main
  const savedSel = S.sel; S.sel = { main_id: null, alt_ids: [], updated_at: null };
  const errsBefore = errs.length; await go();
  ok(await vis('#pf-ready') && !(await p.isChecked('#pf-show-ch_a')) && !(await p.isChecked('#pf-show-ch_b')), 'null selection: page ready, nothing displayed');
  ok(!/Invalid Date/.test(await p.textContent('body')) && errs.length === errsBefore, 'null selection: no Invalid Date, no page errors');
  ok(await p.evaluate(() => { const s = CSArmoryApi.normSel({ main_id: null, alt_ids: null, updated_at: null }); return s.main_id === null && s.alt_ids.length === 0 && s.updated_at === null && CSArmoryApi.selectionTime(s) === '' && CSArmoryApi.selectionTime({ main_id: 'x', alt_ids: [], updated_at: 'garbage' }) === '' && CSArmoryApi.selectionTime(null) === '' && CSArmoryApi.selectionTime({ main_id: 'x', updated_at: '2026-11-04T00:00:00Z' }) !== ''; }), 'normSel/selectionTime: null + invalid updated_at -> no date');
  await p.click('#pf-show-ch_a'); await idle();
  ok(JSON.stringify(last('PUT', /selection$/).body) === '{"main_id":"ch_a","alt_ids":[]}', 'null selection -> first toggle PUTs ch_a as main');
  S.sel = savedSel; await go();

  // hide: selection drops the alt; sets kept. Hiding the last displayed character is blocked (server needs a main).
  await p.uncheck('#pf-show-ch_b'); await status(/is hidden/); await idle();
  ok(JSON.stringify(last('PUT', /selection$/).body) === '{"main_id":"ch_a","alt_ids":[]}', 'hide -> PUT selection without the alt');
  ok(await p.locator('.pf-pchar[data-char=ch_b]').count() === 0 && S.sets.some(s => s.character_id === 'ch_b'), 'hidden character leaves the panel; sets kept');
  const puts = S.log.filter(x => x.m === 'PUT').length;
  await p.click('#pf-show-ch_a');
  ok(await vis('#pf-save-error') && /at least one character/.test(await p.textContent('#pf-save-error')) && await p.isChecked('#pf-show-ch_a') && S.log.filter(x => x.m === 'PUT').length === puts, 'last displayed character cannot be hidden (no request)');

  ok(!S.log.some(x => x.m !== 'GET' && x.csrf !== CSRF), 'every write carried X-CSRF-Token');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close();
})().catch(e => { console.log('FAIL crash ' + e.message); process.exit(1); });
