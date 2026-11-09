/* =====================================================================
   admin.js  --  SCREEN 01 bootstrap
   ---------------------------------------------------------------------
   Wires the tabs, boots the three feature modules (teams / lottery /
   branding), subscribes to the central Store so every local *and*
   remote change re-renders, and hosts the two PNG export buttons.
   ===================================================================== */
(function (global) {
  'use strict';

  var booted = false;

  /* ------------------------------------------------ tabs */
  function initTabs() {
    var tabs = document.querySelectorAll('.tab');
    var pages = document.querySelectorAll('.panel-page');

    function show(name) {
      tabs.forEach(function (t) {
        t.classList.toggle('is-active', t.getAttribute('data-tab') === name);
      });
      pages.forEach(function (p) {
        p.classList.toggle('is-active', p.getAttribute('data-page') === name);
      });
      try { history.replaceState(null, '', '#' + name); } catch (e) {}
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () { show(t.getAttribute('data-tab')); });
    });

    /* buttons elsewhere in the page can jump to a tab */
    document.querySelectorAll('[data-goto-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { show(btn.getAttribute('data-goto-tab')); });
    });

    var fromHash = (location.hash || '').replace('#', '');
    if (['teams', 'lottery', 'branding'].indexOf(fromHash) !== -1) show(fromHash);
  }

  /* ------------------------------------------------ presentation windows */
  function initNav() {
    function open(page, label) {
      var win = global.open(page, '_blank');
      if (!win) {
        UI.toast('Your browser blocked the pop-up. Allow pop-ups for this site, ' +
          'or open ' + page + ' manually.', 'err', 7000);
      } else {
        UI.toast(label + ' opened in a new tab. Drag it to your second monitor and ' +
          'press F for fullscreen.', 'ok', 5500);
      }
    }
    ['btnOpenLive', 'btnOpenLive2'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.addEventListener('click', function () { open('live-result.html', 'Live Result'); });
    });
    ['btnOpenBoard', 'btnOpenBoard2'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.addEventListener('click', function () { open('draw-board.html', 'Draw Board'); });
    });
    document.getElementById('btnSaveTop').addEventListener('click', function () {
      LotteryUI.save();
    });
  }

  /* ------------------------------------------------ exports */
  function initExports() {
    var live = document.getElementById('btnExportLive');
    var board = document.getElementById('btnExportBoard');
    var json = document.getElementById('btnExportJSON');

    live.addEventListener('click', function () {
      live.disabled = true;
      Exporter.exportLiveResult().then(function () { live.disabled = false; });
    });

    board.addEventListener('click', function () {
      if (!Store.isDrawStarted()) {
        UI.toast('The draw board is still empty — nothing to export yet.', 'err');
        return;
      }
      board.disabled = true;
      Exporter.exportDrawBoard().then(function () { board.disabled = false; });
    });

    json.addEventListener('click', function () {
      var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      UI.downloadBlob(blob, 'futsal-draw-backup.json');
      UI.toast('Draw backup downloaded.', 'ok');
    });
  }

  /* ------------------------------------------------ header counters */
  function renderHeader() {
    var total = Store.teams().length;
    var drawn = Store.pointer();
    document.getElementById('statRegistered').textContent = total + ' / ' + Store.MAX_TEAMS;
    document.getElementById('statSelected').textContent = drawn + ' / ' + Store.SLOTS;
    document.getElementById('statRemaining').textContent =
      Store.availableCount() + ' / ' + total;
    document.getElementById('statProgress').textContent = Store.progressPercent() + '%';
  }

  /* ------------------------------------------------ master render
     Every image key is resolved to an object URL *before* painting, so
     no card ever flashes an empty logo box.                          */
  var pending = false, dirty = false;
  function refresh() {
    if (pending) { dirty = true; return; }
    pending = true;
    ImageDB.ensureUrls(Store.allImageKeys()).then(function () {
      pending = false;
      renderHeader();
      TeamsUI.render();
      LotteryUI.render();
      BrandingUI.render();
      if (dirty) { dirty = false; refresh(); }
    }).catch(function (err) {
      pending = false;
      console.error('[admin] render failed', err);
    });
  }

  /* ------------------------------------------------ boot */
  function boot() {
    if (booted) return;
    booted = true;

    Store.onError(function (msg) { UI.toast(msg, 'err', 8000); });

    initTabs();
    initNav();
    initExports();

    TeamsUI.init();
    LotteryUI.init();
    BrandingUI.init();

    Store.subscribe(function () { refresh(); });

    Store.init().then(function () {
      refresh();
      /* First run on this browser: pull every logo out of /LOGO and
         register each file name as a team, so the operator starts with
         the squad already loaded. */
      return TeamsUI.autoImportOnce();
    }).then(function () {
      refresh();
    });

    /* Warn before closing with an unsaved draw in progress. */
    global.addEventListener('beforeunload', function (e) {
      if (global.__flowNavigating) return;   // moving on through the flow
      var s = Store.getState();
      if (s.order.length && s.updatedAt > s.savedAt) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
