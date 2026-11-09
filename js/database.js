/* =====================================================================
   database.js  --  IndexedDB image store
   ---------------------------------------------------------------------
   All heavy binary data (team logos, tournament logo, stadium
   backgrounds) lives here as Blobs. LocalStorage only ever holds the
   lightweight tournament state (names, ids, match assignments) plus the
   *keys* that point into this database.

   Public API:
     await ImageDB.open()
     await ImageDB.put(key, blobOrFile)
     await ImageDB.get(key)            -> Blob | null
     await ImageDB.delete(key)
     await ImageDB.keys()              -> [key,...]
     await ImageDB.clear()
     ImageDB.url(key)                  -> cached object URL | null
     await ImageDB.ensureUrl(key)      -> object URL | null
     await ImageDB.ensureUrls([keys])  -> resolves whole batch
     ImageDB.revoke(key)
     ImageDB.newKey(prefix)            -> unique key string
   ===================================================================== */
(function (global) {
  'use strict';

  var DB_NAME = 'futsal_lottery_db';
  var DB_VERSION = 1;
  var STORE = 'images';

  var _db = null;          // IDBDatabase
  var _opening = null;     // Promise guard so we only open once
  var _urlCache = {};      // key -> object URL
  var _fallback = {};      // key -> dataURL (used only if IndexedDB fails)

  /* ------------------------------------------------ open / upgrade */
  function open() {
    if (_db) return Promise.resolve(_db);
    if (_opening) return _opening;

    _opening = new Promise(function (resolve) {
      if (!global.indexedDB) {
        console.warn('[ImageDB] IndexedDB unavailable - using in-memory fallback.');
        return resolve(null);
      }
      var req;
      try {
        req = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        console.warn('[ImageDB] open() threw, using fallback.', err);
        return resolve(null);
      }

      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = function (e) {
        _db = e.target.result;
        _db.onversionchange = function () {
          try { _db.close(); } catch (x) {}
          _db = null;
          _opening = null;
        };
        resolve(_db);
      };
      req.onerror = function () {
        console.warn('[ImageDB] Could not open IndexedDB - using fallback.', req.error);
        resolve(null);
      };
      req.onblocked = function () {
        console.warn('[ImageDB] open blocked by another tab.');
      };
    });

    return _opening;
  }

  function store(mode) {
    return open().then(function (db) {
      if (!db) return null;
      try {
        return db.transaction(STORE, mode).objectStore(STORE);
      } catch (err) {
        console.warn('[ImageDB] transaction failed', err);
        return null;
      }
    });
  }

  /* ------------------------------------------------ blob helpers */
  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  function dataURLToBlob(dataURL) {
    var parts = dataURL.split(',');
    var mime = (/:(.*?);/.exec(parts[0]) || [, 'image/png'])[1];
    var bin = atob(parts[1]);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  function newKey(prefix) {
    return (prefix || 'img') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  /* ------------------------------------------------ CRUD */
  function put(key, blob) {
    return store('readwrite').then(function (st) {
      revoke(key);
      if (!st) {
        return blobToDataURL(blob).then(function (d) { _fallback[key] = d; return key; });
      }
      return new Promise(function (resolve, reject) {
        var r = st.put(blob, key);
        r.onsuccess = function () { resolve(key); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  function get(key) {
    if (!key) return Promise.resolve(null);
    return store('readonly').then(function (st) {
      if (!st) return _fallback[key] ? dataURLToBlob(_fallback[key]) : null;
      return new Promise(function (resolve) {
        var r = st.get(key);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { resolve(null); };
      });
    });
  }

  function remove(key) {
    if (!key) return Promise.resolve();
    revoke(key);
    delete _fallback[key];
    return store('readwrite').then(function (st) {
      if (!st) return;
      return new Promise(function (resolve) {
        var r = st.delete(key);
        r.onsuccess = function () { resolve(); };
        r.onerror = function () { resolve(); };
      });
    });
  }

  function keys() {
    return store('readonly').then(function (st) {
      if (!st) return Object.keys(_fallback);
      return new Promise(function (resolve) {
        if (st.getAllKeys) {
          var r = st.getAllKeys();
          r.onsuccess = function () { resolve(r.result || []); };
          r.onerror = function () { resolve([]); };
        } else {
          var out = [];
          var c = st.openKeyCursor();
          c.onsuccess = function (e) {
            var cur = e.target.result;
            if (cur) { out.push(cur.key); cur.continue(); } else resolve(out);
          };
          c.onerror = function () { resolve(out); };
        }
      });
    });
  }

  function clear() {
    Object.keys(_urlCache).forEach(revoke);
    _fallback = {};
    return store('readwrite').then(function (st) {
      if (!st) return;
      return new Promise(function (resolve) {
        var r = st.clear();
        r.onsuccess = function () { resolve(); };
        r.onerror = function () { resolve(); };
      });
    });
  }

  /* ------------------------------------------------ object-URL cache
     Screens render <img src="blob:..."> so we keep exactly one URL per
     key and only revoke it when that image is replaced or deleted.   */
  function url(key) {
    return key ? (_urlCache[key] || null) : null;
  }

  function ensureUrl(key) {
    if (!key) return Promise.resolve(null);
    if (_urlCache[key]) return Promise.resolve(_urlCache[key]);
    return get(key).then(function (blob) {
      if (!blob) return null;
      try {
        _urlCache[key] = URL.createObjectURL(blob);
      } catch (err) {
        return null;
      }
      return _urlCache[key];
    });
  }

  function ensureUrls(keyList) {
    var uniq = {};
    (keyList || []).forEach(function (k) { if (k) uniq[k] = 1; });
    return Promise.all(Object.keys(uniq).map(ensureUrl)).then(function () { return _urlCache; });
  }

  function revoke(key) {
    if (_urlCache[key]) {
      try { URL.revokeObjectURL(_urlCache[key]); } catch (e) {}
      delete _urlCache[key];
    }
  }

  global.ImageDB = {
    open: open,
    put: put,
    get: get,
    delete: remove,
    keys: keys,
    clear: clear,
    url: url,
    ensureUrl: ensureUrl,
    ensureUrls: ensureUrls,
    revoke: revoke,
    newKey: newKey,
    blobToDataURL: blobToDataURL,
    dataURLToBlob: dataURLToBlob
  };
})(window);
