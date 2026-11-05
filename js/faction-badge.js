/** Shared faction badge (web#26). Unknown or missing faction -> neutral badge, never Horde. */
window.csFactionBadge = function (faction) {
  var known = { alliance: 'Alliance', horde: 'Horde' };
  var label = known[faction] || 'No faction';
  var b = document.createElement('span');
  b.className = 'cs-badge ' + (known[faction] ? 'cs-badge-' + faction : 'cs-badge-neutral');
  b.textContent = label;
  b.setAttribute('aria-label', 'Faction: ' + (known[faction] ? label : 'none'));
  return b;
};
