/** Profile page: characters + main/alt. API data is rendered with createElement + textContent only. */
(function () {
  'use strict';
  var api = window.CSProfileApi;
  var $ = function (id) { return document.getElementById(id); };
  var st = { battletag: '', region: '', characters: [], mainId: null, saving: false };

  function txt(v) { return (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim() : ''; }
  function fullName(c) { return [txt(c.character_name), txt(c.surname)].filter(Boolean).join(' ') || 'Unnamed character'; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function announce(msg) { var s = $('pf-status'); s.textContent = ''; setTimeout(function () { s.textContent = msg; }, 50); }
  function retryAfter(r) {
    var ra = parseInt(r && r.headers && r.headers['retry-after'], 10);
    return ra > 0 && ra < 3600 ? ra : 30;
  }
  // Shared error text (platform#30): 400 {errors:{field|body}}, 403 csrf_failed, 429 rate_limited + Retry-After, 502 upstream.
  function errMsg(r, fallback) {
    var b = r && r.body;
    if (r && r.status === 403 && b && b.error && b.error.code === 'csrf_failed') return 'Security check failed. Reload the page and try again.';
    if (r && r.status === 429) return 'Too many requests. Try again in ' + retryAfter(r) + ' seconds.';
    if (r && r.status === 502) return 'Battle.net is unavailable, try again later';
    if (b && b.error && txt(b.error.message)) return txt(b.error.message);
    if (b && b.errors) return Object.keys(b.errors).map(function (k) { return txt(b.errors[k]); }).filter(Boolean).join(' ') || fallback;
    return fallback;
  }
  function show(name) {
    ['loading', 'disabled', 'signedout', 'error', 'ready'].forEach(function (s) { $('pf-' + s).hidden = s !== name; });
    var h = $('pf-' + name + '-h'); if (h && name !== 'loading') h.focus();
  }

  function render() {
    $('pf-battletag').textContent = st.battletag;
    $('pf-region').value = st.region || 'us';
    var list = $('pf-list');
    while (list.firstChild) list.removeChild(list.firstChild);
    var empty = !st.characters.length;
    $('pf-empty').hidden = !empty;
    $('pf-fieldset').hidden = empty;
    st.characters.forEach(function (c) {
      var isMain = c.id === st.mainId;
      var li = el('li', 'cs-card pf-card' + (isMain ? ' is-main' : ''));
      li.setAttribute('data-id', c.id);
      var nameId = 'pf-name-' + c.id;
      var name = el('span', 'pf-name', fullName(c)); name.id = nameId;
      li.appendChild(name);
      var reg = txt(c.region) ? txt(c.region).toUpperCase() : '';
      var meta = [txt(c.realm), reg, txt(c.level) ? 'Level ' + txt(c.level) : '', [txt(c.race), txt(c.class)].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
      if (meta) li.appendChild(el('span', 'pf-meta', meta));
      var tags = el('div', 'pf-tags');
      tags.appendChild(window.csFactionBadge(c.faction));
      var role = el('span', 'cs-badge ' + (isMain ? 'cs-badge-gold' : ''), isMain ? 'Main' : 'Alt');
      role.className = role.className.trim(); role.setAttribute('data-role', isMain ? 'main' : 'alt');
      tags.appendChild(role);
      if (c.stale) {
        role.textContent = 'Not available';
        role.setAttribute('data-role', 'stale');
        var sb = el('span', 'cs-badge pf-stale', 'Stale');
        sb.setAttribute('aria-label', 'Stale: missing from the latest Battle.net refresh');
        tags.appendChild(sb);
      }
      li.appendChild(tags);
      var lab = el('label', 'pf-choice');
      var r = el('input'); r.type = 'radio'; r.name = 'main'; r.value = c.id; r.id = 'pf-main-' + c.id;
      r.checked = isMain; r.disabled = st.saving || !!c.stale;
      r.setAttribute('aria-describedby', nameId);
      lab.appendChild(r); lab.appendChild(el('span', null, 'Set as main'));
      li.appendChild(lab);
      list.appendChild(li);
    });
    $('pf-refresh').disabled = st.saving;
  }

  function applyList(body) {
    var chars = (body && Array.isArray(body.characters) ? body.characters : []).filter(function (c) { return c && c.game === 'wow_forever' && txt(c.id); });
    st.characters = chars;
    var sel = body && body.selection;
    var ids = chars.map(function (c) { return c.id; });
    var live = chars.filter(function (c) { return !c.stale; }).map(function (c) { return c.id; });
    st.mainId = sel && live.indexOf(sel.main_id) >= 0 ? sel.main_id : null;
    return live.length;
  }

  function load() {
    show('loading');
    api.session().then(function (s) {
      if (s.status === 401) { show('signedout'); return null; }
      if (!s.ok) throw s;
      st.battletag = txt(s.body.battletag);
      return api.profile().then(function (pr) {
        if (pr.ok && pr.body) {
          st.battletag = txt(pr.body.battletag) || st.battletag;
          st.region = ['us', 'eu'].indexOf(pr.body.preferred_region) >= 0 ? pr.body.preferred_region : '';
        }
        return api.characters();
      });
    }).then(function (r) {
      if (!r) return;
      if (r.status === 401) { show('signedout'); return; }
      if (!r.ok) throw r;
      var live = applyList(r.body);
      // First sign-in (or main went stale) with no main yet: send the user to the picker.
      if (live && !st.mainId) { location.replace('../signin.html'); return; }
      render(); show('ready');
      announce(st.characters.length + ' characters loaded.');
    }).catch(function (r) {
      $('pf-error-msg').textContent = errMsg(r, 'Something went wrong. Please try again.');
      show('error');
    });
  }

  function setMain(id) {
    if (st.saving || id === st.mainId) return;
    var prev = st.mainId;
    st.mainId = id; st.saving = true;           // optimistic
    $('pf-save-error').hidden = true;
    render(); $('pf-main-' + id).focus();
    announce('Saving main…');
    var alts = st.characters.filter(function (c) { return !c.stale; }).map(function (c) { return c.id; }).filter(function (x) { return x !== id; });
    api.setMain(id, alts).then(function (r) {
      st.saving = false;
      if (r.status === 401) { show('signedout'); return; }
      if (!r.ok) {
        st.mainId = prev;                        // rollback
        render();
        if (prev) $('pf-main-' + prev).focus();
        var m = 'Could not save your main: ' + errMsg(r, 'please try again.');
        $('pf-save-error').textContent = m; $('pf-save-error').hidden = false;
        return;
      }
      render(); $('pf-main-' + id).focus();
      var c = st.characters.filter(function (x) { return x.id === id; })[0];
      announce('Main saved: ' + fullName(c) + '.');
    });
  }

  $('pf-list').addEventListener('change', function (e) { if (e.target.name === 'main') setMain(e.target.value); });
  $('pf-retry').addEventListener('click', load);
  $('pf-region').addEventListener('change', function (e) {
    var prev = st.region, v = e.target.value;
    if (['us', 'eu'].indexOf(v) < 0) return;
    e.target.disabled = true; $('pf-region-error').hidden = true;
    api.updateProfile({ preferred_region: v }).then(function (r) {
      e.target.disabled = false;
      if (r.status === 401) { show('signedout'); return; }
      if (!r.ok) {
        e.target.value = prev || 'us';
        $('pf-region-error').textContent = 'Could not save your region: ' + errMsg(r, 'please try again.');
        $('pf-region-error').hidden = false; return;
      }
      st.region = r.body && r.body.preferred_region || v;
      announce('Preferred region saved.');
    });
  });
  var cooldown = null;
  function refreshIdle() { var b = $('pf-refresh'); b.disabled = st.saving; b.removeAttribute('aria-busy'); b.textContent = 'Refresh characters'; }
  function startCooldown(sec) {
    var b = $('pf-refresh'), left = sec;
    clearInterval(cooldown);
    b.disabled = true;
    var tick = function () {
      if (left <= 0) { clearInterval(cooldown); cooldown = null; refreshIdle(); $('pf-refresh-error').hidden = true; return; }
      b.textContent = 'Refresh again in ' + left + 's';
      left--;
    };
    tick(); cooldown = setInterval(tick, 1000);
  }
  function refreshError(m) { $('pf-refresh-error').textContent = m; $('pf-refresh-error').hidden = false; }
  $('pf-refresh').addEventListener('click', function () {
    var b = $('pf-refresh');
    if (cooldown) return;
    b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = 'Refreshing…';
    $('pf-refresh-error').hidden = true;
    announce('Refreshing characters…');
    api.refresh().then(function (r) {
      refreshIdle();
      if (r.status === 401) { show('signedout'); return; }
      if (r.status === 429) {
        var sec = retryAfter(r);
        refreshError('Too many refreshes. You can refresh again in ' + sec + ' seconds.');
        startCooldown(sec); return;
      }
      if (r.status === 502) { refreshError('Battle.net is unavailable, try again later'); return; }
      if (!r.ok) { refreshError('Refresh failed: ' + errMsg(r, 'please try again.')); return; }
      var hadMain = !!st.mainId;
      var liveN = applyList(r.body);
      // The refresh cleared the selection (main went stale): send the user to the picker.
      if (hadMain && !st.mainId && liveN) { location.replace('../signin.html'); return; }
      render(); announce('Characters refreshed.');
    });
  });
  if (!window.csBnetEnabled()) { show('disabled'); return; }
  load();
})();
