/* =====================================================================
   lottery.js  --  SCREEN 01 : sequential manual lottery
   ---------------------------------------------------------------------
   THE RULE
     Clicks fill a single ordered list. Slot p in that list is
         match = floor(p / 2),  side = (p % 2 === 0) ? LEFT : RIGHT
     so the order is strictly
         M01-LEFT, M01-RIGHT, M02-LEFT, M02-RIGHT, ... M16-RIGHT
     There is NO randomisation and NO shuffling anywhere in this file.

   Also owns: next-selection banner, progress ring, team selection grid,
   the 16-match admin overview, and UNDO / RESET / SAVE.
   ===================================================================== */
(function (global) {
  'use strict';

  var RING_CIRCUMFERENCE = 2 * Math.PI * 52;   // r=52 in the SVG

  var lastPicked = null;    // team id to flash after a successful pick
  var el = {};

  function cache() {
    [
      'nextBanner', 'nextMatchLabel', 'nextSideLabel', 'nextNote',
      'ringValue', 'lotteryProgressPct',
      'lotteryLock', 'lotteryLockText',
      'btnUndo', 'btnReset', 'btnSave', 'saveStamp',
      'selectionGrid', 'matchOverview'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  /* =================================================== SELECT */
  function pick(teamId) {
    var res = Store.selectTeam(teamId);
    if (!res.ok) { UI.toast(res.error, 'err'); return; }

    lastPicked = teamId;
    var t = Store.teamById(teamId);
    var pos = res.position;
    UI.toast(pos.matchLabel + ' ' + pos.sideLabel + ': ' + t.name, 'ok', 2200);

    if (Store.isDrawComplete()) {
      UI.toast('DRAW COMPLETE - all 16 matches are set.', 'ok', 6000);
    }

    /* The control panel never navigates away. The presentation screens
       live in their own tabs and update themselves, so the operator can
       keep both hands on this one. */
  }

  /* =================================================== CONTROLS */
  function undo() {
    var before = Store.pointer();
    if (!before) { UI.toast('Nothing to undo.', 'err'); return; }

    /* Describe the slot we are about to clear, for a useful message. */
    var slot = before - 1;
    var label = 'MATCH-' + Store.pad2(Math.floor(slot / 2) + 1) + ' ' +
                (slot % 2 === 0 ? 'LEFT' : 'RIGHT');

    var res = Store.undo();
    if (!res.ok) { UI.toast(res.error, 'err'); return; }
    lastPicked = null;
    UI.toast('Undone: ' + label + ' is empty again.', 'ok');
  }

  function reset() {
    if (!Store.isDrawStarted()) { UI.toast('The draw is already empty.', 'err'); return; }
    UI.confirm({
      title: 'RESET DRAW',
      body: 'Clear <strong>all 16 match assignments</strong> and return every team to ' +
            'AVAILABLE?<br><br>Team names and logos are kept. ' +
            'Both presentation screens reset immediately.',
      confirmText: 'RESET DRAW'
    }).then(function (yes) {
      if (!yes) return;
      Store.resetDraw();
      lastPicked = null;
      UI.toast('Draw reset. Next selection is MATCH-01 LEFT TEAM.', 'ok');
    });
  }

  function save() {
    var res = Store.saveDraw();
    if (res.ok) UI.toast('Tournament state saved.', 'ok');
  }

  /* =================================================== RENDER */
  function renderBanner() {
    var next = Store.nextPosition();
    var pct = Store.progressPercent();

    el.lotteryProgressPct.textContent = pct + '%';
    el.ringValue.style.strokeDasharray = RING_CIRCUMFERENCE;
    el.ringValue.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - pct / 100);

    if (!Store.isRegistrationComplete()) {
      el.nextBanner.classList.remove('is-done');
      el.nextMatchLabel.textContent = 'LOCKED';
      el.nextSideLabel.textContent = 'REGISTRATION INCOMPLETE';
      el.nextNote.textContent = 'Register exactly ' + Store.MAX_TEAMS +
        ' teams to unlock the lottery.';
    } else if (!next) {
      el.nextBanner.classList.add('is-done');
      el.nextMatchLabel.textContent = 'COMPLETE';
      el.nextSideLabel.textContent = 'ALL 16 MATCHES SET';
      el.nextNote.textContent = 'Use UNDO to correct a selection, or RESET DRAW to start again.';
    } else {
      el.nextBanner.classList.remove('is-done');
      el.nextMatchLabel.textContent = next.matchLabel;
      el.nextSideLabel.textContent = next.sideLabel;
      el.nextNote.textContent = next.side === 'left'
        ? 'Click a team logo to open ' + next.matchLabel + '. Screen 02 switches to it instantly.'
        : 'Click a team logo to complete ' + next.matchLabel + '.';
    }

    /* lock note */
    var locked = !Store.isRegistrationComplete();
    el.lotteryLock.classList.toggle('hidden', !locked);
    if (locked) {
      el.lotteryLockText.textContent = 'Exactly ' + Store.MAX_TEAMS +
        ' registered teams are required — currently ' + Store.teams().length + '. ';
    }

    /* buttons */
    el.btnUndo.disabled = !Store.isDrawStarted();
    el.btnReset.disabled = !Store.isDrawStarted();

    var savedAt = Store.getState().savedAt;
    el.saveStamp.textContent = savedAt
      ? 'LAST SAVED ' + new Date(savedAt).toLocaleTimeString()
      : 'NOT SAVED YET';
  }

  function renderGrid() {
    var teams = Store.teams();
    var order = Store.getState().order;
    var regOK = Store.isRegistrationComplete();
    var done = Store.isDrawComplete();

    el.selectionGrid.innerHTML = '';
    if (!teams.length) {
      el.selectionGrid.innerHTML =
        '<p class="empty-state" style="grid-column:1/-1">' +
        'No teams registered yet. Open the TEAM MANAGEMENT tab first.</p>';
      return;
    }

    var frag = document.createDocumentFragment();
    teams.forEach(function (t) {
      var slot = order.indexOf(t.id);
      var selected = slot !== -1;
      var url = t.logoKey ? ImageDB.url(t.logoKey) : null;

      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'team-card' +
        (selected ? ' is-selected' : '') +
        (!regOK || done ? ' is-locked' : '') +
        (t.id === lastPicked ? ' just-picked' : '');
      card.setAttribute('data-team', t.id);
      card.disabled = selected || !regOK || done;
      card.title = selected
        ? t.name + ' — already drawn'
        : (regOK ? 'Place ' + t.name : 'Registration incomplete');

      var tag = '';
      if (selected) {
        tag = '<span class="slot-tag">M' + Store.pad2(Math.floor(slot / 2) + 1) +
              ' ' + (slot % 2 === 0 ? 'L' : 'R') + '</span>';
      }

      card.innerHTML =
        tag +
        '<div class="card-logo">' +
          (url
            ? '<img class="logo-fit" src="' + url + '" alt="">'
            : '<span class="ph">' + UI.escapeHtml(UI.initials(t.name)) + '</span>') +
        '</div>' +
        '<div class="card-name">' + UI.escapeHtml(t.name) + '</div>' +
        '<div class="card-status">' + (selected ? 'SELECTED' : 'AVAILABLE') + '</div>';

      frag.appendChild(card);
    });
    el.selectionGrid.appendChild(frag);
    lastPicked = null;   // flash only once
  }

  function renderOverview() {
    var ms = Store.matches();
    var currentIdx = Store.nextPosition() ? Store.nextPosition().matchIndex : -1;

    el.matchOverview.innerHTML = '';
    var frag = document.createDocumentFragment();

    ms.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'mo-row' +
        (m.index === currentIdx ? ' is-current' : '') +
        (m.complete ? ' is-complete' : '');
      row.innerHTML =
        '<div class="mo-num">' + m.label + '</div>' +
        side(m.left, 'left') +
        '<div class="mo-vs">VS</div>' +
        side(m.right, 'right');
      frag.appendChild(row);
    });
    el.matchOverview.appendChild(frag);

    function side(team, which) {
      var url = team && team.logoKey ? ImageDB.url(team.logoKey) : null;
      return '<div class="mo-team ' + which + '">' +
        '<div class="mo-logo' + (team ? '' : ' empty') + '">' +
          (url ? '<img class="logo-fit" src="' + url + '" alt="">' : '') +
        '</div>' +
        '<div class="mo-name' + (team ? '' : ' empty') + '">' +
          (team ? UI.escapeHtml(team.name) : '—') +
        '</div>' +
      '</div>';
    }
  }

  function render() {
    renderBanner();
    renderGrid();
    renderOverview();
  }

  /* =================================================== BIND */
  function init() {
    cache();

    el.selectionGrid.addEventListener('click', function (e) {
      var card = e.target.closest('[data-team]');
      if (!card || card.disabled) return;
      pick(card.getAttribute('data-team'));
    });

    el.btnUndo.addEventListener('click', undo);
    el.btnReset.addEventListener('click', reset);
    el.btnSave.addEventListener('click', save);

    /* Ctrl/Cmd+Z undoes the last selection, as long as no field is focused. */
    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    });
  }

  global.LotteryUI = { init: init, render: render, save: save };
})(window);
