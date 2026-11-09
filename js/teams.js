/* =====================================================================
   teams.js  --  SCREEN 01 : team registration, editing, deletion
   ---------------------------------------------------------------------
   Owns the "TEAM MANAGEMENT" tab:
     * add a team (name + logo upload with live preview)
     * bulk-import every logo in the /LOGO folder
     * search / list all registered teams
     * edit a name, replace a logo, delete a team
     * registration progress + warnings
   ===================================================================== */
(function (global) {
  'use strict';

  var MAX = Store.MAX_TEAMS;

  var pendingLogo = null;    // File chosen for the "add team" form
  var editingId   = null;    // team currently open in the edit modal
  var editLogo    = null;    // replacement File chosen in the edit modal
  var searchTerm  = '';

  var el = {};

  function cache() {
    [
      'teamName', 'teamLogoInput', 'logoPreview', 'btnPickLogo', 'btnClearLogo',
      'logoFileName', 'btnAddTeam', 'btnImportFolder', 'chipSlots',
      'regProgressBar', 'regProgressText', 'regRemainingText',
      'regWarning', 'regWarningText', 'regReady',
      'teamSearch', 'teamList', 'teamListCount', 'teamListEmpty',
      'btnClearTeams',
      'editModal', 'editName', 'editLogoInput', 'editPreview', 'btnEditPick',
      'editFileName', 'btnEditSave', 'btnEditCancel'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  /* =================================================== ADD TEAM FORM */
  function showPendingPreview(file) {
    var box = el.logoPreview;
    box.innerHTML = '';
    if (!file) {
      box.innerHTML = '<span>NO LOGO</span>';
      el.logoFileName.textContent = 'No file selected';
      return;
    }
    var img = document.createElement('img');
    img.className = 'logo-fit';
    img.alt = '';
    img.src = URL.createObjectURL(file);
    img.onload = function () { /* keep the URL alive while visible */ };
    box.appendChild(img);
    el.logoFileName.textContent = file.name;
  }

  function onPickLogo(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var check = UI.validateImageFile(file);
    if (!check.ok) { UI.toast(check.error, 'err'); e.target.value = ''; return; }
    pendingLogo = file;
    showPendingPreview(file);
  }

  function clearPendingLogo() {
    pendingLogo = null;
    el.teamLogoInput.value = '';
    showPendingPreview(null);
  }

  function addTeam() {
    var name = el.teamName.value.trim();
    if (!name) { UI.toast('Enter a team name first.', 'err'); el.teamName.focus(); return; }
    if (Store.teams().length >= MAX) {
      UI.toast('All ' + MAX + ' team slots are filled.', 'err');
      return;
    }
    var dup = Store.teams().some(function (t) {
      return t.name.toLowerCase() === name.toLowerCase();
    });
    if (dup) { UI.toast('A team called "' + name + '" is already registered.', 'err'); return; }

    var finish = function (logoKey) {
      var res = Store.addTeam(name, logoKey);
      if (!res.ok) { UI.toast(res.error, 'err'); return; }
      el.teamName.value = '';
      clearPendingLogo();
      el.teamName.focus();
      UI.toast(name + ' registered (' + Store.teams().length + '/' + MAX + ').', 'ok');
    };

    if (pendingLogo) {
      var key = ImageDB.newKey('team');
      ImageDB.put(key, pendingLogo)
        .then(function () { return ImageDB.ensureUrl(key); })
        .then(function () { finish(key); })
        .catch(function (err) {
          console.error(err);
          UI.toast('Could not store that logo. The team was not added.', 'err');
        });
    } else {
      finish(null);
    }
  }

  /* =================================================== BULK IMPORT
     Reads every file listed in js/logo-manifest.js (generated from the
     /LOGO folder), stores the artwork in IndexedDB and registers the
     file name as the team name. Runs automatically the first time the
     panel is opened, and can be re-run from the button at any time.  */
  var SIG_KEY = 'futsal_logo_manifest_sig_v1';

  /* A fingerprint of the current /LOGO contents. When js/logo-manifest.js
     changes (logos added, removed or renamed) the fingerprint changes and
     the squad is rebuilt, so the panel never shows a stale team list. */
  function manifestSignature() {
    return (global.LOGO_MANIFEST || []).map(function (m) {
      return m.name + '>' + m.file;
    }).join('|');
  }

  function autoImportOnce() {
    var manifest = global.LOGO_MANIFEST || [];
    if (!manifest.length) return Promise.resolve(false);

    var sig = manifestSignature();
    var stored = null;
    try { stored = global.localStorage.getItem(SIG_KEY); } catch (e) {}

    /* Already imported this exact folder -> leave the operator's work alone. */
    if (stored === sig) return Promise.resolve(false);

    var rebuilding = stored !== null && Store.teams().length > 0;
    if (rebuilding) {
      Store.clearAllTeams();
      UI.toast('The /LOGO folder changed — rebuilding the team list.', 'ok', 6000);
    } else {
      UI.toast('Loading team logos from the /LOGO folder…');
    }

    /* The fingerprint is stored only once every logo actually landed, so an
       interrupted or failed import is retried on the next page load instead
       of leaving the operator with a half-built squad. */
    return importFolder(true).then(function () {
      var got = 0;
      var names = {};
      Store.teams().forEach(function (t) { names[t.name.toLowerCase()] = 1; });
      manifest.forEach(function (m) { if (names[m.name.toLowerCase()]) got++; });
      if (got === manifest.length) {
        try { global.localStorage.setItem(SIG_KEY, sig); } catch (e) {}
        return true;
      }
      console.warn('[teams] auto-import incomplete: ' + got + '/' + manifest.length);
      return false;
    });
  }

  function importFolder(silent) {
    var manifest = global.LOGO_MANIFEST || [];
    if (!manifest.length) {
      UI.toast('js/logo-manifest.js is empty - nothing to import.', 'err');
      return Promise.resolve(false);
    }

    var existing = {};
    Store.teams().forEach(function (t) { existing[t.name.toLowerCase()] = 1; });

    var queue = manifest.filter(function (m) { return !existing[m.name.toLowerCase()]; });
    var room = MAX - Store.teams().length;
    if (room <= 0) {
      UI.toast('All ' + MAX + ' slots are already filled.', 'err');
      return Promise.resolve(false);
    }
    if (!queue.length) {
      UI.toast('Every logo in /LOGO is already registered.', 'ok');
      return Promise.resolve(false);
    }
    queue = queue.slice(0, room);

    el.btnImportFolder.disabled = true;
    el.btnImportFolder.textContent = 'IMPORTING 0/' + queue.length;

    var added = 0, failed = 0;

    /* Sequential so IndexedDB writes and state commits stay ordered. */
    var chain = Promise.resolve();
    queue.forEach(function (item, i) {
      chain = chain.then(function () {
        return fetch(encodeURI(item.file))
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
          })
          .then(function (blob) {
            if (!blob.size) throw new Error('empty file');
            var key = ImageDB.newKey('team');
            return ImageDB.put(key, blob)
              .then(function () { return ImageDB.ensureUrl(key); })
              .then(function () {
                var res = Store.addTeam(item.name, key);
                if (res.ok) added++; else failed++;
              });
          })
          .catch(function (err) {
            console.warn('[import] failed:', item.file, err);
            failed++;
          })
          .then(function () {
            el.btnImportFolder.textContent = 'IMPORTING ' + (i + 1) + '/' + queue.length;
          });
      });
    });

    return chain.then(function () {
      el.btnImportFolder.disabled = false;
      el.btnImportFolder.textContent = 'RE-IMPORT LOGO FOLDER';
      if (added) {
        UI.toast(added + ' team(s) loaded from /LOGO. Registered: ' +
          Store.teams().length + '/' + MAX + '.', 'ok', 5000);
      }
      if (failed) {
        UI.toast(failed + ' logo(s) could not be loaded. Are you running a local ' +
          'server (Live Server)? file:// blocks folder reads.', 'err', 9000);
      }
      if (added && Store.teams().length < MAX) {
        UI.toast('Add ' + (MAX - Store.teams().length) + ' more team(s) to reach ' +
          MAX + ' and unlock the lottery.', 'err', 10000);
      }
      return added > 0;
    });
  }

  /* =================================================== LIST RENDER */
  function render() {
    var teams = Store.teams();
    var total = teams.length;

    /* --- progress --- */
    el.regProgressText.textContent = total + ' / ' + MAX;
    el.regProgressBar.style.width = Math.round((total / MAX) * 100) + '%';
    var left = MAX - total;
    el.regRemainingText.textContent = left === 0
      ? 'All team slots are filled.'
      : left + ' team slot' + (left === 1 ? '' : 's') + ' remaining';
    el.chipSlots.textContent = left === 0 ? 'FULL' : left + ' SLOTS LEFT';

    /* --- warning / ready --- */
    if (total === MAX) {
      el.regWarning.classList.add('hidden');
      el.regReady.classList.remove('hidden');
    } else {
      el.regWarning.classList.remove('hidden');
      el.regReady.classList.add('hidden');
      el.regWarningText.textContent = total === 0
        ? 'No teams registered yet. Exactly ' + MAX + ' teams are required for 16 matches.'
        : 'Only ' + total + ' of ' + MAX + ' teams registered. Add ' + left +
          ' more before the lottery can begin.';
    }

    /* --- add button --- */
    el.btnAddTeam.disabled = total >= MAX;
    el.btnAddTeam.textContent = total >= MAX ? 'ALL 32 SLOTS FILLED' : '+ ADD TEAM';
    el.btnImportFolder.disabled = total >= MAX;
    el.btnClearTeams.disabled = total === 0;

    /* --- list --- */
    el.teamListCount.textContent = String(total);

    var filtered = searchTerm
      ? teams.filter(function (t) { return t.name.toLowerCase().indexOf(searchTerm) !== -1; })
      : teams;

    el.teamList.innerHTML = '';
    if (!filtered.length) {
      el.teamListEmpty.classList.remove('hidden');
      el.teamListEmpty.textContent = total === 0
        ? 'No teams registered yet. Add your first team above.'
        : 'No team matches "' + searchTerm + '".';
      return;
    }
    el.teamListEmpty.classList.add('hidden');

    var frag = document.createDocumentFragment();
    filtered.forEach(function (t) {
      var realIndex = teams.indexOf(t) + 1;
      var selected = Store.isSelected(t.id);
      var url = t.logoKey ? ImageDB.url(t.logoKey) : null;

      var row = document.createElement('div');
      row.className = 'team-row';
      row.innerHTML =
        '<div class="team-idx">' + realIndex + '</div>' +
        '<div class="team-thumb">' +
          (url
            ? '<img class="logo-fit" src="' + url + '" alt="">'
            : '<span class="ph">NO LOGO</span>') +
        '</div>' +
        '<div class="team-name-cell">' +
          '<strong>' + UI.escapeHtml(t.name) + '</strong>' +
          '<span>ID ' + UI.escapeHtml(t.id) + '</span>' +
        '</div>' +
        '<div class="status-pill ' + (selected ? 'sel' : 'av') + '">' +
          (selected ? 'SELECTED' : 'AVAILABLE') +
        '</div>' +
        '<div class="row-actions">' +
          '<button class="btn btn-mini btn-outline" data-edit="' + t.id + '">EDIT</button>' +
          '<button class="btn btn-mini btn-danger" data-del="' + t.id + '">DELETE</button>' +
        '</div>';
      frag.appendChild(row);
    });
    el.teamList.appendChild(frag);
  }

  /* =================================================== EDIT MODAL */
  function openEdit(id) {
    var t = Store.teamById(id);
    if (!t) return;
    editingId = id;
    editLogo = null;
    el.editName.value = t.name;
    el.editLogoInput.value = '';
    el.editFileName.textContent = t.logoKey ? 'Current logo kept' : 'No logo set';

    el.editPreview.innerHTML = '';
    var url = t.logoKey ? ImageDB.url(t.logoKey) : null;
    if (url) {
      var img = document.createElement('img');
      img.className = 'logo-fit';
      img.src = url;
      img.alt = '';
      el.editPreview.appendChild(img);
    } else {
      el.editPreview.innerHTML = '<span>NO LOGO</span>';
    }

    el.editModal.classList.remove('hidden');
    el.editName.focus();
  }

  function closeEdit() {
    el.editModal.classList.add('hidden');
    editingId = null;
    editLogo = null;
  }

  function onEditPickFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var check = UI.validateImageFile(file);
    if (!check.ok) { UI.toast(check.error, 'err'); e.target.value = ''; return; }
    editLogo = file;
    el.editPreview.innerHTML = '';
    var img = document.createElement('img');
    img.className = 'logo-fit';
    img.src = URL.createObjectURL(file);
    img.alt = '';
    el.editPreview.appendChild(img);
    el.editFileName.textContent = file.name;
  }

  function saveEdit() {
    if (!editingId) return;
    var name = el.editName.value.trim();
    if (!name) { UI.toast('Team name cannot be empty.', 'err'); return; }

    var dup = Store.teams().some(function (t) {
      return t.id !== editingId && t.name.toLowerCase() === name.toLowerCase();
    });
    if (dup) { UI.toast('Another team already uses that name.', 'err'); return; }

    var apply = function (logoKey) {
      var patch = { name: name };
      if (logoKey !== undefined) patch.logoKey = logoKey;
      var res = Store.updateTeam(editingId, patch);
      if (!res.ok) { UI.toast(res.error, 'err'); return; }
      UI.toast('Team updated. All screens refreshed.', 'ok');
      closeEdit();
    };

    if (editLogo) {
      var key = ImageDB.newKey('team');
      ImageDB.put(key, editLogo)
        .then(function () { return ImageDB.ensureUrl(key); })
        .then(function () { apply(key); })
        .catch(function (err) {
          console.error(err);
          UI.toast('Could not store the new logo.', 'err');
        });
    } else {
      apply(undefined);
    }
  }

  /* =================================================== DELETE */
  function deleteTeam(id) {
    var t = Store.teamById(id);
    if (!t) return;

    if (Store.isSelected(id)) {
      /* Validation rule #12: never silently corrupt an active draw. */
      UI.confirm({
        title: 'TEAM IS IN THE ACTIVE DRAW',
        body: '<strong>' + UI.escapeHtml(t.name) + '</strong> has already been placed on the ' +
              'draw board.<br><br>Deleting it now will pull every later selection one slot ' +
              'forward and change existing matches.<br><br>' +
              'Delete the team and rebuild the affected part of the draw?',
        confirmText: 'DELETE AND SHIFT DRAW'
      }).then(function (yes) {
        if (!yes) return;
        var res = Store.deleteTeam(id, true);
        if (res.ok) UI.toast(t.name + ' deleted. Draw order updated.', 'ok');
        else UI.toast(res.error, 'err');
      });
      return;
    }

    UI.confirm({
      title: 'DELETE TEAM',
      body: 'Permanently delete <strong>' + UI.escapeHtml(t.name) + '</strong> and its logo?',
      confirmText: 'DELETE'
    }).then(function (yes) {
      if (!yes) return;
      var res = Store.deleteTeam(id, false);
      if (res.ok) UI.toast(t.name + ' deleted.', 'ok');
      else UI.toast(res.error, 'err');
    });
  }

  function clearAll() {
    UI.confirm({
      title: 'DELETE ALL TEAMS',
      body: 'This removes <strong>all ' + Store.teams().length + ' registered teams</strong>, ' +
            'their logos and the current draw.<br><br>Tournament branding is kept. ' +
            'This cannot be undone.',
      confirmText: 'DELETE EVERYTHING'
    }).then(function (yes) {
      if (!yes) return;
      Store.clearAllTeams();
      UI.toast('All teams removed.', 'ok');
    });
  }

  /* =================================================== BIND */
  function init() {
    cache();

    el.btnPickLogo.addEventListener('click', function () { el.teamLogoInput.click(); });
    el.teamLogoInput.addEventListener('change', onPickLogo);
    el.btnClearLogo.addEventListener('click', clearPendingLogo);
    el.btnAddTeam.addEventListener('click', addTeam);
    el.teamName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addTeam();
    });

    el.btnImportFolder.addEventListener('click', function () { importFolder(false); });
    el.btnClearTeams.addEventListener('click', clearAll);

    el.teamSearch.addEventListener('input', function () {
      searchTerm = el.teamSearch.value.trim().toLowerCase();
      render();
    });

    /* delegated edit / delete */
    el.teamList.addEventListener('click', function (e) {
      var ed = e.target.closest('[data-edit]');
      if (ed) { openEdit(ed.getAttribute('data-edit')); return; }
      var dl = e.target.closest('[data-del]');
      if (dl) { deleteTeam(dl.getAttribute('data-del')); }
    });

    el.btnEditPick.addEventListener('click', function () { el.editLogoInput.click(); });
    el.editLogoInput.addEventListener('change', onEditPickFile);
    el.btnEditSave.addEventListener('click', saveEdit);
    el.btnEditCancel.addEventListener('click', closeEdit);
    el.editModal.addEventListener('click', function (e) {
      if (e.target === el.editModal) closeEdit();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.editModal.classList.contains('hidden')) closeEdit();
    });

    showPendingPreview(null);
  }

  global.TeamsUI = {
    init: init,
    render: render,
    importFolder: importFolder,
    autoImportOnce: autoImportOnce
  };
})(window);
