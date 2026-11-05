// web#20 rankings page. Run: node tests/e2e/rankings.e2e.js (site served on http://localhost:8765).
const { chromium } = require('playwright');
const fs = require('fs');
const B = 'http://localhost:8765/';
(async () => {
const b = await chromium.launch();
let p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const ready = () => p.waitForFunction(() => document.getElementById('rk-table').getAttribute('aria-busy') === 'false' || !document.getElementById('rk-error').hidden || !document.getElementById('rk-empty').hidden);
const lastQ = () => p.evaluate(() => CSRankingsMock.lastQuery);
const cap = () => p.textContent('#rk-caption');

// ---- flag OFF (default): spec params only
await p.goto(B + 'rankings.html?mock_scenario=slow'); ok(await p.locator('#rk-status').textContent() === 'Loading rankings…', 'loading state');
await p.goto(B + 'rankings.html'); await ready();
ok(await p.locator('#rk-body tr').count() === 25, 'first page 25 rows');
ok(JSON.stringify(Object.keys(await lastQ()).sort()) === '["board","limit"]', 'default request: board+limit only ' + JSON.stringify(await lastQ()));
ok(!(await p.$('#rk-tabs')) && !(await p.$('#rk-scope')) && !(await p.$('#rk-period')) && !(await p.$('#rk-bracket')), 'PvP tab and scope/period/bracket removed');
const body = await p.evaluate(() => document.body.innerText);
ok(!/All guilds|Last 30 days|Last 7 days|World PvP|This season|realm/i.test(body), 'no extended-filter labels with flag off');
ok((await cap()) === 'Dungeon Runs, fastest clear, all dungeons, by rank', 'caption: ' + await cap());
await p.goto(B + 'rankings.html?scope=all&period=30d&bracket=solo&tab=pvp'); await ready();
ok(JSON.stringify(Object.keys(await lastQ()).sort()) === '["board","limit"]' && (await lastQ()).board === 'fastest_clear', 'URL extended params ignored with flag off');
// dungeon id pass-through (no hardcoded list)
await p.goto(B + 'rankings.html?dungeon_id=2437'); await ready();
ok((await lastQ()).dungeon_id === 2437 && await p.inputValue('#rk-dungeon') === '2437', 'unknown dungeon_id from URL passes through');
await p.goto(B + 'rankings.html?dungeon_id=999999'); await ready(); ok(await p.locator('#rk-empty').isVisible(), 'unknown dungeon -> empty page');
await p.goto(B + 'rankings.html?dungeon_id=abc'); await ready(); ok(!('dungeon_id' in await lastQ()), 'invalid dungeon_id dropped');
await p.fill('#rk-dungeon', '36'); await p.press('#rk-dungeon', 'Enter'); await p.locator('#rk-dungeon').blur(); await ready();
ok((await lastQ()).dungeon_id === 36 && p.url().includes('dungeon_id=36') && (await cap()).includes('dungeon 36'), 'typed dungeon id sent + URL synced');
await p.selectOption('#rk-board', 'runs_completed'); await ready(); ok((await lastQ()).board === 'runs_completed', 'board select');
await p.selectOption('#rk-board', 'fastest_clear'); await ready();
// load more
await p.click('#rk-more'); await ready(); ok(await p.locator('#rk-body tr').count() === 28 && typeof (await lastQ()).cursor === 'string', 'load more via cursor');
ok(await p.locator('#rk-more').isHidden(), 'no more pages -> button hidden');
// sorting = loaded rows
await p.click('button.cs-sort[data-sort=value]');
ok(await p.getAttribute('th:has(#rk-value-h)', 'aria-sort') === 'ascending', 'aria-sort on time');
ok((await cap()).endsWith('loaded rows sorted by time ascending'), 'caption says loaded rows: ' + await cap());
ok((await p.textContent('#rk-sort-note')).includes('only the rows loaded'), 'sort note visible');
await p.focus('button.cs-sort[data-sort=character_name]'); await p.keyboard.press('Enter');
ok(await p.getAttribute('th:has([data-sort=character_name])', 'aria-sort') === 'ascending', 'keyboard sort');
// states
for (const [sc, re, m] of [['empty', null, 'empty state'], ['error', /went wrong/, '500'], ['unauthorized', /Sign in/, '401'],
  ['ratelimit', /12 seconds/, '429 Retry-After'], ['unavailable', /temporarily unavailable/, '503'], ['network', /reach Crusader Strike/, 'network error']]) {
  await p.goto(B + 'rankings.html?mock_scenario=' + sc); await ready();
  if (!re) ok(await p.locator('#rk-empty').isVisible(), m);
  else ok(await p.locator('#rk-error').isVisible() && re.test(await p.textContent('#rk-error-msg')), m + ': ' + await p.textContent('#rk-error-msg'));
}
// XSS
await p.goto(B + 'rankings.html'); await ready();
await p.evaluate(() => { const o = CSRankingsMock.getRankings.bind(CSRankingsMock); CSRankingsMock.getRankings = q => o(q).then(r => { r.items[0].character_name = '<img src=x onerror="window.__x=1">'; return r; }); });
await p.selectOption('#rk-board', 'runs_completed'); await ready();
ok(await p.evaluate(() => !window.__x && !document.querySelector('#rk-body img')), 'hostile name not parsed');
ok((await p.textContent('#rk-body tr td:nth-child(2)')).startsWith('<img'), 'hostile name shown as text');
const txt = await p.evaluate(() => document.body.innerText); ok(!/\b(retail|classic|season of discovery|undefined|null|NaN)\b/i.test(txt), 'WoW Forever wording, no undefined/null');
const src = await p.evaluate(async () => { let s = ''; for (const f of ['js/rankings.js', 'js/rankings-api.js', 'js/rankings-mock.js']) s += await (await fetch(f)).text(); return s; });
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src), 'no HTML sinks in rankings JS');
ok(!/Deadmines|Wailing Caverns|Shadowfang|Scarlet Monastery|Blackrock/.test(src + await p.content()), 'no hardcoded dungeon list');
// mobile
await p.setViewportSize({ width: 375, height: 800 }); await p.goto(B + 'rankings.html'); await ready();
ok(await p.evaluate(() => document.documentElement.scrollWidth <= 375), 'no horizontal overflow at 375px');

// ---- flag ON
const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
await q.route('**/js/config.js', async r => { const t = fs.readFileSync(__dirname + '/../../js/config.js', 'utf8').replace('RANKINGS_EXTENDED_FILTERS: false', 'RANKINGS_EXTENDED_FILTERS: true'); r.fulfill({ contentType: 'application/javascript', body: t }); });
p = q;
await p.goto(B + 'rankings.html'); await ready();
ok(await p.isVisible('#rk-tabs') && await p.isVisible('#rk-scope') && await p.isVisible('#rk-period'), 'flag on: extended controls shown');
ok(JSON.stringify(Object.keys(await lastQ()).sort()) === '["board","limit"]', 'flag on: still no defaults sent');
ok(JSON.stringify(await p.$$eval('#rk-period option', o => o.map(x => x.value))) === '["","week","month","season","all"]', 'period values from config');
ok(JSON.stringify(await p.$$eval('#rk-scope option', o => o.map(x => x.value))) === '["","guild","realm","global"]', 'scope values from config');
await p.selectOption('#rk-scope', 'realm'); await ready(); await p.selectOption('#rk-period', 'month'); await ready();
let lq = await lastQ(); ok(lq.scope === 'realm' && lq.period === 'month' && !('bracket' in lq), 'only explicitly set params sent: ' + JSON.stringify(lq));
await p.selectOption('#rk-bracket', 'heroic'); await ready(); ok((await lastQ()).bracket === 'heroic', 'bracket (difficulty) sent when set');
ok((await cap()).includes('my realm') && (await cap()).includes('this month') && (await cap()).includes('heroic'), 'caption with set filters: ' + await cap());
await p.selectOption('#rk-scope', ''); await ready(); ok(!('scope' in await lastQ()), 'back to Default -> not sent');
await p.focus('#rk-tab-dungeon'); await p.keyboard.press('ArrowRight'); await ready();
lq = await lastQ(); ok(lq.board === 'world_pvp' && !('bracket' in lq) && !('dungeon_id' in lq), 'pvp tab: no bracket/dungeon sent');
ok(await p.getAttribute('#rk-tab-pvp', 'aria-selected') === 'true' && await p.evaluate(() => document.activeElement.id) === 'rk-tab-pvp', 'arrow-key tabs');
ok((await p.textContent('#rk-value-h')) === 'Honorable kills', 'pvp value header');
await p.goto(B + 'rankings.html?scope=all&period=30d'); await ready();
ok(!('scope' in await lastQ()) && !('period' in await lastQ()), 'old enum values from URL ignored');
ok(errs.length === 0, 'no page errors ' + errs.join('|'));
await b.close();
})();
