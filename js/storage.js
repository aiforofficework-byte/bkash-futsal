/* =====================================================================
   storage.js  --  Centralised tournament state + real-time sync
   ---------------------------------------------------------------------
   Single source of truth for all three screens.

     * LocalStorage      -> lightweight tournament state (persistence)
     * IndexedDB         -> the actual image blobs (see database.js)
     * BroadcastChannel  -> instant same-origin cross-tab messaging
     * storage event     -> fallback when BroadcastChannel is missing

   STATE SHAPE
   -----------
   {
     version : 1,
     teams   : [ { id, name, logoKey, createdAt } ],      // max 32
     order   : [ teamId, teamId, ... ],                   // click sequence
     branding: { tournamentName, subtitle, roundTitle,
                 logoKey, liveBgKey, boardBgKey },
     savedAt : <timestamp of last explicit SAVE DRAW>,
     updatedAt: <timestamp of last mutation>
   }

   `order` IS the lottery.  Position p in that array means:
       match index = floor(p / 2)        (0..15)
       side        = p % 2 === 0 ? LEFT : RIGHT
   Deriving matches from one ordered array makes UNDO trivially correct
   and guarantees the sequential rule can never be violated.
   ===================================================================== */
(function (global) {
  'use strict';

  var LS_KEY      = 'futsal_lottery_state_v1';
  var CHANNEL     = 'futsal_lottery_channel_v1';
  var PING_KEY    = 'futsal_lottery_ping_v1';

  var MAX_TEAMS   = 32;
  var MATCH_COUNT = 16;
  var SLOTS       = MATCH_COUNT * 2;   // 32

  /* ------------------------------------------------ default state */
  function defaultState() {
    return {
      version: 1,
      teams: [],
      order: [],
      branding: {
        tournamentName: 'FUTSAL CARNIVAL',
        subtitle: 'DHAKA 2026',
        roundTitle: 'First Round',
        matchDate: '21 Nov 2026',
        logoKey: null,
        liveBgKey: null,
        boardBgKey: null
      },
      savedAt: 0,
      updatedAt: 0
    };
  }

  var _state = defaultState();
  var _listeners = [];
  var _channel = null;
  var _selfId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var _suppress = false;   // guard against echoing our own broadcasts

  /* ------------------------------------------------ sanitising
     Any state coming from LocalStorage (possibly written by an older
     build, or hand-edited) is normalised so the rest of the app can
     trust its shape without defensive checks everywhere.            */
  function sanitize(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;

    var out = base;

    /* --- teams --- */
    if (Array.isArray(raw.teams)) {
      var seen = {};
      out.teams = raw.teams
        .filter(function (t) { return t && typeof t === 'object' && t.id; })
        .filter(function (t) {                       // enforce unique ids
          if (seen[t.id]) return false;
          seen[t.id] = 1;
          return true;
        })
        .slice(0, MAX_TEAMS)
        .map(function (t) {
          return {
            id: String(t.id),
            name: String(t.name == null ? '' : t.name),
            logoKey: t.logoKey ? String(t.logoKey) : null,
            createdAt: Number(t.createdAt) || Date.now()
          };
        });
    }

    /* --- order: must reference real teams, no duplicates, max 32 --- */
    if (Array.isArray(raw.order)) {
      var ids = {};
      out.teams.forEach(function (t) { ids[t.id] = 1; });
      var used = {};
      out.order = raw.order
        .map(String)
        .filter(function (id) {
          if (!ids[id] || used[id]) return false;
          used[id] = 1;
          return true;
        })
        .slice(0, SLOTS);
    }

    /* --- branding --- */
    if (raw.branding && typeof raw.branding === 'object') {
      var b = raw.branding;
      out.branding = {
        tournamentName: b.tournamentName != null ? String(b.tournamentName) : base.branding.tournamentName,
        subtitle: b.subtitle != null ? String(b.subtitle) : base.branding.subtitle,
        roundTitle: b.roundTitle != null ? String(b.roundTitle) : base.branding.roundTitle,
        matchDate: b.matchDate != null ? String(b.matchDate) : base.branding.matchDate,
        logoKey: b.logoKey ? String(b.logoKey) : null,
        liveBgKey: b.liveBgKey ? String(b.liveBgKey) : null,
        boardBgKey: b.boardBgKey ? String(b.boardBgKey) : null
      };
    }

    out.savedAt = Number(raw.savedAt) || 0;
    out.updatedAt = Number(raw.updatedAt) || 0;
    return out;
  }

  /* ------------------------------------------------ persistence */
  function load() {
    var raw = null;
    try {
      raw = global.localStorage.getItem(LS_KEY);
    } catch (err) {
      console.warn('[Store] LocalStorage unreadable.', err);
    }
    if (raw) {
      try {
        _state = sanitize(JSON.parse(raw));
      } catch (err) {
        console.warn('[Store] Corrupt saved state - starting fresh.', err);
        _state = defaultState();
      }
    } else {
      _state = defaultState();
    }
    return _state;
  }

  function persist() {
    try {
      global.localStorage.setItem(LS_KEY, JSON.stringify(_state));
      return true;
    } catch (err) {
      console.error('[Store] Could not save state (quota?).', err);
      notifyError('Tournament state could not be saved to this browser. ' +
        'Storage may be full or disabled.');
      return false;
    }
  }

  var _errorHandlers = [];
  function onError(fn) { _errorHandlers.push(fn); }
  function notifyError(msg) {
    _errorHandlers.forEach(function (fn) { try { fn(msg); } catch (e) {} });
  }

  /* ------------------------------------------------ broadcast */
  function initChannel() {
    if (global.BroadcastChannel) {
      try {
        _channel = new global.BroadcastChannel(CHANNEL);
        _channel.onmessage = function (ev) {
          var msg = ev.data;
          if (!msg || msg.from === _selfId) return;
          if (msg.type === 'state') {
            _state = sanitize(msg.state);
            emit('remote');
          } else if (msg.type === 'request') {
            // A screen just opened and wants the freshest state.
            send('state');
          }
        };
      } catch (err) {
        console.warn('[Store] BroadcastChannel failed.', err);
        _channel = null;
      }
    }

    /* storage-event fallback (also fires for browsers w/o BroadcastChannel) */
    global.addEventListener('storage', function (ev) {
      if (_suppress) return;
      if (ev.key === LS_KEY || ev.key === PING_KEY) {
        load();
        emit('remote');
      }
    });
  }

  function send(type) {
    var msg = { type: type, from: _selfId, state: _state, at: Date.now() };
    if (_channel) {
      try { _channel.postMessage(msg); } catch (err) { /* ignore */ }
    }
    /* Also nudge the storage event so tabs without BroadcastChannel sync. */
    try {
      _suppress = true;
      global.localStorage.setItem(PING_KEY, String(Date.now()));
      _suppress = false;
    } catch (err) { _suppress = false; }
  }

  /* ------------------------------------------------ change events */
  function subscribe(fn) {
    _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (f) { return f !== fn; });
    };
  }

  function emit(source) {
    _listeners.forEach(function (fn) {
      try { fn(_state, source || 'local'); } catch (err) { console.error(err); }
    });
  }

  /* Commit a local mutation: stamp, persist, broadcast, re-render. */
  function commit() {
    _state.updatedAt = Date.now();
    persist();
    send('state');
    emit('local');
  }

  /* ------------------------------------------------ derived getters */
  function getState() { return _state; }

  function teams() { return _state.teams.slice(); }

  function teamById(id) {
    for (var i = 0; i < _state.teams.length; i++) {
      if (_state.teams[i].id === id) return _state.teams[i];
    }
    return null;
  }

  /* 16 match objects derived from the click order. */
  function matches() {
    var out = [];
    for (var m = 0; m < MATCH_COUNT; m++) {
      var l = _state.order[m * 2];
      var r = _state.order[m * 2 + 1];
      out.push({
        index: m,
        number: m + 1,
        label: 'MATCH-' + pad2(m + 1),
        left: l ? teamById(l) : null,
        right: r ? teamById(r) : null,
        complete: !!(l && r)
      });
    }
    return out;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* How many slots are filled (0..32) -- also the next slot's index. */
  function pointer() { return _state.order.length; }

  /* Where the NEXT click lands. null once all 32 are placed. */
  function nextPosition() {
    var p = pointer();
    if (p >= SLOTS) return null;
    return {
      slot: p,
      matchIndex: Math.floor(p / 2),
      matchNumber: Math.floor(p / 2) + 1,
      side: p % 2 === 0 ? 'left' : 'right',
      sideLabel: p % 2 === 0 ? 'LEFT TEAM' : 'RIGHT TEAM',
      matchLabel: 'MATCH-' + pad2(Math.floor(p / 2) + 1)
    };
  }

  /* The match Screen 02 must show: the match of the MOST RECENT pick.
     With zero picks there is nothing live yet -> null.                */
  function currentMatchIndex() {
    var p = pointer();
    if (p === 0) return null;
    return Math.floor((p - 1) / 2);
  }

  function currentMatch() {
    var i = currentMatchIndex();
    return i === null ? null : matches()[i];
  }

  function isSelected(teamId) {
    return _state.order.indexOf(teamId) !== -1;
  }

  function availableCount() { return _state.teams.length - _state.order.length; }

  function progressPercent() {
    return Math.round((_state.order.length / SLOTS) * 100);
  }

  function isRegistrationComplete() { return _state.teams.length === MAX_TEAMS; }

  function isDrawComplete() { return _state.order.length === SLOTS; }

  function isDrawStarted() { return _state.order.length > 0; }

  /* Every image key the state references -- used to pre-resolve URLs. */
  function allImageKeys() {
    var out = [];
    _state.teams.forEach(function (t) { if (t.logoKey) out.push(t.logoKey); });
    ['logoKey', 'liveBgKey', 'boardBgKey'].forEach(function (k) {
      if (_state.branding[k]) out.push(_state.branding[k]);
    });
    return out;
  }

  /* ------------------------------------------------ team mutations */
  function addTeam(name, logoKey) {
    if (_state.teams.length >= MAX_TEAMS) {
      return { ok: false, error: 'Maximum of ' + MAX_TEAMS + ' teams already registered.' };
    }
    var clean = String(name || '').trim();
    if (!clean) return { ok: false, error: 'Team name is required.' };

    var id = 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    _state.teams.push({ id: id, name: clean, logoKey: logoKey || null, createdAt: Date.now() });
    commit();
    return { ok: true, id: id };
  }

  function updateTeam(id, patch) {
    var t = teamById(id);
    if (!t) return { ok: false, error: 'Team not found.' };
    if (patch.name != null) {
      var clean = String(patch.name).trim();
      if (!clean) return { ok: false, error: 'Team name cannot be empty.' };
      t.name = clean;
    }
    if (patch.logoKey !== undefined) {
      if (t.logoKey && t.logoKey !== patch.logoKey) {
        ImageDB.delete(t.logoKey);     // drop the replaced blob
      }
      t.logoKey = patch.logoKey || null;
    }
    commit();
    return { ok: true };
  }

  /* Deleting a team that is already drawn would corrupt the board, so the
     caller must pass force:true (after confirming) -- we then remove it
     from the draw order too, which re-packs later picks. Validation rule
     #12 is enforced by teams.js refusing to force without confirmation. */
  function deleteTeam(id, force) {
    var t = teamById(id);
    if (!t) return { ok: false, error: 'Team not found.' };
    if (isSelected(id) && !force) {
      return { ok: false, error: 'That team is already placed in the draw.', needsForce: true };
    }
    if (t.logoKey) ImageDB.delete(t.logoKey);
    _state.teams = _state.teams.filter(function (x) { return x.id !== id; });
    _state.order = _state.order.filter(function (x) { return x !== id; });
    commit();
    return { ok: true };
  }

  function clearAllTeams() {
    _state.teams.forEach(function (t) { if (t.logoKey) ImageDB.delete(t.logoKey); });
    _state.teams = [];
    _state.order = [];
    commit();
    return { ok: true };
  }

  /* ------------------------------------------------ lottery mutations */
  function selectTeam(teamId) {
    if (!isRegistrationComplete()) {
      return { ok: false, error: 'Register all ' + MAX_TEAMS + ' teams before starting the draw.' };
    }
    if (pointer() >= SLOTS) {
      return { ok: false, error: 'All 16 matches are already complete.' };
    }
    var t = teamById(teamId);
    if (!t) return { ok: false, error: 'Unknown team.' };
    if (isSelected(teamId)) return { ok: false, error: t.name + ' has already been drawn.' };

    var pos = nextPosition();
    _state.order.push(teamId);
    commit();
    return { ok: true, position: pos };
  }

  function undo() {
    if (!_state.order.length) return { ok: false, error: 'Nothing to undo.' };
    var id = _state.order.pop();
    commit();
    return { ok: true, teamId: id, team: teamById(id) };
  }

  function resetDraw() {
    _state.order = [];
    commit();
    return { ok: true };
  }

  function saveDraw() {
    _state.savedAt = Date.now();
    commit();
    return { ok: true, savedAt: _state.savedAt };
  }

  /* ------------------------------------------------ branding */
  function setBranding(patch) {
    Object.keys(patch).forEach(function (k) {
      if (!(k in _state.branding)) return;
      var val = patch[k];
      if (/Key$/.test(k)) {
        var old = _state.branding[k];
        if (old && old !== val) ImageDB.delete(old);
        _state.branding[k] = val || null;
      } else {
        _state.branding[k] = String(val == null ? '' : val);
      }
    });
    commit();
    return { ok: true };
  }

  /* ------------------------------------------------ import / export JSON */
  function exportJSON() {
    return JSON.stringify(_state, null, 2);
  }

  /* ------------------------------------------------ boot */
  function init() {
    load();
    initChannel();
    return ImageDB.open().then(function () {
      /* Ask any already-open screen for its in-memory state so a freshly
         opened tab is never a step behind. */
      if (_channel) { try { _channel.postMessage({ type: 'request', from: _selfId }); } catch (e) {} }
      return _state;
    });
  }

  global.Store = {
    /* constants */
    MAX_TEAMS: MAX_TEAMS,
    MATCH_COUNT: MATCH_COUNT,
    SLOTS: SLOTS,

    /* lifecycle */
    init: init,
    reload: load,
    subscribe: subscribe,
    onError: onError,

    /* getters */
    getState: getState,
    teams: teams,
    teamById: teamById,
    matches: matches,
    pointer: pointer,
    nextPosition: nextPosition,
    currentMatch: currentMatch,
    currentMatchIndex: currentMatchIndex,
    isSelected: isSelected,
    availableCount: availableCount,
    progressPercent: progressPercent,
    isRegistrationComplete: isRegistrationComplete,
    isDrawComplete: isDrawComplete,
    isDrawStarted: isDrawStarted,
    allImageKeys: allImageKeys,
    pad2: pad2,

    /* mutations */
    addTeam: addTeam,
    updateTeam: updateTeam,
    deleteTeam: deleteTeam,
    clearAllTeams: clearAllTeams,
    selectTeam: selectTeam,
    undo: undo,
    resetDraw: resetDraw,
    saveDraw: saveDraw,
    setBranding: setBranding,
    exportJSON: exportJSON
  };
})(window);
