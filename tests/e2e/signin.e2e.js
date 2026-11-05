// web#51: signin.html is a redirect stub to the platform start-auth URL (GitHub Pages has no 301/302).
// No form, no inputs, noindex, lands on start-auth; the callback coming back (?auth=) goes to the profile, no OAuth loop.
const { chromium } = require('playwright');
const B = 'http://localhost:' + (process.env.CS_E2E_PORT || 8765) + '/';
const START = 'https://api.crusaderstrike.com/api/v1/auth/blizzard/login';
(async () => {
  const b = require('./_test-config.js').withTestConfig(await chromium.launch());
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const ctx = await b.newContext(); const p = await ctx.newPage(); const hits = [];
  await ctx.route('https://api.crusaderstrike.com/**', r => { hits.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>start-auth</p>' }); });
  // Static check of the stub before any script runs.
  const raw = await (await p.request.get(B + 'signin.html')).text();
  ok(!/<(form|input|textarea|select|button)\b/i.test(raw) && !/contenteditable|type=["']?password|autocomplete/i.test(raw), 'signin.html: no form, inputs or form-like controls');
  ok(/<meta name="robots" content="noindex">/.test(raw), 'signin.html: robots noindex');
  ok(raw.includes('http-equiv="refresh" content="0; url=' + START + '"') && raw.includes("location.replace('" + START + "')"), 'signin.html: meta refresh + location.replace to start-auth');
  ok(raw.includes('Redirecting to Battle.net sign-in…') && raw.includes('<a href="' + START + '">'), 'signin.html: redirect line + plain link to start-auth');
  ok(!/return_to/.test(raw.replace(/<!--[\s\S]*?-->/g, '')), 'signin.html: no return_to sent');
  await p.goto(B + 'signin.html'); await p.waitForURL(u => u.href.startsWith(START), { timeout: 5000 }).catch(() => {});
  ok(p.url() === START && hits[0] === START, 'signin.html lands on start-auth: ' + p.url());
  // JS off: the noscript meta refresh still lands on start-auth.
  const nj = await b.newContext({ javaScriptEnabled: false }); const q = await nj.newPage();
  await nj.route('https://api.crusaderstrike.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
  await q.goto(B + 'signin.html'); await q.waitForURL(u => u.href.startsWith(START), { timeout: 5000 }).catch(() => {});
  ok(q.url() === START, 'JS off: meta refresh lands on start-auth');
  // Platform default return_to is /signin.html: the callback's ?auth=ok|error must not restart OAuth.
  hits.length = 0; await p.goto(B + 'signin.html?auth=ok'); await p.waitForURL(/\/profile\/\?auth=ok$/, { timeout: 5000 }).catch(() => {});
  ok(/\/profile\/\?auth=ok$/.test(p.url()) && hits.length === 0, 'callback return (?auth=ok) goes to profile, no OAuth loop: ' + p.url());
  // Leaderboards caption (kept from the old suite).
  await p.goto(B + 'leaderboards.html'); await p.selectOption('#filter-realm', 'Emberfall'); await p.click('button.cs-sort[data-sort=score]');
  const c2 = await p.textContent('#lb-caption'); ok(c2.includes('Emberfall') && c2.includes('sorted by Score, descending'), 'caption reflects filter+sort');
  await b.close();
})();
