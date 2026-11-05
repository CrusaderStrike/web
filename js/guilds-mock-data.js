/**
 * web#38 fictional public-guild data + query logic, shaped like the platform draft contract
 * (/workspace/groom/public-guild-api.md, amended): GET /api/v1/public/guilds, /{realm_slug}/{guild_slug}, /sitemap.
 * Shared by the in-browser mock (js/guilds-mock.js) and the static generator (tools/build-guild-pages.js).
 * WoW Forever only. Realms: Emberfall, Duskhollow, Stormwatch Keep. No PII: no characters, BattleTags or rosters.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CSGuildsMockData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var REGIONS = ['us', 'eu', 'kr', 'tw'];
  var REALMS = [['emberfall', 'Emberfall'], ['duskhollow', 'Duskhollow'], ['stormwatch-keep', 'Stormwatch Keep']];
  var CLASSES = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];
  var ROLES = ['tank', 'healer', 'dps'];
  var CLASS_ROLES = { warrior: ['tank', 'dps'], paladin: ['tank', 'healer', 'dps'], hunter: ['dps'], rogue: ['dps'],
    priest: ['healer', 'dps'], shaman: ['healer', 'dps'], mage: ['dps'], warlock: ['dps'], druid: ['tank', 'healer', 'dps'] };
  var TZ = ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Australia/Sydney'];
  var A = ['Ashen', 'Silver', 'Gilded', 'Crimson', 'Hollow', 'Iron', 'Verdant', 'Ember', 'Storm', 'Dusk', 'Sable'];
  var B = ['Vanguard', 'Covenant', 'Lantern', 'Oath', 'Wardens', 'Circle', 'Banner', 'Accord', 'Watch', 'Compact'];
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function build() {
    var out = [];
    for (var i = 0; i < 31; i++) {
      var realm = REALMS[i % 3], name = A[i % A.length] + ' ' + B[(i * 3) % B.length];
      var needs = [];
      for (var k = 0; k < (i % 4) + 1; k++) {
        var c = CLASSES[(i + k * 2) % 9], r = CLASS_ROLES[c][(i + k) % CLASS_ROLES[c].length];
        if (!needs.some(function (n) { return n.class === c && n.role === r; })) needs.push({ class: c, role: r, priority: ['high', 'medium', 'low'][(i + k) % 3] });
      }
      var recruiting = i % 7 !== 6;
      if (!recruiting) needs = [];
      var contactType = ['discord', 'url', 'in_game'][i % 3];
      out.push({
        region: REGIONS[Math.floor(i / 3) % 4], realm_slug: realm[0], realm_name: realm[1], guild_slug: slug(name), name: name,
        faction: i % 2 ? 'horde' : 'alliance', recruiting: recruiting,
        open_roles: ROLES.filter(function (r) { return needs.some(function (n) { return n.role === r; }); }),
        updated_at: new Date(Date.UTC(2026, 9, 1 + i, 12, 0, 0)).toISOString().replace('.000', ''),
        pitch: (i % 2 ? 'A Horde' : 'An Alliance') + ' guild on ' + realm[1] + ' clearing World of Warcraft Forever raids at a relaxed pace. We value clear calls, good humour and showing up prepared.',
        recruiting_needs: needs,
        raid_schedule: [{ day: DAYS[(i + 1) % 7], start: '19:30', end: '22:30' }, { day: DAYS[(i + 3) % 7], start: '20:00', end: '23:00' }].slice(0, (i % 2) + 1),
        raid_timezone: TZ[i % TZ.length],
        contact: contactType === 'discord' ? { type: 'discord', value: 'https://discord.gg/cs' + slug(name).replace(/-/g, '') }
          : contactType === 'url' ? { type: 'url', value: 'https://' + slug(name) + '.example.org/apply' }
          : { type: 'in_game', value: 'Whisper any officer of <' + name + '> in game' },
        member_count: i % 4 === 3 ? null : 20 + i * 3,
        emblem_url: null,
        public_listed: true
      });
    }
    // Fixed fixtures used by tests.
    out[0].name = 'Knights of the Silver Hand'; out[0].guild_slug = 'knights-of-the-silver-hand';
    out[0].raid_schedule = [{ day: 'wed', start: '20:00', end: '23:00' }, { day: 'sun', start: '19:00', end: '22:00' }];
    out[0].raid_timezone = 'America/New_York'; out[0].member_count = 87;
    out[0].contact = { type: 'discord', value: 'https://discord.gg/silverhand' };
    out[0].recruiting_needs = [{ class: 'priest', role: 'healer', priority: 'high' }, { class: 'warrior', role: 'tank', priority: 'medium' }, { class: 'mage', role: 'dps', priority: 'low' }];
    out[0].open_roles = ['tank', 'healer', 'dps'];
    out[1].name = 'Duskhollow <Night> & Co'; out[1].guild_slug = 'night-and-co';
    out[1].pitch = '<img src=x onerror="window.__x=1"> Plain text only. "Quotes" & ampersands </script> stay text.';
    out[1].contact = { type: 'in_game', value: '<script>window.__x=1</script> whisper Grimlantern' };
    out[1].member_count = null;
    // Same realm + guild slug in another region (realms are not globally unique).
    var twin = JSON.parse(JSON.stringify(out[0])); twin.region = 'eu'; twin.updated_at = '2026-10-29T12:00:00Z';
    twin.raid_timezone = 'Europe/Berlin'; twin.member_count = 41; twin.contact = { type: 'url', value: 'https://silverhand-eu.example.org/apply' };
    twin.pitch = 'The European Knights of the Silver Hand on Emberfall. Same name, different region and raid nights.';
    twin.recruiting_needs = [{ class: 'druid', role: 'tank', priority: 'high' }]; twin.open_roles = ['tank'];
    out.push(twin);
    // No raid schedule set yet: platform sends raid_timezone null and an empty schedule.
    out[2].raid_schedule = []; out[2].raid_timezone = null; out[2].member_count = null;
    // Zone missing but schedule present: treated as no schedule.
    out[4].raid_timezone = null;
    // Private (not opted in): must 404 and never appear in list/sitemap.
    out.push({ region: 'us', realm_slug: 'emberfall', realm_name: 'Emberfall', guild_slug: 'hidden-hand', name: 'Hidden Hand', faction: 'alliance', recruiting: true,
      open_roles: ['dps'], updated_at: '2026-10-30T12:00:00Z', pitch: 'secret', recruiting_needs: [{ class: 'rogue', role: 'dps', priority: 'high' }],
      raid_schedule: [], raid_timezone: null, contact: { type: 'in_game', value: 'x' }, member_count: 5, emblem_url: null, public_listed: false });
    return out;
  }
  var GUILDS = build();
  var SUMMARY = ['region', 'realm_slug', 'realm_name', 'guild_slug', 'name', 'faction', 'recruiting', 'open_roles', 'updated_at'];
  var DETAIL = SUMMARY.concat(['pitch', 'recruiting_needs', 'raid_schedule', 'raid_timezone', 'contact', 'member_count', 'emblem_url']);
  function pick(g, keys) { var o = {}; keys.forEach(function (k) { o[k] = JSON.parse(JSON.stringify(g[k])); }); return o; }
  function arr(v) { return v == null || v === '' ? [] : [].concat(v); }
  function err(status, code, message, retryAfter) { var e = new Error(message); e.status = status; e.body = { error: { code: code, message: message, request_id: 'mock-req' } }; if (retryAfter) e.retryAfter = retryAfter; return e; }
  function enc(n) { return 'c' + n.toString(36); }
  function dec(c) { if (c == null || c === '') return 0; var m = /^c([0-9a-z]+)$/.exec(c); if (!m) throw err(400, 'validation_error', 'cursor is invalid'); return parseInt(m[1], 36); }
  function listed() { return GUILDS.filter(function (g) { return g.public_listed; }); }
  /** q: {realm, faction, role:[], class:[], cursor, limit}. Within one need: class AND role; repeated values: OR. */
  function list(q) {
    q = q || {};
    var realms = REALMS.map(function (r) { return r[0]; });
    var roles = arr(q.role), classes = arr(q['class']);
    if (q.region && REGIONS.indexOf(q.region) < 0) throw err(400, 'validation_error', 'region must be one of us, eu, kr, tw');
    if (q.realm && realms.indexOf(q.realm) < 0) throw err(400, 'validation_error', 'realm is not a World of Warcraft Forever realm');
    if (q.faction && ['alliance', 'horde'].indexOf(q.faction) < 0) throw err(400, 'validation_error', 'faction is invalid');
    if (roles.some(function (r) { return ROLES.indexOf(r) < 0; }) || classes.some(function (c) { return CLASSES.indexOf(c) < 0; })) throw err(400, 'validation_error', 'role or class is invalid');
    var limit = q.limit == null ? 25 : +q.limit;
    if (!(limit >= 1 && limit <= 50)) throw err(400, 'validation_error', 'limit must be 1..50');
    var all = listed().filter(function (g) {
      if (q.region && g.region !== q.region) return false;
      if (q.realm && g.realm_slug !== q.realm) return false;
      if (q.faction && g.faction !== q.faction) return false;
      if (!roles.length && !classes.length) return true;
      return g.recruiting_needs.some(function (n) {
        return (!roles.length || roles.indexOf(n.role) >= 0) && (!classes.length || classes.indexOf(n['class']) >= 0);
      });
    });
    var start = dec(q.cursor);
    return { items: all.slice(start, start + limit).map(function (g) { return pick(g, SUMMARY); }), next_cursor: start + limit < all.length ? enc(start + limit) : null };
  }
  function detail(region, realm, guild) {
    var g = GUILDS.filter(function (x) { return x.region === region && x.realm_slug === realm && x.guild_slug === guild && x.public_listed; })[0];
    if (!g) throw err(404, 'not_found', 'Guild not found.');
    return pick(g, DETAIL);
  }
  function sitemap(q) {
    q = q || {};
    var limit = q.limit == null ? 200 : +q.limit;
    if (!(limit >= 1 && limit <= 500)) throw err(400, 'validation_error', 'limit must be 1..500');
    var all = listed(), start = dec(q.cursor);
    return { items: all.slice(start, start + limit).map(function (g) { return { region: g.region, realm_slug: g.realm_slug, guild_slug: g.guild_slug, updated_at: g.updated_at }; }), next_cursor: start + limit < all.length ? enc(start + limit) : null };
  }
  return { REGIONS: REGIONS, REGION_NAMES: { us: 'US', eu: 'Europe', kr: 'Korea', tw: 'Taiwan' }, REALMS: REALMS, CLASSES: CLASSES, ROLES: ROLES, GUILDS: GUILDS, list: list, detail: detail, sitemap: sitemap, err: err };
});
