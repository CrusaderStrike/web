/** web#17: reveal the Battle.net entry point only when the feature flag is on. */
(function () {
  'use strict';
  if (!(window.csBnetEnabled && window.csBnetEnabled())) return;
  var li = document.getElementById('nav-bnet');
  if (li) li.hidden = false;
  // Landing hero: Battle.net sign-in becomes the main button; other hero buttons drop to secondary.
  var hero = document.getElementById('hero-bnet');
  if (hero) {
    hero.hidden = false;
    Array.prototype.forEach.call(hero.parentNode.querySelectorAll('.cs-btn-primary'), function (b) {
      if (b !== hero) { b.classList.remove('cs-btn-primary'); b.classList.add('cs-btn-ghost'); }
    });
  }
})();
