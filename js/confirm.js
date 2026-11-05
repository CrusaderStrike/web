(function () {
  'use strict';

  var cfg = window.CS_CONFIG || {};
  var statusEl = document.getElementById('confirm-status');
  var actionEl = document.getElementById('confirm-action');
  var btn = document.getElementById('confirm-btn');
  if (!statusEl || !btn) return;

  var params = new URLSearchParams(window.location.search);
  var token = (params.get('token') || '').trim();

  function setTone(tone, text, linkText, linkHref) {
    statusEl.dataset.tone = tone || '';
    statusEl.textContent = text || '';
    if (linkText) {
      var a = document.createElement('a');
      a.href = linkHref;
      a.textContent = linkText;
      statusEl.appendChild(a);
      statusEl.appendChild(document.createTextNode('.'));
    }
  }

  if (!token) {
    setTone('err', 'This confirmation link is missing a token. ', 'Request a new signup', '../index.html#signup');
    btn.hidden = true;
    return;
  }

  function mockConfirm() {
    // Mirrors contract: 200 confirmed | 400 {errors:{token:"invalid or expired"}}
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        if (token === 'expired' || token === 'invalid') {
          resolve({ status: 400, body: { errors: { token: 'invalid or expired' } } });
        } else {
          resolve({ status: 200, body: { status: 'confirmed' } });
        }
      }, 300);
    });
  }

  function liveConfirm() {
    var url = String(cfg.API_BASE || '').replace(/\/$/, '') + (cfg.CONFIRM_PATH || '/api/v1/signups/confirm');
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ token: token })
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = {};
        if (text) {
          try { body = JSON.parse(text); } catch (e) { body = {}; }
        }
        return { status: res.status, body: body };
      });
    });
  }

  btn.addEventListener('click', function () {
    btn.disabled = true;
    setTone('warn', 'Confirming…');
    var runner = cfg.USE_MOCK_SIGNUP ? mockConfirm() : liveConfirm();
    runner
      .then(function (result) {
        if (result.status === 200 && result.body && result.body.status === 'confirmed') {
          setTone('ok', 'You are confirmed. Welcome to Crusader Strike.');
          btn.hidden = true;
          if (actionEl) {
            var home = document.createElement('a');
            home.className = 'cs-btn cs-btn-primary';
            home.href = '../index.html';
            home.textContent = 'Back to home';
            actionEl.replaceChildren(home);
          }
          return;
        }
        var tokenMsg = result.body && result.body.errors && result.body.errors.token
          ? result.body.errors.token
          : 'invalid or expired';
        setTone('err', 'This confirmation link is ' + String(tokenMsg) + '. ', 'Sign up again', '../index.html#signup');
        btn.hidden = true;
      })
      .catch(function () {
        setTone('err', 'Network error. Please try again.');
        btn.disabled = false;
      });
  });
})();
