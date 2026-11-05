/**
 * web#38 raid time helpers. Raid times are wall-clock HH:MM in the guild's IANA raid_timezone.
 * nextOccurrence() returns the next real instant for a weekday+time in that zone (DST-safe),
 * so the page can show it in the viewer's own zone. Works in Node and the browser.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CSGuildTime = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  function validZone(tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; } }
  function parts(ms, tz) {
    var o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
      .formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: DAYS.indexOf(o.weekday.toLowerCase().slice(0, 3)) };
  }
  function offset(ms, tz) { var p = parts(ms, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000; }
  /** UTC ms for wall-clock y-m-d h:mi in tz. */
  function zoned(y, m, d, h, mi, tz) {
    var guess = Date.UTC(y, m - 1, d, h, mi), t = guess - offset(guess, tz);
    return guess - offset(t, tz);
  }
  function nextOccurrence(day, hhmm, tz, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs, p = parts(now, tz), want = DAYS.indexOf(day);
    var hm = hhmm.split(':'), add = (want - p.wd + 7) % 7;
    for (var i = 0; i < 2; i++) {
      var base = new Date(Date.UTC(p.y, p.m - 1, p.d + add + i * 7));
      var t = zoned(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), +hm[0], +hm[1], tz);
      if (t > now - 6 * 3600e3) return t;
    }
    return t;
  }
  /** "Wed 8:00 PM" in the given zone (undefined = viewer's zone). */
  function fmt(ms, tz, locale) {
    var o = { weekday: 'short', hour: 'numeric', minute: '2-digit' }; if (tz) o.timeZone = tz;
    return new Intl.DateTimeFormat(locale || 'en-US', o).format(new Date(ms));
  }
  function fmtTime(ms, tz, locale) { var o = { hour: 'numeric', minute: '2-digit' }; if (tz) o.timeZone = tz; return new Intl.DateTimeFormat(locale || 'en-US', o).format(new Date(ms)); }
  function zoneName(tz, ms, locale) {
    try {
      var o = { timeZoneName: 'short' }; if (tz) o.timeZone = tz;
      var p = new Intl.DateTimeFormat(locale || 'en-US', o).formatToParts(new Date(ms == null ? Date.now() : ms));
      for (var i = 0; i < p.length; i++) if (p[i].type === 'timeZoneName') return p[i].value;
    } catch (e) {}
    return tz || '';
  }
  /** One schedule row -> {start, end} instants (end rolls past midnight). */
  function slot(s, tz, nowMs) {
    function mins(x) { var a = x.split(':'); return +a[0] * 60 + +a[1]; }
    var start = nextOccurrence(s.day, s.start, tz, nowMs), dur = ((mins(s.end) - mins(s.start) + 1440) % 1440) || 1440;
    return { start: start, end: start + dur * 60000 };
  }
  return { DAY_NAMES: DAY_NAMES, validZone: validZone, nextOccurrence: nextOccurrence, slot: slot, fmt: fmt, fmtTime: fmtTime, zoneName: zoneName };
});
