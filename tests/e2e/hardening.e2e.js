// web#48 hardening for the addon#26 morning check, against the in-browser mocks:
// (1) CSGEAR1 import: decode/validate, create id:null sets (with slots), apply ops to linked sets, local_id -> id mapping, reply string;
// (2) until_level / under-60 rules, incl. under-60 creating max_level; (3) API-down and expired-session states on armory, gear lists, character selection.
const { chromium } = require('playwright');
const B = 'http://localhost:' + (process.env.CS_E2E_PORT || 8765) + '/';
const EXAMPLE = 'CSGEAR1:eyJjaGFyYWN0ZXIiOiJTbmlweSIsImNoYXJhY3Rlcl9pZCI6bnVsbCwiZGVsZXRlZF9saXN0cyI6W10sImVxdWlwcGVkIjp7Im1haW5faGFuZCI6eyJlbmNoYW50X2lkIjowLCJpdGVtX2lkIjoxNDE0NX0sIndyaXN0Ijp7Iml0ZW1faWQiOjE0MTQ4fX0sImV4cG9ydGVkX2F0IjoiMjAyNi0xMS0wNVQwNjozMDowMFoiLCJnYW1lX3ZlcnNpb24iOiJmb3JldmVyIiwibGlzdHMiOlt7ImVkaXRlZF9hdCI6IjIwMjYtMTEtMDVUMDY6Mjk6MTBaIiwiZWRpdGVkX2luIjoiZ2FtZSIsImlkIjpudWxsLCJsb2NhbF9pZCI6ImEzZjA5YzEyIiwibmFtZSI6IlByZS1CaVMgNTAiLCJyZW1vdmVzIjpbXSwicm9sZV9zcGVjIjoiZnVyeSIsInNsb3RzIjp7ImhlYWQiOjEyMzQ1LCJtYWluX2hhbmQiOjE5MDE5LCJvZmZfaGFuZCI6bnVsbH0sInR5cGUiOiJsZXZlbGluZyIsInVudGlsX2xldmVsIjo1MH0seyJlZGl0ZWRfYXQiOiIyMDI2LTExLTA1VDA1OjU4OjAwWiIsImVkaXRlZF9pbiI6IndlYiIsImlkIjoiN2IxZTJjNGEtMGQxZi00ZThhLTljM2ItMmE2ZjVlNGQzYzIxIiwibG9jYWxfaWQiOiI1ZTdkMWI5MCIsIm5hbWUiOiJUYW5rIEJpUyIsInJlbW92ZXMiOlt7Im9wIjoiY2xlYXJfc2xvdCIsInNsb3QiOiJvZmZfaGFuZCJ9LHsiaXRlbV9pZCI6MTQxNDksIm9wIjoicmVtb3ZlX2l0ZW0iLCJzbG90Ijoid3Jpc3QifV0sInJvbGVfc3BlYyI6bnVsbCwic2xvdHMiOnsiY2hlc3QiOjE2OTY2fSwidHlwZSI6Im1heF9sZXZlbCIsInVudGlsX2xldmVsIjpudWxsfV0sInJlYWxtIjoiQ3J1c2FkZXJTdHJpa2UiLCJyZWdpb24iOiJ1cyIsInNjaGVtYV92ZXJzaW9uIjoxfQ==|c=c896e890';
(async () => {
  const b = require('./_test-config.js').withTestConfig(await chromium.launch());
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const vis = (s, t) => p.waitForSelector(s + ':not([hidden])', { timeout: t || 5000 }).then(() => true, () => false);
  const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 6000 }).then(() => true, () => false);
  const GL = (c, q = '') => B + 'gear/lists/?character=' + c + '&ff_bnet=1' + q;
  const store = () => p.evaluate(() => JSON.parse(sessionStorage.getItem('cs_mock_gear_lists')));
  const enc = o => p.evaluate(x => CSGear1.encode(x), o);
  const base = (o) => Object.assign({ schema_version: 1, game_version: 'forever', region: 'us', realm: 'Emberfall', character: 'Thornquill', character_id: null, exported_at: '2026-11-05T06:30:00Z', lists: [], deleted_lists: [] }, o);
  const set = (o) => Object.assign({ id: null, local_id: 'a1b2c3d4', name: 'Set', type: 'max_level', until_level: null, role_spec: null, slots: {}, removes: [], edited_at: '2026-11-05T06:29:10Z', edited_in: 'game' }, o);
  const paste = async s => { await p.fill('#gl-import-text', s); await p.click('#gl-import-btn'); await p.waitForFunction(() => !document.getElementById('gl-import-btn').hasAttribute('aria-busy') || !document.getElementById('gl-ready').offsetParent, null, { timeout: 8000 }).catch(() => {}); };
  const impErr = () => p.textContent('#gl-import-err');

  await p.goto(B + 'gear/lists/?character=ch_us_1003&ff_bnet=1');
  await p.evaluate(() => { CSAuthMock.devSignIn(); sessionStorage.removeItem('cs_mock_gear_lists'); });

  // ---------- (1) CSGEAR1 decode ----------
  await p.goto(GL('ch_us_1003')); await vis('#gl-ready');
  let r = await p.evaluate(s => { const d = CSGear1.decode(s); return { ok: d.ok, n: d.ok && d.payload.lists.length, re: d.ok && CSGear1.encode(d.payload) === s, fnv: CSGear1.fnv1a(new TextEncoder().encode('a')) }; }, EXAMPLE);
  ok(r.ok && r.n === 2, 'schema §9 example decodes (2 sets)');
  ok(r.re, 'encode(decode(x)) === x: sorted compact JSON, base64, FNV-1a checksum c896e890');
  ok(r.fnv === 'e40c292c', 'FNV-1a 32-bit reference vector');
  r = await p.evaluate(s => CSGear1.decode('CSRUN1:abc|c=00000000\n' + s + '\n').ok, EXAMPLE); ok(r, 'whole /cs export box (CSRUN1 line + CSGEAR1 line) accepted');
  const bad = await p.evaluate(([s]) => {
    const m = (o) => CSGear1.encode(o), d = x => CSGear1.decode(x).code;
    const pl = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.slice(8).split('|')[0]), c => c.charCodeAt(0))));
    const w = f => { const c = JSON.parse(JSON.stringify(pl)); f(c); return d(m(c)); };
    return {
      prefix: d('csgear1:' + s.slice(8)), empty: d(''), check: d(s.replace(/c=[0-9a-f]{8}$/, 'c=00000000')), nocheck: d(s.split('|')[0]),
      b64: d('CSGEAR1:@@@|c=00000000'), size: d('CSGEAR1:' + 'A'.repeat(25 * 1024) + '|c=00000000'), json: d(m(1).replace(/^CSGEAR1:[^|]+/, 'CSGEAR1:' + btoa('{nope')).replace(/c=\w+/, 'c=' + CSGear1.fnv1a(new TextEncoder().encode('{nope')))),
      v2: w(c => { c.schema_version = 2; }), game: w(c => { c.game_version = 'classic'; }), region: w(c => { c.region = 'xx'; }), realm: w(c => { c.realm = '<b>x</b>'; }),
      slot: w(c => { c.lists[0].slots.hat = 1; }), item: w(c => { c.lists[0].slots.head = 0; }), big: w(c => { c.lists[0].slots.head = 2147483648; }),
      local: w(c => { c.lists[0].local_id = 'XYZ'; }), dupl: w(c => { c.lists[1].local_id = c.lists[0].local_id; }), lvl: w(c => { c.lists[0].until_level = null; }),
      lvl61: w(c => { c.lists[0].until_level = 61; }), maxlvl: w(c => { c.lists[1].until_level = 40; }), op: w(c => { c.lists[1].removes.push({ op: 'add_item', slot: 'head', item_id: 1 }); }),
      ctrl: w(c => { c.lists[0].name = 'a\u0000b'; }), role: w(c => { c.lists[0].role_spec = 'x'.repeat(33); }), many: w(c => { for (let i = 0; i < 20; i++) c.lists.push(Object.assign({}, c.lists[0], { local_id: ('0000000' + i.toString(16)).slice(-8) })); }),
      uuid: w(c => { c.lists[1].id = 'not-a-uuid'; }), del: w(c => { c.deleted_lists = [{}]; }), unknown: w(c => { c.wat = 1; c.lists[0].x = 2; }), equipped: w(c => { delete c.equipped; })
    };
  }, [EXAMPLE]);
  ok(bad.prefix === 'bad_prefix' && bad.empty === 'bad_prefix', 'exact case-sensitive prefix -> bad_prefix');
  ok(bad.check === 'bad_checksum' && bad.nocheck === 'bad_checksum', 'checksum mismatch / missing -> bad_checksum');
  ok(bad.b64 === 'bad_json' && bad.json === 'bad_json', 'invalid base64 / JSON -> bad_json');
  ok(bad.size === 'too_large', 'paste > 24 KiB -> too_large');
  ok(bad.v2 === 'schema' && bad.game === 'schema' && bad.region === 'schema' && bad.realm === 'schema', 'schema_version, game_version, region allowlist, realm chars -> schema');
  ok([bad.slot, bad.item, bad.big, bad.local, bad.dupl, bad.lvl, bad.lvl61, bad.maxlvl, bad.op, bad.ctrl, bad.role, bad.many, bad.uuid, bad.del].every(x => x === 'validation'),
    'unknown slot, item_id range, local_id, duplicate local_id, until_level rules, removes ops, control chars, role_spec, > 20 sets, id, deleted_lists -> validation ' + JSON.stringify(bad));
  ok(bad.unknown === undefined && bad.equipped === undefined, 'unknown keys ignored; equipped optional (import strings omit it)');

  // ---------- (1) import: create id:null sets, map local_id -> id ----------
  ok(await p.isChecked('#gl-new-type-leveling') && await p.getAttribute('#gl-new-until', 'min') === '53', 'level 52: leveling default, Up to level min 53');
  await paste(await enc(base({ character_id: 'ch_us_1001' }))); ok(/different character/.test(await impErr()), 'character_id of another character -> character_mismatch, nothing applied');
  await paste(await enc(base({ character: 'Lightbringer' }))); ok(/different character/.test(await impErr()), 'realm + name of another character -> character_mismatch');
  await paste(await enc(base({ lists: [set({ type: 'leveling', until_level: 50, name: 'Too low' })] })));
  ok(/higher than the character/.test(await impErr()) && (await store()).lists.every(l => l.name !== 'Too low'), 'leveling until_level <= current level -> whole string rejected (until_level_not_above_current_level)');
  await paste('CSGEAR1:nope'); ok(/damaged|could not be read/.test(await impErr()) && await p.getAttribute('#gl-import-text', 'aria-invalid') === 'true', 'bad string -> inline error, aria-invalid');
  const n0 = (await store()).lists.filter(l => l.character_id === 'ch_us_1003').length;
  const first = base({ lists: [
    set({ local_id: 'a1b2c3d4', name: 'Pre-BiS 55', type: 'leveling', until_level: 55, role_spec: 'feral', slots: { head: 910001, back: 940002, off_hand: null } }),
    set({ local_id: 'b2c3d4e5', name: 'Raid ideal', type: 'max_level', slots: { finger1: 940003 } }) ], deleted_lists: [{ local_id: 'deadbeef' }] });
  await paste(await enc(first));
  ok(await vis('#gl-import-result'), 'import result shown ' + await impErr() + ' ' + await p.textContent('#gl-import-list'));
  let st = await store(); const made = st.lists.filter(l => l.character_id === 'ch_us_1003').slice(n0);
  const pre = made.find(l => l.name === 'Pre-BiS 55'), ideal = made.find(l => l.name === 'Raid ideal');
  ok(made.length === 2 && pre && pre.type === 'leveling' && pre.until_level === 55 && pre.role_spec === 'feral' && pre.visibility === 'private', 'id:null leveling set created with type/until_level/role_spec');
  ok(ideal && ideal.type === 'max_level' && ideal.until_level === null, 'under 60: id:null max_level set created (until_level null)');
  ok(pre.items.map(i => i.slot + ':' + i.item_id).sort().join() === 'back:940002,head:910001' && ideal.items.map(i => i.slot + ':' + i.item_id).join() === 'finger1:940003', 'create carries slots (null slot = empty)');
  const li = await p.$$eval('#gl-import-list li', l => l.map(x => [x.dataset.localId, x.dataset.id, x.textContent]));
  ok(li.some(x => x[0] === 'a1b2c3d4' && x[1] === pre.id) && li.some(x => x[0] === 'b2c3d4e5' && x[1] === ideal.id), 'result maps local_id -> server id: ' + JSON.stringify(li.map(x => x[0] + '->' + x[1])));
  const out = await p.inputValue('#gl-import-out');
  const back = await p.evaluate(s => CSGear1.decode(s), out);
  ok(back.ok && back.payload.character_id === 'ch_us_1003' && !('equipped' in back.payload), 'reply string decodes, carries character_id, no equipped');
  const bl = id => back.payload.lists.find(l => l.id === id);
  ok(bl(pre.id) && bl(pre.id).local_id === 'a1b2c3d4' && bl(ideal.id).local_id === 'b2c3d4e5', 'reply echoes local_id for the new ids (addon links them)');
  ok(back.payload.lists.every(l => /^[0-9a-f]{8}$/.test(l.local_id)) && new Set(back.payload.lists.map(l => l.local_id)).size === back.payload.lists.length, 'web-only lists get a stable 8-hex local_id');
  ok(bl(pre.id).slots.head === 910001 && bl(pre.id).until_level === 55 && bl(ideal.id).until_level === null, 'reply carries slots and level fields');

  // ---------- (1) re-import: linked sets get ops, last-edited-wins, deletes ----------
  const later = new Date(Date.now() + 60000).toISOString().replace(/\.\d+Z$/, 'Z');
  await p.evaluate(() => { window.__glOpsLog = []; });
  const second = JSON.parse(JSON.stringify(back.payload));
  const sp = second.lists.find(l => l.id === pre.id); sp.slots = { chest: 940001, head: null }; sp.removes = [{ op: 'clear_slot', slot: 'back' }, { op: 'clear_slot', slot: 'chest' }]; sp.edited_at = later; sp.edited_in = 'game';
  const si = second.lists.find(l => l.id === ideal.id); si.slots = { finger1: 940004 }; si.edited_at = '2020-01-01T00:00:00Z';
  second.lists.push(set({ local_id: 'c3d4e5f6', name: 'Bad item', slots: { head: 19019 } }));
  second.deleted_lists = [{ id: made.find(l => l.name === 'Raid ideal') ? null : null, local_id: 'deadbeef' }].filter(Boolean);
  const emb = st.lists.find(l => l.character_id === 'ch_us_1003' && l.name === 'Pre-BiS 55');
  await paste(await p.evaluate(x => CSGear1.encode(x), second));
  await until(() => !document.getElementById('gl-import-btn').disabled);
  st = await store();
  const pre2 = st.lists.find(l => l.id === pre.id), ideal2 = st.lists.find(l => l.id === ideal.id);
  ok(pre2.items.map(i => i.slot + ':' + i.item_id).sort().join() === 'chest:940001,head:910001', 'linked set: set_slot applied, null slot left alone (no silent wipe), clear_slot from removes applied: ' + pre2.items.map(i => i.slot + ':' + i.item_id).join());
  const sent = await p.evaluate(() => window.__glOpsLog);
  ok(sent.length === 1 && sent[0].map(o => o.type + ':' + o.slot).join() === 'set_slot:chest,clear_slot:back' && sent[0].every(o => /^[0-9a-f-]{36}$/.test(o.op_id) && o.base_version === emb.version), 'one batch, one op per slot (set_slot wins over a clear of the same slot), fresh op_id + current base_version ' + JSON.stringify(sent));
  ok(ideal2.items.map(i => i.item_id).join() === '940003', 'site newer than the game edit -> site version kept (last-edited-wins)');
  const li2 = await p.$$eval('#gl-import-list li', l => l.map(x => x.textContent).join(' | '));
  ok(/site version kept/.test(li2) && /Not saved .Bad item.: That item isn.t a WoW Forever item/.test(li2), 'result lists kept + rejected sets: ' + li2);
  ok(!st.lists.some(l => l.name === 'Bad item'), 'item_not_forever create not saved');
  // deleted_lists {id} -> DELETE; unknown linked id -> skipped
  const third = JSON.parse(JSON.stringify(back.payload)); third.lists = [set({ id: 'gl_gone_123', local_id: '0badf00d', name: 'Gone' })]; third.deleted_lists = [{ id: ideal.id }, { local_id: '12345678' }];
  await paste(await enc(third)); await until(() => !document.getElementById('gl-import-btn').disabled);
  st = await store();
  ok(!st.lists.some(l => l.id === ideal.id), 'deleted_lists {id} -> DELETE /gear-lists/{id}');
  ok(/Gone.* not on the site any more/.test(await p.$$eval('#gl-import-list li', l => l.map(x => x.textContent).join(' | '))), 'linked id missing on the site -> skipped and reported');

  // ---------- (2) until_level / under-60 UI and server rules ----------
  await p.check('#gl-new-type-max'); ok(await p.isHidden('#gl-new-until-wrap'), 'under 60, switch to max-level -> no level field');
  await p.fill('#gl-new-name', 'Plan ahead'); await p.click('#gl-new-btn'); await until(() => document.getElementById('gl-detail-h').textContent === 'Plan ahead');
  st = await store(); const pa = st.lists.find(l => l.name === 'Plan ahead');
  ok(pa && pa.type === 'max_level' && pa.until_level === null, 'under-60 character creates a max_level set (until_level null)');
  await p.check('#gl-new-type-leveling'); await p.fill('#gl-new-until', '61'); await p.fill('#gl-new-name', 'x'); await p.click('#gl-new-btn');
  ok(/from 1 to 60/.test(await p.textContent('#gl-new-until-err')), 'until_level 61 -> out of range');
  await p.fill('#gl-new-until', '52'); await p.click('#gl-new-btn'); ok(/higher than/.test(await p.textContent('#gl-new-until-err')), 'until_level = current level -> not above current level');
  await p.fill('#gl-new-until', ''); await p.click('#gl-new-btn'); ok(/Enter the level/.test(await p.textContent('#gl-new-until-err')), 'leveling without until_level -> required');
  await p.fill('#gl-new-until', '53'); await p.click('#gl-new-btn'); await until(() => document.getElementById('gl-detail-h').textContent === 'x');
  ok((await store()).lists.some(l => l.name === 'x' && l.until_level === 53), 'until_level = level + 1 accepted');
  const srv = await p.evaluate(async () => {
    const a = CSGearListsApi; await a.session();
    const r1 = await a.create('ch_us_1003', { name: 'q', type: 'leveling', until_level: 40 });
    const r2 = await a.create('ch_us_1001', { name: 'q', type: 'leveling', until_level: 60 });
    const r3 = await a.create('ch_us_1003', { name: 'q', type: 'max_level', until_level: 55 });
    const r4 = await a.create('ch_us_1001', { name: 'q2', type: 'max_level', until_level: null });
    return [r1.body.errors, r2.body.errors, r3.body.errors, r4.status];
  });
  ok(srv[0].until_level === 'until_level_not_above_current_level' && srv[1].type === 'leveling_set_at_max_level' && srv[2].until_level === 'until_level_must_be_null' && srv[3] === 201, 'mock enforces platform level rules on create ' + JSON.stringify(srv));
  const rules = await p.evaluate(() => {
    const R = CSGearSetRules, s = R.sort([{ name: 'b', type: 'leveling', until_level: null }, { name: 'a', type: 'leveling', until_level: 40 }, { name: 'm', type: 'max_level', until_level: null }]);
    return { order: s.leveling.map(x => x.name).join(), unknown: R.levelKnown({ level: null }), canUnknown: R.canLevel({}), min: R.minUntil({}), at59: R.minUntil({ level: 59 }), at60: R.canLevel({ level: '60' }),
      v59: JSON.stringify(R.validate({ name: 'n', type: 'leveling', until_level: 60 }, { level: 59 })), v60: JSON.stringify(R.validate({ name: 'n', type: 'leveling', until_level: 60 }, { level: 60 })),
      dec: JSON.stringify(R.validate({ name: 'n', type: 'leveling', until_level: '55.5' }, { level: 10 })), outg: R.outgrown({ type: 'leveling', until_level: 30 }, { level: 30 }) && !R.outgrown({ type: 'max_level', until_level: null }, { level: 60 }) };
  });
  ok(rules.order === 'a,b', 'leveling set with a missing until_level sorts last (no NaN order)');
  ok(!rules.unknown && rules.canUnknown && rules.min === 1, 'unknown level: leveling allowed from level 1, server stays authoritative');
  ok(rules.at59 === 60 && rules.v59 === '{}' && rules.at60 === false && /leveling_set_at_max_level/.test(rules.v60), 'level 59 -> until 60 only; level 60 (string) -> max-level only');
  ok(/until_level_out_of_range/.test(rules.dec) && rules.outg, 'non-integer until_level rejected; outgrown at level >= until_level, never for max_level');
  // level 60 page: leveling import rejected client-side
  await p.goto(GL('ch_us_1001')); await vis('#gl-ready');
  await paste(await enc(base({ realm: 'Emberfall', character: 'Lightbringer', lists: [set({ type: 'leveling', until_level: 60 })] })));
  ok(/Level 60 characters can only have max-level sets/.test(await impErr()), 'level 60: leveling set in an import -> leveling_set_at_max_level');

  // ---------- (3) API down / expired session: gear lists ----------
  await p.goto(GL('ch_us_1003', '&mock=500')); ok(await vis('#gl-error') && /HTTP 500/.test(await p.textContent('#gl-error-msg')), 'gear lists: API 500 on load -> error state names HTTP 500');
  await p.goto(GL('ch_us_1003', '&mock=offline')); ok(await vis('#gl-error') && /offline, or Crusader Strike can.t be reached/.test(await p.textContent('#gl-error-msg')), 'gear lists: no response -> offline/unreachable state');
  await p.click('#gl-retry'); ok(await vis('#gl-error'), 'Try again stays on the error state while down');
  await p.goto(GL('ch_us_1003', '&mock_scenario=error')); ok(await vis('#gl-error') && /HTTP 500/.test(await p.textContent('#gl-error-msg')), 'gear lists: character lookup down -> error state (no lists with an unknown level)');
  await p.goto(GL('ch_us_1003')); await vis('#gl-ready');
  await p.evaluate(() => history.replaceState(null, '', location.href + '&mock=500'));
  await paste(await enc(base({ lists: [set({ local_id: 'e5f6a7b8', name: 'During outage' })] })));
  ok(/HTTP 500.*Nothing was imported/.test(await impErr()) && !(await store()).lists.some(l => l.name === 'During outage'), 'import while API down -> clear message, nothing saved: ' + await impErr());
  await p.evaluate(() => history.replaceState(null, '', location.href.replace('&mock=500', '')));
  await p.evaluate(() => sessionStorage.removeItem('cs_mock_session'));
  await paste(await enc(base({ lists: [set({ local_id: 'f6a7b8c9', name: 'Expired' })] })));
  ok(await vis('#gl-signedout') && (await p.textContent('#gl-signedout-h')) === 'Your session has expired' && /kept on this device/.test(await p.textContent('#gl-signedout-msg')), 'gear lists: token expired mid-import -> "session has expired" state');
  await p.goto(GL('ch_us_1003')); ok(await vis('#gl-signedout') && (await p.textContent('#gl-signedout-h')) === 'Sign in to see your gear lists' && await p.isHidden('#gl-signedout-msg'), 'never signed in -> plain sign-in prompt');
  await p.evaluate(() => CSAuthMock.devSignIn()); await p.goto(GL('ch_us_1003')); await vis('#gl-ready');
  await p.evaluate(() => sessionStorage.removeItem('cs_mock_session'));
  await p.fill('#gl-new-name', 'After expiry'); await p.check('#gl-new-type-max'); await p.click('#gl-new-btn');
  ok(await vis('#gl-signedout') && (await p.textContent('#gl-signedout-h')) === 'Your session has expired', 'gear lists: create after expiry -> expired state');

  // ---------- (3) profile: character selection + armory ----------
  const PF = (q = '') => B + 'profile/?ff_bnet=1' + q;
  const idle = () => p.waitForFunction(() => document.documentElement.getAttribute('data-pf-busy') === '0', null, { timeout: 8000 }).catch(() => {});
  await p.goto(PF()); await p.evaluate(() => { CSAuthMock.devSignIn(); CSAuthMock.devReset(); CSArmoryMock.devReset(); });
  await p.goto(PF('&mock_scenario=error')); ok(await vis('#pf-error') && /HTTP 500/.test(await p.textContent('#pf-error-msg')), 'character list API 500 -> error state names HTTP 500');
  await p.goto(PF()); await vis('#pf-ready'); await idle();
  await p.evaluate(() => sessionStorage.removeItem('cs_mock_session'));
  await p.check('#pf-show-ch_us_1003');
  ok(await vis('#pf-signedout') && (await p.textContent('#pf-signedout-h')) === 'Your session has expired', 'character selection: token expired -> "session has expired"');
  await p.evaluate(() => CSAuthMock.devSignIn());
  await p.goto(PF('&mock_armory=toggle500')); await vis('#pf-ready'); await idle(); await p.check('#pf-show-ch_us_1003');
  ok(await vis('#pf-save-error') && /HTTP 500/.test(await p.textContent('#pf-save-error')) && !(await p.isChecked('#pf-show-ch_us_1003')), 'character selection: API 500 -> rollback + HTTP 500 message');
  await p.goto(PF()); await vis('#pf-ready'); await idle(); await p.check('#pf-show-ch_us_1003'); await until(() => /is displayed/.test(document.getElementById('pf-status').textContent)); await idle();
  await p.goto(PF('&mock_armory=down')); await vis('#pf-ready'); await idle();
  ok(await until(() => /offline, or Crusader Strike can.t be reached/.test(document.getElementById('pf-panel').textContent)), 'armory: sets API unreachable -> message in the gear panel');
  await p.goto(PF('&mock_armory=api503')); await vis('#pf-ready'); await idle();
  ok(await until(() => /HTTP 503/.test(document.getElementById('pf-panel').textContent)), 'armory: sets API 503 -> message names HTTP 503');
  await p.goto(PF()); await vis('#pf-ready'); await idle();
  await p.click('.pf-pchar[data-char=ch_us_1003] .pf-new');
  ok(await p.isChecked('#pf-c-type-lv') && /From 53 to 60 \(above current level 52\)/.test(await p.textContent('#pf-c-until-hint')), 'armory create, level 52: leveling default, hint 53..60');
  await p.check('#pf-c-type-max'); ok(await p.isHidden('#pf-c-until-wrap'), 'armory create: max-level hides Up to level');
  await p.fill('#pf-c-name', 'Expiry test'); await p.click('#pf-c-save');
  ok(await vis('#pf-armory-view') && await p.evaluate(() => JSON.parse(localStorage.getItem('cs_mock_armory')).sets.some(x => x.name === 'Expiry test' && x.type === 'max_level' && x.until_level === null)), 'armory: under-60 character creates a max_level set');
  await idle();
  await p.click('#pf-slot-head'); await p.waitForSelector('#pf-picker-list .pf-pick');
  await p.evaluate(() => sessionStorage.removeItem('cs_mock_session'));
  await p.click('#pf-picker-list .pf-pick');
  ok(await vis('#pf-signedout') && (await p.textContent('#pf-signedout-h')) === 'Your session has expired' && !(await p.evaluate(() => document.getElementById('pf-create').open)), 'armory: token expired while editing a set -> "session has expired"');

  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
