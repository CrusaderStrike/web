#!/usr/bin/env node
/**
 * web#38 static generator for public guild recruiting pages (crawlable without JavaScript).
 *
 * The site is plain static files on GitHub Pages (no server, no framework), so "pre-render" here means:
 * at deploy time this script reads the public guild API and writes real HTML files that Pages serves as-is:
 *   g/<region>/<realm_slug>/<guild_slug>/index.html   guild page (title, description, canonical, OG/Twitter, JSON-LD Organization)
 *   guilds/index.html, guilds/page/<n>/      browse index, every page linked so crawlers reach every guild
 *   sitemap.xml                              built by looping the API sitemap cursor (limit <= 500)
 *   robots.txt, 404.html                     404.html is what Pages serves for unknown or private guilds
 * Browser JS then enhances the pages (local raid times, filters, live refresh, 404/429 states).
 *
 * Usage: node tools/build-guild-pages.js [--source=mock|api] [--api=https://api.crusaderstrike.com]
 *        [--origin=https://crusaderstrike.com] [--out=.] [--sitemap-limit=500]
 * Default source follows USE_MOCK_GUILDS in js/config.js. Mock output is marked noindex.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('../js/guild-time.js');

const ROOT = path.join(__dirname, '..');
const LABEL = { warrior: 'Warrior', paladin: 'Paladin', hunter: 'Hunter', rogue: 'Rogue', priest: 'Priest', shaman: 'Shaman', mage: 'Mage', warlock: 'Warlock', druid: 'Druid',
  tank: 'Tank', healer: 'Healer', dps: 'DPS', high: 'High', medium: 'Medium', low: 'Low', alliance: 'Alliance', horde: 'Horde' };
const PRIO = { high: 0, medium: 1, low: 2 };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REGION_RE = /^(us|eu|kr|tw)$/;

function readConfig() {
  const sb = { window: {}, location: { hostname: 'localhost', search: '' } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8'), sb);
  return sb.window.CS_CONFIG;
}
function args(argv) {
  const o = {};
  argv.forEach(a => { const m = /^--([a-z-]+)=(.*)$/.exec(a); if (m) o[m[1]] = m[2]; });
  return o;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsonLd = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const httpsUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' ? u.href : null; } catch (e) { return null; } };
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

// ---------- data sources ----------
function mockSource() {
  const D = require('../js/guilds-mock-data.js');
  return { list: q => Promise.resolve(D.list(q)), detail: (rg, r, g) => Promise.resolve(D.detail(rg, r, g)), sitemap: q => Promise.resolve(D.sitemap(q)) };
}
function apiSource(base, paths, opts) {
  opts = opts || {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function get(p, tries) {
    tries = tries || 0;
    const res = await (opts.fetch || fetch)(base + p, { headers: { Accept: 'application/json' } });
    if (res.status === 429 && tries < 5) {   // anonymous per-IP limit: honour Retry-After, then retry
      const ra = parseInt(res.headers.get('Retry-After'), 10);
      await sleep((isNaN(ra) ? 5 : Math.min(ra, 120)) * 1000 * (opts.sleepScale == null ? 1 : opts.sleepScale));
      return get(p, tries + 1);
    }
    if (!res.ok) { const e = new Error('GET ' + p + ' -> ' + res.status); e.status = res.status; throw e; }
    return res.json();
  }
  const qs = q => { const p = new URLSearchParams(); Object.keys(q).forEach(k => { if (q[k] != null) p.set(k, String(q[k])); }); return p.toString(); };
  return {
    list: q => get(paths.LIST + '?' + qs(q)),
    detail: (rg, r, g) => get(paths.DETAIL.replace('{region}', encodeURIComponent(rg)).replace('{realm_slug}', encodeURIComponent(r)).replace('{guild_slug}', encodeURIComponent(g))),
    sitemap: q => get(paths.SITEMAP + '?' + qs(q))
  };
}

/** Loops next_cursor until exhausted. Guards against a cursor that repeats. */
async function collectSitemap(src, limit) {
  const out = [], seen = new Set(); let cursor = null, pages = 0;
  do {
    const page = await src.sitemap(cursor ? { limit, cursor } : { limit });
    pages++;
    (page.items || []).forEach(i => { if (REGION_RE.test(i.region) && SLUG.test(i.realm_slug) && SLUG.test(i.guild_slug)) out.push(i); });
    cursor = page.next_cursor || null;
    if (cursor && seen.has(cursor)) throw new Error('sitemap cursor repeated: ' + cursor);
    if (cursor) seen.add(cursor);
  } while (cursor);
  return { items: out, pages };
}

// ---------- HTML ----------
function head(o) {
  const t = [
    '<!DOCTYPE html>', '<html lang="en">', '<head>',
    '  <meta charset="utf-8">', '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>' + esc(o.title) + '</title>',
    '  <meta name="description" content="' + esc(o.description) + '">',
    '  <meta name="theme-color" content="#0b0907">'
  ];
  if (o.noindex) t.push('  <meta name="robots" content="noindex">');
  if (o.canonical) {
    t.push('  <link rel="canonical" href="' + esc(o.canonical) + '">');
    if (o.prev) t.push('  <link rel="prev" href="' + esc(o.prev) + '">');
    if (o.next) t.push('  <link rel="next" href="' + esc(o.next) + '">');
    t.push('  <meta property="og:type" content="' + (o.ogType || 'website') + '">', '  <meta property="og:site_name" content="Crusader Strike">',
      '  <meta property="og:title" content="' + esc(o.title) + '">', '  <meta property="og:description" content="' + esc(o.description) + '">',
      '  <meta property="og:url" content="' + esc(o.canonical) + '">', '  <meta property="og:image" content="' + esc(o.image) + '">',
      '  <meta property="og:image:alt" content="' + esc(o.imageAlt || 'Crusader Strike') + '">',
      '  <meta name="twitter:card" content="summary">', '  <meta name="twitter:title" content="' + esc(o.title) + '">',
      '  <meta name="twitter:description" content="' + esc(o.description) + '">', '  <meta name="twitter:image" content="' + esc(o.image) + '">');
  }
  if (o.jsonld) t.push('  <script type="application/ld+json">' + jsonLd(o.jsonld) + '</script>');
  t.push('  <link rel="icon" href="/assets/logo.svg" type="image/svg+xml">', '  <link rel="stylesheet" href="/css/design-system.css">',
    '  <link rel="stylesheet" href="/css/guilds.css">', '</head>', '<body>',
    '  <a class="cs-skip-link" href="#main">Skip to content</a>',
    '  <header class="cs-wrap cs-header">',
    '    <a class="cs-brand" href="/index.html"><img src="/assets/logo.svg" width="40" height="40" alt=""><span>Crusader Strike</span></a>',
    '    <nav aria-label="Primary"><ul class="cs-nav">',
    '      <li><a href="/index.html">Home</a></li>',
    '      <li><a href="/guilds/"' + (o.nav === 'guilds' ? ' aria-current="page"' : '') + '>Find a guild</a></li>',
    '      <li><a href="/rankings.html">Rankings</a></li>',
    '    </ul></nav>', '  </header>');
  return t.join('\n') + '\n';
}
function foot(scripts) {
  return ['  <footer class="cs-wrap cs-footer"><span>© Crusader Strike — World of Warcraft Forever guild recruiting</span><span><a href="/guilds/">Browse guilds</a></span></footer>']
    .concat((scripts || []).map(s => '  <script src="' + s + '"></script>')).concat(['</body>', '</html>', '']).join('\n');
}
const crest = f => '/assets/crest-' + (f === 'horde' ? 'horde' : 'alliance') + '.svg';
const guildPath = g => '/g/' + g.region + '/' + g.realm_slug + '/' + g.guild_slug + '/';
const badge = f => '<span class="cs-badge cs-badge-' + (f === 'horde' ? 'horde' : 'alliance') + '" aria-label="Faction: ' + LABEL[f] + '">' + LABEL[f] + '</span>';

function contactHtml(c) {
  if (!c) return '<p class="cs-muted">This guild has not listed a contact yet.</p>';
  const url = (c.type === 'discord' || c.type === 'url') ? httpsUrl(c.value) : null;
  if (url) {
    const label = c.type === 'discord' ? 'Join the guild Discord' : 'Apply on the guild website';
    return '<p><a class="cs-btn gp-apply" href="' + esc(url) + '" rel="noopener nofollow ugc" target="_blank">' + label +
      '<span class="cs-visually-hidden"> (opens in a new tab)</span></a></p><p class="cs-muted gp-contact-host">' + esc(new URL(url).host) + '</p>';
  }
  // in_game (or an invalid link): plain text, never a link
  return '<p class="gp-ingame"><span class="gp-ingame-label">In game:</span> <span id="gp-ingame-text">' + esc(c.value) + '</span></p>';
}

function renderGuild(g, ctx) {
  const url = ctx.origin + guildPath(g);
  const rn = ctx.regionNames[g.region];
  const tzOk = T.validZone(g.raid_timezone);
  const tz = tzOk ? g.raid_timezone : 'UTC';
  const title = g.name + ' — ' + g.realm_name + ' (' + rn + ') ' + LABEL[g.faction] + ' guild' + (g.recruiting ? ' recruiting' : '') + ' | Crusader Strike';
  const needsTxt = g.recruiting && g.recruiting_needs.length ? 'Recruiting ' + g.recruiting_needs.map(n => LABEL[n.class] + ' ' + LABEL[n.role]).join(', ') + '. ' : '';
  const description = clip(LABEL[g.faction] + ' World of Warcraft Forever guild on ' + g.realm_name + ' (' + rn + '). ' + needsTxt + g.pitch, 160);
  const ld = { '@context': 'https://schema.org', '@type': 'Organization', name: g.name, url, description: clip(g.pitch, 500), logo: ctx.origin + crest(g.faction),
    location: { '@type': 'Place', name: g.realm_name + ', ' + rn + ' (World of Warcraft Forever)' } };
  const same = g.contact && g.contact.type !== 'in_game' ? httpsUrl(g.contact.value) : null;
  if (same) ld.sameAs = [same];
  const needs = g.recruiting_needs.slice().sort((a, b) => PRIO[a.priority] - PRIO[b.priority] || a['class'].localeCompare(b['class']));
  const now = ctx.now;
  const sched = g.raid_schedule.map(s => {
    const sl = T.slot(s, tz, now);
    return '        <li class="gp-raid" data-day="' + esc(s.day) + '" data-start="' + esc(s.start) + '" data-end="' + esc(s.end) + '">' +
      '<span class="gp-raid-guild"><strong>' + T.DAY_NAMES[s.day] + '</strong> ' + esc(T.fmtTime(sl.start, tz)) + '–' + esc(T.fmtTime(sl.end, tz)) +
      ' <span class="cs-muted">guild time</span></span> <span class="gp-raid-local" hidden></span></li>';
  }).join('\n');
  let h = head({ title, description, canonical: url, image: ctx.origin + crest(g.faction), imageAlt: LABEL[g.faction] + ' crest', ogType: 'profile', noindex: ctx.noindex, jsonld: ld });
  h += `  <main id="main" class="cs-wrap cs-section gp" data-region="${esc(g.region)}" data-realm="${esc(g.realm_slug)}" data-guild="${esc(g.guild_slug)}" data-updated="${esc(g.updated_at)}" data-tz="${esc(tz)}">
    <p class="cs-muted gp-crumbs"><a href="/guilds/">Guilds</a> / <a href="/guilds/?region=${esc(g.region)}">${esc(rn)}</a> / <a href="/guilds/?region=${esc(g.region)}&amp;realm=${esc(g.realm_slug)}">${esc(g.realm_name)}</a></p>
    <p id="gp-status" class="gp-status" role="status" aria-live="polite"></p>
    <div id="gp-notfound" class="cs-card gp-state" hidden>
      <h2>This guild page is not available</h2>
      <p>The guild may have made its page private or changed its name. <a href="/guilds/">Browse recruiting guilds</a>.</p>
    </div>
    <article id="gp-content">
      <header class="gp-banner gp-banner-${g.faction === 'horde' ? 'horde' : 'alliance'}">
        <img class="gp-crest" src="${crest(g.faction)}" width="96" height="96" alt="">
        <div>
          <h1 class="cs-display gp-name">${esc(g.name)}</h1>
          <p class="gp-meta">${badge(g.faction)} <span class="cs-badge gp-forever">World of Warcraft Forever</span> <span class="cs-badge gp-realm">${esc(g.realm_name)} · ${esc(rn)}</span>
            <span class="cs-badge ${g.recruiting ? 'gp-open' : 'gp-closed'}">${g.recruiting ? 'Recruiting' : 'Not recruiting'}</span>${g.public_member_count != null ? ` <span class="gp-members">${esc(g.public_member_count)} members</span>` : ''}</p>
        </div>
      </header>
      <div class="gp-grid">
        <section class="cs-card" aria-labelledby="gp-about-h">
          <h2 id="gp-about-h">About the guild</h2>
          <p class="gp-pitch">${esc(g.pitch)}</p>
        </section>
        <section class="cs-card" aria-labelledby="gp-apply-h">
          <h2 id="gp-apply-h">How to apply</h2>
          ${contactHtml(g.contact)}
        </section>
        <section class="cs-card" aria-labelledby="gp-needs-h">
          <h2 id="gp-needs-h">Recruiting</h2>
${g.recruiting && needs.length ? `          <div class="cs-table-wrap"><table class="cs-table gp-needs">
            <caption class="cs-visually-hidden">Classes and roles ${esc(g.name)} is recruiting, highest priority first</caption>
            <thead><tr><th scope="col">Class</th><th scope="col">Role</th><th scope="col">Priority</th></tr></thead>
            <tbody>
${needs.map(n => `              <tr><td><span class="gp-class gp-class-${n['class']}">${LABEL[n['class']]}</span></td><td>${LABEL[n.role]}</td><td><span class="gp-prio gp-prio-${n.priority}">${LABEL[n.priority]}</span></td></tr>`).join('\n')}
            </tbody>
          </table></div>` : `          <p class="cs-muted">${esc(g.name)} is not recruiting right now.</p>`}
        </section>
        <section class="cs-card" aria-labelledby="gp-raids-h">
          <h2 id="gp-raids-h">Raid times</h2>
${sched ? `      <ul class="gp-raids">\n${sched}\n      </ul>` : '          <p class="cs-muted">No raid schedule listed.</p>'}
          <p class="cs-muted gp-tz">Guild time zone: <span id="gp-tz-name">${esc(tz.replace(/_/g, ' '))}</span>.<span id="gp-local-note" hidden> Times marked “your time” are shown in your time zone.</span></p>
        </section>
      </div>
      <p class="cs-muted gp-updated">Last updated <time datetime="${esc(g.updated_at)}">${esc(g.updated_at.slice(0, 10))}</time></p>
    </article>
  </main>
`;
  return h + foot(['/js/config.js', '/js/guilds-mock-data.js', '/js/guilds-mock.js', '/js/guilds-api.js', '/js/guild-time.js', '/js/guild-page.js']);
}

function card(g, ctx) {
  return `        <li class="cs-card gl-card">
          <img class="gl-crest" src="${crest(g.faction)}" width="48" height="48" alt="">
          <div>
            <h3 class="gl-name"><a href="${guildPath(g)}">${esc(g.name)}</a></h3>
            <p class="gl-meta">${badge(g.faction)} <span>${esc(g.realm_name)} (${esc(ctx.regionNames[g.region])})</span> · <span>${g.recruiting ? (g.open_roles.length ? 'Recruiting ' + g.open_roles.map(r => LABEL[r]).join(', ') : 'Recruiting') : 'Not recruiting'}</span></p>
          </div>
        </li>`;
}
const opt = (v, l) => `<option value="${v}">${l}</option>`;
const checks = (name, vals) => vals.map(v => `<label class="gl-check"><input type="checkbox" name="${name}" value="${v}"> ${LABEL[v]}</label>`).join('\n            ');

function renderIndex(pageItems, n, total, ctx) {
  const url = ctx.origin + (n === 1 ? '/guilds/' : '/guilds/page/' + n + '/');
  const link = k => k === 1 ? '/guilds/' : '/guilds/page/' + k + '/';
  const title = 'Find a World of Warcraft Forever guild' + (n > 1 ? ' — page ' + n : '') + ' | Crusader Strike';
  const description = 'Browse recruiting World of Warcraft Forever guilds on Emberfall, Duskhollow and Stormwatch Keep. Filter by region, realm, faction, class and role.';
  let h = head({ title, description, canonical: url, image: ctx.origin + '/assets/logo.svg', nav: 'guilds', noindex: ctx.noindex,
    prev: n > 1 ? ctx.origin + link(n - 1) : null, next: n < total ? ctx.origin + link(n + 1) : null,
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'World of Warcraft Forever guilds', url } });
  h += `  <main id="main" class="cs-wrap cs-section gl" data-page="${n}">
    <h1 class="cs-display">Find a guild</h1>
    <p class="cs-section-intro">Public World of Warcraft Forever guilds that are looking for players. Pick a realm, faction, class or role.</p>
    <form id="gl-filters" class="cs-card gl-filters" role="search" aria-label="Guild filters" action="/guilds/" method="get">
      <div class="gl-row">
        <div class="cs-field"><label for="gl-region">Region</label>
          <select id="gl-region" name="region">${opt('', 'Any region')}${Object.keys(ctx.regionNames).map(k => opt(k, ctx.regionNames[k])).join('')}</select></div>
        <div class="cs-field"><label for="gl-realm">Realm</label>
          <select id="gl-realm" name="realm">${opt('', 'Any realm')}${ctx.realms.map(r => opt(r[0], esc(r[1]))).join('')}</select></div>
        <div class="cs-field"><label for="gl-faction">Faction</label>
          <select id="gl-faction" name="faction">${opt('', 'Any faction')}${opt('alliance', 'Alliance')}${opt('horde', 'Horde')}</select></div>
      </div>
      <fieldset class="gl-set"><legend>Role</legend>
            ${checks('role', ctx.roles)}
      </fieldset>
      <fieldset class="gl-set"><legend>Class</legend>
            ${checks('class', ctx.classes)}
      </fieldset>
      <p class="cs-muted gl-hint" id="gl-hint">Picking a class and a role finds guilds that need that class in that role. Picking several of one kind matches any of them.</p>
      <p class="gl-actions"><button type="submit" class="cs-btn">Show guilds</button> <button type="button" class="cs-btn cs-btn-ghost" id="gl-clear">Clear filters</button></p>
    </form>
    <p id="gl-status" class="gl-status" role="status" aria-live="polite"></p>
    <div id="gl-error" class="cs-card gl-state" role="alert" hidden><h2>Guilds could not load</h2><p id="gl-error-msg"></p><button type="button" class="cs-btn cs-btn-ghost cs-btn-sm" id="gl-retry">Try again</button></div>
    <div id="gl-empty" class="cs-card gl-state" hidden><h2>No guilds match</h2><p>Try fewer filters or another realm.</p></div>
    <h2 class="cs-visually-hidden" id="gl-results-h">Guilds</h2>
    <ul class="gl-list" id="gl-list" aria-labelledby="gl-results-h">
${pageItems.map(g => card(g, ctx)).join('\n')}
    </ul>
    <nav class="gl-pager" aria-label="Guild pages" id="gl-pager">
      ${n > 1 ? `<a class="cs-btn cs-btn-ghost" rel="prev" id="gl-prev" href="${link(n - 1)}">Previous</a>` : `<a class="cs-btn cs-btn-ghost" id="gl-prev" hidden>Previous</a>`}
      <span id="gl-page" class="cs-muted">Page ${n}${total > 1 ? ' of ' + total : ''}</span>
      ${n < total ? `<a class="cs-btn cs-btn-ghost" rel="next" id="gl-next" href="${link(n + 1)}">Next</a>` : `<a class="cs-btn cs-btn-ghost" id="gl-next" hidden>Next</a>`}
    </nav>
  </main>
`;
  return h + foot(['/js/config.js', '/js/guilds-mock-data.js', '/js/guilds-mock.js', '/js/guilds-api.js', '/js/faction-badge.js', '/js/guilds-browse.js']);
}

function render404(ctx) {
  return head({ title: 'Page not found | Crusader Strike', description: 'This page does not exist or is private.', noindex: true }) +
`  <main id="main" class="cs-wrap cs-section">
    <h1 class="cs-display">Page not found</h1>
    <p>We couldn’t find that page. If you followed a guild link, the guild may have made its page private or changed its name.</p>
    <p><a class="cs-btn" href="/guilds/">Browse recruiting guilds</a> <a class="cs-btn cs-btn-ghost" href="/index.html">Home</a></p>
  </main>
` + foot([]);
}

function renderSitemap(rows, ctx) {
  const x = s => esc(s);
  const urls = [{ loc: ctx.origin + '/' }, { loc: ctx.origin + '/guilds/' }].concat(rows.map(r => ({ loc: ctx.origin + guildPath(r), lastmod: r.updated_at })));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '  <url><loc>' + x(u.loc) + '</loc>' + (u.lastmod ? '<lastmod>' + x(u.lastmod) + '</lastmod>' : '') + '</url>').join('\n') + '\n</urlset>\n';
}
function renderRobots(ctx) {
  return ['User-agent: *', 'Allow: /', 'Disallow: /profile/', 'Disallow: /gear/', 'Disallow: /signin.html', 'Disallow: /styleguide.html', '', 'Sitemap: ' + ctx.origin + '/sitemap.xml', ''].join('\n');
}

async function build(opts) {
  opts = opts || {};
  const cfg = readConfig();
  const out = opts.out || ROOT;
  const sourceKind = opts.source || (cfg.USE_MOCK_GUILDS ? 'mock' : 'api');
  const src = opts.src || (sourceKind === 'mock' ? mockSource() : apiSource(opts.api || cfg.API_BASE, cfg.GUILDS_PATHS, opts));
  const D = require('../js/guilds-mock-data.js');
  const ctx = { origin: (opts.origin || cfg.SITE_ORIGIN).replace(/\/$/, ''), noindex: sourceKind === 'mock', now: opts.now || Date.now(),
    regionNames: cfg.GUILD_REGIONS, realms: D.REALMS, roles: D.ROLES, classes: D.CLASSES };
  const sm = await collectSitemap(src, +(opts['sitemap-limit'] || opts.sitemapLimit || 500));
  // Detail pages (only guilds the sitemap lists = public_listed). A 404 between calls means it went private: skip it.
  const guilds = [];
  for (const r of sm.items) {
    try { guilds.push(await src.detail(r.region, r.realm_slug, r.guild_slug)); } catch (e) { if (e.status !== 404) throw e; }
  }
  const gdir = path.join(out, 'g'); fs.rmSync(gdir, { recursive: true, force: true });
  const pdir = path.join(out, 'guilds', 'page'); fs.rmSync(pdir, { recursive: true, force: true });
  for (const g of guilds) {
    const d = path.join(gdir, g.region, g.realm_slug, g.guild_slug); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), renderGuild(g, ctx));
  }
  const size = cfg.GUILDS_PAGE_SIZE, total = Math.max(1, Math.ceil(guilds.length / size));
  for (let n = 1; n <= total; n++) {
    const d = n === 1 ? path.join(out, 'guilds') : path.join(pdir, String(n)); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), renderIndex(guilds.slice((n - 1) * size, n * size), n, total, ctx));
  }
  fs.writeFileSync(path.join(out, 'sitemap.xml'), renderSitemap(guilds, ctx));
  fs.writeFileSync(path.join(out, 'robots.txt'), renderRobots(ctx));
  fs.writeFileSync(path.join(out, '404.html'), render404(ctx));
  return { guilds: guilds.length, indexPages: total, sitemapPages: sm.pages, source: sourceKind };
}

module.exports = { build, collectSitemap, apiSource, mockSource, renderGuild, esc, jsonLd };
if (require.main === module) {
  build(args(process.argv.slice(2))).then(r => console.log('built ' + r.guilds + ' guild pages, ' + r.indexPages + ' index pages, ' + r.sitemapPages + ' sitemap API pages (source: ' + r.source + ')'))
    .catch(e => { console.error(e.message); process.exit(1); });
}
