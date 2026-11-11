/* =====================================================================
   export.js  --  Full HD (1920 x 1080) PNG export engine
   ---------------------------------------------------------------------
   Instead of screenshotting the DOM, both graphics are re-drawn on a
   dedicated 1920x1080 canvas. That guarantees:
       * the exact pixel resolution every time, on any monitor
       * razor-sharp text and logos (no scaled-screenshot blur)
       * no admin control, button, scrollbar or browser UI can leak in
       * no html2canvas / CORS dependency

   The background artwork comes from js/scene.js -- the very same
   routine that paints the on-screen background canvas -- so the export
   matches the presentation screens exactly.

   Public API
     await Exporter.exportLiveResult()
     await Exporter.exportDrawBoard()
     await Exporter.renderLive(canvas)
     await Exporter.renderBoard(canvas)
   ===================================================================== */
(function (global) {
  'use strict';

  var W = 1920, H = 1080;

  /* palette (kept in sync with common.css) */
  var C = {
    white: '#ffffff',
    refPink: '#ee1d7a',
    refPink2: '#f33a8c',
    refPinkDk: '#d2126a',
    pink: '#ff1b6b',
    pink2: '#ff5c94'
  };

  var DISPLAY = '"Teko","Barlow Condensed","Arial Narrow",Impact,sans-serif';
  var COND    = '"Barlow Condensed","Arial Narrow",Impact,sans-serif';
  var UIFONT  = '"Inter","Segoe UI",system-ui,sans-serif';
  var BOARD   = '"Poppins","Inter","Segoe UI",system-ui,sans-serif';

  /* ================================================================
     IMAGE LOADING — every upload must be decoded before we draw
     ================================================================ */
  var imgCache = {};

  function loadImageForKey(key) {
    if (!key) return Promise.resolve(null);
    if (imgCache[key] && imgCache[key].complete && imgCache[key].naturalWidth) {
      return Promise.resolve(imgCache[key]);
    }
    return ImageDB.ensureUrl(key).then(function (url) {
      if (!url) return null;
      return new Promise(function (resolve) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { imgCache[key] = img; resolve(img); };
        img.onerror = function () {
          console.warn('[export] image failed to decode:', key);
          resolve(null);
        };
        img.src = url;
      });
    });
  }

  function loadMany(keys) {
    var out = {};
    var uniq = [];
    (keys || []).forEach(function (k) { if (k && uniq.indexOf(k) === -1) uniq.push(k); });
    return Promise.all(uniq.map(function (k) {
      return loadImageForKey(k).then(function (img) { out[k] = img; });
    })).then(function () { return out; });
  }

  function fontsReady() {
    if (!global.document.fonts) return Promise.resolve();
    var wanted = [
      '700 24px "Poppins"', '800 58px "Poppins"', '700 34px "Poppins"',
      '800 23px "Poppins"', '700 110px "Teko"', '700 62px "Barlow Condensed"',
      '600 24px "Inter"'
    ];
    return Promise.all(wanted.map(function (f) {
      try { return document.fonts.load(f); } catch (e) { return Promise.resolve(); }
    })).then(function () { return document.fonts.ready; })
      .catch(function () { return null; });
  }

  /* ================================================================
     CANVAS PRIMITIVES
     ================================================================ */
  function roundRect(ctx, x, y, w, h, r) {
    var tl, tr, br, bl;
    if (typeof r === 'number') { tl = tr = br = bl = r; }
    else { tl = r[0]; tr = r[1]; br = r[2]; bl = r[3]; }
    var m = Math.min(w / 2, h / 2);
    tl = Math.min(tl, m); tr = Math.min(tr, m); br = Math.min(br, m); bl = Math.min(bl, m);

    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h);
    ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl);
    ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
  }

  /* object-fit: cover */
  function drawCover(ctx, img, x, y, w, h) {
    if (!img || !img.naturalWidth) return;
    var ir = img.naturalWidth / img.naturalHeight;
    var br = w / h;
    var sw, sh, sx, sy;
    if (ir > br) { sh = img.naturalHeight; sw = sh * br; sx = (img.naturalWidth - sw) / 2; sy = 0; }
    else         { sw = img.naturalWidth;  sh = sw / br; sx = 0; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  /* object-fit: contain -- never stretches a logo, always dead-centre.
     Team logos are large artboards drawn into small card slots, and a
     single big drawImage() downscale leaves them soft. Halving the
     source step by step first (the classic pyramid trick) keeps the
     edges and small type crisp in the exported PNG. */
  function drawContain(ctx, img, x, y, w, h) {
    if (!img || !img.naturalWidth) return;

    var scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    var dw = img.naturalWidth * scale;
    var dh = img.naturalHeight * scale;
    var dx = Math.round(x + (w - dw) / 2);
    var dy = Math.round(y + (h - dh) / 2);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';

    if (scale < 0.5) {
      var src = img, sw = img.naturalWidth, sh = img.naturalHeight;
      var guard = 0;
      while (sw / 2 >= dw && sh / 2 >= dh && guard++ < 8) {
        var nw = Math.max(1, Math.round(sw / 2));
        var nh = Math.max(1, Math.round(sh / 2));
        var tmp = document.createElement('canvas');
        tmp.width = nw; tmp.height = nh;
        var tctx = tmp.getContext('2d');
        tctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in tctx) tctx.imageSmoothingQuality = 'high';
        tctx.drawImage(src, 0, 0, sw, sh, 0, 0, nw, nh);
        src = tmp; sw = nw; sh = nh;
      }
      ctx.drawImage(src, 0, 0, sw, sh, dx, dy, dw, dh);
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  /* letter-spaced text (canvas tracking is not portable) */
  function trackedWidth(ctx, text, spacing) {
    var chars = String(text).split('');
    if (!chars.length) return 0;
    var total = 0;
    for (var i = 0; i < chars.length; i++) total += ctx.measureText(chars[i]).width + spacing;
    return total - spacing;
  }

  function drawTracked(ctx, text, x, y, spacing, align) {
    var chars = String(text).split('');
    if (!chars.length) return 0;
    var total = trackedWidth(ctx, text, spacing);
    var sx = align === 'center' ? x - total / 2 : (align === 'right' ? x - total : x);
    var prev = ctx.textAlign;
    ctx.textAlign = 'left';
    for (var i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], sx, y);
      sx += ctx.measureText(chars[i]).width + spacing;
    }
    ctx.textAlign = prev;
    return total;
  }

  function fitFont(ctx, text, maxW, weight, startPx, family, spacing, minPx) {
    var px = startPx;
    minPx = minPx || 14;
    spacing = spacing || 0;
    while (px > minPx) {
      ctx.font = weight + ' ' + px + 'px ' + family;
      if (trackedWidth(ctx, text, spacing) <= maxW) break;
      px -= 1;
    }
    ctx.font = weight + ' ' + px + 'px ' + family;
    return px;
  }

  function clipText(ctx, text, maxW, spacing) {
    spacing = spacing || 0;
    if (trackedWidth(ctx, text, spacing) <= maxW) return text;
    var s = String(text);
    while (s.length > 1 && trackedWidth(ctx, s + '…', spacing) > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  /* simple greedy word wrap, returns an array of lines */
  function wrapLines(ctx, text, maxW, maxLines) {
    var words = String(text).trim().split(/\s+/);
    var lines = [], line = '';
    words.forEach(function (wd) {
      var test = line ? line + ' ' + wd : wd;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else { lines.push(line); line = wd; }
    });
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = clipText(ctx, lines[maxLines - 1], maxW, 0);
    }
    return lines;
  }

  /* ================================================================
     SHARED BRANDING BITS
     ================================================================ */

  /* The reference artwork sets the round title in plain white above a
     date line, with no pink plate behind it. */
  function drawTitleBlock(ctx, b) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = C.white;
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 18;
    fitFont(ctx, b.roundTitle, 1180, "700", 72, BOARD, 0, 30);
    ctx.fillText(b.roundTitle, W / 2, 160);

    if (b.matchDate) {
      ctx.fillStyle = "rgba(255,255,255,.96)";
      ctx.shadowBlur = 12;
      fitFont(ctx, b.matchDate, 1100, "600", 36, BOARD, 0, 18);
      ctx.fillText(b.matchDate, W / 2, 226);
    }
    ctx.restore();
  }

  /* kept for the fallback arena (unused while the plate is present) */
  function drawBanner(ctx, text, cx, top) {
    ctx.font = '700 34px ' + BOARD;
    var tw = ctx.measureText(text).width;
    var bw = Math.max(452, Math.min(900, tw + 88));
    var bh = 58;
    var x = cx - bw / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    var g = ctx.createLinearGradient(0, top, 0, top + bh);
    g.addColorStop(0, C.refPink2);
    g.addColorStop(0.55, C.refPink);
    g.addColorStop(1, C.refPinkDk);
    ctx.fillStyle = g;
    roundRect(ctx, x, top, bw, bh, 8);
    ctx.fill();
    ctx.restore();

    /* pink bloom around the banner */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var bloom = ctx.createRadialGradient(cx, top + bh / 2, 10, cx, top + bh / 2, bw * 0.75);
    bloom.addColorStop(0, 'rgba(238,29,122,.30)');
    bloom.addColorStop(1, 'rgba(238,29,122,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(x - bw * 0.5, top - 60, bw * 2, bh + 120);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.28)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    var size = 34;
    while (size > 18 && ctx.measureText(text).width > bw - 56) {
      size -= 1;
      ctx.font = '700 ' + size + 'px ' + BOARD;
    }
    ctx.fillText(text, cx, top + bh / 2 + 1);
    ctx.restore();
  }

  /* The artwork plate already carries the FUTSAL CARNIVAL shield, so a
     logo is only drawn when the operator uploaded their own -- placed
     over the same spot so it replaces it cleanly. */
  function drawTournamentMark(ctx, img, name) {
    if (img) {
      drawContain(ctx, img, 1542, 58, 264, 300);
      return;
    }
    if (Scene.hasPlate() && Scene.plateExportSafe()) return;   // shield is in the plate
    var bw = 206, x = W - 28 - bw, top = 26, pad = 14;
    ctx.font = '800 21px ' + BOARD;
    var lines = wrapLines(ctx, String(name || '').toUpperCase(), bw - pad * 2, 3);
    var lineH = 25;
    var bh = pad * 2 + lines.length * lineH;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    var g = ctx.createLinearGradient(0, top, 0, top + bh);
    g.addColorStop(0, C.refPink2);
    g.addColorStop(1, '#c7115f');
    ctx.fillStyle = g;
    roundRect(ctx, x, top, bw, bh, 14);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 21px ' + BOARD;
    lines.forEach(function (ln, i) {
      ctx.fillText(ln, x + bw / 2, top + pad + lineH * i + lineH / 2);
    });
    ctx.restore();
  }

  /* ================================================================
     SCREEN 03  --  COMPLETE 16-MATCH DRAW BOARD
     Geometry mirrors .db-grid / .db-card in css/draw-board.css
     ================================================================ */
  var BOARD_GEO = {
    left: 64, top: 376, width: 1792, height: 688,
    cols: 4, rows: 4, gapX: 26, gapY: 12,
    pad: 5, stripH: 40, radius: 24, innerR: 19,
    bodyPadX: 14, vsPx: 34, slotW: 138, slotH: 92
  };

  function cardSize() {
    var g = BOARD_GEO;
    return {
      w: (g.width - g.gapX * (g.cols - 1)) / g.cols,
      h: (g.height - g.gapY * (g.rows - 1)) / g.rows
    };
  }

  function renderBoard(canvas) {
    var b = Store.getState().branding;
    var ms = Store.matches();

    var keys = [b.boardBgKey, b.logoKey];
    ms.forEach(function (m) {
      if (m.left)  keys.push(m.left.logoKey);
      if (m.right) keys.push(m.right.logoKey);
    });

    return fontsReady()
      .then(function () { return Scene.ready(); })
      .then(function () { return loadMany(keys); })
      .then(function (imgs) {
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, W, H);
        ctx.textBaseline = 'alphabetic';

        /* ---------- background ---------- */
        var custom = imgs[b.boardBgKey];
        if (custom) {
          /* an uploaded background goes in untouched */
          drawCover(ctx, custom, 0, 0, W, H);
        } else {
          Scene.paintScene(ctx, "board", true);
        }

        /* ---------- header ---------- */
        drawTitleBlock(ctx, b);
        drawTournamentMark(ctx, imgs[b.logoKey], b.tournamentName);

        /* ---------- 16 cards ---------- */
        var g = BOARD_GEO;
        var cs = cardSize();
        ms.forEach(function (m, i) {
          var col = i % g.cols;
          var row = Math.floor(i / g.cols);
          var x = g.left + col * (cs.w + g.gapX);
          var y = g.top + row * (cs.h + g.gapY);
          drawMatchCard(ctx, m, x, y, cs.w, cs.h, imgs);
        });

        return canvas;
      });
  }

  function drawMatchCard(ctx, m, x, y, w, h, imgs) {
    var g = BOARD_GEO;

    /* ---- white card ---- */
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.50)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y, w, h, g.radius);
    ctx.fill();
    ctx.restore();

    /* ---- pink header strip ---- */
    var sx = x + g.pad, sy = y + g.pad, sw = w - g.pad * 2;
    var sg = ctx.createLinearGradient(0, sy, 0, sy + g.stripH);
    sg.addColorStop(0, C.refPink2);
    sg.addColorStop(0.55, C.refPink);
    sg.addColorStop(1, '#e0156f');
    ctx.fillStyle = sg;
    roundRect(ctx, sx, sy, sw, g.stripH, [g.innerR, g.innerR, 0, 0]);
    ctx.fill();

    /* ---- match number ---- */
    ctx.save();
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 24px ' + BOARD;
    ctx.shadowColor = 'rgba(0,0,0,.22)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fillText('Match-' + Store.pad2(m.number), x + w / 2, sy + g.stripH / 2 + 1);
    ctx.restore();

    /* ---- body ---- */
    var bodyTop = sy + g.stripH;
    var bodyH = h - g.pad * 2 - g.stripH;
    var cy = bodyTop + bodyH / 2;

    /* VS */
    ctx.save();
    ctx.font = '800 ' + g.vsPx + 'px ' + BOARD;
    var vsW = ctx.measureText('VS').width;
    ctx.fillStyle = C.refPink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', x + w / 2, cy + 1);
    ctx.restore();

    /* logo slots either side of VS */
    var innerW = w - g.pad * 2 - g.bodyPadX * 2;
    var trackW = (innerW - (vsW + 10)) / 2;
    var leftCx  = x + g.pad + g.bodyPadX + trackW / 2;
    var rightCx = x + w - g.pad - g.bodyPadX - trackW / 2;
    var slotW = Math.min(g.slotW, trackW);

    drawSlot(ctx, m.left,  leftCx,  cy, slotW, g.slotH, imgs);
    drawSlot(ctx, m.right, rightCx, cy, slotW, g.slotH, imgs);
  }

  function drawSlot(ctx, team, cx, cy, w, h, imgs) {
    if (!team) return;                      // empty slots stay blank, as in the reference
    var img = team.logoKey ? imgs[team.logoKey] : null;
    if (img) {
      drawContain(ctx, img, cx - w / 2, cy - h / 2, w, h);
    } else {
      ctx.save();
      ctx.fillStyle = '#c9bfd0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 38px ' + BOARD;
      ctx.fillText(UI.initials(team.name), cx, cy);
      ctx.restore();
    }
  }

  /* ================================================================
     SCREEN 02  --  LIVE SINGLE MATCH RESULT
     The draw-board match card, enlarged to fill the screen.
     Geometry mirrors .lr-card in css/live-result.css.
     ================================================================ */
  var LIVE_GEO = {
    x: 200, y: 348, w: 1520, h: 620,
    pad: 12, stripH: 130, radius: 46, innerR: 36,
    bodyPadX: 50, vsPx: 150, slotW: 460, slotH: 376
  };

  function renderLive(canvas) {
    var b = Store.getState().branding;
    var match = Store.currentMatch();

    var keys = [b.liveBgKey, b.logoKey];
    if (match) {
      if (match.left)  keys.push(match.left.logoKey);
      if (match.right) keys.push(match.right.logoKey);
    }

    return fontsReady()
      .then(function () { return Scene.ready(); })
      .then(function () { return loadMany(keys); })
      .then(function (imgs) {
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, W, H);
        ctx.textBaseline = 'alphabetic';

        /* ---------- background ---------- */
        var custom = imgs[b.liveBgKey];
        if (custom) {
          /* an uploaded background goes in untouched */
          drawCover(ctx, custom, 0, 0, W, H);
        } else {
          Scene.paintScene(ctx, "live", true);
        }

        /* ---------- header ---------- */
        drawTitleBlock(ctx, b);
        drawTournamentMark(ctx, imgs[b.logoKey], b.tournamentName);

        /* ---------- standby ---------- */
        if (!match) {
          ctx.save();
          ctx.fillStyle = C.white;
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(226,19,110,.65)';
          ctx.shadowBlur = 50;
          fitFont(ctx, 'LOTTERY DRAW', 1560, '800', 122, BOARD, 1, 50);
          drawTracked(ctx, 'LOTTERY DRAW', W / 2, 500, 1, 'center');
          fitFont(ctx, 'WILL START SOON', 1560, '800', 122, BOARD, 1, 50);
          drawTracked(ctx, 'WILL START SOON', W / 2, 628, 1, 'center');
          ctx.restore();

          ctx.save();
          ctx.fillStyle = 'rgba(255,255,255,.58)';
          ctx.textAlign = 'center';
          ctx.font = '600 26px ' + UIFONT;
          drawTracked(ctx, '16 MATCHES  ·  32 TEAMS', W / 2, 730, 9.4, 'center');
          ctx.restore();

          drawFooterBar(ctx, b);
          return canvas;
        }

        /* ---------- the enlarged match card ---------- */
        var g = LIVE_GEO;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.62)';
        ctx.shadowBlur = 70;
        ctx.shadowOffsetY = 26;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, g.x, g.y, g.w, g.h, g.radius);
        ctx.fill();
        ctx.restore();

        /* pink strip */
        var sx = g.x + g.pad, sy = g.y + g.pad, sw = g.w - g.pad * 2;
        var sg = ctx.createLinearGradient(0, sy, 0, sy + g.stripH);
        sg.addColorStop(0, C.refPink2);
        sg.addColorStop(0.55, C.refPink);
        sg.addColorStop(1, '#d2126a');
        ctx.fillStyle = sg;
        roundRect(ctx, sx, sy, sw, g.stripH, [g.innerR, g.innerR, 0, 0]);
        ctx.fill();

        ctx.save();
        ctx.fillStyle = C.white;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 76px ' + BOARD;
        ctx.shadowColor = 'rgba(0,0,0,.22)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillText('Match-' + Store.pad2(match.number), g.x + g.w / 2, sy + g.stripH / 2 + 2);
        ctx.restore();

        /* body */
        var bodyTop = sy + g.stripH;
        var bodyH = g.h - g.pad * 2 - g.stripH;
        var cy = bodyTop + bodyH / 2;

        ctx.save();
        ctx.font = '800 ' + g.vsPx + 'px ' + BOARD;
        var vsW = ctx.measureText('VS').width;
        ctx.fillStyle = C.refPink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VS', g.x + g.w / 2, cy + 2);
        ctx.restore();

        var innerW = g.w - g.pad * 2 - g.bodyPadX * 2;
        var trackW = (innerW - (vsW + 24)) / 2;
        var leftCx  = g.x + g.pad + g.bodyPadX + trackW / 2;
        var rightCx = g.x + g.w - g.pad - g.bodyPadX - trackW / 2;
        var slotW = Math.min(g.slotW, trackW);

        drawBigSlot(ctx, match.left, leftCx, cy, slotW, g.slotH, imgs);

        if (match.right) {
          drawBigSlot(ctx, match.right, rightCx, cy, slotW, g.slotH, imgs);
        } else {
          waitingSlot(ctx, rightCx, cy, slotW, g.slotH);
        }

        drawFooterBar(ctx, b);
        return canvas;
      });
  }

  function drawBigSlot(ctx, team, cx, cy, w, h, imgs) {
    if (!team) return;
    var img = team.logoKey ? imgs[team.logoKey] : null;
    if (img) {
      drawContain(ctx, img, cx - w / 2, cy - h / 2, w, h);
    } else {
      ctx.save();
      ctx.fillStyle = '#c9bfd0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 156px ' + BOARD;
      ctx.fillText(UI.initials(team.name), cx, cy);
      ctx.restore();
    }
  }

  function waitingSlot(ctx, cx, cy, w, h) {
    ctx.save();
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 26);
    ctx.fillStyle = 'rgba(226,19,110,.045)';
    ctx.fill();
    ctx.setLineDash([26, 20]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(226,19,110,.55)';
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(226,19,110,.78)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 58px ' + BOARD;
    ['WAITING', 'FOR', 'OPPONENT'].forEach(function (wd, i) {
      ctx.fillText(wd, cx, cy - 72 + i * 72);
    });
    ctx.restore();
  }


  function drawFooterBar(ctx, b) {
    var y = H - 72;
    var g = ctx.createLinearGradient(0, y, W, y);
    g.addColorStop(0, 'rgba(238,29,122,0)');
    g.addColorStop(0.5, 'rgba(238,29,122,.78)');
    g.addColorStop(1, 'rgba(238,29,122,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, 3);

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.textAlign = 'center';
    ctx.font = '600 19px ' + UIFONT;
    drawTracked(ctx, b.roundTitle + '  ·  LIVE DRAW', W / 2, y + 42, 8, 'center');
    ctx.restore();
  }


  /* ================================================================
     SCREEN 04  --  FULL TOURNAMENT BRACKET
     Geometry mirrors css/bracket.css.
     ================================================================ */
  var BR = {
    r1:    { x: 26,   y: 148, w: 616, h: 900, cols: 2, rows: 8, gx: 12, gy: 10 },
    r2:    { x: 672,  y: 300, w: 438, h: 596, cols: 2, rows: 4, gx: 12, gy: 14, rowMajor: true },
    qf:    { x: 1140, y: 300, w: 268, h: 596, cols: 1, rows: 4, gx: 0,  gy: 14 },
    sf:    { x: 1452, y: 424, w: 268, h: 296, cols: 1, rows: 2, gx: 0,  gy: 14 },
    final: { x: 1748, y: 436, w: 152, h: 272 },
    heads: [
      { x: 26,   y: 26,  title: null },   /* round title comes from branding */
      { x: 672,  y: 188, title: 'Second Round' },
      { x: 1140, y: 214, title: 'Quarter Final' },
      { x: 1452, y: 348, title: 'Semi Final' }
    ],
    pad: 3, radius: 13, innerR: 10, stripH: 25, stripPx: 15
  };

  function brCell(g, i) {
    var cw = (g.w - g.gx * (g.cols - 1)) / g.cols;
    var ch = (g.h - g.gy * (g.rows - 1)) / g.rows;
    /* First Round flows down each column; the later rounds read across
       each row, exactly as the printed artwork lays them out. */
    var col, row;
    if (g.rowMajor) { row = Math.floor(i / g.cols); col = i % g.cols; }
    else            { col = Math.floor(i / g.rows); row = i % g.rows; }
    return { x: g.x + col * (cw + g.gx), y: g.y + row * (ch + g.gy), w: cw, h: ch };
  }

  /* white card shell with its pink strip; returns the body rect */
  function brCard(ctx, x, y, w, h, label, stripH, stripPx) {
    stripH = stripH || BR.stripH;
    stripPx = stripPx || BR.stripPx;
    var pad = BR.pad;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y, w, h, BR.radius);
    ctx.fill();
    ctx.restore();

    var sx = x + pad, sy = y + pad, sw = w - pad * 2;
    var sg = ctx.createLinearGradient(0, sy, 0, sy + stripH);
    sg.addColorStop(0, C.refPink2);
    sg.addColorStop(0.55, C.refPink);
    sg.addColorStop(1, '#e0156f');
    ctx.fillStyle = sg;
    roundRect(ctx, sx, sy, sw, stripH, [BR.innerR, BR.innerR, 0, 0]);
    ctx.fill();

    ctx.save();
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + stripPx + 'px ' + BOARD;
    ctx.shadowColor = 'rgba(0,0,0,.22)';
    ctx.shadowBlur = 3;
    ctx.fillText(label, x + w / 2, sy + stripH / 2 + 1);
    ctx.restore();

    return { x: x + pad, y: sy + stripH, w: w - pad * 2, h: h - pad * 2 - stripH };
  }

  /* two-line "M:01 / WINNER" placeholder */
  function brPlaceholder(ctx, text, cx, cy) {
    ctx.save();
    ctx.fillStyle = C.refPink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 13px ' + BOARD;
    var lines = text.split('|');
    var lh = 15;
    var top = cy - ((lines.length - 1) * lh) / 2;
    lines.forEach(function (ln, i) { ctx.fillText(ln, cx, top + i * lh); });
    ctx.restore();
  }

  function brVs(ctx, cx, cy, px) {
    ctx.save();
    ctx.fillStyle = C.refPink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + px + 'px ' + BOARD;
    ctx.fillText('VS', cx, cy + 1);
    ctx.restore();
  }

  function renderBracket(canvas) {
    var b = Store.getState().branding;
    var ms = Store.matches();

    var keys = [b.boardBgKey, b.logoKey];
    ms.forEach(function (m) {
      if (m.left)  keys.push(m.left.logoKey);
      if (m.right) keys.push(m.right.logoKey);
    });

    return fontsReady()
      .then(function () { return Scene.ready(); })
      .then(function () { return loadMany(keys); })
      .then(function (imgs) {
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, W, H);
        ctx.textBaseline = 'alphabetic';

        /* ---------- background ---------- */
        var custom = imgs[b.boardBgKey];
        if (custom) {
          /* an uploaded background goes in untouched */
          drawCover(ctx, custom, 0, 0, W, H);
        } else {
          Scene.paintScene(ctx, 'board', true);
        }

        if (imgs[b.logoKey]) drawContain(ctx, imgs[b.logoKey], 1542, 58, 264, 300);

        /* ---------- round headings ---------- */
        BR.heads.forEach(function (hd) {
          var title = hd.title || b.roundTitle;
          ctx.save();
          ctx.textAlign = 'left';
          ctx.fillStyle = C.white;
          ctx.shadowColor = 'rgba(0,0,0,.6)';
          ctx.shadowBlur = 14;
          ctx.font = '700 40px ' + BOARD;
          ctx.fillText(title, hd.x, hd.y + 36);
          if (b.matchDate) {
            ctx.font = '600 19px ' + BOARD;
            ctx.fillStyle = 'rgba(255,255,255,.95)';
            ctx.shadowBlur = 10;
            ctx.fillText(b.matchDate, hd.x, hd.y + 62);
          }
          ctx.restore();
        });

        /* ---------- First Round: the drawn logos ---------- */
        ms.forEach(function (m, i) {
          var c = brCell(BR.r1, i);
          var body = brCard(ctx, c.x, c.y, c.w, c.h, 'Match ' + Store.pad2(i + 1));
          var cy = body.y + body.h / 2;
          var padX = 8;
          ctx.font = '800 23px ' + BOARD;
          var vsW = ctx.measureText('VS').width;
          var track = (body.w - padX * 2 - (vsW + 6)) / 2;
          var lcx = body.x + padX + track / 2;
          var rcx = body.x + body.w - padX - track / 2;
          brVs(ctx, body.x + body.w / 2, cy, 23);
          var sw2 = Math.min(118, track), sh2 = 62;
          drawSlot(ctx, m.left,  lcx, cy, sw2, sh2, imgs);
          drawSlot(ctx, m.right, rcx, cy, sw2, sh2, imgs);
        });

        /* ---------- later rounds: WINNER placeholders ---------- */
        function placeholders(g, prefix, feeder, count) {
          for (var i = 0; i < count; i++) {
            var c = brCell(g, i);
            var body = brCard(ctx, c.x, c.y, c.w, c.h, prefix + '-' + Store.pad2(i + 1));
            var cy = body.y + body.h / 2;
            var padX = 6;
            ctx.font = '800 22px ' + BOARD;
            var vsW = ctx.measureText('VS').width;
            var track = (body.w - padX * 2 - (vsW + 6)) / 2;
            brVs(ctx, body.x + body.w / 2, cy, 22);
            brPlaceholder(ctx, feeder + ':' + Store.pad2(i * 2 + 1) + '|WINNER',
              body.x + padX + track / 2, cy);
            brPlaceholder(ctx, feeder + ':' + Store.pad2(i * 2 + 2) + '|WINNER',
              body.x + body.w - padX - track / 2, cy);
          }
        }
        placeholders(BR.r2, 'SR', 'M',  8);
        placeholders(BR.qf, 'QF', 'SR', 4);
        placeholders(BR.sf, 'SF', 'QF', 2);

        /* ---------- Final ---------- */
        var f = BR.final;
        var fb = brCard(ctx, f.x, f.y, f.w, f.h, 'FINAL', 34, 21);
        var fcx = fb.x + fb.w / 2;
        var top = fb.y + 20;
        if (b.matchDate) {
          ctx.save();
          ctx.fillStyle = '#4a4455';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '700 12px ' + BOARD;
          ctx.fillText(b.matchDate, fcx, top);
          ctx.restore();
        }
        brPlaceholder(ctx, 'SF:01|WINNER', fcx, top + 52);
        brVs(ctx, fcx, top + 110, 30);
        brPlaceholder(ctx, 'SF:02|WINNER', fcx, top + 168);

        return canvas;
      });
  }

  /* ================================================================
     DOWNLOAD
     ================================================================ */
  function canvasToPng(canvas, filename) {
    return new Promise(function (resolve, reject) {
      try {
        if (canvas.toBlob) {
          canvas.toBlob(function (blob) {
            if (blob) { UI.downloadBlob(blob, filename); resolve(true); }
            else reject(new Error("The browser returned an empty image."));
          }, "image/png");
        } else {
          var a = document.createElement("a");
          a.href = canvas.toDataURL("image/png");
          a.download = filename;
          a.click();
          resolve(true);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /* One clear message instead of a bare SecurityError. */
  function explain(err) {
    if (err && err.name === "SecurityError") {
      return "The browser blocked the download because the page was opened " +
             "as a file. Run the folder through VS Code Live Server and the " +
             "export will work.";
    }
    return "Export failed: " + (err && err.message ? err.message : err);
  }

  /* Warn once if the artwork background had to be left out. */
  var warnedPlate = false;
  function plateWarning() {
    if (warnedPlate || !Scene.hasPlate() || Scene.plateExportSafe()) return;
    warnedPlate = true;
    UI.toast("Opened as a file:// page, so the artwork background cannot be " +
             "written into the PNG. Use Live Server for the full design.", "err", 9000);
  }

  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
           p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function offscreen() {
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  }

  function exportLiveResult() {
    UI.toast('Rendering 1920×1080 Live Result…');
    var match = Store.currentMatch();
    var name = 'live-result-' +
      (match ? 'match-' + Store.pad2(match.number) : 'standby') + '-' + stamp() + '.png';
    return renderLive(offscreen())
      .then(function (c) { return canvasToPng(c, name); })
      .then(function () { plateWarning(); UI.toast('Live Result PNG exported (1920×1080).', 'ok'); })
      .catch(function (err) {
        console.error(err);
        UI.toast(explain(err), 'err', 10000);
      });
  }

  function exportDrawBoard() {
    UI.toast('Rendering 1920×1080 Draw Board…');
    var name = 'draw-board-' + stamp() + '.png';
    return renderDrawBoardSafe(offscreen())
      .then(function (c) { return canvasToPng(c, name); })
      .then(function () { plateWarning(); UI.toast('Draw Board PNG exported (1920×1080).', 'ok'); })
      .catch(function (err) {
        console.error(err);
        UI.toast(explain(err), 'err', 10000);
      });
  }

  function renderDrawBoardSafe(c) { return renderBoard(c); }

  function exportBracket() {
    UI.toast('Rendering 1920\u00d71080 Full Bracket\u2026');
    var name = 'full-bracket-' + stamp() + '.png';
    return renderBracket(offscreen())
      .then(function (c) { return canvasToPng(c, name); })
      .then(function () { plateWarning(); UI.toast('Full Bracket PNG exported (1920\u00d71080).', 'ok'); })
      .catch(function (err) {
        console.error(err);
        UI.toast(explain(err), 'err', 10000);
      });
  }

  function forget(key) { delete imgCache[key]; }

  global.Exporter = {
    W: W, H: H,
    renderLive: renderLive,
    renderBoard: renderBoard,
    renderBracket: renderBracket,
    exportLiveResult: exportLiveResult,
    exportDrawBoard: exportDrawBoard,
    exportBracket: exportBracket,
    forget: forget
  };
})(window);
