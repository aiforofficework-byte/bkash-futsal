/* =====================================================================
   branding.js  --  SCREEN 01 : custom tournament branding & backgrounds
   ---------------------------------------------------------------------
   Uploads (stored as blobs in IndexedDB, referenced by key in state):
     branding.logoKey     -> tournament logo   (Screens 02 + 03)
     branding.liveBgKey   -> Live Result background      (Screen 02)
     branding.boardBgKey  -> Draw Board background       (Screen 03)
   Plus the three editable text fields. Every screen re-reads branding
   automatically through the Store subscription, so a change here is
   visible on the presentation screens without a refresh.
   ===================================================================== */
(function (global) {
  'use strict';

  /* input id -> { stateKey, previewId, prefix, label } */
  var MAP = {
    inputTournamentLogo: {
      stateKey: 'logoKey', previewId: 'previewTournamentLogo',
      prefix: 'brandlogo', label: 'Tournament logo', placeholder: 'NO LOGO'
    },
    inputLiveBg: {
      stateKey: 'liveBgKey', previewId: 'previewLiveBg',
      prefix: 'livebg', label: 'Live Result background', placeholder: 'DEFAULT'
    },
    inputBoardBg: {
      stateKey: 'boardBgKey', previewId: 'previewBoardBg',
      prefix: 'boardbg', label: 'Draw Board background', placeholder: 'DEFAULT'
    }
  };

  var el = {};
  var typing = false;    // don't overwrite a field the operator is editing

  function cache() {
    [
      'brandTournamentName', 'brandSubtitle', 'brandRoundTitle', 'btnSaveBranding',
      'brandTitle', 'brandMarkImg', 'brandMarkFallback'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  /* =================================================== UPLOAD */
  function handleUpload(inputId, file) {
    var cfg = MAP[inputId];
    if (!cfg) return;

    var check = UI.validateImageFile(file);
    if (!check.ok) { UI.toast(check.error, 'err'); return; }

    var key = ImageDB.newKey(cfg.prefix);
    ImageDB.put(key, file)
      .then(function () { return ImageDB.ensureUrl(key); })
      .then(function () {
        var patch = {};
        patch[cfg.stateKey] = key;
        Store.setBranding(patch);
        UI.toast(cfg.label + ' updated on all screens.', 'ok');
      })
      .catch(function (err) {
        console.error(err);
        UI.toast('Could not store ' + cfg.label.toLowerCase() + '.', 'err');
      });
  }

  function removeGraphic(stateKey) {
    var cfg = null;
    Object.keys(MAP).forEach(function (k) { if (MAP[k].stateKey === stateKey) cfg = MAP[k]; });
    if (!cfg) return;
    if (!Store.getState().branding[stateKey]) {
      UI.toast('Nothing to remove — the default is already in use.', 'err');
      return;
    }
    var patch = {};
    patch[stateKey] = null;
    Store.setBranding(patch);
    UI.toast(cfg.label + ' removed. Default restored.', 'ok');
  }

  /* =================================================== TEXT */
  function saveIdentity() {
    Store.setBranding({
      tournamentName: el.brandTournamentName.value.trim() || 'FUTSAL CARNIVAL',
      subtitle: el.brandSubtitle.value.trim() || 'DHAKA 2026',
      roundTitle: el.brandRoundTitle.value.trim() || 'First Round'
    });
    UI.toast('Tournament identity saved.', 'ok');
  }

  /* =================================================== RENDER */
  function render() {
    var b = Store.getState().branding;

    if (!typing) {
      el.brandTournamentName.value = b.tournamentName;
      el.brandSubtitle.value = b.subtitle;
      el.brandRoundTitle.value = b.roundTitle;
    }

    /* top-bar title + mark */
    el.brandTitle.textContent = b.tournamentName;
    var logoUrl = b.logoKey ? ImageDB.url(b.logoKey) : null;
    if (logoUrl) {
      el.brandMarkImg.src = logoUrl;
      el.brandMarkImg.classList.remove('hidden');
      el.brandMarkFallback.classList.add('hidden');
    } else {
      el.brandMarkImg.classList.add('hidden');
      el.brandMarkFallback.classList.remove('hidden');
      el.brandMarkFallback.textContent = (b.tournamentName || 'F').trim().charAt(0).toUpperCase();
    }

    /* graphic previews */
    Object.keys(MAP).forEach(function (inputId) {
      var cfg = MAP[inputId];
      var box = document.getElementById(cfg.previewId);
      if (!box) return;
      var url = b[cfg.stateKey] ? ImageDB.url(b[cfg.stateKey]) : null;
      box.innerHTML = url
        ? '<img src="' + url + '" alt="">'
        : '<span>' + cfg.placeholder + '</span>';
    });
  }

  /* =================================================== BIND */
  function init() {
    cache();

    /* "UPLOAD" buttons proxy the hidden file inputs */
    document.querySelectorAll('[data-upload]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = document.getElementById(btn.getAttribute('data-upload'));
        if (input) input.click();
      });
    });

    Object.keys(MAP).forEach(function (inputId) {
      var input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) handleUpload(inputId, file);
        e.target.value = '';
      });
    });

    document.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        removeGraphic(btn.getAttribute('data-remove'));
      });
    });

    el.btnSaveBranding.addEventListener('click', saveIdentity);

    /* Live-preview the title in the top bar while typing, and stop the
       re-render from fighting the operator's keystrokes. */
    [el.brandTournamentName, el.brandSubtitle, el.brandRoundTitle].forEach(function (f) {
      f.addEventListener('focus', function () { typing = true; });
      f.addEventListener('blur',  function () { typing = false; render(); });
      f.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveIdentity(); });
    });
    el.brandTournamentName.addEventListener('input', function () {
      el.brandTitle.textContent = el.brandTournamentName.value || 'FUTSAL CARNIVAL';
    });
  }

  global.BrandingUI = { init: init, render: render };
})(window);
