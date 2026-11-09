/* =====================================================================
   draw-board.js  --  SCREEN 03 : complete 16-match draw board
   ---------------------------------------------------------------------
   All 16 cards exist from the first paint and are then UPDATED IN PLACE,
   never rebuilt. That keeps every already-placed logo on screen, lets a
   newly placed logo animate on its own, and means no manual refresh is
   ever needed -- the Store subscription drives everything.

   Card design follows the supplied reference artwork: a white card with
   a pink "Match-NN" strip and a big pink VS between the two logos.
   ===================================================================== */
(function (global) {
  'use strict';

  var el = {};
  var cards = [];                 // 16 x { root, slotL, slotR }
  var prevSlots = {};             // "i:side" -> teamId, to detect new placements
  var firstPaint = true;
  var HOVER_BAND = 150;    // px up from the bottom edge that reveals the bars
  var pinned = false;      // C key keeps them up
  var hintTimer = null;

  function cache() {
    [
      'stage', 'sceneCanvas', 'bgImage', 'bgDim', 'tLogo', 'tName',
      'roundTitle', 'matchDate', 'boardGrid',
      'opStrip', 'opState', 'btnFull', 'btnExport', 'btnHide',
      'flowBar', 'btnFlowNew', 'btnFlowLive'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  /* ------------------------------------------------ build the 4x4 grid */
  function buildGrid() {
    el.boardGrid.innerHTML = '';
    cards = [];

    var frag = document.createDocumentFragment();
    for (var i = 0; i < Store.MATCH_COUNT; i++) {
      var card = document.createElement('div');
      card.className = 'db-card';
      card.innerHTML =
        '<div class="db-strip">Match-' + Store.pad2(i + 1) + '</div>' +
        '<div class="db-body">' +
          '<div class="db-slot"><img class="hidden" alt=""><span class="ini"></span></div>' +
          '<div class="db-vs">VS</div>' +
          '<div class="db-slot"><img class="hidden" alt=""><span class="ini"></span></div>' +
        '</div>';

      var slots = card.querySelectorAll('.db-slot');
      cards.push({ root: card, slotL: slots[0], slotR: slots[1] });
      frag.appendChild(card);
    }
    el.boardGrid.appendChild(frag);
  }

  /* ------------------------------------------------ paint one slot */
  function paintSlot(slot, team, animate) {
    var img = slot.querySelector('img');
    var ini = slot.querySelector('.ini');

    if (!team) {
      img.classList.add('hidden');
      img.removeAttribute('src');
      ini.textContent = '';
      slot.classList.remove('placed');
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
    slot.title = team.name;          // hover tooltip for the operator

    if (animate) {
      slot.classList.remove('placed');
      void slot.offsetWidth;         // restart the animation
      slot.classList.add('placed');
    }
  }

  /* ------------------------------------------------ branding */
  function renderBranding() {
    var b = Store.getState().branding;

    el.tName.textContent = b.tournamentName;
    el.roundTitle.textContent = b.roundTitle;
    el.matchDate.textContent = b.matchDate || '';

    /* background: custom upload wins, otherwise the procedural scene */
    var bgUrl = b.boardBgKey ? ImageDB.url(b.boardBgKey) : null;
    if (bgUrl) {
      el.bgImage.src = bgUrl;
      el.bgImage.classList.remove('hidden');
      el.bgDim.classList.remove('hidden');
      el.sceneCanvas.classList.add('hidden');
    } else {
      el.bgImage.classList.add('hidden');
      el.bgImage.removeAttribute('src');
      el.bgDim.classList.add('hidden');
      el.sceneCanvas.classList.remove('hidden');
    }

    /* tournament logo */
    var logoUrl = b.logoKey ? ImageDB.url(b.logoKey) : null;
    if (logoUrl) {
      el.tLogo.src = logoUrl;
      el.tLogo.classList.remove('hidden');
    } else {
      /* no upload -> the artwork plate already shows the shield */
      el.tLogo.classList.add('hidden');
      el.tLogo.removeAttribute('src');
    }
  }

  /* ------------------------------------------------ main render */
  function render() {
    renderBranding();

    var ms = Store.matches();
    var next = Store.nextPosition();
    var currentIdx = next ? next.matchIndex : -1;
    var nowSlots = {};

    ms.forEach(function (m, i) {
      var c = cards[i];
      if (!c) return;

      var lId = m.left ? m.left.id : null;
      var rId = m.right ? m.right.id : null;
      nowSlots[i + ':l'] = lId;
      nowSlots[i + ':r'] = rId;

      /* animate only a slot that just received a different team */
      var animL = !firstPaint && lId && prevSlots[i + ':l'] !== lId;
      var animR = !firstPaint && rId && prevSlots[i + ':r'] !== rId;

      paintSlot(c.slotL, m.left, animL);
      paintSlot(c.slotR, m.right, animR);

      if (animL || animR) {
        c.root.classList.remove('flash-in');
        void c.root.offsetWidth;
        c.root.classList.add('flash-in');
      }

      c.root.classList.toggle('is-current',
        i === currentIdx && Store.isRegistrationComplete());
    });

    prevSlots = nowSlots;
    firstPaint = false;

    var drawn = Store.pointer();
    var done = ms.filter(function (m) { return m.complete; }).length;
    setOpState(drawn + '/32 TEAMS PLACED  ·  ' + done + '/16 MATCHES COMPLETE');
    renderFlow();
  }

  /* Resolve all image URLs before painting. The dirty flag makes sure a
     change arriving mid-resolve is never dropped. */
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
      console.error('[draw-board] render failed', err);
    });
  }

  /* ------------------------------------------------ operator strip */
  function setOpState(txt) { if (el.opState) el.opState.textContent = txt; }

  /* Both bars sit at the bottom edge: move the pointer down there and they
     appear, move it away and they are gone at once. No timers, so the
     audience never sees controls lingering on screen. */
  function showBars() {
    el.opStrip.classList.add('show');
    el.flowBar.classList.remove('hidden-ui');
    document.body.classList.add('show-cursor');
  }
  function hideBars() {
    if (pinned) return;
    el.opStrip.classList.remove('show');
    el.flowBar.classList.add('hidden-ui');
    document.body.classList.remove('show-cursor');
  }

  /* ------------------------------------------------ presentation flow */
  function initFlow() {
    el.btnFlowNew.addEventListener('click', function () {
      UI.go('index.html#lottery');
    });
    el.btnFlowLive.addEventListener('click', function () {
      UI.go('live-result.html');
    });
  }

  /* The button reads DRAW COMPLETE once all 16 matches are set. */
  function renderFlow() {
    if (Store.isDrawComplete()) {
      el.btnFlowNew.textContent = '✓ DRAW COMPLETE';
    } else {
      el.btnFlowNew.textContent = '+ NEW MATCH DRAW';
    }
  }

  function initOperator() {
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
      Exporter.exportDrawBoard().then(function () { el.btnExport.disabled = false; });
    });

    document.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if (k === 'f') UI.toggleFullscreen(document.documentElement);
      else if (k === 'e') Exporter.exportDrawBoard();
      else if (k === 'c') {
        if (pinned) { pinned = false; hideBars(); }
        else { pinned = true; showBars(); }
      }
      else if (k === 'n') UI.go('index.html#lottery');
    });

    global.addEventListener('dblclick', function () {
      UI.toggleFullscreen(document.documentElement);
    });
  }

  /* ------------------------------------------------ boot */
  function boot() {
    cache();
    UI.scaleStage(el.stage);
    Scene.paintInto(el.sceneCanvas, 'board');   // same artwork as the export
    buildGrid();
    initOperator();
    initFlow();
    /* a short hint on load so the operator knows the bars are there */
    showBars();
    hintTimer = setTimeout(hideBars, 1800);

    Store.subscribe(function () { refresh(); });
    Store.init().then(refresh);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
