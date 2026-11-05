(function () {
  'use strict';

  var cfg = window.CS_CONFIG || {};
  var form = document.getElementById('signup-form');
  var statusEl = document.getElementById('form-status');
  if (!form || !statusEl) return;

  var INTERESTS = ['guild_site', 'dungeon_run', 'world_pvp', 'addon'];

  function clearFieldErrors() {
    form.querySelectorAll('[aria-invalid="true"]').forEach(function (el) {
      el.removeAttribute('aria-invalid');
    });
    form.querySelectorAll('.cs-error[data-field-error]').forEach(function (el) {
      el.remove();
    });
  }

  function showFieldError(name, message) {
    var input = form.elements.namedItem(name);
    if (!input) return;
    var field = input.closest('.cs-field, .cs-field-check') || input.parentElement;
    input.setAttribute('aria-invalid', 'true');
    var err = document.createElement('p');
    err.className = 'cs-error';
    err.dataset.fieldError = name;
    err.id = name + '-error';
    err.textContent = message;
    field.appendChild(err);
    var described = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (described.indexOf(err.id) === -1) described.push(err.id);
    input.setAttribute('aria-describedby', described.join(' '));
  }

  function setStatus(tone, text) {
    statusEl.dataset.tone = tone || '';
    statusEl.textContent = text || '';
  }

  function collectPayload() {
    var interests = INTERESTS.filter(function (key) {
      var el = form.elements.namedItem('interest_' + key);
      return el && el.checked;
    });
    var factionEl = form.elements.namedItem('faction');
    var faction = factionEl && factionEl.value ? factionEl.value : undefined;
    var payload = {
      email: String(form.elements.namedItem('email').value || '').trim(),
      consent: !!(form.elements.namedItem('consent') && form.elements.namedItem('consent').checked),
      consent_version: cfg.CONSENT_VERSION,
      website: String((form.elements.namedItem('website') && form.elements.namedItem('website').value) || '')
    };
    var character = String(form.elements.namedItem('character_name').value || '').trim();
    var realm = String(form.elements.namedItem('realm').value || '').trim();
    var guild = String(form.elements.namedItem('guild_name').value || '').trim();
    if (character) payload.character_name = character.slice(0, 48);
    if (realm) payload.realm = realm.slice(0, 48);
    if (faction === 'alliance' || faction === 'horde') payload.faction = faction;
    if (guild) payload.guild_name = guild.slice(0, 48);
    if (interests.length) payload.interests = interests;
    return payload;
  }

  function clientValidate(payload) {
    var errors = {};
    if (!payload.email || payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      errors.email = 'Enter a valid email (max 254 characters).';
    }
    if (!payload.consent) {
      errors.consent = 'Consent is required to join the list.';
    }
    if (payload.character_name && payload.character_name.length > 48) {
      errors.character_name = 'Character name must be 48 characters or fewer.';
    }
    if (payload.realm && payload.realm.length > 48) {
      errors.realm = 'Realm must be 48 characters or fewer.';
    }
    if (payload.guild_name && payload.guild_name.length > 48) {
      errors.guild_name = 'Guild name must be 48 characters or fewer.';
    }
    return errors;
  }

  function mockSubmit(payload) {
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        if (payload.website) {
          resolve({ status: 202, body: { status: 'pending' } });
          return;
        }
        if (!payload.email || payload.email.indexOf('bad@') === 0) {
          resolve({ status: 400, body: { errors: { email: 'That email looks invalid.' } } });
          return;
        }
        if (payload.email.indexOf('rate@') === 0) {
          resolve({ status: 429, body: {}, headers: { 'Retry-After': '60' } });
          return;
        }
        resolve({ status: 202, body: { status: 'pending' } });
      }, 350);
    });
  }

  function liveSubmit(payload) {
    var url = String(cfg.API_BASE || '').replace(/\/$/, '') + (cfg.SIGNUP_PATH || '/api/v1/signups');
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(payload)
    }).then(function (res) {
      var retryAfter = res.headers.get('Retry-After');
      return res.text().then(function (text) {
        var body = {};
        if (text) {
          try { body = JSON.parse(text); } catch (e) { body = {}; }
        }
        return {
          status: res.status,
          body: body,
          headers: retryAfter ? { 'Retry-After': retryAfter } : {}
        };
      });
    });
  }

  function handleResponse(result) {
    var status = result.status;
    var body = result.body || {};
    if (status === 202) {
      setStatus('ok', 'Check your email to confirm your signup.');
      form.reset();
      return;
    }
    if (status === 400 && body.errors) {
      Object.keys(body.errors).forEach(function (field) {
        showFieldError(field, body.errors[field]);
      });
      setStatus('err', 'Please fix the highlighted fields.');
      return;
    }
    if (status === 415) {
      setStatus('err', 'Unexpected request format. Please try again.');
      return;
    }
    if (status === 429) {
      var retry = result.headers && result.headers['Retry-After'];
      var msg = 'Too many attempts. Please try again';
      msg += retry ? ' in about ' + retry + ' seconds.' : ' shortly.';
      setStatus('warn', msg);
      return;
    }
    setStatus('err', 'Something went wrong (' + status + '). Please try again.');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearFieldErrors();
    setStatus('', '');

    var payload = collectPayload();
    var errors = clientValidate(payload);
    var keys = Object.keys(errors);
    if (keys.length) {
      keys.forEach(function (k) { showFieldError(k, errors[k]); });
      setStatus('err', 'Please fix the highlighted fields.');
      return;
    }

    var submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    var runner = cfg.USE_MOCK_SIGNUP ? mockSubmit(payload) : liveSubmit(payload);
    runner
      .then(handleResponse)
      .catch(function () {
        setStatus('err', 'Network error. Please try again.');
      })
      .then(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
})();
