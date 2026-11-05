// web#38 static generator + mock contract tests (no browser). Run: node tests/guilds-build.test.js
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const B = require('../tools/build-guild-pages.js');
const D = require('../js/guilds-mock-data.js');
const T = require('../js/guild-time.js');
let n = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); n++; if (!c) process.exitCode = 1; };
(async () => {
  // ---- mock contract
  const pub = D.GUILDS.filter(g => g.public_listed);
  ok(D.REALMS.map(r => r[1]).join('|') === 'Emberfall|Duskhollow|Stormwatch Keep', 'only the three fictional Forever realms');
  ok(pub.every(g => D.REALMS.some(r => r[0] === g.realm_slug)), 'every guild on a mock realm');
  ok(pub.every(g => g.emblem_url === null), 'emblem_url always null');
  ok(pub.every(g => g.pitch.length <= 500 && T.validZone(g.raid_timezone)), 'pitch <= 500, raid_timezone valid IANA');
  ok(pub.every(g => g.recruiting_needs.every(x => x['class'] === x['class'].toLowerCase())), 'class lowercase');
  ok(pub.some(g => g.public_member_count === null) && pub.some(g => g.public_member_count != null), 'member count nullable');
  ok(['discord', 'url', 'in_game'].every(t => pub.some(g => g.contact.type === t)), 'all contact types present');
  ok(new Set(pub.map(g => g.region + '/' + g.realm_slug + '/' + g.guild_slug)).size === pub.length, 'slugs unique per region+realm');
  ok(pub.every(g => /^(us|eu|kr|tw)$/.test(g.region)) && ['us', 'eu', 'kr', 'tw'].every(r => pub.some(g => g.region === r)), 'guilds spread across us/eu/kr/tw');
  ok(pub.filter(g => g.realm_slug === 'emberfall' && g.guild_slug === 'knights-of-the-silver-hand').map(g => g.region).sort().join() === 'eu,us', 'same realm/guild slug in two regions');
  ok(D.detail('us', 'emberfall', 'knights-of-the-silver-hand').public_member_count === 87 && D.detail('eu', 'emberfall', 'knights-of-the-silver-hand').public_member_count === 41, 'detail keyed by region');
  ok(D.list({ region: 'eu', limit: 50 }).items.every(g => g.region === 'eu'), 'region filter');
  let re; try { D.list({ region: 'cn' }); } catch (x) { re = x; } ok(re && re.status === 400, 'unknown region 400');
  ok(Object.keys(D.sitemap({}).items[0]).sort().join() === 'guild_slug,realm_slug,region,updated_at', 'sitemap items carry region');
  const l1 = D.list({}); ok(l1.items.length === 25 && l1.next_cursor, 'list default limit 25 + cursor');
  const l2 = D.list({ cursor: l1.next_cursor }); ok(l2.items.length === pub.length - 25 && l2.next_cursor === null, 'list page 2 ends');
  ok(Object.keys(l1.items[0]).sort().join() === 'faction,guild_slug,name,open_roles,realm_name,realm_slug,recruiting,region,updated_at', 'list returns summary fields only');
  ok(!D.list({ limit: 50 }).items.some(g => g.guild_slug === 'hidden-hand'), 'private guild not listed');
  let e; try { D.detail('us', 'emberfall', 'hidden-hand'); } catch (x) { e = x; } ok(e && e.status === 404, 'private guild detail 404');
  e = null; try { D.detail('us', 'emberfall', 'nope'); } catch (x) { e = x; } ok(e && e.status === 404 && e.body.error.code === 'not_found', 'unknown guild same 404');
  e = null; try { D.list({ realm: 'stormwind' }); } catch (x) { e = x; } ok(e && e.status === 400, 'unknown realm filter 400');
  e = null; try { D.sitemap({ limit: 501 }); } catch (x) { e = x; } ok(e && e.status === 400, 'sitemap limit > 500 rejected');
  // AND within a need, OR across repeated values
  const and = D.list({ role: ['healer'], 'class': ['priest'], limit: 50 }).items.map(g => g.guild_slug);
  const byNeed = (f) => pub.filter(g => g.recruiting_needs.some(f)).map(g => g.guild_slug);
  ok(JSON.stringify(and) === JSON.stringify(byNeed(x => x.role === 'healer' && x['class'] === 'priest')), 'class+role AND within one need');
  const warTankOnly = pub.filter(g => g.recruiting_needs.some(x => x['class'] === 'warrior') && g.recruiting_needs.some(x => x.role === 'healer') && !g.recruiting_needs.some(x => x['class'] === 'warrior' && x.role === 'healer'));
  ok(!D.list({ role: ['healer'], 'class': ['warrior'], limit: 50 }).items.some(g => warTankOnly.some(w => w.guild_slug === g.guild_slug)), 'class and role in different needs do not match');
  const or = D.list({ role: ['tank', 'healer'], limit: 50 }).items.map(g => g.guild_slug);
  ok(JSON.stringify(or) === JSON.stringify(byNeed(x => x.role === 'tank' || x.role === 'healer')), 'repeated role values OR');
  const or2 = D.list({ 'class': ['mage', 'rogue'], role: ['dps'], limit: 50 }).items.length;
  ok(or2 === byNeed(x => (x['class'] === 'mage' || x['class'] === 'rogue') && x.role === 'dps').length, 'repeated class OR + role AND');
  ok(D.list({ realm: 'duskhollow', faction: 'horde', limit: 50 }).items.every(g => g.realm_slug === 'duskhollow' && g.faction === 'horde'), 'realm + faction filter');

  // ---- time
  const now = Date.UTC(2026, 10, 4, 12);
  const s = T.slot({ day: 'wed', start: '20:00', end: '23:00' }, 'America/New_York', now);
  ok(new Date(s.start).toISOString() === '2026-11-05T01:00:00.000Z' && s.end - s.start === 3 * 3600e3, 'Wed 20:00 New York -> 01:00Z');
  const o = T.slot({ day: 'sat', start: '22:00', end: '01:00' }, 'Europe/London', now);
  ok(o.end - o.start === 3 * 3600e3, 'past-midnight raid ends next day');
  const dst = T.slot({ day: 'sun', start: '20:00', end: '22:00' }, 'America/Los_Angeles', Date.UTC(2026, 2, 6));
  ok(new Date(dst.start).toISOString() === '2026-03-09T03:00:00.000Z', 'DST start handled (PDT -7)');

  // ---- sitemap cursor loop
  const sm = await B.collectSitemap(B.mockSource(), 5);
  ok(sm.items.length === pub.length && sm.pages === Math.ceil(pub.length / 5), 'sitemap loops cursor: ' + sm.pages + ' pages');
  let loopErr; try { await B.collectSitemap({ sitemap: () => Promise.resolve({ items: [], next_cursor: 'same' }) }, 500); } catch (x) { loopErr = x; }
  ok(loopErr && /repeated/.test(loopErr.message), 'repeating cursor aborts');

  // ---- live API source honours 429 Retry-After
  const calls = []; let first = true;
  const fakeFetch = (url) => { calls.push(url); const r429 = first; first = false;
    return Promise.resolve({ ok: !r429, status: r429 ? 429 : 200, headers: { get: k => k === 'Retry-After' ? '2' : null }, json: () => Promise.resolve({ items: [], next_cursor: null }) }); };
  const api = B.apiSource('https://api.example.test', { LIST: '/api/v1/public/guilds', DETAIL: '/api/v1/public/guilds/{region}/{realm_slug}/{guild_slug}', SITEMAP: '/api/v1/public/guilds/sitemap' }, { fetch: fakeFetch, sleepScale: 0 });
  await B.collectSitemap(api, 500);
  ok(calls.length === 2 && calls[0] === 'https://api.example.test/api/v1/public/guilds/sitemap?limit=500' && (await api.detail('eu', 'emberfall', 'x'), calls[2] === 'https://api.example.test/api/v1/public/guilds/eu/emberfall/x'), 'api source retries after 429, sitemap path + limit 500');

  // ---- full build into a temp dir
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'csg-'));
  const r = await B.build({ out, source: 'mock', now, origin: 'https://crusaderstrike.com' });
  ok(r.guilds === pub.length && r.indexPages === Math.ceil(pub.length / 12), 'build counts: ' + JSON.stringify(r));
  const page = fs.readFileSync(path.join(out, 'g/us/emberfall/knights-of-the-silver-hand/index.html'), 'utf8');
  ok(/<title>Knights of the Silver Hand — Emberfall \(US\) Alliance guild recruiting \| Crusader Strike<\/title>/.test(page), 'guild title');
  ok(/<link rel="canonical" href="https:\/\/crusaderstrike\.com\/g\/us\/emberfall\/knights-of-the-silver-hand\/">/.test(page), 'canonical');
  const desc = /<meta name="description" content="([^"]*)">/.exec(page)[1]; ok(desc.length <= 160 && /Emberfall/.test(desc), 'description <= 160: ' + desc.length);
  ok(['og:title', 'og:description', 'og:url', 'og:image', 'og:type'].every(p => page.includes('property="' + p + '"')) && page.includes('name="twitter:card" content="summary"'), 'OG + Twitter tags');
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(page)[1]);
  ok(ld['@type'] === 'Organization' && ld.name === 'Knights of the Silver Hand' && ld.url === 'https://crusaderstrike.com/g/us/emberfall/knights-of-the-silver-hand/' && ld.sameAs[0] === 'https://discord.gg/silverhand', 'JSON-LD Organization');
  ok(page.includes('87 members') && page.includes('World of Warcraft Forever') && page.includes('America/New York'), 'members, Forever badge, timezone shown');
  ok(/Wednesday<\/strong> 8:00 PM–11:00 PM/.test(page), 'raid time pre-rendered in guild time');
  ok(page.indexOf('Priest') < page.indexOf('Warrior') && page.indexOf('Warrior') < page.indexOf('Mage'), 'needs sorted by priority');
  ok(/href="https:\/\/discord\.gg\/silverhand" rel="noopener nofollow ugc"/.test(page), 'discord link rel=noopener nofollow ugc');
  ok(/<meta name="robots" content="noindex">/.test(page), 'mock build is noindex');
  const hostile = fs.readFileSync(path.join(out, 'g/' + pub.find(g => g.guild_slug === 'night-and-co').region + '/duskhollow/night-and-co/index.html'), 'utf8');
  ok(!/<img src=x|<script>window/.test(hostile) && hostile.includes('&lt;img src=x'), 'hostile pitch/contact escaped');
  const ldh = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(hostile)[1];
  ok(!/<\/script/i.test(ldh) && JSON.parse(ldh).description.includes('</script>'), 'JSON-LD cannot break out of script');
  ok(!/members<\/span>/.test(hostile) && !/class="gp-ingame"[^]*<a /.test(hostile.split('gp-apply-h')[1].split('</section>')[0]), 'null member count hidden; in-game contact not a link');
  const nullG = pub.find(g => g.public_member_count === null && g.guild_slug !== 'night-and-co');
  ok(!fs.readFileSync(path.join(out, 'g', nullG.region, nullG.realm_slug, nullG.guild_slug, 'index.html'), 'utf8').includes(' members'), 'null public_member_count hidden');
  ok(!fs.existsSync(path.join(out, 'g/us/emberfall/hidden-hand')), 'no page for private guild');
  const idx = fs.readFileSync(path.join(out, 'guilds/index.html'), 'utf8');
  ok((idx.match(/class="cs-card gl-card"/g) || []).length === 12 && idx.includes('rel="next" id="gl-next" href="/guilds/page/2/"'), 'index page 1: 12 cards + next link');
  const last = fs.readFileSync(path.join(out, 'guilds/page/' + r.indexPages + '/index.html'), 'utf8');
  ok(last.includes('<link rel="prev"') && !last.includes('<link rel="next"'), 'last index page prev only');
  const xml = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  ok((xml.match(/<url>/g) || []).length === pub.length + 2 && xml.includes('<loc>https://crusaderstrike.com/g/us/emberfall/knights-of-the-silver-hand/</loc><lastmod>2026-10-01T12:00:00Z</lastmod>') && xml.includes('<loc>https://crusaderstrike.com/g/eu/emberfall/knights-of-the-silver-hand/</loc>') && !xml.includes('hidden-hand'), 'sitemap.xml urls + lastmod');
  const robots = fs.readFileSync(path.join(out, 'robots.txt'), 'utf8');
  ok(/Sitemap: https:\/\/crusaderstrike\.com\/sitemap\.xml/.test(robots) && /Allow: \//.test(robots) && !/Disallow: \/g\//.test(robots), 'robots.txt');
  ok(/noindex/.test(fs.readFileSync(path.join(out, '404.html'), 'utf8')), '404.html noindex');
  const eu = fs.readFileSync(path.join(out, 'g/eu/emberfall/knights-of-the-silver-hand/index.html'), 'utf8');
  ok(eu.includes('41 members') && eu.includes('Emberfall · Europe') && eu.includes('href="https://crusaderstrike.com/g/eu/emberfall/knights-of-the-silver-hand/"') && !eu.includes('87 members'), 'EU twin page separate, region display name');
  ok(idx.includes('<option value="kr">Korea</option>') && idx.includes('<option value="tw">Taiwan</option>'), 'region filter options with display names');
  const all = fs.readdirSync(path.join(out, 'g')).join(' ') + idx + xml;
  ok(!/\b(retail|classic|season of discovery|undefined|NaN)\b/i.test(all), 'WoW Forever wording, no undefined');
  const live = fs.mkdtempSync(path.join(os.tmpdir(), 'csg-'));
  await B.build({ out: live, src: B.mockSource(), source: 'api', now });
  ok(!/noindex/.test(fs.readFileSync(path.join(live, 'g/us/emberfall/knights-of-the-silver-hand/index.html'), 'utf8')), 'api build is indexable');
  console.log(n + ' checks');
})().catch(e => { console.error(e); process.exit(1); });
