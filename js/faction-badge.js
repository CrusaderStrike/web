/**
 * Shared faction badge (web#26). Contract (platform#30): faction is "alliance" | "horde" | null.
 * Missing, null or unknown -> neutral "No faction" badge, never Horde.
 */
window.csFactionBadge = function (faction) {
  var known = { alliance: 'Alliance', horde: 'Horde' };
  var f = typeof faction === 'string' ? faction : '';
  var ok = Object.prototype.hasOwnProperty.call(known, f);
  var b = document.createElement('span');
  b.className = 'cs-badge ' + (ok ? 'cs-badge-' + f : 'cs-badge-neutral');
  b.textContent = ok ? known[f] : 'No faction';
  b.setAttribute('aria-label', 'Faction: ' + (ok ? known[f] : 'none'));
  return b;
};
