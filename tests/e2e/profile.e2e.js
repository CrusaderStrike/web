// web#42 profile + armory against the in-browser mocks (USE_MOCK_ARMORY=true; shipped wire shapes: PUT selection, POST ops): display toggles, choose step,
// gear set side panel (drawer on mobile), create form level rules, 19-slot armory, item picker, autosave + conflicts.
// web#56: planning-character selector (switch + keyboard), center 3D viewer placeholder, slot click still updates the icon.
const { chromium } = require('playwright');
const B = 'http://localhost:' + (process.env.CS_E2E_PORT || 8765) + '/';
(async () => {
  const b = require('./_test-config.js').withTestConfig(await chromium.launch());
  const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const vis = (s, t) => p.waitForSelector(s + ':not([hidden])', { timeout: t || 5000 }).then(() => true, () => false);
  const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);
  const status = () => p.textContent('#pf-status');
  const card = id => p.locator(`#pf-list > li[data-id=${id}]`);
  const idle = () => p.waitForFunction(() => document.documentElement.getAttribute('data-pf-busy') === '0', null, { timeout: 8000 }).catch(() => {});
  const go = async q => { await p.goto(B + 'profile/' + (q || '')); await vis('#pf-ready'); await idle(); };
  const mockSet = id => p.evaluate(i => JSON.parse(localStorage.getItem('cs_mock_armory')).sets.find(s => s.id === i), id);

  await p.goto(B + 'profile/'); ok(await vis('#pf-disabled'), 'flag off -> coming soon');
  await p.goto(B + 'profile/?ff_bnet=1'); ok(await vis('#pf-signedout'), 'signed out -> sign-in prompt (armory only behind login)');
  await p.waitForFunction(() => window.CSAuthMock && window.CSArmoryMock && window.CSArmoryApi, null, { timeout: 8000 });
  await p.evaluate(() => { CSAuthMock.devSignIn(); CSAuthMock.devReset(); CSArmoryMock.devReset(); });
  await go();
  ok(await p.evaluate(() => CS_CONFIG.USE_MOCK_ARMORY === true), 'USE_MOCK_ARMORY on');
  ok(await p.evaluate(() => !('ARMORY_SLOT_OPS' in CS_CONFIG)), 'no ARMORY_SLOT_OPS switch (set_slot only)');
  ok((await p.textContent('#pf-battletag')) === 'Crusader#1234', 'battletag');
  ok(await p.locator('#pf-list > li').count() === 6, '6 WoW Forever characters listed (non-Forever filtered)');
  ok(await p.isVisible('#pf-choose') && await p.evaluate(() => document.activeElement.id === 'pf-choose-h'), 'none displayed -> "Choose characters to display" step, focused');
  ok(await p.isHidden('#pf-armory-wrap'), 'no gear panel until a character is displayed');
  ok(await p.locator('input[name=main], [data-role=main], [data-role=alt]').count() === 0, 'no main/alt UI');
  ok((await p.textContent('#pf-fieldset legend')) === 'Characters to display', 'toggle group labelled');
  ok(await p.getAttribute('#pf-show-ch_us_1002', 'role') === 'switch' && await p.getAttribute('#pf-show-ch_us_1002', 'aria-describedby') === 'pf-name-ch_us_1002', 'toggle is a labelled switch');
  ok(await p.isDisabled('#pf-show-ch_eu_2001'), 'stale character cannot be displayed');
  ok(await p.evaluate(() => [...document.querySelectorAll('#pf-list input[name=displayed]')].every(i => !i.checked)), 'new characters default to hidden');

  // keyboard toggle (Space)
  await p.focus('#pf-show-ch_us_1001'); await p.keyboard.press('Space');
  ok(await until(() => /is displayed on your profile/.test(document.getElementById('pf-status').textContent)), 'Space toggles + announced');
  ok(await p.isHidden('#pf-choose') && await vis('#pf-armory-wrap'), 'choose step gone, gear panel shown');
  for (const id of ['ch_us_1003', 'ch_us_1005']) { await p.check('#pf-show-' + id); await until(i => document.querySelector('#pf-show-' + i) && !document.querySelector('#pf-show-' + i).disabled, id); await idle(); }
  ok(await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('cs_mock_selection')); return s.main_id === 'ch_us_1001' && s.alt_ids.join() === 'ch_us_1003,ch_us_1005'; }), 'display saved as PUT /me/characters/selection {main_id, alt_ids}');
  await p.reload(); await vis('#pf-ready'); await idle();
  ok(await p.isChecked('#pf-show-ch_us_1001') && await p.isChecked('#pf-show-ch_us_1003') && !(await p.isChecked('#pf-show-ch_us_1002')), 'display choice persists');
  ok(await p.locator('#pf-panel .pf-pchar').count() === 3, 'panel lists the 3 displayed characters');

  // create form: level 60 -> max-level only
  const newBtn = id => p.locator(`.pf-pchar[data-char=${id}] .pf-new`);
  await newBtn('ch_us_1001').click(); ok(await p.isVisible('#pf-create') && await p.evaluate(() => document.activeElement.id === 'pf-c-name'), 'create dialog opens, focus on name');
  ok(await p.isHidden('#pf-c-type-lv-l') && await p.isChecked('#pf-c-type-max') && await p.isHidden('#pf-c-until-wrap'), 'level 60: max-level only, no level field');
  await p.click('#pf-c-save'); ok(/name/i.test(await p.textContent('#pf-c-name-err')) && await p.getAttribute('#pf-c-name', 'aria-invalid') === 'true', 'name required');
  await p.fill('#pf-c-name', 'Tank'); await p.evaluate(() => { document.getElementById('pf-c-role').value = 'x'.repeat(33); }); await p.click('#pf-c-save');
  ok(/32/.test(await p.textContent('#pf-c-role-err')), 'role_spec > 32 rejected');
  await p.fill('#pf-c-role', 'Protection'); await p.click('#pf-c-save');
  ok(await until(() => !document.getElementById('pf-create').open), 'max-level set created');
  ok((await p.textContent('#pf-set-h')) === 'Tank' && /Max level · Protection/.test(await p.textContent('#pf-set-meta')), 'armory opens for new set');
  await newBtn('ch_us_1001').click(); await p.fill('#pf-c-name', 'DPS'); await p.click('#pf-c-save'); await until(() => !document.getElementById('pf-create').open);
  ok(await p.locator('.pf-pchar[data-char=ch_us_1001] .pf-sets-max_level .pf-set-name').allTextContents().then(a => a.join() === 'DPS,Tank'), 'several named max-level sets');
  await p.keyboard.press('Escape');

  // level 52: leveling by default, until_level > 52, max-level still allowed
  await newBtn('ch_us_1003').click();
  ok(await p.isChecked('#pf-c-type-lv') && await p.isVisible('#pf-c-until'), 'under 60 defaults to leveling with Up to level');
  await p.fill('#pf-c-name', 'Pre-raid'); await p.click('#pf-c-save'); ok(/Enter the level/.test(await p.textContent('#pf-c-until-err')), 'until_level_required');
  await p.fill('#pf-c-until', '52'); await p.click('#pf-c-save'); ok(/higher than/.test(await p.textContent('#pf-c-until-err')), 'until_level_not_above_current_level');
  await p.fill('#pf-c-until', '61'); await p.click('#pf-c-save'); ok(/1 to 60/.test(await p.textContent('#pf-c-until-err')), 'until_level_out_of_range');
  // server-side codes surface too (bypass client check)
  const sv = await p.evaluate(() => CSArmoryApi.create({ id: 'ch_us_1003', level: 52 }, { name: 'x', type: 'max_level', until_level: 55 }));
  ok(sv.status === 400 && sv.body.error.code === 'validation_error' && sv.body.error.details.until_level === 'until_level_must_be_null', 'mock 400 until_level_must_be_null');
  const sv2 = await p.evaluate(() => CSArmoryApi.create({ id: 'ch_us_1001', level: 60 }, { name: 'x', type: 'leveling', until_level: 60 }));
  ok(sv2.status === 400 && sv2.body.error.details.type === 'leveling_set_at_max_level', 'mock 400 leveling_set_at_max_level');
  await p.fill('#pf-c-until', '58'); await p.click('#pf-c-save'); await until(() => !document.getElementById('pf-create').open);
  for (const [n, l] of [['Questing', '55'], ['Late', '60']]) { await newBtn('ch_us_1003').click(); await p.fill('#pf-c-name', n); await p.fill('#pf-c-until', l); await p.click('#pf-c-save'); await until(() => !document.getElementById('pf-create').open); }
  await newBtn('ch_us_1003').click(); await p.check('#pf-c-type-max'); ok(await p.isHidden('#pf-c-until-wrap'), 'can still pick max-level to plan ahead');
  await p.fill('#pf-c-name', 'Endgame'); await p.click('#pf-c-save'); await until(() => !document.getElementById('pf-create').open);
  const lv = await p.locator('.pf-pchar[data-char=ch_us_1003] .pf-sets-leveling .pf-set-name').allTextContents();
  ok(lv.join() === 'Questing,Pre-raid,Late', 'leveling sets ordered by until_level: ' + lv.join());
  ok((await p.locator('.pf-pchar[data-char=ch_us_1003] .pf-sets-max_level .pf-set-name').allTextContents()).join() === 'Endgame', 'max-level sets listed separately');

  // armory layout: 19 slots in character-window columns
  ok(await p.locator('.pf-charwin .pf-slot').count() === 19, '19 slots incl. shirt + tabard');
  ok((await p.$$eval('#pf-col-left .pf-slot', x => x.map(e => e.dataset.slot).join())) === 'head,neck,shoulder,back,chest,shirt,tabard,wrist', 'left column like the in-game window');
  ok((await p.$$eval('#pf-col-right .pf-slot', x => x.map(e => e.dataset.slot).join())) === 'hands,waist,legs,feet,finger1,finger2,trinket1,trinket2', 'right column');
  ok((await p.$$eval('#pf-row-weapons .pf-slot', x => x.map(e => e.dataset.slot).join())) === 'main_hand,off_hand,ranged', 'weapons along the bottom');
  ok(await p.getAttribute('#pf-slot-head', 'aria-label') === 'Head: empty. Choose item', 'slot buttons labelled');
  ok(await p.locator('#pf-slot-head .pf-icon.is-ph svg[data-glyph=helm]').count() === 1, 'placeholder icon when empty');

  // web#56: selector makes the planning character obvious; center is an empty 3D placeholder; slot click still writes the icon
  ok(await p.locator('#pf-plan-chars input[name=pf-plan]').count() === 3, 'selector lists displayed characters');
  ok((await p.textContent('#pf-plan-legend')) === 'Planning for', 'selector labelled Planning for');
  ok(await p.locator('#pf-plan-ch_us_1003').isChecked() && /Planning/.test(await p.locator('.pf-plan-char.is-selected').textContent()) && (await p.getAttribute('.pf-pchar.is-planning', 'data-char')) === 'ch_us_1003', 'Thornquill is the checked planning character');
  ok(await p.isVisible('#pf-viewer') && (await p.getAttribute('#pf-viewer', 'role')) === 'region' && (await p.getAttribute('#pf-viewer', 'aria-labelledby')) === 'pf-viewer-label', 'center is a labelled region');
  ok((await p.textContent('#pf-viewer-label')) === '3D viewer placeholder' && /Thornquill Briarhide/.test(await p.textContent('#pf-viewer-char')), 'placeholder names the planned character');
  ok(await p.locator('#pf-viewer-mount').evaluate(n => n.childElementCount === 0 && n.getAttribute('data-viewer') === 'placeholder') && await p.locator('.pf-silhouette').count() === 0, 'viewer mount is empty');
  await p.focus('#pf-plan-ch_us_1003'); await p.keyboard.press('ArrowLeft');
  ok(await until(() => /Planning for Lightbringer Dawnmantle/.test(document.getElementById('pf-status').textContent) && /Lightbringer Dawnmantle/.test(document.getElementById('pf-set-meta').textContent)), 'ArrowLeft switches the planning character and opens their set');
  await idle();
  ok(await p.locator('#pf-plan-ch_us_1001').isChecked() && /Lightbringer Dawnmantle/.test(await p.textContent('#pf-viewer-char')), 'selector and placeholder follow Lightbringer');
  ok((await p.$$eval('#pf-col-left .pf-slot', x => x.map(e => e.dataset.slot).join())) === 'head,neck,shoulder,back,chest,shirt,tabard,wrist', 'left column stays head through wrist after the switch');
  ok((await p.$$eval('#pf-col-right .pf-slot', x => x.map(e => e.dataset.slot).join())) === 'hands,waist,legs,feet,finger1,finger2,trinket1,trinket2', 'right column stays hands through trinkets');
  ok((await p.$$eval('#pf-row-weapons .pf-slot', x => x.map(e => e.dataset.slot).join())) === 'main_hand,off_hand,ranged', 'weapons stay along the bottom');
  await p.click('#pf-slot-hands'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0);
  const handsName = (await p.textContent('#pf-picker-list .pf-pick-name')).trim();
  await p.click('#pf-picker-list .pf-pick');
  ok(await until(() => /Hands saved/.test(document.getElementById('pf-status').textContent)), 'slot click still saves through set_slot');
  await idle();
  ok((await p.textContent('#pf-slot-hands')).includes(handsName) && (await p.textContent('#pf-viewer-label')) === '3D viewer placeholder', 'slotted icon updates and the center stays a placeholder');
  ok(await p.locator('#pf-viewer-mount').evaluate(n => n.childElementCount === 0), 'placeholder mount stays empty after set_slot');
  await p.click('#pf-plan-ch_us_1005');
  ok(await until(() => document.getElementById('pf-armory-view').hidden && /Wispwander/.test(document.getElementById('pf-armory-h').textContent)), 'character with no gear set leaves the pane closed');
  ok(await p.locator('#pf-plan-ch_us_1005').isChecked() && /no gear set yet/.test(await p.textContent('#pf-armory-empty-msg')), 'empty plan names that character');
  await p.locator('.pf-set', { hasText: 'Endgame' }).click();
  ok(await until(() => document.getElementById('pf-set-h').textContent === 'Endgame' && document.getElementById('pf-plan-ch_us_1003').checked), 'opening a set plans for that character again');
  await idle();

  // picker: search + paging, keyboard, autosave with If-Match
  await p.focus('#pf-slot-head'); await p.keyboard.press('Enter');
  ok(await p.evaluate(() => document.getElementById('pf-picker').open && document.activeElement.id === 'pf-picker-q'), 'Enter opens picker, focus on search');
  await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length === 10);
  ok(await p.isVisible('#pf-picker-more') && /more available/.test(await p.textContent('#pf-picker-status')), 'first page of 10 + Load more');
  await p.click('#pf-picker-more'); ok(await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length === 20), 'paging appends next page');
  await p.click('#pf-picker-more'); ok(await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length === 22) && await p.isHidden('#pf-picker-more'), 'last page, no Load more');
  ok(await p.locator('#pf-picker-list .pf-icon.is-ph').count() === 22, 'icon_url null -> placeholder icons');
  await p.fill('#pf-picker-q', 'ember'); ok(await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length === 1), 'search filters');
  ok((await p.textContent('#pf-picker-list .pf-pick-name')) === 'Emberwrought Helm', 'fictional Forever item shown');
  const iid = +(await p.getAttribute('#pf-picker-list .pf-pick', 'data-item'));
  await p.click('#pf-picker-list .pf-pick');
  ok(await until(() => /Head saved: Emberwrought Helm/.test(document.getElementById('pf-status').textContent)), 'pick autosaves (no save button)');
  ok(await p.evaluate(() => document.activeElement.id === 'pf-slot-head'), 'focus returns to the slot');
  ok(/Emberwrought Helm/.test(await p.textContent('#pf-slot-head')), 'slot shows item');
  const setId = await p.getAttribute('.pf-set[aria-current=true]', 'data-set');
  const srv = await mockSet(setId);
  ok(srv.items.length === 1 && srv.items[0].slot === 'head' && srv.items[0].item_id === iid && srv.items[0].priority === 1 && srv.version === 2, 'POST ops set_slot -> one row priority 1 + v2');
  // finger2 picker lists finger items
  await p.click('#pf-slot-finger2'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0);
  ok(/Band/.test(await p.textContent('#pf-picker-list .pf-pick-name')), 'finger2 picker shows rings'); await p.keyboard.press('Escape');
  ok(await p.evaluate(() => !document.getElementById('pf-picker').open && document.activeElement.id === 'pf-slot-finger2'), 'Escape closes picker, focus back');
  // clear slot
  await p.click('#pf-slot-head'); await p.click('#pf-picker-clear'); ok(await until(() => /Head cleared/.test(document.getElementById('pf-status').textContent)), 'clear slot saves');
  ok(!(await mockSet(setId)).items.some(i => i.slot === 'head'), 'clear = clear_slot, head gone on server');
  // replacing a filled slot = one set_slot, still one item per slot
  await p.click('#pf-slot-head'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 1); await p.click('#pf-picker-list li:nth-child(1) .pf-pick'); await until(() => /Head saved/.test(document.getElementById('pf-status').textContent)); await idle();
  await p.click('#pf-slot-head'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 1); await p.click('#pf-picker-list li:nth-child(2) .pf-pick'); await until(() => /Head saved/.test(document.getElementById('pf-status').textContent) && document.documentElement.getAttribute('data-pf-busy') === '0');
  ok((await mockSet(setId)).items.filter(i => i.slot === 'head').length === 1, 'replace keeps one item per slot');
  await p.click('#pf-slot-head'); await p.click('#pf-picker-clear'); await until(() => /Head cleared/.test(document.getElementById('pf-status').textContent)); await idle();
  // several items in one slot (addon data): armory shows priority 1
  const multi = await p.evaluate(() => CSArmoryApi.slotsOf([{ slot: 'head', item_id: 7, priority: 3 }, { slot: 'head', item_id: 8, priority: 1 }, { slot: 'neck', item_id: 9, priority: 2 }, { slot: 'neck', item_id: 10, priority: 2 }]));
  ok(multi.head === 8 && multi.neck === 9, 'multiple items per slot -> priority 1, else first');
  // reload keeps picks
  await p.click('#pf-slot-neck'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); await p.click('#pf-picker-list .pf-pick');
  await until(() => /Neck saved/.test(document.getElementById('pf-status').textContent));
  await go(); await p.click(`.pf-set[data-set="${setId}"]`); await until(() => /Pendant/.test(document.getElementById('pf-slot-neck').textContent));
  ok(/Emberwrought Pendant/.test(await p.textContent('#pf-slot-neck')), 'picks persist across reload');

  // stale base_version -> conflicts[] -> reload + banner + automatic retry at the fresh version
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('cs_mock_armory')); s.flags = {}; localStorage.setItem('cs_mock_armory', JSON.stringify(s)); });
  await go('?mock_armory=conflict'); await p.click(`.pf-set[data-set="${setId}"]`); await until(() => !document.getElementById('pf-armory-view').hidden); await idle();
  await p.click('#pf-slot-back'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); await p.click('#pf-picker-list .pf-pick');
  ok(await until(() => /Back saved/.test(document.getElementById('pf-status').textContent)), 'stale_base_version: retried and saved');
  ok(/changed somewhere else, so it was reloaded/.test(await p.textContent('#pf-slot-banner')) && /Duskhollow Pendant/.test(await p.textContent('#pf-slot-neck')), 'stale_base_version: banner + shows the other edit');
  ok((await mockSet(setId)).items.some(i => i.slot === 'back'), 'retry landed on the server');
  await idle(); await p.click('#pf-slot-back'); await p.click('#pf-picker-clear'); await until(() => /Back cleared/.test(document.getElementById('pf-status').textContent)); await idle();
  // item_not_forever conflict, 400 invalid op, 429
  await go('?mock_armory=notforever'); await p.click(`.pf-set[data-set="${setId}"]`); await until(() => !document.getElementById('pf-armory-view').hidden); await idle();
  await p.click('#pf-slot-wrist'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); await p.click('#pf-picker-list .pf-pick');
  ok(await vis('#pf-slot-banner') && /isn.t a WoW Forever item/.test(await p.textContent('#pf-slot-banner')) && /Empty/.test(await p.textContent('#pf-slot-wrist')), 'conflicts[] item_not_forever -> message, slot from server');
  const bad = await p.evaluate(() => CSArmoryMock.ops('x', { ops: [{ op_id: 'nope', type: 'set_slot', slot: 'hat', item_id: 1, base_version: 1 }] }));
  ok(bad.status === 400 && bad.body.errors['ops.0'], '400 {errors:{ops.N}} for unknown op / slot / non-uuid op_id');
  // web#44: in-browser mock emulates platform#46 set_slot / clear_slot
  await go();
  const sb = await p.evaluate(async id => {
    const M = CSArmoryMock, U = () => CSArmoryApi.uuid(), head = (await M.items({ slot: 'head' })).body.items, neck = (await M.items({ slot: 'neck' })).body.items[0].item_id;
    const v = async () => (await M.get(id)).body.version, o = [];
    let r = await M.ops(id, { ops: [{ op_id: U(), type: 'set_slot', slot: 'head', item_id: head[0].item_id, base_version: await v() }] }); o.push(r.body.applied.length === 1 && r.body.list.items.filter(i => i.slot === 'head').length === 1);
    const v1 = await v(); r = await M.ops(id, { ops: [{ op_id: U(), type: 'set_slot', slot: 'head', item_id: head[0].item_id, base_version: v1 }] }); o.push(r.body.applied.length === 1 && r.body.version === v1);
    r = await M.ops(id, { ops: [{ op_id: U(), type: 'set_slot', slot: 'head', item_id: head[1].item_id, base_version: v1 }] }); o.push(r.body.version === v1 + 1 && r.body.list.items.filter(i => i.slot === 'head').map(i => i.item_id).join() === String(head[1].item_id));
    r = await M.ops(id, { ops: [{ op_id: U(), type: 'set_slot', slot: 'head', item_id: neck, base_version: await v() }] }); o.push(r.body.conflicts[0] && r.body.conflicts[0].reason === 'item_not_in_slot');
    r = await M.ops(id, { ops: [{ op_id: U(), type: 'set_slot', slot: 'head', item_id: head[0].item_id, base_version: 1 }] }); o.push(r.body.conflicts[0] && r.body.conflicts[0].reason === 'stale_base_version');
    r = await M.ops(id, { ops: [{ op_id: U(), type: 'set_slot', slot: 'head', item_id: head[0].item_id, priority: 7, note: 'n', obtained: true, base_version: await v() }] });
    o.push(r.status === 200 && !r.body.ignored.length && r.body.list.items.filter(i => i.slot === 'head').every(i => i.priority === 1 && i.note === null && i.obtained === false));
    let vs = await v(); r = await M.ops(id, { ops: [{ op_id: U(), type: 'set_slot', slot: 'head', item_id: head[0].item_id, base_version: 1 }] }); o.push(r.body.conflicts[0].reason === 'stale_base_version' && r.body.version === vs + 1);
    r = await M.ops(id, { ops: [{ op_id: U(), type: 'clear_slot', slot: 'head', base_version: await v(), x: 1 }] }); o.push(r.body.ignored.length === 1 && r.body.ignored[0].keys.join() === 'x');
    r = await M.ops(id, { ops: [{ op_id: U(), type: 'set_slot', slot: 'head', base_version: await v() }] }); o.push(r.status === 400);
    // same-batch ops never make each other stale (different slots, one base_version)
    vs = await v();
    r = await M.ops(id, { ops: [{ op_id: U(), type: 'set_slot', slot: 'head', item_id: head[0].item_id, base_version: vs }, { op_id: U(), type: 'set_slot', slot: 'neck', item_id: neck, base_version: vs }] });
    o.push(r.body.applied.length === 2 && !r.body.conflicts.length);
    // slot changed in an earlier request -> op at the old base is stale
    vs = await v(); await M.ops(id, { ops: [{ op_id: U(), type: 'clear_slot', slot: 'head', base_version: vs }] });
    r = await M.ops(id, { ops: [{ op_id: U(), type: 'set_slot', slot: 'head', item_id: head[0].item_id, base_version: vs }] }); o.push(r.body.conflicts[0] && r.body.conflicts[0].reason === 'stale_base_version');
    r = await M.ops(id, { ops: [{ op_id: U(), type: 'add_item', slot: 'head', item_id: head[0].item_id, priority: 1, base_version: await v() }] }); o.push(r.status === 400);
    r = await M.ops(id, { ops: [{ op_id: U(), type: 'clear_slot', slot: 'head', base_version: await v() }] }); o.push(r.body.applied.length === 1 && !r.body.list.items.some(i => i.slot === 'head'));
    const v2 = await v(); r = await M.ops(id, { ops: [{ op_id: U(), type: 'clear_slot', slot: 'head', base_version: v2 }] }); o.push(r.body.applied.length === 1 && r.body.version === v2);
    return o;
  }, setId);
  ok(sb.every(Boolean), 'mock set_slot/clear_slot (#46 answers): replace, no-op, item_not_in_slot, stale, ignored extras -> priority 1 row, stale-before-noop bump, ignored[] unknown keys, item_id required, same-batch no self-stale, earlier-request stale, add_item not modelled, clear, empty-clear no-op ' + JSON.stringify(sb));
  await go('?mock_armory=ratelimit'); await p.click(`.pf-set[data-set="${setId}"]`); await until(() => !document.getElementById('pf-armory-view').hidden); await idle();
  await p.click('#pf-slot-wrist'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); await p.click('#pf-picker-list .pf-pick');
  ok(await vis('#pf-slot-banner') && /Wait 2 seconds/.test(await p.textContent('#pf-slot-banner')), '429 Retry-After message');

  // 409 list_limit_reached + 409 character_not_displayed on create
  await go('?mock_armory=limit'); await newBtn('ch_us_1001').click(); await p.fill('#pf-c-name', 'One more'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /already has 20 gear sets/.test(await p.textContent('#pf-c-error')), '409 list_limit_reached message'); await p.click('#pf-c-cancel');
  await go('?mock_armory=notdisplayed'); await newBtn('ch_us_1001').click(); await p.fill('#pf-c-name', 'One more'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /Show this character on your profile/.test(await p.textContent('#pf-c-error')), '403 {errors:{character_id}} (not in selection) message'); await p.click('#pf-c-cancel');
  ok(await p.evaluate(() => document.activeElement.classList.contains('pf-new')), 'cancel returns focus to Create new gear list');

  // outgrown: Wispwander (27) with a leveling set up to 20, seeded
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('cs_mock_armory')); s.sets.push({ id: 'gs_old', character_id: 'ch_us_1005', name: 'Starter', type: 'leveling', until_level: 20, role_spec: null, updated_at: '2026-11-01T00:00:00Z', version: 1, items: [], touch: {} });
    localStorage.setItem('cs_mock_armory', JSON.stringify(s)); });
  await go(); const og = p.locator('.pf-set[data-set=gs_old]');
  ok(await og.evaluate(e => e.classList.contains('is-outgrown')) && /Outgrown/.test(await og.textContent()), 'outgrown set grayed out in panel');
  await og.click(); await until(() => /Outgrown: Wispwander is level 27/.test(document.getElementById('pf-set-outgrown').textContent || '')); await idle();
  ok(await p.evaluate(() => document.getElementById('pf-armory-view').classList.contains('is-outgrown')) && /Outgrown: Wispwander is level 27/.test(await p.textContent('#pf-set-outgrown')), 'outgrown armory grayed with note');

  // hiding keeps sets
  await p.uncheck('#pf-show-ch_us_1003'); await until(() => /Its gear sets are kept/.test(document.getElementById('pf-status').textContent));
  ok(await p.locator('.pf-pchar[data-char=ch_us_1003]').count() === 0, 'hidden character leaves the panel');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('cs_mock_armory')).sets.filter(s => s.character_id === 'ch_us_1003').length === 4), 'its sets are kept');
  await p.check('#pf-show-ch_us_1003'); await until(() => document.querySelectorAll('.pf-pchar[data-char=ch_us_1003] .pf-set').length === 4);
  ok(true, 'showing it again brings the sets back');
  // toggle failure rolls back
  await go('?mock_armory=toggle500'); await p.check('#pf-show-ch_us_1002');
  ok(await vis('#pf-save-error') && !(await p.isChecked('#pf-show-ch_us_1002')), 'toggle error -> rollback + message');

  // region (kept)
  await go(); await p.selectOption('#pf-region', 'eu'); ok(await until(() => /Preferred region saved/.test(document.getElementById('pf-status').textContent)), 'preferred region still saves');

  // mobile drawer
  await p.setViewportSize({ width: 375, height: 800 }); await go();
  ok(await p.isVisible('#pf-drawer-btn') && !(await p.isVisible('#pf-panel')), 'mobile: panel is a closed drawer');
  await p.click('#pf-drawer-btn');
  ok(await until(() => document.getElementById('pf-panel').classList.contains('is-open')) && await p.getAttribute('#pf-drawer-btn', 'aria-expanded') === 'true', 'drawer opens (aria-expanded)');
  await p.waitForTimeout(300); ok(await p.isVisible('#pf-panel') && await p.evaluate(() => document.activeElement.id === 'pf-panel'), 'drawer visible, focus moved in');
  await p.keyboard.press('Escape'); ok(await until(() => !document.getElementById('pf-panel').classList.contains('is-open')) && await p.evaluate(() => document.activeElement.id === 'pf-drawer-btn'), 'Escape closes drawer, focus back on toggle');
  await p.click('#pf-drawer-btn'); await p.waitForTimeout(300); await p.click(`.pf-set[data-set="${setId}"]`);
  ok(await until(() => !document.getElementById('pf-panel').classList.contains('is-open') && !document.getElementById('pf-armory-view').hidden), 'choosing a set closes the drawer and opens the armory');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= 375), 'no horizontal overflow at 375px');
  await p.screenshot({ path: require('path').join(process.env.CS_E2E_SHOTS || require('os').tmpdir(), 'armory-mobile.png'), fullPage: true });
  await p.setViewportSize({ width: 1280, height: 900 }); await go(); await p.click(`.pf-set[data-set="${setId}"]`); await p.waitForTimeout(400);
  await p.screenshot({ path: require('path').join(process.env.CS_E2E_SHOTS || require('os').tmpdir(), 'armory-desktop.png'), fullPage: true });

  const txt = await p.evaluate(() => document.body.innerText); ok(!/\b(undefined|NaN)\b/.test(txt), 'no undefined/NaN in page text');
  const src = await p.evaluate(async () => { let s = ''; for (const f of ['js/profile.js', 'js/armory-api.js', 'js/armory-mock.js', 'js/gear-set-rules.js']) s += await (await fetch('../' + f)).text(); return s; });
  ok(!/innerHTML/.test(src), 'no innerHTML in armory JS');
  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  await b.close();
})().catch(e => { console.log('FAIL crash ' + e.message); process.exitCode = 1; process.exit(1); });
