/* =====================================================================
   live-result.js  --  SCREEN 02 : live single-match display
   ---------------------------------------------------------------------
   THE CRITICAL RULE
     This screen shows exactly ONE match: the match of the most recent
     selection (Store.currentMatch()).  Because that is derived from the
     click order, the first team of a match appears the instant it is
     picked -- the screen never waits for the opponent -- and the moment
     the first team of the NEXT match is picked the screen switches to
     it.  Undo rewinds the same derivation, so it always lands back on a
     valid earlier state, and a browser refresh restores the same match.

   Visually it is the draw-board match card, enlarged to fill the screen.
   ===================================================================== */
(function (global) {
  'use strict';

  var el = {};
  var prev = { matchIndex: null, leftId: null, rightId: null, idle: null };
  var HOVER_BAND = 150;    // px up from the bottom edge that reveals the bars
  var pinned = false;      // C key keeps them up
  var hintTimer = null;
  var clearedMatch = null; // index of the match already saved and cleared

  function cache() {
    [
      'stage', 'sceneCanvas', 'bgImage', 'bgDim',
      'tLogo', 'tName', 'roundTitle', 'matchDate', 'footText',
      'idleBlock', 'matchCard', 'matchStrip',
      'slotLeft', 'logoLeft', 'initialsLeft',
      'slotRight', 'logoRight', 'initialsRight', 'slotWaiting',
      'opStrip', 'opState', 'btnFull', 'btnExport', 'btnHide',
      'flowBar', 'btnFlowNext', 'nextBar', 'btnDownloadNext'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  /* restart a CSS animation class */
  function replay(node, cls) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;          // force reflow
    node.classList.add(cls);
  }

  /* ------------------------------------------------ branding */
  function renderBranding() {
    var b = Store.getState().branding;

    el.tName.textContent = b.tournamentName;
    el.roundTitle.textContent = b.roundTitle;
    el.matchDate.textContent = b.matchDate || '';
    el.footText.textContent = b.roundTitle + '  ·  LIVE DRAW';

    /* background: custom upload wins, otherwise the procedural scene */
    var bgUrl = b.liveBgKey ? ImageDB.url(b.liveBgKey) : null;
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

  /* ------------------------------------------------ one logo slot */
  function paintSlot(team, imgEl, iniEl, slotEl) {
    var url = team && team.logoKey ? ImageDB.url(team.logoKey) : null;
    if (url) {
      if (imgEl.getAttribute('src') !== url) imgEl.src = url;
      imgEl.classList.remove('hidden');
      iniEl.textContent = '';
    } else {
      imgEl.classList.add('hidden');
      imgEl.removeAttribute('src');
      iniEl.textContent = team ? UI.initials(team.name) : '';
    }
    if (slotEl) slotEl.title = team ? team.name : '';
  }

  /* ------------------------------------------------ main render */
  function render() {
    renderBranding();

    var match = Store.currentMatch();

    /* ---------- standby ---------- */
    if (!match) {
      el.idleBlock.classList.remove('hidden');
      el.matchCard.classList.add('hidden');
      el.nextBar.classList.add('hidden-ui');
      prev = { matchIndex: null, leftId: null, rightId: null, idle: true };
      setOpState('STANDBY — no team drawn yet');
      return;
    }

    el.idleBlock.classList.add('hidden');
    el.matchCard.classList.remove('hidden');

    /* This match was saved and cleared away: show an empty card for the
       match that comes next, until the operator picks its first team. */
    if (clearedMatch === match.index) {
      renderEmptyCard(match.number + 1);
      return;
    }

    var leftId  = match.left  ? match.left.id  : null;
    var rightId = match.right ? match.right.id : null;
    var switchedMatch = prev.matchIndex !== match.index || prev.idle;

    /* ---------- match number ---------- */
    el.matchStrip.textContent = 'Match-' + Store.pad2(match.number);
    if (switchedMatch) replay(el.matchCard, 'flip');

    /* ---------- left team (always present for a live match) ---------- */
    paintSlot(match.left, el.logoLeft, el.initialsLeft, el.slotLeft);
    if (switchedMatch || prev.leftId !== leftId) replay(el.slotLeft, 'enter-left');

    /* ---------- right team OR the waiting placeholder ---------- */
    if (match.right) {
      el.slotWaiting.classList.add('hidden');
      el.slotRight.classList.remove('hidden');
      paintSlot(match.right, el.logoRight, el.initialsRight, el.slotRight);

      /* animate only when the opponent is newly revealed */
      if (prev.rightId !== rightId) replay(el.slotRight, 'reveal');

      setOpState('MATCH-' + Store.pad2(match.number) + ' COMPLETE — ' +
        match.left.name + ' vs ' + match.right.name);
    } else {
      el.slotRight.classList.add('hidden');
      el.slotWaiting.classList.remove('hidden');
      if (switchedMatch || prev.rightId) replay(el.slotWaiting, 'enter-right');
      setOpState('MATCH-' + Store.pad2(match.number) + ' — waiting for opponent');
    }

    /* the button only makes sense once both teams are in */
    el.nextBar.classList.toggle('hidden-ui', !match.complete);

    prev = { matchIndex: match.index, leftId: leftId, rightId: rightId, idle: false };
  }

  /* ------------------------------------------------ cleared-card state
     A blank card carrying the next match number, so the screen is ready
     for the draw that follows without dropping all the way back to the
     standby headline. */
  function renderEmptyCard(number) {
    el.nextBar.classList.add('hidden-ui');

    if (number > Store.MATCH_COUNT) {
      el.matchCard.classList.add('hidden');
      el.idleBlock.classList.remove('hidden');
      el.idleBlock.querySelector('h2').innerHTML = 'ALL 16 MATCHES<br>ARE DRAWN';
      setOpState('DRAW COMPLETE');
      return;
    }

    el.matchStrip.textContent = 'Match-' + Store.pad2(number);
    paintSlot(null, el.logoLeft, el.initialsLeft, el.slotLeft);
    el.slotRight.classList.remove('hidden');
    el.slotWaiting.classList.add('hidden');
    paintSlot(null, el.logoRight, el.initialsRight, el.slotRight);
    replay(el.matchCard, 'flip');

    prev = { matchIndex: null, leftId: null, rightId: null, idle: false };
    setOpState('MATCH-' + Store.pad2(number) + ' — ready for the next draw');
  }

  /* Resolve every image URL before painting so no logo ever flashes.
     The dirty flag makes sure a change arriving mid-resolve is never
     dropped -- important when the operator clicks quickly. */
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
      console.error('[live-result] render failed', err);
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
    el.btnFlowNext.addEventListener('click', function () {
      UI.go('draw-board.html');
    });

    el.btnDownloadNext.addEventListener('click', function () {
      var match = Store.currentMatch();
      if (!match || !match.complete) return;
      el.btnDownloadNext.disabled = true;
      Exporter.exportLiveResult().then(function () {
        el.btnDownloadNext.disabled = false;
        clearedMatch = match.index;     // blank the card for the next draw
        render();
      });
    });
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
      Exporter.exportLiveResult().then(function () { el.btnExport.disabled = false; });
    });

    document.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if (k === 'f') UI.toggleFullscreen(document.documentElement);
      else if (k === 'e') Exporter.exportLiveResult();
      else if (k === 'c') {
        if (pinned) { pinned = false; hideBars(); }
        else { pinned = true; showBars(); }
      }
      else if (k === 'b' || k === 'w') UI.go('draw-board.html');
      else if (k === 'd') el.btnDownloadNext.click();
    });

    /* double-click anywhere toggles fullscreen -- handy on a projector */
    global.addEventListener('dblclick', function () {
      UI.toggleFullscreen(document.documentElement);
    });
  }

  /* ------------------------------------------------ boot */
  function boot() {
    cache();
    UI.scaleStage(el.stage);
    Scene.paintInto(el.sceneCanvas, 'live');   // same artwork as the export
    initOperator();
    initFlow();
    /* a short hint on load so the operator knows the bars are there */
    showBars();
    hintTimer = setTimeout(hideBars, 1800);

    Store.subscribe(function () { refresh(); });
    Store.init().then(refresh);

    /* Re-layout once webfonts land so nothing shifts mid-broadcast. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { render(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
