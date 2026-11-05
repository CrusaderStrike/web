// web#42 profile + armory against the in-browser mocks (USE_MOCK_ARMORY=true): display toggles, choose step,
// gear set side panel (drawer on mobile), create form level rules, 19-slot armory, item picker, autosave + conflicts.
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
  const go = async q => { await p.goto(B + 'profile/' + (q || '')); await vis('#pf-ready'); await p.waitForTimeout(300); };

  await p.goto(B + 'profile/'); ok(await vis('#pf-disabled'), 'flag off -> coming soon');
  await p.goto(B + 'profile/?ff_bnet=1'); ok(await vis('#pf-signedout'), 'signed out -> sign-in prompt (armory only behind login)');
  await p.evaluate(() => { CSAuthMock.devSignIn(); CSAuthMock.devReset(); CSArmoryMock.devReset(); });
  await go();
  ok(await p.evaluate(() => CS_CONFIG.USE_MOCK_ARMORY === true), 'USE_MOCK_ARMORY on');
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
  for (const id of ['ch_us_1003', 'ch_us_1005']) { await p.check('#pf-show-' + id); await until(i => document.querySelector('#pf-show-' + i) && !document.querySelector('#pf-show-' + i).disabled, id); }
  await p.reload(); await vis('#pf-ready'); await p.waitForTimeout(300);
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
  const srv = await p.evaluate(id => JSON.parse(localStorage.getItem('cs_mock_armory')).sets.find(s => s.id === id), setId);
  ok(srv.slots.head === iid && srv.version === 2, 'server state updated (v2)');
  // finger2 picker lists finger items
  await p.click('#pf-slot-finger2'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0);
  ok(/Band/.test(await p.textContent('#pf-picker-list .pf-pick-name')), 'finger2 picker shows rings'); await p.keyboard.press('Escape');
  ok(await p.evaluate(() => !document.getElementById('pf-picker').open && document.activeElement.id === 'pf-slot-finger2'), 'Escape closes picker, focus back');
  // clear slot
  await p.click('#pf-slot-head'); await p.click('#pf-picker-clear'); ok(await until(() => /Head cleared/.test(document.getElementById('pf-status').textContent)), 'clear slot saves null');
  // reload keeps picks
  await p.click('#pf-slot-neck'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); await p.click('#pf-picker-list .pf-pick');
  await until(() => /Neck saved/.test(document.getElementById('pf-status').textContent));
  await go(); await p.click(`.pf-set[data-set="${setId}"]`); await until(() => /Pendant/.test(document.getElementById('pf-slot-neck').textContent));
  ok(/Emberwrought Pendant/.test(await p.textContent('#pf-slot-neck')), 'picks persist across reload');

  // 409 and 412 conflicts -> reload set, banner, pick not saved
  for (const sc of ['conflict', 'stale412']) {
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('cs_mock_armory')); s.flags = {}; localStorage.setItem('cs_mock_armory', JSON.stringify(s)); });
    await go('?mock_armory=' + sc); await p.click(`.pf-set[data-set="${setId}"]`); await until(() => !document.getElementById('pf-armory-view').hidden);
    await p.click('#pf-slot-back'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); await p.click('#pf-picker-list .pf-pick');
    ok(await vis('#pf-slot-banner') && /changed somewhere else, so it was reloaded/.test(await p.textContent('#pf-slot-banner')), sc + ': reloads the set with a banner');
    ok(/Duskhollow Pendant/.test(await p.textContent('#pf-slot-neck')) && /Empty/.test(await p.textContent('#pf-slot-back')), sc + ': shows the other edit; this pick not kept');
    await p.click('#pf-slot-back'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); await p.click('#pf-picker-list .pf-pick');
    ok(await until(() => /Back saved/.test(document.getElementById('pf-status').textContent)), sc + ': next pick saves with the fresh ETag');
    await p.click('#pf-slot-back'); await p.click('#pf-picker-clear'); await until(() => /Back cleared/.test(document.getElementById('pf-status').textContent));
  }
  // 400 item_not_in_slot, 429
  await go('?mock_armory=badslot'); await p.click(`.pf-set[data-set="${setId}"]`); await until(() => !document.getElementById('pf-armory-view').hidden);
  await p.click('#pf-slot-wrist'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); await p.click('#pf-picker-list .pf-pick');
  ok(await vis('#pf-slot-banner') && /doesn.t fit this slot/.test(await p.textContent('#pf-slot-banner')) && /Empty/.test(await p.textContent('#pf-slot-wrist')), '400 item_not_in_slot -> rolled back + message');
  const nf = await p.evaluate(id => CSArmoryApi.putSlot(id, 'head', 123, null), setId); ok(nf.status === 400 && nf.body.error.details.item_id === 'item_not_forever', 'mock 400 item_not_forever');
  const is = await p.evaluate(id => CSArmoryApi.putSlot(id, 'hat', null, null), setId); ok(is.status === 400 && is.body.error.details.slot === 'invalid_slot', 'mock 400 invalid_slot');
  await go('?mock_armory=ratelimit'); await p.click(`.pf-set[data-set="${setId}"]`); await until(() => !document.getElementById('pf-armory-view').hidden);
  await p.click('#pf-slot-wrist'); await until(() => document.querySelectorAll('#pf-picker-list .pf-pick').length > 0); await p.click('#pf-picker-list .pf-pick');
  ok(await vis('#pf-slot-banner') && /Wait 2 seconds/.test(await p.textContent('#pf-slot-banner')), '429 Retry-After message');

  // 409 list_limit_reached + 409 character_not_displayed on create
  await go('?mock_armory=limit'); await newBtn('ch_us_1001').click(); await p.fill('#pf-c-name', 'One more'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /already has 20 gear sets/.test(await p.textContent('#pf-c-error')), '409 list_limit_reached message'); await p.click('#pf-c-cancel');
  await go('?mock_armory=notdisplayed'); await newBtn('ch_us_1001').click(); await p.fill('#pf-c-name', 'One more'); await p.click('#pf-c-save');
  ok(await vis('#pf-c-error') && /Show this character on your profile/.test(await p.textContent('#pf-c-error')), '409 character_not_displayed message'); await p.click('#pf-c-cancel');
  ok(await p.evaluate(() => document.activeElement.classList.contains('pf-new')), 'cancel returns focus to Create new gear list');

  // outgrown: Wispwander (27) with a leveling set up to 20, seeded
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('cs_mock_armory')); const slots = {}; CS_CONFIG.ARMORY_SLOTS.forEach(k => slots[k] = null);
    s.sets.push({ id: 'gs_old', character_id: 'ch_us_1005', name: 'Starter', type: 'leveling', until_level: 20, role_spec: null, edited_at: '2026-11-01T00:00:00Z', version: 1, slots });
    localStorage.setItem('cs_mock_armory', JSON.stringify(s)); });
  await go(); const og = p.locator('.pf-set[data-set=gs_old]');
  ok(await og.evaluate(e => e.classList.contains('is-outgrown')) && /Outgrown/.test(await og.textContent()), 'outgrown set grayed out in panel');
  await og.click(); await until(() => !document.getElementById('pf-armory-view').hidden);
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
  await p.screenshot({ path: '/workspace/armory-mobile.png', fullPage: true });
  await p.setViewportSize({ width: 1280, height: 900 }); await go(); await p.click(`.pf-set[data-set="${setId}"]`); await p.waitForTimeout(400);
  await p.screenshot({ path: '/workspace/armory-desktop.png', fullPage: true });

  const txt = await p.evaluate(() => document.body.innerText); ok(!/\b(undefined|NaN)\b/.test(txt), 'no undefined/NaN in page text');
  const src = await p.evaluate(async () => { let s = ''; for (const f of ['js/profile.js', 'js/armory-api.js', 'js/armory-mock.js', 'js/gear-set-rules.js']) s += await (await fetch('../' + f)).text(); return s; });
  ok(!/innerHTML/.test(src), 'no innerHTML in armory JS');
  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  await b.close();
})().catch(e => { console.log('FAIL crash ' + e.message); process.exitCode = 1; process.exit(1); });
