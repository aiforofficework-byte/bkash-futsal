/* =====================================================================
   scene.js  --  Procedural tournament artwork (arena + futsal pitch)
   ---------------------------------------------------------------------
   Recreates the reference draw-board artwork in pure Canvas 2D:
     * deep maroon arena with bokeh haze
     * pink + white spotlight beams fanning from both top corners
     * clusters of glowing stadium lamps with lens flares
     * a green futsal pitch in perspective across the bottom

   The SAME routine paints the on-screen background canvas and the
   1920x1080 PNG export, so what the operator sees is exactly what gets
   exported. Everything is deterministic (seeded noise, no Math.random)
   so repeated renders are identical.
   ===================================================================== */
(function (global) {
  'use strict';

  var W = 1920, H = 1080;

  /* ------------------------------------------------ deterministic noise */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------ base arena wash */
  function paintBase(ctx) {
    ctx.fillStyle = '#060004';
    ctx.fillRect(0, 0, W, H);

    var g = ctx.createRadialGradient(W / 2, 300, 40, W / 2, 300, 1280);
    g.addColorStop(0.00, '#3d0c22');
    g.addColorStop(0.36, '#2a0715');
    g.addColorStop(0.68, '#16030b');
    g.addColorStop(1.00, '#080005');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* faint warm core behind the card grid */
    var c = ctx.createRadialGradient(W / 2, 470, 60, W / 2, 470, 780);
    c.addColorStop(0, 'rgba(110,10,48,.14)');
    c.addColorStop(1, 'rgba(110,10,48,0)');
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, W, H);
  }

  /* ------------------------------------------------ bokeh haze */
  function paintBokeh(ctx) {
    var rnd = seeded(20260411);
    ctx.save();
    for (var i = 0; i < 70; i++) {
      var x = rnd() * W;
      var y = rnd() * 900;
      var r = 6 + rnd() * 26;
      var a = 0.06 + rnd() * 0.20;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(190,22,74,' + a + ')');
      g.addColorStop(0.65, 'rgba(150,14,58,' + (a * 0.55) + ')');
      g.addColorStop(1, 'rgba(150,14,58,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------ spotlight beams
     Drawn once for the left corner, then mirrored for the right.     */
  var BEAMS = [
    { deg:  12, len: 1500, wide:  84, col: '255,45,130', a: 0.14 },
    { deg:  30, len: 1350, wide:  58, col: '255,235,245', a: 0.075 },
    { deg:  47, len: 1250, wide:  92, col: '255,45,130', a: 0.115 },
    { deg:  64, len: 1150, wide:  50, col: '255,235,245', a: 0.055 },
    { deg:  82, len: 1050, wide:  78, col: '255,45,130', a: 0.095 },
    { deg: 102, len:  900, wide:  60, col: '255,45,130', a: 0.07 }
  ];

  function paintBeamFan(ctx, ox, oy) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    BEAMS.forEach(function (b) {
      var rad = b.deg * Math.PI / 180;
      var ex = ox + Math.cos(rad) * b.len;
      var ey = oy + Math.sin(rad) * b.len;
      /* perpendicular offset for the far edge */
      var px = -Math.sin(rad) * b.wide;
      var py = Math.cos(rad) * b.wide;

      var g = ctx.createLinearGradient(ox, oy, ex, ey);
      g.addColorStop(0, 'rgba(' + b.col + ',' + b.a + ')');
      g.addColorStop(0.45, 'rgba(' + b.col + ',' + (b.a * 0.45) + ')');
      g.addColorStop(1, 'rgba(' + b.col + ',0)');

      ctx.beginPath();
      ctx.moveTo(ox - px * 0.07, oy - py * 0.07);
      ctx.lineTo(ox + px * 0.07, oy + py * 0.07);
      ctx.lineTo(ex + px, ey + py);
      ctx.lineTo(ex - px, ey - py);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    });
    ctx.restore();
  }

  /* ------------------------------------------------ stadium lamps
     Positions are hand-placed to echo the reference artwork.         */
  var LAMPS = [
    { x: 186, y:  54, rx: 21, ry: 13, flare: true },
    { x: 266, y:  36, rx: 17, ry: 11 },
    { x: 320, y:  55, rx: 16, ry: 10 },
    { x: 236, y:  75, rx: 15, ry:  9 },
    { x: 290, y:  90, rx: 13, ry:  9 },
    { x: 344, y:  97, rx: 12, ry:  8 },
    { x: 192, y: 111, rx: 16, ry: 10 },
    { x: 249, y: 127, rx: 13, ry:  9 },
    { x: 166, y: 133, rx: 12, ry:  8 },
    { x: 221, y: 157, rx: 11, ry:  7 },
    { x: 275, y: 147, rx: 10, ry:  6 },
    { x: 358, y: 121, rx:  9, ry:  6 },
    { x:  58, y: 184, rx: 19, ry: 19, flare: true },
    { x: 231, y: 247, rx: 17, ry: 17, flare: true },
    { x: 596, y: 352, rx: 13, ry: 13, flare: true },
    { x: 148, y: 420, rx:  9, ry:  9 },
    { x: 103, y: 672, rx:  8, ry:  8 }
  ];

  var LAMP_SCALE = 1.20;   // the reference lamps read a little larger

  function paintLamp(ctx, L) {
    var rx = L.rx * LAMP_SCALE, ry = L.ry * LAMP_SCALE;
    var rr = Math.max(rx, ry);

    /* pink halo */
    var halo = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, rr * 5.0);
    halo.addColorStop(0, 'rgba(255,100,168,.62)');
    halo.addColorStop(0.35, 'rgba(255,40,120,.26)');
    halo.addColorStop(1, 'rgba(255,40,120,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(L.x, L.y, rr * 5.0, 0, Math.PI * 2);
    ctx.fill();

    /* white core */
    var core = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, rr);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.62, 'rgba(255,240,248,.95)');
    core.addColorStop(1, 'rgba(255,190,220,.25)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(L.x, L.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    /* lens streaks */
    if (L.flare) {
      var len = rr * 9;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      [[1, 0.30], [0, 0.22]].forEach(function (dir, i) {
        var gx = ctx.createLinearGradient(
          L.x - (i === 0 ? len : 0), L.y - (i === 0 ? 0 : len),
          L.x + (i === 0 ? len : 0), L.y + (i === 0 ? 0 : len));
        gx.addColorStop(0, 'rgba(255,120,180,0)');
        gx.addColorStop(0.5, 'rgba(255,190,220,' + dir[1] + ')');
        gx.addColorStop(1, 'rgba(255,120,180,0)');
        ctx.fillStyle = gx;
        if (i === 0) ctx.fillRect(L.x - len, L.y - 1.6, len * 2, 3.2);
        else ctx.fillRect(L.x - 1.6, L.y - len, 3.2, len * 2);
      });
      ctx.restore();
    }
  }

  function paintLamps(ctx) {
    ctx.save();
    LAMPS.forEach(function (L) { paintLamp(ctx, L); });
    /* mirrored cluster on the right */
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    LAMPS.forEach(function (L) { paintLamp(ctx, L); });
    ctx.restore();
  }

  /* ------------------------------------------------ futsal pitch */
  var PITCH = {
    edgeY: 818,      // pitch top edge at the left/right screen edges
    crownY: 702      // control point -- makes the far touchline bow upward
  };

  function pitchPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, PITCH.edgeY);
    ctx.quadraticCurveTo(W / 2, PITCH.crownY, W, PITCH.edgeY);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
  }

  function paintPitch(ctx) {
    ctx.save();
    pitchPath(ctx);
    ctx.clip();

    /* turf */
    var g = ctx.createLinearGradient(0, PITCH.crownY, 0, H);
    g.addColorStop(0, '#2da04d');
    g.addColorStop(0.38, '#1f8b3f');
    g.addColorStop(1, '#12742f');
    ctx.fillStyle = g;
    ctx.fillRect(0, PITCH.crownY - 10, W, H);

    /* floodlit centre */
    var spot = ctx.createRadialGradient(W / 2, 930, 20, W / 2, 930, 760);
    spot.addColorStop(0, 'rgba(120,235,155,.30)');
    spot.addColorStop(1, 'rgba(120,235,155,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, PITCH.crownY - 10, W, H);

    /* perspective mow stripes converging on a vanishing point */
    var vpX = W / 2, vpY = 430;
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    for (var i = -9; i <= 9; i += 2) {
      var x0 = W / 2 + i * 230;
      var x1 = W / 2 + (i + 1) * 230;
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(x0, H + 20);
      ctx.lineTo(x1, H + 20);
      ctx.closePath();
      ctx.fill();
    }

    /* ---- white markings ---- */
    ctx.strokeStyle = 'rgba(255,255,255,.60)';
    ctx.lineWidth = 4;

    /* far touchline */
    ctx.beginPath();
    ctx.moveTo(0, PITCH.edgeY);
    ctx.quadraticCurveTo(W / 2, PITCH.crownY, W, PITCH.edgeY);
    ctx.stroke();

    /* halfway line */
    ctx.beginPath();
    ctx.moveTo(W / 2, PITCH.crownY + 4);
    ctx.lineTo(W / 2, H);
    ctx.stroke();

    /* centre circle + spot */
    ctx.beginPath();
    ctx.ellipse(W / 2, 1004, 296, 96, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.ellipse(W / 2, 1004, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    /* penalty areas, drawn in perspective and mirrored */
    function penaltyArea(flip) {
      ctx.save();
      if (flip) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.beginPath();
      ctx.moveTo(96, 848);
      ctx.lineTo(474, 866);
      ctx.lineTo(540, H);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(44, 950);
      ctx.lineTo(286, 962);
      ctx.lineTo(318, H);
      ctx.stroke();
      ctx.restore();
    }
    penaltyArea(false);
    penaltyArea(true);

    ctx.restore();

    /* pink haze along the touchline, blending pitch into the arena */
    var haze = ctx.createLinearGradient(0, PITCH.crownY - 110, 0, PITCH.edgeY + 60);
    haze.addColorStop(0, 'rgba(255,27,107,0)');
    haze.addColorStop(0.7, 'rgba(255,27,107,.16)');
    haze.addColorStop(1, 'rgba(255,27,107,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, PITCH.crownY - 110, W, 230);
  }

  /* ------------------------------------------------ vignette */
  function paintVignette(ctx, strength) {
    var v = ctx.createRadialGradient(W / 2, H / 2, H * 0.30, W / 2, H / 2, W * 0.78);
    v.addColorStop(0, 'rgba(4,0,2,0)');
    v.addColorStop(1, 'rgba(4,0,2,' + (strength == null ? 0.55 : strength) + ')');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  /* ================================================================
     COMPOSITE SCENES
     ================================================================ */
  function paintBoardScene(ctx) {
    paintBase(ctx);
    paintBokeh(ctx);
    paintBeamFan(ctx, 64, 56);
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    paintBeamFan(ctx, 64, 46);
    ctx.restore();
    paintLamps(ctx);
    paintPitch(ctx);
    paintVignette(ctx, 0.58);
  }

  /* Screen 02 uses the same world but darker, so the huge headline type
     and team plates stay readable over it. */
  function paintLiveScene(ctx) {
    /* Screen 02 uses the identical backdrop -- the big white card carries
       the contrast on its own, so no extra darkening is applied. */
    paintBoardScene(ctx);
  }

  /* ================================================================
     THE ARTWORK PLATE
     ----------------------------------------------------------------
     assets/backgrounds/board-bg.png is the tournament artwork with the
     match cards and the title text painted out (the FUTSAL CARNIVAL
     shield is left in place). When it is present it IS the background
     on both presentation screens and in both PNG exports. The
     procedural arena above stays as the fallback for when the file is
     missing or the page is opened over file://.
     ================================================================ */
  var PLATE_URL = 'assets/backgrounds/board-bg.png';
  var plate = null;
  var platePromise = null;
  var plateSafe = false;   // false when the plate would taint an export canvas

  function ready() {
    if (platePromise) return platePromise;
    platePromise = new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        plate = (im.naturalWidth && im.naturalHeight) ? im : null;
        /* Over file:// Chrome treats this image as cross-origin, which
           taints any canvas it is drawn on and makes toBlob() throw.
           Probe it once here so the exporter can fall back cleanly. */
        plateSafe = false;
        if (plate) {
          try {
            var t = document.createElement("canvas");
            t.width = 1; t.height = 1;
            var tc = t.getContext("2d");
            tc.drawImage(plate, 0, 0, 1, 1);
            tc.getImageData(0, 0, 1, 1);
            plateSafe = true;
          } catch (err) {
            console.warn("[Scene] artwork plate cannot be exported from a file:// page.");
          }
        }
        resolve(plate);
      };
      im.onerror = function () {
        console.warn('[Scene] ' + PLATE_URL + ' not available - using the drawn arena.');
        plate = null;
        resolve(null);
      };
      im.src = PLATE_URL;
    });
    return platePromise;
  }

  function hasPlate() { return !!plate; }
  function plateExportSafe() { return !!plate && plateSafe; }

  /* Draw the plate to fill 1920x1080 exactly (it is authored at 16:9). */
  function paintPlate(ctx) {
    ctx.drawImage(plate, 0, 0, W, H);
  }

  /* forExport skips the plate when it would taint the canvas, so a PNG
     is still produced -- with the drawn arena instead of the artwork. */
  function paintScene(ctx, which, forExport) {
    if (plate && (!forExport || plateSafe)) { paintPlate(ctx); return; }
    if (which === "live") paintLiveScene(ctx); else paintBoardScene(ctx);
  }

  /* Paint straight into an on-page <canvas> element. Resolves once the
     artwork plate has been fetched, so callers can await a real paint. */
  function paintInto(canvas, which) {
    if (!canvas) return Promise.resolve();
    return ready().then(function () {
      canvas.width = W;
      canvas.height = H;
      paintScene(canvas.getContext('2d'), which);
    });
  }

  global.Scene = {
    W: W, H: H,
    ready: ready,
    hasPlate: hasPlate,
    plateExportSafe: plateExportSafe,
    paintScene: paintScene,
    paintBoardScene: paintBoardScene,
    paintLiveScene: paintLiveScene,
    paintInto: paintInto,
    PITCH: PITCH
  };
})(window);
