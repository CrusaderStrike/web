// web#38 public guild pages + /guilds browse. Run: node tools/build-guild-pages.js && node tests/e2e/guilds.e2e.js (site on http://localhost:8765).
const { chromium } = require('playwright');
const B = 'http://localhost:8765/';
const G = B + 'g/us/emberfall/knights-of-the-silver-hand/';
(async () => {
const b = await chromium.launch();
const errs = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const ctxFor = async (o) => { const c = await b.newContext(o); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };

// ---- no-JS: crawlers get the content
let p = await ctxFor({ javaScriptEnabled: false });
await p.goto(G);
ok(await p.textContent('h1') === 'Knights of the Silver Hand', 'no-JS: guild name in HTML');
ok((await p.textContent('#gp-content')).includes('Priest') && (await p.textContent('#gp-content')).includes('8:00 PM'), 'no-JS: needs + raid times present');
ok(await p.locator('.gp-raid-local').first().isHidden(), 'no-JS: local-time line hidden');
await p.goto(B + 'guilds/');
ok(await p.locator('#gl-list li').count() === 12 && await p.getAttribute('#gl-next', 'href') === '/guilds/page/2/', 'no-JS: browse page has cards + next link');
await p.click('#gl-next'); ok(p.url().endsWith('/guilds/page/2/') && await p.locator('#gl-list li').count() === 12, 'no-JS: static paging');
const r404 = await p.goto(B + 'g/us/emberfall/hidden-hand/'); ok(r404.status() === 404 || /Page not found/.test(await p.textContent('h1')), 'private guild has no page');

// ---- guild page with JS, viewer in Los Angeles
p = await ctxFor({ timezoneId: 'America/Los_Angeles' });
await p.goto(G); await p.waitForTimeout(400);
const local = await p.locator('.gp-raid-local').first().textContent();
ok(/^\(your time: Wed 5:00 PM–8:00 PM P[SD]T\)$/.test(local), 'raid time converted to viewer zone: ' + local);
ok(await p.isVisible('#gp-local-note') && (await p.textContent('.gp-tz')).includes('America/New York'), 'guild time zone noted');
ok(await p.getAttribute('.gp-apply', 'rel') === 'noopener nofollow ugc' && (await p.getAttribute('.gp-apply', 'href')).startsWith('https://discord.gg/'), 'discord CTA rel');
ok(await p.getAttribute('.gp-crest', 'src') === '/assets/crest-alliance.svg' && await p.getAttribute('.gp-crest', 'alt') === '', 'faction crest fallback (decorative)');
ok(await p.isHidden('#gp-status') || (await p.textContent('#gp-status')) === '', 'live check ok: no status');
// same zone -> no duplicate line
p = await ctxFor({ timezoneId: 'America/New_York' }); await p.goto(G); await p.waitForTimeout(300);
ok(await p.locator('.gp-raid-local').first().isHidden(), 'viewer in guild zone: no extra local line');
// 404 (went private since build) and 429
await p.goto(G + '?mock_scenario=notfound'); await p.waitForSelector('#gp-notfound:not([hidden])');
ok(await p.isHidden('#gp-content') && /not available/.test(await p.title()), '404 state');
await p.goto(G + '?mock_scenario=ratelimit'); await p.waitForFunction(() => document.getElementById('gp-status').textContent);
ok(/try again in 17 seconds/.test(await p.textContent('#gp-status')) && await p.isVisible('#gp-content'), '429 keeps saved copy + Retry-After');
// hostile content
await p.goto(B + 'g/' + await p.evaluate(() => CSGuildsMockData.GUILDS.find(g => g.guild_slug === 'night-and-co').region) + '/duskhollow/night-and-co/'); await p.waitForTimeout(300);
ok(await p.evaluate(() => !window.__x && !document.querySelector('.gp-pitch img, .gp-ingame script, .gp-ingame a')), 'hostile pitch/contact not parsed');
ok((await p.textContent('#gp-ingame-text')).startsWith('<script>') && !(await p.textContent('#gp-content')).includes(' members'), 'in-game text plain; null member count hidden');
// url contact
await p.goto(B + 'g/' + (await (await p.request.get(B + 'sitemap.xml')).text()).match(/g\/((?:us|eu|kr|tw)\/stormwatch-keep\/[a-z0-9-]+)\//)[1] + '/');
ok(await p.locator('h1').count() === 1, 'stormwatch keep guild page renders');

// ---- browse with JS
p = await ctxFor({});
const lastQ = () => p.evaluate(() => CSGuildsMock.lastQuery);
await p.goto(B + 'guilds/');
ok(await p.locator('#gl-list li').count() === 12 && await lastQ() === null, 'unfiltered: pre-rendered, no API call');
await p.check('input[name=role][value=healer]'); await p.waitForFunction(() => document.getElementById('gl-list').getAttribute('aria-busy') === 'false');
let q = await lastQ(); ok(JSON.stringify(q.role) === '["healer"]' && q.limit === 12 && p.url().endsWith('/guilds/?role=healer'), 'role filter sent + URL synced');
await p.check('input[name=class][value=priest]'); await p.waitForFunction(() => document.getElementById('gl-list').getAttribute('aria-busy') === 'false');
const n1 = await p.locator('#gl-list li').count();
await p.check('input[name=class][value=paladin]'); await p.waitForFunction(() => document.getElementById('gl-list').getAttribute('aria-busy') === 'false');
q = await lastQ(); ok(JSON.stringify(q['class']) === '["paladin","priest"]' && await p.locator('#gl-list li').count() >= n1, 'repeated class OR widens results');
await p.waitForTimeout(0);
const exp = await p.evaluate(() => CSGuildsMockData.GUILDS.filter(g => g.public_listed && g.recruiting_needs.some(n => n.role === 'healer' && (n['class'] === 'priest' || n['class'] === 'paladin'))).length);
ok(await p.locator('#gl-list li').count() === Math.min(exp, 12), 'AND within need: ' + exp);
await p.click('#gl-clear'); await p.waitForFunction(() => document.getElementById('gl-list').getAttribute('aria-busy') === 'false');
ok(await p.locator('#gl-list li').count() === 12 && !(await p.isHidden('#gl-next')), 'cleared: page 1 with next');
await p.click('#gl-next'); await p.waitForFunction(() => document.getElementById('gl-list').getAttribute('aria-busy') === 'false');
ok(typeof (await lastQ()).cursor === 'string' && (await p.textContent('#gl-page')) === 'Page 2' && await p.isVisible('#gl-prev'), 'cursor paging next');
await p.click('#gl-next'); await p.waitForFunction(() => document.getElementById('gl-list').getAttribute('aria-busy') === 'false');
ok(await p.locator('#gl-list li').count() === 32 - 24 && await p.isHidden('#gl-next'), 'last page');
await p.click('#gl-prev'); await p.waitForFunction(() => document.getElementById('gl-list').getAttribute('aria-busy') === 'false');
ok((await p.textContent('#gl-page')) === 'Page 2', 'prev');
await p.selectOption('#gl-realm', 'duskhollow'); await p.selectOption('#gl-faction', 'horde'); await p.waitForFunction(() => document.getElementById('gl-list').getAttribute('aria-busy') === 'false');
q = await lastQ(); ok(q.realm === 'duskhollow' && q.faction === 'horde' && !q.cursor, 'realm/faction filter resets paging');
ok((await p.$$eval('#gl-list .gl-meta', m => m.map(x => x.textContent))).every(t => /Horde/.test(t) && /Duskhollow/.test(t)), 'filtered cards');
await p.selectOption('#gl-region', 'eu'); await p.waitForFunction(() => document.getElementById('gl-list').getAttribute('aria-busy') === 'false');
q = await lastQ(); ok(q.region === 'eu' && p.url().includes('region=eu'), 'region filter sent + URL synced');
ok((await p.$$eval('#gl-list .gl-meta', m => m.map(x => x.textContent))).every(t => /\(Europe\)/.test(t)), 'region display name on cards');
await p.selectOption('#gl-region', '');
// twin guild in two regions
const p2 = await ctxFor({}); await p2.goto(B + 'g/eu/emberfall/knights-of-the-silver-hand/'); await p2.waitForTimeout(300);
ok((await p2.textContent('.gp-members')) === '41 members' && (await p2.textContent('.gp-realm')).includes('Europe') && await p2.isHidden('#gp-notfound'), 'EU twin page: own data, live check by region');
ok(await p2.getAttribute('link[rel=canonical]', 'href') === 'https://crusaderstrike.com/g/eu/emberfall/knights-of-the-silver-hand/', 'EU canonical has region');
ok((await p2.goto(B + 'g/kr/emberfall/knights-of-the-silver-hand/')).status() === 404, 'no KR twin -> 404 (Pages serves 404.html)');
// deep link
await p.goto(B + 'guilds/?region=us&realm=emberfall&role=tank&role=dps&class=bogus&faction=gnome'); await p.waitForFunction(() => CSGuildsMock.lastQuery && document.getElementById('gl-list').getAttribute('aria-busy') === 'false');
q = await lastQ(); ok(q.region === 'us' && q.realm === 'emberfall' && JSON.stringify(q.role) === '["tank","dps"]' && !q['class'] && !q.faction && await p.isChecked('input[name=role][value=dps]'), 'deep link restores valid filters, drops invalid');
// states
for (const [sc, re, m] of [['ratelimit', /17 seconds/, '429 Retry-After'], ['error', /went wrong/, '500'], ['network', /reach Crusader Strike/, 'network']]) {
  await p.goto(B + 'guilds/?realm=emberfall&mock_scenario=' + sc); await p.waitForSelector('#gl-error:not([hidden])');
  ok(re.test(await p.textContent('#gl-error-msg')), m + ': ' + await p.textContent('#gl-error-msg'));
}
await p.goto(B + 'guilds/?realm=emberfall&mock_scenario=empty'); await p.waitForSelector('#gl-empty:not([hidden])'); ok(true, 'empty state');
// no HTML sinks
const src = await p.evaluate(async () => { let s = ''; for (const f of ['/js/guilds-browse.js', '/js/guild-page.js', '/js/guilds-api.js', '/js/guilds-mock.js', '/js/guild-time.js']) s += await (await fetch(f)).text(); return s; });
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src), 'no HTML sinks in guild JS');

// ---- a11y + mobile
for (const url of [G, B + 'guilds/']) {
  p = await ctxFor({ viewport: { width: 375, height: 800 } }); await p.goto(url); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= 375), 'no horizontal overflow at 375px: ' + url.replace(B, '/'));
  const a = await p.evaluate(() => {
    const issues = [];
    if (document.documentElement.lang !== 'en') issues.push('lang');
    if (document.querySelectorAll('h1').length !== 1) issues.push('h1');
    document.querySelectorAll('img').forEach(i => { if (!i.hasAttribute('alt')) issues.push('img alt'); });
    document.querySelectorAll('input,select').forEach(i => { if (!(i.labels && i.labels.length)) issues.push('label ' + (i.id || i.name)); });
    const lum = c => { const v = c.match(/[\d.]+/g).slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const bg = el => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c) && !/gradient/.test(getComputedStyle(el).backgroundImage)) return c; if (/gradient/.test(getComputedStyle(el).backgroundImage)) return null; el = el.parentElement; } return 'rgb(11, 9, 7)'; };
    document.querySelectorAll('main p, main a, main td, main th, main label, main h1, main h2, main h3, main span, main legend').forEach(el => {
      if (!el.offsetParent || !el.textContent.trim() || el.closest('.cs-visually-hidden')) return;
      const b = bg(el); if (!b) return;
      const f = lum(getComputedStyle(el).color), g = lum(b), r = (Math.max(f, g) + 0.05) / (Math.min(f, g) + 0.05);
      if (r < 4.5) issues.push('contrast ' + r.toFixed(2) + ' ' + el.tagName + ':' + el.textContent.trim().slice(0, 20));
    });
    return issues;
  });
  ok(a.length === 0, 'a11y checks (lang, one h1, alt, labels, AA contrast) ' + url.replace(B, '/') + ' ' + a.slice(0, 5).join('; '));
  if (url === G) {
    await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.activeElement.className) === 'cs-skip-link', 'skip link first in tab order');
    await p.screenshot({ path: '/workspace/guild-page-mobile.png', fullPage: true });
  } else await p.screenshot({ path: '/workspace/guilds-browse-mobile.png', fullPage: true });
}
p = await ctxFor({ viewport: { width: 1280, height: 900 } }); await p.goto(G); await p.screenshot({ path: '/workspace/guild-page-desktop.png', fullPage: true });
const txt = await p.evaluate(() => document.body.innerText); ok(!/\b(retail|classic|season of discovery|undefined|null|NaN)\b/i.test(txt), 'WoW Forever wording, no undefined/null');
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
})().catch(e => { console.error(e); process.exit(1); });
