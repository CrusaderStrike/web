// web#18 gear lists (mock, platform#34 shapes). Run with the repo served on :8765.
const { chromium } = require('playwright');
const B = 'http://localhost:8765/';
(async () => {
  const b = require('./_test-config.js').withTestConfig(await chromium.launch());
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const vis = s => p.waitForSelector(s + ':not([hidden])', { timeout: 5000 }).then(() => true, () => false);
  const U = (q = '') => B + 'gear/lists/?character=ch_us_1001' + q;
  const fresh = async (q = '') => { await p.evaluate(() => { sessionStorage.removeItem('cs_mock_gear_lists'); Object.keys(localStorage).filter(k => k.startsWith('cs_gl_queue:')).forEach(k => localStorage.removeItem(k)); window.__glOpsLog = []; window.__glOpsLists = []; }); await p.goto(U(q)); return vis('#gl-ready'); };
  const banner = () => p.textContent('#gl-banner-msg');
  const rows = () => p.$$eval('#gl-items tr', t => t.map(r => r.dataset.slot + ':' + r.dataset.item + ':' + r.cells[2].textContent + ':' + r.cells[3].textContent));

  await p.goto(U()); ok(await vis('#gl-disabled'), 'flag off -> coming soon');
  await p.goto(U('&ff_bnet=1')); ok(await vis('#gl-signedout'), 'signed out');
  await p.evaluate(() => CSAuthMock.devSignIn());
  // equipped gear page links to lists
  await p.goto(B + 'gear/?character=ch_us_1001'); await vis('#gr-ready');
  await p.click('#gr-lists-link'); await p.waitForURL(/gear\/lists\/\?character=ch_us_1001/); ok(await vis('#gl-ready'), 'ready via gear page link');
  ok((await p.textContent('#gl-h')) === 'Lightbringer Dawnmantle — gear lists', 'heading');
  ok((await p.$$eval('#gl-index button', x => x.length)) === 2, 'two fixture lists');
  ok((await p.textContent('#gl-count')) === '(2 of 5)', 'count of max 5');
  ok((await p.textContent('#gl-detail-h')) === 'Emberfall BiS', 'first list selected');
  ok(/from in game$/.test(await p.textContent('#gl-meta')), 'updated_source shown: ' + await p.textContent('#gl-meta'));
  ok((await rows()).join('|') === 'head:910001:1:Wanted|back:940002:1:Wanted|finger1:940003:2:Obtained', 'items in slot order: ' + (await rows()).join('|'));
  ok((await p.$$eval('#gl-new-vis option', o => o.map(x => x.value).join())) === 'private,guild', 'visibility options from spec');
  ok((await p.$$eval('#gl-add-slot option', o => o.length)) === 19, '19 slots from generated spec');
  ok(await p.evaluate(() => window.CSGearListsSpec.limits.priority_max === 50 && CSGearListsSpec.limits.items_per_list === 100), 'spec limits 50/100');

  // create -> rename -> add -> reprioritize (keyboard) -> obtain -> undo -> remove -> delete
  await fresh();
  await p.click('#gl-create button[type=submit]'); ok((await p.textContent('#gl-new-name-err')).includes('1–64'), 'empty name validation');
  ok((await p.getAttribute('#gl-new-name', 'aria-invalid')) === 'true', 'aria-invalid on bad name');
  await p.fill('#gl-new-name', 'Duskhollow raid night'); await p.selectOption('#gl-new-vis', 'guild'); await p.click('#gl-new-btn');
  await p.waitForFunction(() => document.getElementById('gl-detail-h').textContent === 'Duskhollow raid night');
  ok(await p.evaluate(() => document.activeElement.id === 'gl-detail-h'), 'focus moves to new list');
  ok(await p.isVisible('#gl-items-empty'), 'empty list state');
  await p.fill('#gl-name', 'Duskhollow raid'); await p.selectOption('#gl-vis', 'private'); await p.click('#gl-meta-form button[type=submit]');
  await p.waitForFunction(() => document.getElementById('gl-detail-h').textContent === 'Duskhollow raid'); ok(true, 'renamed');
  ok((await p.textContent('#gl-meta')).startsWith('Only me'), 'visibility changed');
  await p.fill('#gl-add-id', 'abc'); await p.click('#gl-add button[type=submit]'); ok((await p.textContent('#gl-add-id-err')).length > 0, 'non-numeric item id rejected');
  await p.fill('#gl-add-id', '940001'); await p.fill('#gl-add-pr', '51'); await p.click('#gl-add button[type=submit]'); ok((await p.textContent('#gl-add-pr-err')).includes('1–50'), 'priority max 50');
  await p.selectOption('#gl-add-slot', 'back'); await p.fill('#gl-add-pr', '2'); await p.fill('#gl-add-note', 'From Emberfall Dungeon Run');
  await p.click('#gl-add button[type=submit]'); await p.waitForSelector('#gl-items tr');
  ok((await rows())[0] === 'back:940001:2:Wanted', 'item added');
  await p.waitForFunction(() => document.querySelector('#gl-items tr td:nth-child(2)').textContent.includes('Emberfall Ward of Cinders'), null, { timeout: 5000 }).catch(() => {});
  ok((await p.textContent('#gl-items tr td:nth-child(2)')).includes('Emberfall Ward of Cinders'), 'item name from fixture (after server ack)');
  await p.focus('#gl-items tr [data-act=up]'); await p.keyboard.press('Enter'); await p.waitForFunction(() => document.querySelector('#gl-items tr').cells[2].textContent === '1');
  ok(true, 'raise priority via keyboard');
  ok(await p.isDisabled('#gl-items tr [data-act=up]'), 'raise disabled at priority 1');
  await p.click('#gl-items tr [data-act=obtain]'); await p.waitForFunction(() => document.querySelector('#gl-items tr').cells[3].textContent === 'Obtained'); await p.waitForFunction(() => document.getElementById('gl-queue').textContent === ''); ok(true, 'mark obtained');
  await p.click('#gl-items tr [data-act=obtain]'); await p.waitForFunction(() => document.querySelector('#gl-items tr').cells[3].textContent === 'Wanted'); ok(true, 'undo obtained (obtained:false)');
  // history: typed payloads, actor display name
  await p.waitForFunction(() => document.getElementById('gl-queue').textContent === '');
  await p.click('#gl-hist-btn'); await p.waitForSelector('#gl-hist-list li');
  const h = await p.$$eval('#gl-hist-list li', l => l.map(x => x.textContent));
  ok(h.length === 6, 'history entries: ' + h.length);
  ok(h[0].startsWith('Undid obtained for Back item 940001') && h[0].includes('Crusader#1234'), 'newest first with actor: ' + h[0]);
  ok(h.some(x => x.startsWith('Renamed to “Duskhollow raid”; Visibility: Only me')), 'rename event');
  ok((await p.getAttribute('#gl-hist-btn', 'aria-expanded')) === 'true', 'history toggle aria-expanded');
  const ops = await p.evaluate(() => { const o = CSGearListsMock.ops; let seen; CSGearListsMock.ops = (id, b) => { seen = b.ops[0]; window.__op = seen; return o(id, b); }; return true; });
  await p.click('#gl-items tr [data-act=remove]'); await p.waitForSelector('#gl-items-empty:not([hidden])');
  await p.waitForFunction(() => document.getElementById('gl-queue').textContent === '');
  const sent = await p.evaluate(() => window.__op);
  ok(sent && sent.type === 'remove_item' && typeof sent.base_version === 'number' && sent.item_id === 940001 && !('source' in sent) && sent.op_id, 'op shape: op_id, type, slot, item_id (snake), base_version, no client source');
  await p.click('#gl-delete'); ok(await p.evaluate(() => document.activeElement.id === 'gl-delete-confirm'), 'delete asks to confirm');
  await p.click('#gl-delete-confirm'); await p.waitForFunction(() => document.querySelectorAll('#gl-index button').length === 2); ok(true, 'list deleted');

  // 5-list cap (client) and 409 list_limit_reached (server)
  await fresh();
  for (const n of ['Three', 'Four', 'Five']) { await p.fill('#gl-new-name', n); await p.click('#gl-new-btn'); await p.waitForFunction(t => document.getElementById('gl-detail-h').textContent === t, n); }
  ok(await p.isDisabled('#gl-new-btn') && await p.isVisible('#gl-limit'), 'create disabled at 5 lists');
  await fresh('&mock=limit'); await p.fill('#gl-new-name', 'Sixth'); await p.click('#gl-new-btn'); await vis('#gl-banner');
  ok((await banner()).includes('already have 5 lists'), '409 list_limit_reached message');

  // 409 version_mismatch: current {version, list} applied, re-apply works
  await fresh('&mock=stale'); await p.fill('#gl-name', 'Emberfall BiS v2'); await p.click('#gl-meta-form button[type=submit]'); await vis('#gl-banner');
  ok((await banner()).includes('changed somewhere else') && (await banner()).includes('Emberfall BiS (in game)'), '409 shows current list: ' + await banner());
  ok((await p.textContent('#gl-detail-h')) === 'Emberfall BiS (in game)', 'current list rendered without refetch');
  await p.fill('#gl-name', 'Emberfall BiS v2'); await p.click('#gl-banner-reapply');
  await p.waitForFunction(() => document.getElementById('gl-detail-h').textContent === 'Emberfall BiS v2'); ok(true, 're-apply with current version');
  ok(await p.evaluate(async () => { const r = await CSGearListsMock.patch('gl_emberfall_bis', { name: 'x' }, undefined); return r.status === 428 && r.body.error.code === 'precondition_required'; }), 'missing If-Match -> 428');
  ok(await p.evaluate(async () => { const r = await CSGearListsMock.get('gl_emberfall_bis'); return /^"v\d+"$/.test(r.headers.etag); }), 'ETag exactly "v<n>"');

  // item_not_forever rejection (reason code), no re-apply offered
  await fresh(); await p.fill('#gl-add-id', '19019'); await p.click('#gl-add button[type=submit]'); await vis('#gl-banner');
  ok((await banner()).includes('not a WoW Forever item') && await p.isHidden('#gl-banner-reapply'), 'item_not_forever conflict: ' + await banner());
  // ops conflict -> toast with re-apply (new op_id)
  await fresh('&mock=conflict'); await p.click('#gl-items tr [data-act=down]'); await vis('#gl-banner');
  ok((await banner()).startsWith('1 change didn’t apply: a newer edit'), 'conflict toast: ' + await banner());
  await p.click('#gl-banner-reapply'); await p.waitForFunction(() => document.querySelector('#gl-items tr').cells[2].textContent === '2'); ok(true, 'conflict re-apply applied');
  // 429 with Retry-After, auto-retry with same op_id
  await fresh('&mock=ratelimit'); await p.click('#gl-items tr [data-act=down]'); await vis('#gl-banner');
  ok((await banner()).includes('will be sent in 3 seconds'), '429 Retry-After shown');
  await p.waitForFunction(() => document.querySelector('#gl-items tr').cells[2].textContent === '2', null, { timeout: 6000 }); ok(true, '429 auto-retry');
  // officer / non-owner: 403 -> read-only
  await fresh('&mock=forbidden'); await p.click('#gl-items tr [data-act=down]'); await vis('#gl-readonly');
  ok((await banner()).includes('Only the list owner'), '403 forbidden message');
  ok(!(await p.isVisible('#gl-add')) && !(await p.isVisible('#gl-meta-form')) && !(await p.isVisible('#gl-items tr [data-act=down]')), 'edit controls hidden read-only');
  // history 403, offline, 500
  await fresh('&mock=history403'); await p.click('#gl-hist-btn'); await p.waitForFunction(() => document.getElementById('gl-hist-msg').textContent.includes('view this list'));
  ok(true, 'history 403 by visibility');
  await p.goto(U('&mock=offline')); ok(await vis('#gl-error') && (await p.textContent('#gl-error-msg')).includes('offline'), 'offline state');
  await p.goto(U('&mock=500')); ok(await vis('#gl-error'), '500 error state');
  await p.goto(B + 'gear/lists/?character=ch_us_9999'); ok(await vis('#gl-notfound'), 'non-owner character -> not found');
  await p.goto(U('&mock=char403')); ok(await vis('#gl-notfound'), 'character 403 forbidden -> not found');
  ok(await p.evaluate(() => [CSGearListsApi.opId(), (() => { const r = crypto.randomUUID; crypto.randomUUID = undefined; try { return CSGearListsApi.opId(); } finally { crypto.randomUUID = r; } })()].every(s => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s))), 'opId always a v4 UUID (incl. fallback)');
  await p.goto(B + 'gear/lists/'); ok(await vis('#gl-notfound'), 'no id -> not found');
  // hostile data rendered as text; no innerHTML in module
  await fresh(); await p.fill('#gl-new-name', '<img src=x onerror="window.__x=1">'); await p.click('#gl-new-btn'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => !window.__x && !document.querySelector('#gl-index img, #gl-detail-h img')), 'hostile name rendered as text');
  const src = await (await p.request.get(B + 'js/gear-lists.js')).text(); ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(src), 'no innerHTML in gear-lists.js');

  // ---- write queue (Addon Dev review on web#34) ----
  const log = () => p.evaluate(() => window.__glOpsLog || []);
  const row = slot => p.locator('#gl-items tr[data-slot=' + slot + ']');
  const cell = async (slot, n) => (await row(slot).locator('td').nth(n).textContent()).trim();
  // two different edits both hit 429 (twice), Dismiss mid-pause: nothing lost
  await fresh('&mock=ratelimit&rl=2');
  await row('head').locator('[data-act=down]').click(); await row('back').locator('[data-act=obtain]').click();
  await vis('#gl-banner'); ok((await banner()).includes('will be sent in 3 seconds'), 'two edits paused by 429');
  ok(await cell('head', 2) === '2' && await cell('back', 3) === 'Obtained', 'queued edits shown optimistically');
  ok((await p.textContent('#gl-queue')).includes('2 changes saving'), 'queue indicator: ' + await p.textContent('#gl-queue'));
  await p.click('#gl-banner-dismiss'); ok(await p.isHidden('#gl-banner'), 'dismiss hides banner');
  await p.waitForFunction(() => document.getElementById('gl-queue').textContent === '', null, { timeout: 15000 });
  const L1 = await log(); ok(L1.length >= 1, 'ops eventually sent after Retry-After');
  await p.goto(U()); await vis('#gl-ready');
  ok(await cell('head', 2) === '2' && await cell('back', 3) === 'Obtained', 'both 429 edits persisted on the server after dismiss');
  // coalescing: three priority clicks while paused -> one reprioritize op with the final value
  await fresh('&mock=ratelimit');
  for (let k = 0; k < 3; k++) await row('head').locator('[data-act=down]').click();
  ok(await cell('head', 2) === '4', 'three clicks build on each other locally');
  await p.waitForFunction(() => document.getElementById('gl-queue').textContent === '', null, { timeout: 10000 });
  const L2 = await log(); const sent2 = L2.flat().filter(o => o.type === 'reprioritize_item');
  ok(sent2.length === 1 && sent2[0].priority === 4, 'coalesced to one op priority 4: ' + JSON.stringify(sent2.map(o => o.priority)));
  await p.goto(U()); await vis('#gl-ready'); ok(await cell('head', 2) === '4', 'coalesced priority persisted');
  // base_version stamped at send: two ops on the same item queued during a pause both apply (no stale_base_version)
  await fresh('&mock=ratelimit');
  await row('head').locator('[data-act=down]').click(); await row('head').locator('[data-act=obtain]').click();
  await p.waitForFunction(() => document.getElementById('gl-queue').textContent === '', null, { timeout: 10000 });
  const L3 = (await log()).filter(b => b.length);
  ok(L3.length === 2 && L3[1][0].base_version > L3[0][0].base_version, 'same-item ops sent one per request, base_version stamped at send: ' + L3.map(b => b[0].base_version).join(','));
  ok(await p.isHidden('#gl-banner') || !(await banner()).includes('didn’t apply'), 'no stale_base_version rejection');
  await p.goto(U()); await vis('#gl-ready'); ok(await cell('head', 2) === '2' && await cell('head', 3) === 'Obtained', 'both same-item edits persisted');
  // add then remove before sending -> nothing sent
  await fresh('&mock=ratelimit'); await row('back').locator('[data-act=down]').click();
  await p.fill('#gl-add-id', '940004'); await p.selectOption('#gl-add-slot', 'off_hand'); await p.click('#gl-add button[type=submit]');
  await row('off_hand').locator('[data-act=remove]').click();
  await p.waitForFunction(() => document.getElementById('gl-queue').textContent === '', null, { timeout: 10000 });
  ok(!(await log()).flat().some(o => o.slot === 'off_hand'), 'add+remove before send coalesced away');
  // 403 csrf_failed -> session refresh + one retry
  await fresh('&mock=csrf'); await row('head').locator('[data-act=down]').click();
  await p.waitForFunction(() => document.getElementById('gl-queue').textContent === '', null, { timeout: 10000 });
  await p.goto(U()); await vis('#gl-ready'); ok(await cell('head', 2) === '2', 'csrf_failed refreshed session and retried once');
  // placeholder icons for null icon_url
  ok(await p.$$eval('#gl-items tr', t => t.every(r => r.querySelector('.gr-icon svg') && !r.querySelector('.gr-icon img') && r.querySelector('.gr-icon').getAttribute('aria-hidden') === 'true')), 'slot placeholder icon when icon_url null');
  ok((await p.getAttribute('#gl-banner', 'role')) === 'alert', 'banner role=alert');
  ok(await p.evaluate(() => CSGearListsSpec.limits.sync_ops_per_request === 500 && CSGearListsSpec.limits.ops_per_request === 200), 'spec caps (200 per list, 500 per sync)');

  // ---- round 2: queued edits survive leaving the page; leave warnings; re-apply targets the original list ----
  await fresh('&mock=ratelimit&rl=50'); await row('head').locator('[data-act=down]').click(); await vis('#gl-banner');
  const stored = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cs_gl_queue:')).map(k => [k, JSON.parse(localStorage.getItem(k))]));
  ok(stored.length === 1 && stored[0][0].endsWith(':gl_emberfall_bis') && stored[0][1].length === 1, 'queue persisted to localStorage keyed by user+list: ' + (stored[0] || [''])[0]);
  ok(await p.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); dispatchEvent(e); return e.defaultPrevented; }), 'beforeunload warns while queue non-empty');
  let dlg = 0; const dismiss = d => { dlg++; d.dismiss(); }; p.on('dialog', dismiss);
  await p.click('#gl-back'); await p.waitForTimeout(300); p.off('dialog', dismiss);
  ok(dlg === 1 && p.url().includes('/gear/lists/'), 'in-app link asks before leaving; cancel stays');
  const accept = d => d.accept(); p.on('dialog', accept);
  await p.click('#gl-back'); await p.waitForURL(u => !u.toString().includes('/gear/lists/')); p.off('dialog', accept);
  ok(true, 'confirm leaves the page');
  await p.goto(U()); await vis('#gl-ready');
  await p.waitForFunction(() => document.getElementById('gl-queue').textContent === '', null, { timeout: 10000 });
  const resent = (await log()).flat();
  ok(resent.length === 1 && resent[0].op_id === stored[0][1][0].op_id, 'restored queue resumed with the same op_id');
  ok(await cell('head', 2) === '2', 'edit queued before leaving was saved');
  ok(await p.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('cs_gl_queue:'))), 'stored queue cleared once sent');
  ok(!(await p.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); dispatchEvent(e); return e.defaultPrevented; })), 'no leave warning when queue empty');
  // re-apply after switching lists goes to the list the conflict came from
  await fresh('&mock=conflict'); await row('head').locator('[data-act=down]').click(); await vis('#gl-banner');
  await p.click('#gl-index button:has-text("Duskhollow pre-raid")'); await p.waitForFunction(() => document.getElementById('gl-detail-h').textContent === 'Duskhollow pre-raid');
  await p.click('#gl-banner-reapply');
  await p.waitForFunction(() => (window.__glOpsLists || []).length === 2 && document.getElementById('gl-queue').textContent === '', null, { timeout: 10000 });
  ok((await p.evaluate(() => window.__glOpsLists)).every(x => x === 'gl_emberfall_bis'), 're-apply sent to original list: ' + await p.evaluate(() => window.__glOpsLists.join(',')));
  ok(await p.isVisible('#gl-items-empty'), 'open list untouched by re-apply');
  await p.click('#gl-index button:has-text("Emberfall BiS")'); await p.waitForFunction(() => document.getElementById('gl-detail-h').textContent === 'Emberfall BiS');
  ok(await cell('head', 2) === '2', 're-applied change landed on the original list');
  // non-200 ops surfaces the dropped count
  await fresh('&mock=ops422'); await row('head').locator('[data-act=down]').click(); await vis('#gl-banner');
  ok((await banner()).includes('1 change was not saved'), 'non-200 ops shows dropped count: ' + await banner());
  // mobile
  await p.setViewportSize({ width: 375, height: 800 }); await fresh();
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= 375), 'no horizontal scroll at 375px');
  await p.screenshot({ path: '/workspace/gear-lists-mobile.png', fullPage: true });
  await p.setViewportSize({ width: 1280, height: 900 }); await fresh(); await p.screenshot({ path: '/workspace/gear-lists-desktop.png', fullPage: true });
  ok(errs.length === 0, 'no console/page errors: ' + errs.join(' | '));
  await b.close();
})();
