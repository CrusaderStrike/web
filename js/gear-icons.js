/**
 * web#18 slot placeholder icons: the one placeholder used on the gear page whenever there is no
 * allowlisted icon_url (platform#31 currently sends null for every item). Inline SVG built with
 * createElementNS (no HTML parsing); decorative, so aria-hidden — the item name sits next to it.
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  // 24x24 glyphs, drawn on whole/half pixels so they stay crisp at 36px (1x) and 72px (2x).
  var G = {
    helm: 'M12 3C7.6 3 5 6.4 5 10.5V16l2 2.5h3V13h4v5.5h3L19 16v-5.5C19 6.4 16.4 3 12 3zm-4 8.5h3v-2H8zm5 0h3v-2h-3z',
    amulet: 'M6 3c0 4 2.7 7 6 7s6-3 6-7h-1.6c0 3-2 5.4-4.4 5.4S7.6 6 7.6 3zM12 11l3.5 4.5L12 21l-3.5-5.5z',
    shoulder: 'M3 14c0-5 4-8.5 9-8.5s9 3.5 9 8.5v2h-4v-2.5c0-2.2-2.2-4-5-4s-5 1.8-5 4V16H3z',
    cloak: 'M8 3h8l1.5 3L20 21l-4-2-4 2-4-2-4 2L6.5 6z',
    chest: 'M8 3l4 2 4-2 4 3-2 4v11H6V10L4 6zm2.5 7v6h3v-6z',
    shirt: 'M8.5 3L12 5l3.5-2L21 6.5 18.5 10 17 9v12H7V9l-1.5 1L3 6.5z',
    wrist: 'M6 8h12v8H6zm2 2v4h8v-4zM5 6h14v1.5H5zm0 10.5h14V18H5z',
    hands: 'M7 21v-5L4.5 12l1.4-1 2.1 2V5.5a1.2 1.2 0 012.4 0V11h.6V4a1.2 1.2 0 012.4 0v7h.6V5a1.2 1.2 0 012.4 0v6h.6V7a1.2 1.2 0 012.4 0v8l-2 6z',
    belt: 'M3 9h18v6H3zm7-1.5h4v9h-4zm1.5 3v3h1v-3z',
    legs: 'M6 3h12l1 18h-5l-2-11-2 11H5z',
    boots: 'M7 3h6v10l6 3.5V21H5v-3l2-1.5z',
    ring: 'M12 7a7 7 0 100 14 7 7 0 000-14zm0 2.6a4.4 4.4 0 110 8.8 4.4 4.4 0 010-8.8zM9.5 2h5L16 5l-4 2.5L8 5z',
    trinket: 'M12 2l2.6 6.4L21 9l-5 4.3 1.6 6.7L12 16.5 6.4 20 8 13.3 3 9l6.4-.6z',
    sword: 'M18.5 2.5H21.5V5.5L10.5 16.5 7.5 13.5zM5 12.5l6.5 6.5-1.5 1.5-1.8-1.8L5.5 21.4 2.6 18.5l2.7-2.7L3.5 14z',
    shield: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5zm0 2.5L6.5 6.6V11c0 3.7 2.4 6.7 5.5 8.3z',
    bow: 'M5 2c7 3 11 7 14 14l-1.5.6C14.7 10 11 6.3 4.4 3.4zM4 3.5l1-1L19.5 17l2 4.5-4.5-2L2.5 5z',
    tabard: 'M6 3h12v14l-6 4-6-4zm3 3v8.5l3 2 3-2V6z'
  };
  var SLOT = { head: 'helm', neck: 'amulet', shoulder: 'shoulder', back: 'cloak', chest: 'chest', shirt: 'shirt', tabard: 'tabard',
    wrist: 'wrist', hands: 'hands', waist: 'belt', legs: 'legs', feet: 'boots', finger1: 'ring', finger2: 'ring',
    trinket1: 'trinket', trinket2: 'trinket', main_hand: 'sword', off_hand: 'shield', ranged: 'bow' };
  window.CSGearIcons = {
    glyphFor: function (slot) { return Object.prototype.hasOwnProperty.call(SLOT, slot) ? SLOT[slot] : 'trinket'; },
    /** Returns an <svg class="gr-glyph" data-glyph="..."> for a slot. */
    placeholder: function (slot) {
      var g = this.glyphFor(slot);
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'gr-glyph');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      svg.setAttribute('data-glyph', g);
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', G[g]); path.setAttribute('fill-rule', 'evenodd');
      svg.appendChild(path);
      return svg;
    }
  };
})();
