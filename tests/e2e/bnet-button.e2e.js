// web#51: Battle.net sign-in buttons (look only). Class, accessible text and href at every entry point,
// plus AA contrast and a visible focus ring. signin.html stub is covered by signin.e2e.js.
const { chromium } = require('playwright');
const B = 'http://localhost:' + (process.env.CS_E2E_PORT || 8765) + '/';
(async () => {
  const b = require('./_test-config.js').withTestConfig(await chromium.launch());
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const vis = s => p.waitForSelector(s + ':not([hidden])', { timeout: 5000 }).then(() => true, () => false);
  const lum = c => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(x => +x / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const style = sel => p.$eval(sel, e => { const s = getComputedStyle(e); return { bg: s.backgroundColor, fg: s.color, img: s.backgroundImage, ow: s.outlineWidth, os: s.outlineStyle, oc: s.outlineColor }; });
  const START = 'https://api.crusaderstrike.com/api/v1/auth/blizzard/login';
  const RT = v => START + '?return_to=' + encodeURIComponent(v); const STATIC = RT('/profile/');
  const points = [
    { url: 'index.html?ff_bnet=1', wait: '#nav-bnet', sel: '#nav-bnet a', role: 'link', name: 'Login / Create account with Battle.net', href: RT('/profile/'), compact: true },
    { url: 'index.html?ff_bnet=1', wait: '#hero-bnet', sel: '#hero-bnet', role: 'link', name: 'Sign in with Battle.net', href: RT('/profile/') },
    { url: 'profile/?ff_bnet=1', wait: '#pf-signedout', sel: '#pf-signin', role: 'link', name: 'Sign in with Battle.net', href: RT('/profile/?ff_bnet=1') },
    { url: 'gear/?character=ch_us_1001&ff_bnet=1', wait: '#gr-signedout', sel: '#gr-signin', role: 'link', name: 'Sign in with Battle.net', href: RT('/gear/?character=ch_us_1001&ff_bnet=1') },
    { url: 'gear/lists/?character=ch_us_1001&ff_bnet=1', wait: '#gl-signedout', sel: '#gl-signin', role: 'link', name: 'Sign in with Battle.net', href: RT('/gear/lists/?character=ch_us_1001&ff_bnet=1') },
  ];
  for (const t of points) {
    await p.goto(B + t.url); const shown = await vis(t.wait); const tag = t.url.split('?')[0] + ' ' + t.sel;
    ok(shown && await p.isVisible(t.sel), tag + ': visible');
    const cls = await p.$eval(t.sel, e => e.className);
    ok(/\bcs-btn-bnet\b/.test(cls) && !/cs-btn-primary/.test(cls), tag + ': has .cs-btn-bnet (' + cls + ')');
    ok(/cs-btn-bnet--compact/.test(cls) === !!t.compact, tag + ': compact variant ' + (t.compact ? 'on' : 'off'));
    const named = p.getByRole(t.role, { name: t.name, exact: true });
    ok(await named.count() >= 1 && await named.first().evaluate((e, s) => e === document.querySelector(s), t.sel), tag + ': accessible name "' + t.name + '"');
    ok(!/®/.test(await p.textContent(t.sel)), tag + ': no ® in label');
    ok(await p.getAttribute(t.sel, 'href') === t.href, tag + ': JS on return_to href ' + t.href);
    const s = await style(t.sel);
    ok(s.img === 'none' && s.bg === 'rgb(0, 116, 224)' && s.fg === 'rgb(255, 255, 255)', tag + ': solid Blizzard blue ' + s.bg);
    ok(ratio(s.bg, s.fg) >= 4.5, tag + ': contrast ' + ratio(s.bg, s.fg).toFixed(2) + ':1 >= 4.5');
    await p.hover(t.sel); const h = await style(t.sel);
    ok(ratio(h.bg, h.fg) >= 4.5 && h.bg !== s.bg, tag + ': hover ' + h.bg + ' contrast ' + ratio(h.bg, h.fg).toFixed(2));
    await p.mouse.move(0, 0);
    await p.focus(t.sel); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab');
    const f = await style(t.sel); const isF = await p.$eval(t.sel, e => e === document.activeElement && e.matches(':focus-visible'));
    ok(isF && f.os !== 'none' && parseFloat(f.ow) >= 2, tag + ': keyboard focus-visible ring ' + f.ow + ' ' + f.oc);
  }
  // JS off: every control keeps the static return_to=/profile/ href (raw HTML is what a no-JS browser follows).
  for (const t of points) {
    const html = await (await p.request.get(B + t.url)).text(); const id = t.sel === '#nav-bnet a' ? 'nav-bnet' : t.sel.slice(1);
    const m = html.match(new RegExp('id="' + id + '"[^>]*>\\s*<a [^>]*href="([^"]+)"|<a [^>]*id="' + id + '"[^>]*href="([^"]+)"|<a [^>]*href="([^"]+)"[^>]*id="' + id + '"'));
    const href = m && (m[1] || m[2] || m[3]); ok(href === STATIC, t.url.split('?')[0] + ' ' + t.sel + ': JS off href ' + href);
  }
  const nj = await b.newContext({ javaScriptEnabled: false }); const q = await nj.newPage();
  for (const t of points.slice(2)) { await q.goto(B + t.url); ok(await q.getAttribute(t.sel, 'href') === STATIC, t.url.split('?')[0] + ' ' + t.sel + ': JS-off page keeps return_to=/profile/'); }
  await nj.close();
  // auth= and reason= are stripped; home (/ and /index.html) uses /profile/.
  await p.goto(B + 'profile/?ff_bnet=1&auth=error&reason=denied'); await vis('#pf-signedout');
  ok(await p.getAttribute('#pf-signin', 'href') === RT('/profile/?ff_bnet=1'), 'auth=/reason= stripped from return_to');
  await p.goto(B + '?ff_bnet=1'); await vis('#hero-bnet'); ok(await p.getAttribute('#hero-bnet', 'href') === STATIC, '/ (home): return_to=/profile/');
  // Platform contract: ':' or backslash in the path, or a leading '//', sends /profile/ instead.
  await p.goto(B + 'profile/?ff_bnet=1'); await vis('#pf-signedout');
  for (const [path, want] of [['/foo:bar/', '/profile/'], ['/a%3Ab/', '/profile/'], ['/a%5Cb/', '/profile/'], ['//evil.example/x', '/profile/'], ['/gear/?x=1', '/gear/?x=1']]) {
    const got = await p.evaluate(u => { history.replaceState(null, '', location.origin + u); return window.csBnetReturnTo(); }, path);
    ok(got === want, 'unsafe-path guard ' + path + ' -> ' + got);
  }
  // Session-expired states reuse the same signed-out button (only the heading/copy changes).
  for (const [u, sec, sel] of [['profile/index.html', 'pf-signedout', 'pf-signin'], ['gear/lists/index.html', 'gl-signedout', 'gl-signin']]) {
    await p.goto(B + u); ok(await p.$eval('#' + sec, (e, s) => { const a = e.querySelectorAll('a.cs-btn'); return a.length === 1 && a[0].id === s; }, sel), u + ': expired + signed-out share #' + sel);
  }
  // Disabled state keeps AA (aria-disabled on a link).
  await p.goto(B + 'index.html?ff_bnet=1'); await vis('#hero-bnet');
  await p.$eval('#hero-bnet', e => e.setAttribute('aria-disabled', 'true')); const d = await style('#hero-bnet');
  ok(ratio(d.bg, d.fg) >= 4.5 && d.bg !== 'rgb(0, 116, 224)', 'disabled: distinct ' + d.bg + ', contrast ' + ratio(d.bg, d.fg).toFixed(2));
  // Footer credit line on every page; nav reveal still demotes other hero primaries.
  for (const u of ['index.html', 'rankings.html', 'guild.html', 'leaderboards.html', 'styleguide.html', 'profile/', 'gear/', 'gear/lists/']) {
    await p.goto(B + u); ok((await p.textContent('footer.cs-footer')).includes('Battle.net is a trademark or registered trademark of Blizzard Entertainment, Inc.'), u + ': footer trademark line');
  }
  // Hero: redirect line + fan-site disclaimer under the main button.
  await p.goto(B + 'index.html?ff_bnet=1'); await vis('#hero-bnet-notes');
  ok((await p.textContent('#hero-bnet-redirect')).trim() === "You'll be redirected to the official Battle.net sign-in page.", 'hero: redirect line');
  ok(/fan site/.test(await p.textContent('#hero-bnet-disclaimer')) && /not affiliated with or endorsed by Blizzard/.test(await p.textContent('#hero-bnet-disclaimer')), 'hero: fan-site disclaimer');
  ok(await p.$eval('#hero-bnet-notes', (n) => n.compareDocumentPosition(document.getElementById('hero-bnet')) & Node.DOCUMENT_POSITION_PRECEDING), 'hero: notes sit under the button');
  for (const sel of ['#hero-bnet-redirect', '#hero-bnet-disclaimer']) { const c = await p.$eval(sel, e => getComputedStyle(e).color); ok(ratio(c, 'rgb(11, 9, 7)') >= 4.5, sel + ' contrast ' + ratio(c, 'rgb(11, 9, 7)').toFixed(2)); }
  // Protected pages: short notice with the button, and no automatic redirect.
  for (const [u, sec, pre] of [['profile/?ff_bnet=1', 'pf-signedout', 'pf'], ['gear/?character=ch_us_1001&ff_bnet=1', 'gr-signedout', 'gr'], ['gear/lists/?character=ch_us_1001&ff_bnet=1', 'gl-signedout', 'gl']]) {
    await p.goto(B + u); await vis('#' + sec); await p.waitForTimeout(400);
    ok((await p.textContent('#' + pre + '-signin-notice')).trim() === 'Sign in to view this page.' && await p.isVisible('#' + pre + '-signin'), u + ': "Sign in to view this page." + button');
    ok(p.url() === B + u, u + ': no automatic redirect');
  }
  // No login input fields anywhere.
  for (const u of ['index.html?ff_bnet=1', 'signin.html', 'profile/?ff_bnet=1', 'gear/?character=ch_us_1001&ff_bnet=1', 'gear/lists/?character=ch_us_1001&ff_bnet=1', 'guild.html', 'rankings.html', 'leaderboards.html']) {
    const html = await (await p.request.get(B + u.split('?')[0])).text();
    ok(!/type=["']?(password|email)|autocomplete=["']?(username|current-password|email)/i.test(html), u + ': no login input fields');
  }
  ok(await (await p.request.get(B + 'img/brand/battlenet-mark.svg')).status() === 404, 'text-only: no Battle.net mark asset shipped');
  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  await b.close();
})();
