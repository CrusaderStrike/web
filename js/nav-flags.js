/** web#17: reveal the Battle.net entry point only when the feature flag is on. */
(function () {
  'use strict';
  var li = document.getElementById('nav-bnet');
  if (li && window.csBnetEnabled && window.csBnetEnabled()) li.hidden = false;
})();
