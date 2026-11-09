/* =====================================================================
   ui.js  --  Small shared helpers used by all three screens
     UI.toast(msg, kind)          non-blocking notification
     UI.confirm({...})            promise-based confirm modal (Screen 01)
     UI.validateImageFile(file)   format / size guard
     UI.scaleStage(el)            fit the 1920x1080 stage into the viewport
     UI.toggleFullscreen(el)      Fullscreen API with vendor fallbacks
     UI.escapeHtml(str)
   ===================================================================== */
(function (global) {
  'use strict';

  var ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  var MAX_BYTES = 12 * 1024 * 1024;   // 12 MB per image

  /* ------------------------------------------------ toast */
  function toast(message, kind, ms) {
    var host = document.getElementById('toastHost');
    if (!host) { console.log('[toast]', message); return; }

    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    host.appendChild(el);

    var life = ms || (kind === 'err' ? 5200 : 3000);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, life);
  }

  /* ------------------------------------------------ confirm modal */
  function confirmDialog(opts) {
    opts = opts || {};
    var host = document.getElementById('confirmModal');
    if (!host) return Promise.resolve(global.confirm(opts.body || 'Are you sure?'));

    var titleEl = document.getElementById('confirmTitle');
    var bodyEl  = document.getElementById('confirmBody');
    var yesBtn  = document.getElementById('btnConfirmYes');
    var noBtn   = document.getElementById('btnConfirmNo');

    titleEl.textContent = opts.title || 'CONFIRM';
    bodyEl.innerHTML = opts.body || 'Are you sure?';
    yesBtn.textContent = opts.confirmText || 'CONFIRM';
    noBtn.textContent  = opts.cancelText  || 'CANCEL';
    yesBtn.className = 'btn ' + (opts.danger === false ? 'btn-pink' : 'btn-danger');

    host.classList.remove('hidden');

    return new Promise(function (resolve) {
      function cleanup(result) {
        host.classList.add('hidden');
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
        host.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onYes() { cleanup(true); }
      function onNo()  { cleanup(false); }
      function onBackdrop(e) { if (e.target === host) cleanup(false); }
      function onKey(e) {
        if (e.key === 'Escape') cleanup(false);
        if (e.key === 'Enter')  cleanup(true);
      }
      yesBtn.addEventListener('click', onYes);
      noBtn.addEventListener('click', onNo);
      host.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
    });
  }

  /* ------------------------------------------------ file validation */
  function validateImageFile(file) {
    if (!file) return { ok: false, error: 'No file selected.' };

    var type = (file.type || '').toLowerCase();
    var byExt = /\.(png|jpe?g|webp)$/i.test(file.name || '');
    if (ALLOWED.indexOf(type) === -1 && !byExt) {
      return { ok: false, error: 'Unsupported format. Use PNG, JPG, JPEG or WEBP.' };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, error: 'Image is larger than 12 MB. Please compress it first.' };
    }
    if (file.size === 0) {
      return { ok: false, error: 'That file is empty.' };
    }
    return { ok: true };
  }

  /* ------------------------------------------------ 16:9 stage scaler
     Screens 02/03 are built at an exact 1920x1080 and uniformly scaled,
     which keeps the composition and every logo proportion intact at
     1920x1080, 1600x900, 1366x768 and anything else.                 */
  function scaleStage(stage) {
    if (!stage) return;
    function apply() {
      var pad = 0;
      var vw = global.innerWidth - pad;
      var vh = global.innerHeight - pad;
      var scale = Math.min(vw / 1920, vh / 1080);
      stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
    }
    apply();
    global.addEventListener('resize', apply);
    global.addEventListener('orientationchange', apply);
    if (global.document.fonts && global.document.fonts.ready) {
      global.document.fonts.ready.then(apply);
    }
    return apply;
  }

  /* ------------------------------------------------ fullscreen */
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement ||
      document.mozFullScreenElement || document.msFullscreenElement);
  }

  function toggleFullscreen(el) {
    el = el || document.documentElement;
    try {
      if (!isFullscreen()) {
        var req = el.requestFullscreen || el.webkitRequestFullscreen ||
                  el.mozRequestFullScreen || el.msRequestFullscreen;
        if (req) req.call(el);
      } else {
        var exit = document.exitFullscreen || document.webkitExitFullscreen ||
                   document.mozCancelFullScreen || document.msExitFullscreen;
        if (exit) exit.call(document);
      }
    } catch (err) {
      toast('Fullscreen was blocked by the browser.', 'err');
    }
  }

  /* ------------------------------------------------ misc */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);
  }

  /* ------------------------------------------------ presentation flow
     The operator can run the whole draw from one window:
         control panel  --(match complete)-->  live result
         live result    --(button)---------->  full draw board
         full draw board--(NEW MATCH DRAW)-->  control panel
     Screens opened in their own tabs are untouched by this -- they just
     keep live-updating -- because only the tab where the click happened
     ever navigates. The operator can switch it off at any time. */
  var FLOW_KEY = 'futsal_flow_auto_v1';

  function flowEnabled() {
    try {
      var v = global.localStorage.getItem(FLOW_KEY);
      return v === null ? true : v === '1';     // on by default
    } catch (e) { return true; }
  }

  function setFlowEnabled(on) {
    try { global.localStorage.setItem(FLOW_KEY, on ? '1' : '0'); } catch (e) {}
  }

  function go(page, delay) {
    /* Flag the jump so the control panel does not fire its unsaved-work
       warning -- the draw is already persisted on every single click. */
    global.__flowNavigating = true;
    if (!delay) { global.location.href = page; return; }
    setTimeout(function () { global.location.href = page; }, delay);
  }

  global.UI = {
    toast: toast,
    flowEnabled: flowEnabled,
    setFlowEnabled: setFlowEnabled,
    go: go,
    confirm: confirmDialog,
    validateImageFile: validateImageFile,
    scaleStage: scaleStage,
    toggleFullscreen: toggleFullscreen,
    isFullscreen: isFullscreen,
    escapeHtml: escapeHtml,
    initials: initials,
    downloadBlob: downloadBlob
  };
})(window);
