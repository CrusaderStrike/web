/**
 * web#38 guild page enhancement. The page is pre-rendered (tools/build-guild-pages.js); this script only
 * 1) adds each raid time in the viewer's own time zone, and 2) re-checks the live API so a guild that went
 * private shows the not-found state, and a 429 explains when to retry. No HTML sinks.
 */
(function () {
  'use strict';
  var main = document.querySelector('main.gp'); if (!main) return;
  var T = window.CSGuildTime, tz = main.getAttribute('data-tz');
  var status = document.getElementById('gp-status');
  var viewerTz; try { viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { viewerTz = ''; }
  var any = false;
  Array.prototype.forEach.call(document.querySelectorAll('.gp-raid'), function (li) {
    var sl = T.slot({ day: li.getAttribute('data-day'), start: li.getAttribute('data-start'), end: li.getAttribute('data-end') }, tz);
    if (viewerTz === tz) return;               // same zone: guild time already is local time
    var out = li.querySelector('.gp-raid-local');
    out.textContent = '(your time: ' + T.fmt(sl.start) + '–' + T.fmtTime(sl.end) + ' ' + T.zoneName(undefined, sl.start) + ')';
    out.hidden = false; any = true;
  });
  if (any) document.getElementById('gp-local-note').hidden = false;

  function say(msg) { status.textContent = msg; status.className = 'gp-status' + (msg ? ' gp-status-on' : ''); }
  function check() {
    return window.CSGuildsApi.getGuild(main.getAttribute('data-region'), main.getAttribute('data-realm'), main.getAttribute('data-guild')).then(function () { say(''); }, function (e) {
      if (e.status === 404) {
        document.getElementById('gp-content').hidden = true;
        document.getElementById('gp-notfound').hidden = false;
        document.title = 'Guild not available | Crusader Strike';
        say('');
      } else if (e.status === 429) {
        var s = parseInt(e.retryAfter, 10);
        say('Showing the saved copy of this page. Too many requests right now' + (s > 0 ? '; try again in ' + s + ' second' + (s === 1 ? '' : 's') : '; try again shortly') + '.');
      }
      // Other errors: the pre-rendered copy stays, silently.
    });
  }
  window.CSGuildPage = { check: check };
  check();
})();
