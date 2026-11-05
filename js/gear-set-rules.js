/**
 * web#42 shared gear-set rules (gear-list schema v1; platform openapi/v1.yaml). Used by the armory (profile) and the gear-lists page.
 * type: leveling | max_level. Leveling needs until_level > character level and <= 60; at level 60 only max_level.
 */
(function () {
  'use strict';
  var MAX = (window.CS_CONFIG && window.CS_CONFIG.ARMORY_MAX_LEVEL) || 60;
  var ROLE_MAX = 32;
  var MSG = {
    until_level_required: 'Enter the level this set is for.',
    until_level_must_be_null: 'Max-level sets have no level.',
    until_level_out_of_range: 'Level must be a whole number from 1 to ' + MAX + '.',
    until_level_not_above_current_level: 'Level must be higher than the character\u2019s current level.',
    leveling_set_at_max_level: 'Level ' + MAX + ' characters can only have max-level sets.',
    role_spec_too_long: 'Role or spec must be ' + ROLE_MAX + ' characters or fewer.',
    name_required: 'Give the set a name (1\u201364 characters).',
    character_not_displayed: 'Show this character on your profile before creating gear sets for it.',
    list_limit_reached: 'This character already has the maximum number of gear sets. Delete one to make another.',
    item_not_in_slot: 'That item doesn\u2019t fit this slot.',
    item_not_forever: 'That item isn\u2019t a WoW Forever item.',
    invalid_slot: 'That slot isn\u2019t valid.',
    list_items_limit: 'This set already holds the maximum number of items.',
    // web#50: platform field-map codes (platform#54 invalid_json and the gear-list create/patch fields).
    invalid_json: 'The request couldn\u2019t be read. Reload the page and try again.',
    invalid_name: 'Name must be 1\u201364 characters.',
    invalid_type: 'Choose leveling or max level.',
    invalid_visibility: 'Choose a valid visibility.',
    invalid_slots: 'The slot list wasn\u2019t valid.'
  };
  var GENERIC = 'That change wasn\u2019t accepted. Check it and try again.';
  function ul(s) { var n = parseInt(s && s.until_level, 10); return n > 0 ? n : MAX + 1; }
  function lvl(c) { var n = parseInt(c && c.level, 10); return n > 0 ? n : 0; }
  window.CSGearSetRules = {
    MAX_LEVEL: MAX, ROLE_MAX: ROLE_MAX, MSG: MSG,
    /** 409 list cap (platform contract): list_limit_reached. */
    isListLimit: function (code) { return code === 'list_limit_reached'; },
    /** Limit from a 409 list_limit_reached body (error.details.limit / error.limit / body.limit, else a number in the message); null if absent. */
    listLimit: function (r) {
      var b = (r && r.body) || {}, e = b.error || {}, d = e.details || {};
      var n = [d.limit, d.max, e.limit, b.limit].map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x > 0; })[0];
      if (!n) { var m = /\b(\d{1,4})\b/.exec(e.message || ''); n = m ? parseInt(m[1], 10) : 0; }
      return n > 0 ? n : null;
    },
    limitMessage: function (r, noun) {
      var n = this.listLimit(r);
      return n ? 'This character already has ' + n + ' ' + noun + ' (the maximum). Delete one to make another.' : 'This character already has the maximum number of ' + noun + '. Delete one to make another.';
    },
    canLevel: function (c) { return lvl(c) < MAX; },
    /** web#48: level missing/0 from the API -> unknown (create still allowed; the server checks against its last synced level). */
    levelKnown: function (c) { return lvl(c) > 0; },
    defaultType: function (c) { return lvl(c) < MAX ? 'leveling' : 'max_level'; },
    minUntil: function (c) { return Math.min(MAX, lvl(c) + 1); },
    /** Client-side check; returns {field: code} (empty = valid). Server stays the source of truth. */
    validate: function (b, c) {
      var e = {};
      if (!b.name || !String(b.name).trim() || String(b.name).trim().length > 64) e.name = 'name_required';
      if (b.type === 'leveling') {
        if (lvl(c) >= MAX) e.type = 'leveling_set_at_max_level';
        else if (b.until_level == null || b.until_level === '') e.until_level = 'until_level_required';
        else if (!/^\d+$/.test(String(b.until_level)) || +b.until_level < 1 || +b.until_level > MAX) e.until_level = 'until_level_out_of_range';
        else if (+b.until_level <= lvl(c)) e.until_level = 'until_level_not_above_current_level';
      } else if (b.until_level != null) e.until_level = 'until_level_must_be_null';
      if (b.role_spec != null && String(b.role_spec).length > ROLE_MAX) e.role_spec = 'role_spec_too_long';
      return e;
    },
    /** Builds the snake_case create body from form values. */
    body: function (name, type, until, role) {
      var r = String(role || '').trim();
      return { name: String(name || '').trim(), type: type, until_level: type === 'leveling' ? (until === '' || until == null ? null : parseInt(until, 10)) : null, role_spec: r ? r : null };
    },
    /** Server 400 validation_error -> {field: code}; accepts {error:{code,details:{field:code}}} and {errors:{field:code|msg}}. */
    fieldCodes: function (r) {
      var b = r && r.body || {}, d = (b.error && b.error.details) || b.errors || {}, out = {};
      Object.keys(d).forEach(function (k) { var v = d[k]; out[k] = typeof v === 'string' ? v : (v && (v.code || v.message)) || ''; });
      return out;
    },
    /** web#50: banner text for a field-map value: known code -> sentence, prose passes through, unknown code -> generic. */
    text: function (v) { return MSG[v] || (typeof v === 'string' && v.indexOf(' ') > 0 ? v : GENERIC); },
    GENERIC: GENERIC,
    /**
     * web#50: one API-down message for profile and gear lists. 502 is Battle.net only when the platform
     * says so (error.code upstream_unavailable); a bare 502 from the proxy means Crusader Strike is down.
     */
    downMsg: function (r) {
      if (!r || r.status === 0) return 'You appear to be offline, or Crusader Strike can\u2019t be reached.';
      var c = r.body && r.body.error && r.body.error.code;
      if (r.status === 502 && c === 'upstream_unavailable') return 'Battle.net is unavailable, try again later';
      if (r.status >= 500) return 'Crusader Strike is having trouble right now (HTTP ' + r.status + '). Try again in a few minutes.';
      return '';
    },
    message: function (code) { return MSG[code] || (typeof code === 'string' && code.indexOf(' ') > 0 ? code : 'Check this field.'); },
    outgrown: function (s, c) { return !!(s && (s.outgrown || (s.type === 'leveling' && lvl(c) && s.until_level != null && lvl(c) >= s.until_level))); },
    /** Leveling sets by until_level asc (then name), then max-level sets by name. */
    sort: function (sets) {
      var by = function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); };
      return {
        leveling: sets.filter(function (s) { return s.type === 'leveling'; }).sort(function (a, b) { return (ul(a) - ul(b)) || by(a, b); }),  // web#48: missing until_level sorts last, never NaN
        max_level: sets.filter(function (s) { return s.type !== 'leveling'; }).sort(by)
      };
    }
  };
})();
