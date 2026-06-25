/* ============================================================
   main.js
   - 3D "embedding field": points float in depth; nearer points are
     larger and brighter. Scrolling rotates the cloud about the X axis
     (pitch), proportional to scroll position.
   - connecting lines stay clickable; navigation works on mouse AND touch.
   - theme toggle (dark-first), updates timeline toggle, scroll reveal.
   ============================================================ */

(function () {
  "use strict";

  /* ---- easter-egg destinations ----
     EGG_MODE: "wiktionary" (default) sends every hidden link to a random
     English Wiktionary entry. Set EGG_MODE = "links" to point to a random
     one of Roksana's own papers / profiles (EGG_LINKS below). */
  const EGG_MODE = "wiktionary";
  const WIKTIONARY_RANDOM = "https://en.wiktionary.org/wiki/Special:RandomInCategory/English_lemmas";
  // any-language Wiktionary: "https://en.wiktionary.org/wiki/Special:Random"
  // Wikipedia: "https://en.wikipedia.org/wiki/Special:Random"

  const EGG_LINKS = [
    "https://arxiv.org/abs/2602.15716",
    "https://arxiv.org/abs/2511.19325",
    "https://arxiv.org/abs/2511.19324",
    "https://aclanthology.org/2025.emnlp-main.1321/",
    "https://aclanthology.org/2025.emnlp-main.1773/",
    "https://arxiv.org/abs/2510.00908",
    "https://aclanthology.org/2025.sigtyp-1.7/",
    "https://aclanthology.org/2024.eacl-srw.28/",
    "https://scholar.google.com.sg/citations?user=TEzAVQQAAAAJ&hl=en",
    "https://github.com/roksanagow",
    "favourites.html",
  ];
  function pickTarget() {
    if (EGG_MODE === "wiktionary") return WIKTIONARY_RANDOM;
    return EGG_LINKS[Math.floor(Math.random() * EGG_LINKS.length)];
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COARSE = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const root = document.documentElement;

  /* ---------- theme toggle (dark-first; light only if chosen) ---------- */
  const toggle = document.getElementById("theme-toggle");
  const readStored = () => { try { return localStorage.getItem("theme"); } catch (e) { return null; } };
  const writeStored = (v) => { try { localStorage.setItem("theme", v); } catch (e) {} };

  root.setAttribute("data-theme", readStored() === "light" ? "light" : "dark");
  if (toggle) {
    const label = () => (root.getAttribute("data-theme") === "light" ? "dark" : "light");
    toggle.textContent = label();
    toggle.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      writeStored(next);
      toggle.textContent = label();
    });
  }

  /* ============================================================
     3D embedding field
     ============================================================ */
  const canvas = document.getElementById("field");
  if (!canvas) { wireRest(); return; }
  const ctx = canvas.getContext("2d");
  const getCSS = (n) => getComputedStyle(root).getPropertyValue(n).trim() || "#8A92C9";
  const HUES = ["--s-teal", "--s-peri", "--s-rose", "--s-amber"];

  const FOCAL = 850;        // was 440
  const DEPTH_SHIFT = 320;  // was 440    // some points sit in front of the focal plane (scale > 1)
  const SCROLL_ROT = 0.0014;  // radians of pitch per pixel scrolled
  const ANG0 = 0.30;          // resting tilt so the field reads as 3D at the top
  const MIN_S = 0.28, MAX_S = 1.5;

  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0;
  let hw = 0, hh = 0, hd = 0, LINK3D = 0;
  let points = [];
  let links = [];
  let hoveredKey = null;
  const mouse = { x: -1e4, y: -1e4 };

  const withAlpha = (hex, a) => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cx = W / 2; cy = H / 2;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const CLOUD_SCALE = 1.5;

    hw = W * 0.5 * CLOUD_SCALE;
    hh = H * 0.5 * CLOUD_SCALE;
    hd = Math.min(W, H) * 0.32 * CLOUD_SCALE;
    LINK3D = Math.min(W, H) * 0.15;
    seed();
  }

  function seed() {
    const target = Math.round(Math.min(150, Math.max(50, (W * H) / 10000)));
    points = [];
    for (let i = 0; i < target; i++) {
      points.push({
        x: (Math.random() * 2 - 1) * hw,
        y: (Math.random() * 2 - 1) * hh,
        z: (Math.random() * 2 - 1) * hd,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        vz: (Math.random() - 0.5) * 0.12,
        r: 1.2 + Math.random() * 1.6,
        hue: getCSS(HUES[i % HUES.length]),
        sx: 0, sy: 0, scale: 1, zc: 0,
      });
    }
  }

  function project() {
    const ang = -(ANG0 + (window.scrollY || window.pageYOffset || 0) * SCROLL_ROT);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (const p of points) {
      if (!reduceMotion) {
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
        if (p.x < -hw || p.x > hw) p.vx *= -1;
        if (p.y < -hh || p.y > hh) p.vy *= -1;
        if (p.z < -hd || p.z > hd) p.vz *= -1;
      }
      const yR = p.y * ca - p.z * sa;
      const zR = p.y * sa + p.z * ca;
      const zc = zR + DEPTH_SHIFT;
      let s = FOCAL / (FOCAL + zc);
      s = Math.max(MIN_S, Math.min(MAX_S, s));
      p.sx = cx + p.x * s;
      p.sy = cy + yR * s;
      p.scale = s;
      p.zc = zc;
    }
  }

  function buildLinks() {
    links = [];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j];
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < LINK3D) {
          const o = (1 - d / LINK3D) * 0.18 * ((a.scale + b.scale) / 2);
          links.push({ x1: a.sx, y1: a.sy, x2: b.sx, y2: b.sy, key: i + "-" + j, o: o });
        }
      }
    }
  }

  function distToSeg(px, py, s) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
  }

  function overRealLink(x, y) {
    const el = document.elementFromPoint(x, y);
    return !!(el && el.closest && el.closest("a, button, input, .chip, .links a, .hero-links a, .card, .tl-title a"));
  }

  function evaluateHover() {
    hoveredKey = null;
    if (COARSE) return;                       // touch devices have no hover
    if (mouse.x < 0 || overRealLink(mouse.x, mouse.y)) { document.body.style.cursor = ""; return; }
    let best = Infinity, hit = null;
    for (const s of links) {
      const d = distToSeg(mouse.x, mouse.y, s);
      if (d < 8 && d < best) { best = d; hit = s; }
    }
    if (!hit) { document.body.style.cursor = ""; return; }
    hoveredKey = hit.key;
    document.body.style.cursor = "pointer";
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const accent = getCSS("--accent");
    for (const s of links) {
      const hot = s.key === hoveredKey;
      ctx.strokeStyle = withAlpha(accent, hot ? 0.7 : s.o);
      ctx.lineWidth = hot ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
    const order = points.map((_, i) => i).sort((a, b) => points[b].zc - points[a].zc);
    for (const i of order) {
      const p = points[i];
      if (p.sx < -30 || p.sx > W + 30 || p.sy < -30 || p.sy > H + 30) continue;
      const depthT = (p.scale - MIN_S) / (MAX_S - MIN_S);
      const alpha = 0.22 + 1 * depthT;
      ctx.fillStyle = withAlpha(p.hue, alpha);
      ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(0.4, p.r * p.scale), 0, Math.PI * 2); ctx.fill();
    }
  }

  function frame() {
    project();
    buildLinks();
    evaluateHover();
    draw();
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  /* ---------- interaction: hover cursor + click/tap navigation ---------- */
  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (reduceMotion) { buildLinks(); evaluateHover(); draw(); }
  });
  window.addEventListener("mouseleave", () => {
    mouse.x = -1e4; hoveredKey = null; document.body.style.cursor = "";
    if (reduceMotion) draw();
  });

  // works for mouse clicks and touch taps alike
  window.addEventListener("click", (e) => {
    const x = e.clientX, y = e.clientY;
    if (x == null || overRealLink(x, y)) return;     // let real links/buttons act
    const thr = COARSE ? 18 : 8;
    let best = Infinity, hit = null;
    for (const s of links) {
      const d = distToSeg(x, y, s);
      if (d < thr && d < best) { best = d; hit = s; }
    }
    if (!hit) return;
    const a = document.createElement("a");
    a.href = pickTarget();
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  // re-render on scroll for reduced-motion users (no rAF loop running)
  window.addEventListener("scroll", () => {
    if (reduceMotion) { project(); buildLinks(); draw(); }
  }, { passive: true });

  window.addEventListener("resize", resize);
  resize();
  frame();

  wireRest();

  /* ============================================================
     non-field bits (run even if canvas is missing)
     ============================================================ */
  function wireRest() {
    // updates timeline: show earlier / fewer
    const tlBtn = document.querySelector(".tl-more");
    const tl = document.querySelector(".timeline-nn");
    if (tlBtn && tl) {
      tlBtn.addEventListener("click", () => {
        const open = tl.classList.toggle("expanded");
        tlBtn.textContent = open ? "Show fewer ↑" : "Show earlier ↓";
      });
    }
    // scroll reveal
    if (!reduceMotion && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      }, { threshold: 0.12 });
      document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    } else {
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
    }
  }
})();
