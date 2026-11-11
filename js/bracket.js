/* =====================================================================
   bracket.js  --  SCREEN 04 : the complete tournament bracket
   ---------------------------------------------------------------------
   Shown once all 16 first-round matches are drawn. The First Round
   column carries the 32 real logos; Second Round, Quarter Final, Semi
   Final and Final stay as "M:01 WINNER" style placeholders, exactly as
   the printed artwork does -- a draw board does not know the winners.
   ===================================================================== */
(function (global) {
  'use strict';

  var el = {};
  var HOVER_BAND = 150;
  var pinned = false;
  var built = false;

  function cache() {
    [
      'stage', 'sceneCanvas', 'bgImage', 'bgDim', 'tLogo', 'tName',
      'titleR1', 'dateR1', 'dateR2', 'dateQF', 'dateSF',
      'gridR1', 'gridR2', 'gridQF', 'gridSF', 'gridFinal',
      'flowBar', 'btnFlowBoard', 'btnFlowNew',
      'opStrip', 'opState', 'btnFull', 'btnExport', 'btnHide'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ------------------------------------------------ build the shells */
  function card(stripText, leftHtml, rightHtml) {
    return '<div class="br-card">' +
      '<div class="br-strip">' + stripText + '</div>' +
      '<div class="br-body">' + leftHtml +
        '<div class="br-vs">VS</div>' + rightHtml +
      '</div></div>';
  }

  function ph(text) { return '<div class="br-ph">' + text + '</div>'; }

  function build() {
    /* --- First Round: 16 cards, real logos --- */
    var h = '';
    for (var i = 1; i <= 16; i++) {
      var slot = '<div class="br-slot"><img class="hidden" alt=""><span class="ini"></span></div>';
      h += card('Match ' + pad2(i), slot, slot);
    }
    el.gridR1.innerHTML = h;

    /* --- Second Round: SR-01..08 fed by match winners --- */
    h = '';
    for (var s = 1; s <= 8; s++) {
      h += card('SR-' + pad2(s),
        ph('M:' + pad2(s * 2 - 1) + '<br>WINNER'),
        ph('M:' + pad2(s * 2) + '<br>WINNER'));
    }
    el.gridR2.innerHTML = h;

    /* --- Quarter Final: QF-01..04 fed by SR winners --- */
    h = '';
    for (var q = 1; q <= 4; q++) {
      h += card('QF-' + pad2(q),
        ph('SR:' + pad2(q * 2 - 1) + '<br>WINNER'),
        ph('SR:' + pad2(q * 2) + '<br>WINNER'));
    }
    el.gridQF.innerHTML = h;

    /* --- Semi Final: SF-01..02 fed by QF winners --- */
    h = '';
    for (var f = 1; f <= 2; f++) {
      h += card('SF-' + pad2(f),
        ph('QF:' + pad2(f * 2 - 1) + '<br>WINNER'),
        ph('QF:' + pad2(f * 2) + '<br>WINNER'));
    }
    el.gridSF.innerHTML = h;

    /* --- Final --- */
    el.gridFinal.innerHTML =
      '<div class="br-card">' +
        '<div class="br-strip">FINAL</div>' +
        '<div class="br-body">' +
          '<div class="br-date" id="dateFinal"></div>' +
          ph('SF:01<br>WINNER') +
          '<div class="br-vs">VS</div>' +
          ph('SF:02<br>WINNER') +
        '</div>' +
      '</div>';

    built = true;
  }

  /* ------------------------------------------------ fill in the logos */
  function paintSlot(slot, team) {
    var img = slot.querySelector('img');
    var ini = slot.querySelector('.ini');
    if (!team) {
      img.classList.add('hidden');
      img.removeAttribute('src');
      ini.textContent = '';
      slot.removeAttribute('title');
      return;
    }
    var url = team.logoKey ? ImageDB.url(team.logoKey) : null;
    if (url) {
      if (img.getAttribute('src') !== url) img.src = url;
      img.classList.remove('hidden');
      ini.textContent = '';
    } else {
      img.classList.add('hidden');
      img.removeAttribute('src');
      ini.textContent = UI.initials(team.name);
    }
    slot.title = team.name;
  }

  function render() {
    if (!built) build();

    var b = Store.getState().branding;
    el.titleR1.textContent = b.roundTitle;
    [el.dateR1, el.dateR2, el.dateQF, el.dateSF].forEach(function (n) {
      n.textContent = b.matchDate || '';
    });
    var df = document.getElementById('dateFinal');
    if (df) df.textContent = b.matchDate || '';

    el.tName.textContent = b.tournamentName;

    /* background: custom upload wins, otherwise the artwork plate */
    var bgUrl = b.boardBgKey ? ImageDB.url(b.boardBgKey) : null;
    if (bgUrl) {
      el.bgImage.src = bgUrl;
      el.bgImage.classList.remove('hidden');
      /* shown exactly as uploaded -- no tint, no darkening */
      el.bgDim.classList.add('hidden');
      el.sceneCanvas.classList.add('hidden');
    } else {
      el.bgImage.classList.add('hidden');
      el.bgImage.removeAttribute('src');
      el.bgDim.classList.add('hidden');
      el.sceneCanvas.classList.remove('hidden');
    }

    var logoUrl = b.logoKey ? ImageDB.url(b.logoKey) : null;
    if (logoUrl) {
      el.tLogo.src = logoUrl;
      el.tLogo.classList.remove('hidden');
    } else {
      el.tLogo.classList.add('hidden');
      el.tLogo.removeAttribute('src');
    }

    /* the 16 drawn matches */
    var ms = Store.matches();
    var cards = el.gridR1.querySelectorAll('.br-card');
    ms.forEach(function (m, i) {
      var c = cards[i];
      if (!c) return;
      var slots = c.querySelectorAll('.br-slot');
      paintSlot(slots[0], m.left);
      paintSlot(slots[1], m.right);
    });

    var done = ms.filter(function (m) { return m.complete; }).length;
    setOpState(done + '/16 FIRST-ROUND MATCHES SET');
  }

  var pending = false, dirty = false;
  function refresh() {
    if (pending) { dirty = true; return; }
    pending = true;
    ImageDB.ensureUrls(Store.allImageKeys()).then(function () {
      pending = false;
      render();
      if (dirty) { dirty = false; refresh(); }
    }).catch(function (err) {
      pending = false;
      console.error('[bracket] render failed', err);
    });
  }

  /* ------------------------------------------------ chrome */
  function setOpState(t) { if (el.opState) el.opState.textContent = t; }

  function showBars() {
    el.opStrip.classList.add('show');
    el.flowBar.classList.remove('hidden-ui');
  }
  function hideBars() {
    if (pinned) return;
    el.opStrip.classList.remove('show');
    el.flowBar.classList.add('hidden-ui');
  }

  function initChrome() {
    global.addEventListener('mousemove', function (e) {
      if (pinned) return;
      if (e.clientY >= global.innerHeight - HOVER_BAND) showBars();
      else hideBars();
    });
    document.addEventListener('mouseleave', hideBars);
    global.addEventListener('blur', hideBars);

    el.btnFull.addEventListener('click', function () { UI.toggleFullscreen(document.documentElement); });
    el.btnHide.addEventListener('click', function () { pinned = false; hideBars(); });
    el.btnExport.addEventListener('click', function () {
      el.btnExport.disabled = true;
      Exporter.exportBracket().then(function () { el.btnExport.disabled = false; });
    });
    el.btnFlowBoard.addEventListener('click', function () { UI.go('draw-board.html'); });
    el.btnFlowNew.addEventListener('click', function () { UI.go('index.html#lottery'); });

    document.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if (k === 'f') UI.toggleFullscreen(document.documentElement);
      else if (k === 'e') Exporter.exportBracket();
      else if (k === 'w' || k === 'b') UI.go('draw-board.html');
      else if (k === 'n') UI.go('index.html#lottery');
      else if (k === 'c') {
        if (pinned) { pinned = false; hideBars(); }
        else { pinned = true; showBars(); }
      }
    });
    global.addEventListener('dblclick', function () {
      UI.toggleFullscreen(document.documentElement);
    });
  }

  function boot() {
    cache();
    UI.scaleStage(el.stage);
    Scene.paintInto(el.sceneCanvas, 'board');
    build();
    initChrome();

    Store.subscribe(function () { refresh(); });
    Store.init().then(refresh);

    showBars();
    setTimeout(hideBars, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
