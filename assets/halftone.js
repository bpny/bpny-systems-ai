/*
 * BPNY "Paper & Ink" halftone still life.
 * Renders an animated duotone, AM round-dot halftone (45 deg screen) of a
 * procedurally shaded sphere-on-plinth into every <canvas data-halftone>.
 *
 * Attributes:
 *   data-halftone        required; opts the canvas in
 *   data-pair="dark"     optional; light dots on dark ground (low-key scene)
 *
 * No dependencies, no build step. ES2017.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // ---- Brand ---------------------------------------------------------------
  var PAIRS = {
    light: { ink: '#17150F', paper: '#F2EDE2' },
    dark: { ink: '#EFE9DC', paper: '#12110E' }
  };

  // Scene "keys". Values are luminance of the depicted scene (0..1).
  // light pair: dot coverage = darkness (1 - lum); high-key background.
  // dark pair:  dots are the light colour, so coverage = lum; low-key scene.
  var KEYS = {
    light: {
      bg: 0.965,
      floor: { alb: 0.96, amb: 0.50 },
      sphere: { alb: 0.93, amb: 0.16 },
      box: { alb: 0.90, amb: 0.20 },
      invert: true
    },
    dark: {
      bg: 0.045,
      floor: { alb: 0.15, amb: 0.30 },
      sphere: { alb: 0.95, amb: 0.06 },
      box: { alb: 0.55, amb: 0.08 },
      invert: false
    }
  };

  var LABEL = 'Halftone still life of a sphere on a plinth';
  var DEVELOP_MS = 1600;
  var ORBIT_S = 40;
  var COARSE = 4;
  var TAU = Math.PI * 2;
  var SQRT1_2 = Math.SQRT1_2;
  var INV_PI = 1 / Math.PI;

  // ---- Geometry (world units, y up, camera looks toward -z) ------------------
  var SR = 0.75;                       // sphere radius
  var SX = 0, SY = 1.1 + SR, SZ = 0;   // sphere centre (resting on plinth top)
  var BHX = 0.78, BHY = 0.55, BHZ = 0.78, BCY = 0.55; // plinth half extents + centre y
  var BROT = -0.5;                      // plinth yaw (radians)
  var BC = Math.cos(BROT), BS = Math.sin(BROT);
  var EYE = [0, 3.3, 6.2];
  var TARGET = [0, 1.25, 0];

  var LIGHT_AZ = -0.95, LIGHT_EL = 0.95; // base light: upper-left-front
  var ORBIT_AZ = 0.42, ORBIT_EL = 0.12; // orbit amplitude
  var PTR_AZ = 0.35, PTR_EL = 0.14;     // pointer parallax amplitude
  var PENUMBRA = 0.085;                 // soft-shadow spread (radians-ish)
  var EPS = 1e-4;

  function smoothstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }

  // ---- Ray tests --------------------------------------------------------------
  // Sphere: nearest positive t or -1.
  function raySphere(ox, oy, oz, dx, dy, dz) {
    var lx = ox - SX, ly = oy - SY, lz = oz - SZ;
    var b = lx * dx + ly * dy + lz * dz;
    var c = lx * lx + ly * ly + lz * lz - SR * SR;
    var h = b * b - c;
    if (h < 0) return -1;
    var t = -b - Math.sqrt(h);
    return t > EPS ? t : -1;
  }

  // Plinth (yawed box). Returns t or -1; writes world-space face normal to boxN.
  var boxN = [0, 0, 0];
  function rayBox(ox, oy, oz, dx, dy, dz) {
    // world -> local (rotate by -BROT about y)
    var lox = BC * ox + BS * oz, loz = -BS * ox + BC * oz, loy = oy - BCY;
    var ldx = BC * dx + BS * dz, ldz = -BS * dx + BC * dz, ldy = dy;
    var tmin = -Infinity, tmax = Infinity, axis = -1, sgn = 0, t1, t2, tt, inv;

    // x
    if (ldx > -1e-9 && ldx < 1e-9) { if (lox < -BHX || lox > BHX) return -1; }
    else {
      inv = 1 / ldx; t1 = (-BHX - lox) * inv; t2 = (BHX - lox) * inv;
      if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) { tmin = t1; axis = 0; sgn = ldx > 0 ? -1 : 1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    // y
    if (ldy > -1e-9 && ldy < 1e-9) { if (loy < -BHY || loy > BHY) return -1; }
    else {
      inv = 1 / ldy; t1 = (-BHY - loy) * inv; t2 = (BHY - loy) * inv;
      if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) { tmin = t1; axis = 1; sgn = ldy > 0 ? -1 : 1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    // z
    if (ldz > -1e-9 && ldz < 1e-9) { if (loz < -BHZ || loz > BHZ) return -1; }
    else {
      inv = 1 / ldz; t1 = (-BHZ - loz) * inv; t2 = (BHZ - loz) * inv;
      if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) { tmin = t1; axis = 2; sgn = ldz > 0 ? -1 : 1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (tmin <= EPS || tmax <= EPS) return -1;

    // local normal -> world (rotate by +BROT)
    var nx = axis === 0 ? sgn : 0, ny = axis === 1 ? sgn : 0, nz = axis === 2 ? sgn : 0;
    boxN[0] = BC * nx - BS * nz;
    boxN[1] = ny;
    boxN[2] = BS * nx + BC * nz;
    return tmin;
  }

  // ---- Light state (per frame) ------------------------------------------------
  // Shadow sample directions: centre + 6 on a ring (area light => soft shadow).
  var NS = 7;
  var SD = new Float64Array(NS * 3);
  var Lx = 0, Ly = 1, Lz = 0;

  function setLight(az, el) {
    var ce = Math.cos(el);
    Lx = Math.sin(az) * ce; Ly = Math.sin(el); Lz = Math.cos(az) * ce;
    // tangent basis
    var t1x = -Lz, t1z = Lx, tl = Math.sqrt(t1x * t1x + t1z * t1z) || 1;
    t1x /= tl; t1z /= tl;
    // t2 = cross(t1, L) with t1y = 0
    var t2x = -t1z * Ly, t2y = t1z * Lx - t1x * Lz, t2z = t1x * Ly;
    SD[0] = Lx; SD[1] = Ly; SD[2] = Lz;
    for (var k = 1; k < NS; k++) {
      var a = (k - 1) / (NS - 1) * TAU;
      var ca = Math.cos(a) * PENUMBRA, sa = Math.sin(a) * PENUMBRA;
      var x = Lx + t1x * ca + t2x * sa, y = Ly + t2y * sa, z = Lz + t1z * ca + t2z * sa;
      var l = Math.sqrt(x * x + y * y + z * z);
      SD[k * 3] = x / l; SD[k * 3 + 1] = y / l; SD[k * 3 + 2] = z / l;
    }
  }

  // Fraction of light reaching P (0..1). Convex objects skip self tests.
  function lightVis(px, py, pz, testSphere, testBox) {
    var lit = 0;
    for (var k = 0; k < NS; k++) {
      var dx = SD[k * 3], dy = SD[k * 3 + 1], dz = SD[k * 3 + 2];
      if (testSphere && raySphere(px, py, pz, dx, dy, dz) > 0) continue;
      if (testBox && rayBox(px, py, pz, dx, dy, dz) > 0) continue;
      lit++;
    }
    return lit / NS;
  }

  // Analytic ambient occlusion by the sphere (cosine-weighted solid angle).
  function sphereAO(px, py, pz, nx, ny, nz) {
    var vx = SX - px, vy = SY - py, vz = SZ - pz;
    var d2 = vx * vx + vy * vy + vz * vz, d = Math.sqrt(d2);
    var c = (nx * vx + ny * vy + nz * vz) / d;
    if (c <= 0) return 1;
    var o = (SR * SR / d2) * c;
    return 1 - (o > 1 ? 1 : o);
  }

  // Contact darkening of the floor around the plinth base.
  function plinthFloorAO(px, pz) {
    var lx = BC * px + BS * pz, lz = -BS * px + BC * pz;
    var ex = Math.abs(lx) - BHX, ez = Math.abs(lz) - BHZ;
    ex = ex > 0 ? ex : 0; ez = ez > 0 ? ez : 0;
    var e = Math.sqrt(ex * ex + ez * ez);
    return 1 - 0.45 * Math.exp(-e * 4.5);
  }

  // Scene luminance along a primary ray.
  function shade(K, ox, oy, oz, dx, dy, dz) {
    var tS = raySphere(ox, oy, oz, dx, dy, dz);
    var tB = rayBox(ox, oy, oz, dx, dy, dz);
    var tF = dy < -1e-6 ? -oy / dy : -1;

    var t = Infinity, hit = 0;
    if (tS > 0) { t = tS; hit = 1; }
    if (tB > 0 && tB < t) { t = tB; hit = 2; }
    if (tF > 0 && tF < t) { t = tF; hit = 3; }
    if (!hit) return K.bg;

    var px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
    var nx, ny, nz, m, vis, ao, ndl;

    if (hit === 1) {
      nx = (px - SX) / SR; ny = (py - SY) / SR; nz = (pz - SZ) / SR;
      m = K.sphere;
      ndl = nx * Lx + ny * Ly + nz * Lz;
      // a touch of bounce from the plinth/floor below keeps the core shadow from going flat
      ao = 0.75 + 0.25 * (ny < 0 ? 1 + ny : 1);
      return m.alb * (m.amb * ao + (1 - m.amb) * (ndl > 0 ? ndl : 0));
    }

    if (hit === 2) {
      nx = boxN[0]; ny = boxN[1]; nz = boxN[2];
      m = K.box;
      ndl = nx * Lx + ny * Ly + nz * Lz;
      ao = sphereAO(px, py, pz, nx, ny, nz);
      vis = ndl > 0 ? lightVis(px + nx * 1e-3, py + ny * 1e-3, pz + nz * 1e-3, true, false) : 0;
      // flat Lambert per face; vis only matters on the top face (sphere shadow)
      return m.alb * (m.amb * ao + (1 - m.amb) * (ndl > 0 ? ndl : 0) * vis);
    }

    // floor
    m = K.floor;
    ao = sphereAO(px, py, pz, 0, 1, 0) * plinthFloorAO(px, pz);
    vis = Ly > 0 ? lightVis(px, 1e-3, pz, true, true) : 0;
    // floor is the exposure reference: lit floor ~= paper, shadow = ambient only
    var lum = m.alb * (m.amb * ao + (1 - m.amb) * (Ly > 0 ? 1 : 0) * vis);
    var rho = Math.sqrt(px * px + pz * pz);
    var f = smoothstep(5, 16, rho);
    return lum + (K.bg - lum) * f;
  }

  // ---- Instance -----------------------------------------------------------------
  var reducedMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var finePtrMQ = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
  var instances = [];
  var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  function isReduced() { return !!(reducedMQ && reducedMQ.matches); }

  function Halftone(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
    this.w = 0; this.h = 0; this.dpr = 1;
    this.visible = false;
    this.developing = false;   // develop has been triggered
    this.devElapsed = 0;       // ms of active time since develop began
    this.orbitTime = 0;        // s of active time after develop
    this.raf = 0; this.last = 0;
    this.ptx = 0; this.pty = 0; this.pcx = 0; this.pcy = 0; // pointer target/current
    this.cam = null;

    if (!canvas.hasAttribute('role')) canvas.setAttribute('role', 'img');
    if (!canvas.hasAttribute('aria-label') && !canvas.hasAttribute('aria-labelledby')) {
      canvas.setAttribute('aria-label', LABEL);
    }

    var self = this;
    this._frame = function (now) { self.frame(now); };

    // Pointer parallax (desktop / fine pointer only)
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (!finePtrMQ || !finePtrMQ.matches || isReduced()) return;
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      self.ptx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      self.pty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    });
    canvas.addEventListener('pointerleave', function () { self.ptx = 0; self.pty = 0; });

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(function () { self.resize(); });
      this.ro.observe(canvas);
    }

    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var en = entries[i];
          self.visible = en.isIntersecting;
          var vh = window.innerHeight || 1;
          if (en.isIntersecting && (en.intersectionRatio >= 0.2 || en.intersectionRect.height >= vh * 0.4)) {
            self.beginDevelop();
          }
        }
        self.sync();
      }, { threshold: [0, 0.2, 0.4] });
      this.io.observe(canvas);
    } else {
      this.visible = true;
      this.developing = true;
    }

    this.resize();
  }

  Halftone.prototype.pair = function () {
    return this.canvas.getAttribute('data-pair') === 'dark' ? 'dark' : 'light';
  };

  Halftone.prototype.beginDevelop = function () {
    if (this.developing) return;
    this.developing = true;
    this.devElapsed = 0;
  };

  Halftone.prototype.resize = function () {
    var c = this.canvas;
    var w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (bw !== c.width || bh !== c.height) { c.width = bw; c.height = bh; }
    this.w = w; this.h = h; this.dpr = dpr;

    // Camera: frame so sphere diameter ~35% of the shorter side, subject a bit low.
    var fx = TARGET[0] - EYE[0], fy = TARGET[1] - EYE[1], fz = TARGET[2] - EYE[2];
    var fl = Math.sqrt(fx * fx + fy * fy + fz * fz); fx /= fl; fy /= fl; fz /= fl;
    var rx = -fz, rz = fx, rl = Math.sqrt(rx * rx + rz * rz); rx /= rl; rz /= rl; // cross(f, up)
    var ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                       // cross(r, f)
    var ex = SX - EYE[0], ey = SY - EYE[1], ez = SZ - EYE[2];
    var dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
    var focal = 0.35 * Math.min(w, h) * dist / (2 * SR);
    this.cam = { fx: fx, fy: fy, fz: fz, rx: rx, rz: rz, ux: ux, uy: uy, uz: uz,
      focal: focal, px: w * 0.5, py: h * 0.54 };

    this.render();
    this.sync();
  };

  Halftone.prototype.targetPitch = function () {
    return Math.max(9, this.w / 60);
  };

  Halftone.prototype.render = function () {
    if (!this.cam || !this.ctx) return;
    var reduced = isReduced();
    var ctx = this.ctx, w = this.w, h = this.h, cam = this.cam;
    var key = this.pair();
    var K = KEYS[key], P = PAIRS[key];

    // Pitch (develop)
    var pt = this.targetPitch(), pitch;
    if (reduced) pitch = pt;
    else if (!this.developing) pitch = pt * COARSE;
    else {
      var k = Math.min(1, this.devElapsed / DEVELOP_MS);
      pitch = pt * (1 + (COARSE - 1) * (1 - easeOutCubic(k)));
    }

    // Light
    var az = LIGHT_AZ, el = LIGHT_EL;
    if (!reduced) {
      var ph = (this.orbitTime / ORBIT_S) * TAU;
      az += ORBIT_AZ * Math.sin(ph) + PTR_AZ * this.pcx;
      el += ORBIT_EL * (Math.cos(ph) - 1) * 0.5 - PTR_EL * this.pcy;
    }
    setLight(az, el);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = P.paper;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = P.ink;
    ctx.beginPath();

    // 45 deg grid anchored at canvas centre: x = cx + d*a, y = cy + s*a, d ≡ s (mod 2)
    var a = pitch * SQRT1_2;
    var cx = w * 0.5, cy = h * 0.5;
    var sN = Math.ceil((h * 0.5) / a) + 1, dN = Math.ceil((w * 0.5) / a) + 1;
    var rMax = pitch * 0.71, rMin = 0.25;
    var ex = EYE[0], ey = EYE[1], ez = EYE[2];
    var F = cam.focal, ppx = cam.px, ppy = cam.py;
    var bx = cam.fx * F, by = cam.fy * F, bz = cam.fz * F;
    var invert = K.invert;

    for (var s = -sN; s <= sN; s++) {
      var y = cy + s * a;
      if (y < -rMax || y > h + rMax) continue;
      var sy = y - ppy;
      var d0 = -dN; if ((d0 - s) & 1) d0++;
      for (var d = d0; d <= dN; d += 2) {
        var x = cx + d * a;
        if (x < -rMax || x > w + rMax) continue;
        var sx = x - ppx;
        var dx = bx + cam.rx * sx - cam.ux * sy;
        var dy = by - cam.uy * sy;
        var dz = bz + cam.rz * sx - cam.uz * sy;
        var il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
        var lum = shade(K, ex, ey, ez, dx * il, dy * il, dz * il);
        var tone = invert ? 1 - lum : lum;
        if (tone <= 0) continue;
        if (tone > 1) tone = 1;
        // area ∝ tone; in deep shadow let dots swell so neighbours merge
        var r = pitch * Math.sqrt(tone * INV_PI) * (1 + 0.26 * smoothstep(0.6, 1, tone));
        if (r < rMin) continue;
        if (r > rMax) r = rMax;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
    }
    ctx.fill();
  };

  Halftone.prototype.shouldRun = function () {
    return this.visible && this.developing && !document.hidden && !isReduced() && !!this.cam;
  };

  Halftone.prototype.sync = function () {
    if (this.shouldRun()) {
      if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame(this._frame); }
    } else if (this.raf) {
      cancelAnimationFrame(this.raf); this.raf = 0;
    }
  };

  Halftone.prototype.frame = function (now) {
    this.raf = 0;
    if (!this.shouldRun()) return;
    var dt = this.last ? Math.min(50, now - this.last) : 0;
    this.last = now;

    if (this.devElapsed < DEVELOP_MS) this.devElapsed += dt;
    else this.orbitTime += dt / 1000;

    var kp = 1 - Math.exp(-dt / 1000 * 3.5);
    this.pcx += (this.ptx - this.pcx) * kp;
    this.pcy += (this.pty - this.pcy) * kp;

    this.render();
    this.raf = requestAnimationFrame(this._frame);
  };

  // ---- Bootstrapping ------------------------------------------------------------
  function init(root) {
    var list = (root || document).querySelectorAll('canvas[data-halftone]');
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (seen ? seen.has(c) : c.__halftone) continue;
      if (seen) seen.add(c); else c.__halftone = true;
      instances.push(new Halftone(c));
    }
  }

  function syncAll() { for (var i = 0; i < instances.length; i++) instances[i].sync(); }
  function renderAll() { for (var i = 0; i < instances.length; i++) instances[i].render(); }

  document.addEventListener('visibilitychange', syncAll);

  function onReducedChange() {
    for (var i = 0; i < instances.length; i++) {
      var it = instances[i];
      it.pcx = it.pcy = it.ptx = it.pty = 0;
      it.render();
      it.sync();
    }
  }
  if (reducedMQ) {
    if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', onReducedChange);
    else if (reducedMQ.addListener) reducedMQ.addListener(onReducedChange);
  }

  // Fallback resize + devicePixelRatio changes (zoom / monitor move)
  var lastDpr = window.devicePixelRatio || 1;
  window.addEventListener('resize', function () {
    var dpr = window.devicePixelRatio || 1;
    if (typeof ResizeObserver === 'undefined' || dpr !== lastDpr) {
      lastDpr = dpr;
      for (var i = 0; i < instances.length; i++) instances[i].resize();
    }
  });

  window.BPNYHalftone = { init: init, redraw: renderAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
})();
