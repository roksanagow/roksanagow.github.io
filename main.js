/* ============================================================
   main.js
   - drifting "embedding field" with proximity links
   - the connecting lines are themselves hyperlinks: hovering one
     turns the cursor to a pointer and brightens it; clicking opens
     a destination in a new tab. No text popup. Guarded so it never
     fires when a real link/button is under the cursor.
   - theme toggle (dark-first), scroll reveal
   ============================================================ */

(function () {
  "use strict";

  /* ---- easter-egg destinations ----
     EGG_MODE: "wiktionary" (default) sends every hidden link to a random
     Wiktionary entry — a *link* leading to a random word's senses.
     Set EGG_MODE = "links" to instead point to a random one of Roksana's
     own papers / profiles (the EGG_LINKS list below). Edit either freely. */
  const EGG_MODE = "wiktionary";
  // English-only: draws from Category:English lemmas rather than all languages.
  const WIKTIONARY_RANDOM = "https://en.wiktionary.org/wiki/Special:RandomInCategory/English_lemmas";
  // for any-language Wiktionary: "https://en.wiktionary.org/wiki/Special:Random"
  // for Wikipedia instead: "https://en.wikipedia.org/wiki/Special:Random"

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
  const root = document.documentElement;

  /* ---------- theme toggle (dark-first; light only if chosen) ---------- */
  const toggle = document.getElementById("theme-toggle");
  const readStored = () => { try { return localStorage.getItem("theme"); } catch (e) { return null; } };
  const writeStored = (v) => { try { localStorage.setItem("theme", v); } catch (e) {} };

  const initial = readStored() === "light" ? "light" : "dark";
  root.setAttribute("data-theme", initial);
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

  /* ---------- the embedding field ---------- */
  const canvas = document.getElementById("field");
  const egg = document.getElementById("egg");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const getCSS = (n) => getComputedStyle(root).getPropertyValue(n).trim() || "#8A92C9";
  const HUES = ["--s-teal", "--s-peri", "--s-rose", "--s-amber"];

  let W = 0, H = 0, DPR = 1, worldH = 0;
  let points = [];
  let links = [];                 // {x1,y1,x2,y2,key,o}
  let hoveredKey = null;
  const LINK_DIST = 76;           // ~2cm: points connect only when fairly close
  const mouse = { x: -1e4, y: -1e4 };

  function withAlpha(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    worldH = Math.max(document.documentElement.scrollHeight, H);
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed();
  }

  function seed() {
    const target = Math.round(Math.min(160, Math.max(34, (W * worldH) / 22000)));
    points = [];
    for (let i = 0; i < target; i++) {
      points.push({
        x: Math.random() * W, y: Math.random() * worldH,
        vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16,
        r: 1.1 + Math.random() * 1.9,
        hue: getCSS(HUES[i % HUES.length]),
      });
    }
  }

  // points live in document space; we draw them offset by scroll so the
  // field scrolls with the page. Links are stored in *screen* coords.
  function buildLinks() {
    const sc = window.scrollY || window.pageYOffset || 0;
    links = [];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < LINK_DIST) {
          const y1 = a.y - sc, y2 = b.y - sc;
          if ((y1 < -60 && y2 < -60) || (y1 > H + 60 && y2 > H + 60)) continue;  // offscreen
          links.push({ x1: a.x, y1: y1, x2: b.x, y2: y2, key: i + "-" + j, o: (1 - d / LINK_DIST) * 0.16 });
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
    if (!el || el === egg) return false;          // our own hotspot doesn't count
    return !!(el.closest && el.closest("a, button, input, .chip, .links a, .card"));
  }

  // decide whether a connecting line is under the cursor; position the
  // invisible hotspot accordingly. No text is ever shown.
  function evaluateHover() {
    hoveredKey = null;
    if (!egg) return;
    if (mouse.x < 0 || overRealLink(mouse.x, mouse.y)) { egg.style.display = "none"; return; }

    let best = Infinity, hit = null;
    for (const s of links) {
      const d = distToSeg(mouse.x, mouse.y, s);
      if (d < 7 && d < best) { best = d; hit = s; }
    }
    if (!hit) { egg.style.display = "none"; return; }

    hoveredKey = hit.key;
    if (hit.key !== egg.dataset.key) {     // only re-roll when the line changes
      egg.dataset.key = hit.key;
      egg.href = pickTarget();
    }
    egg.style.left = mouse.x + "px";
    egg.style.top = mouse.y + "px";
    egg.style.display = "block";
  }

  function draw() {
    const sc = window.scrollY || window.pageYOffset || 0;
    ctx.clearRect(0, 0, W, H);
    const accent = getCSS("--accent");
    for (const s of links) {
      const hot = s.key === hoveredKey;
      ctx.strokeStyle = withAlpha(accent, hot ? 0.7 : s.o);
      ctx.lineWidth = hot ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
    for (const p of points) {
      const sy = p.y - sc;
      if (sy < -20 || sy > H + 20) continue;        // offscreen
      ctx.fillStyle = withAlpha(p.hue, 0.55);
      ctx.beginPath(); ctx.arc(p.x, sy, p.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function move() {
    for (const p of points) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = worldH + 20; if (p.y > worldH + 20) p.y = -20;
    }
  }

  function frame() {
    if (!reduceMotion) move();
    buildLinks();
    evaluateHover();
    draw();
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (reduceMotion) { buildLinks(); evaluateHover(); draw(); }
  });
  window.addEventListener("mouseleave", () => {
    mouse.x = -1e4; if (egg) egg.style.display = "none"; hoveredKey = null;
    if (reduceMotion) draw();
  });
  window.addEventListener("scroll", () => {
    if (reduceMotion) { buildLinks(); evaluateHover(); draw(); }
  }, { passive: true });

  /* ---------- updates timeline: show earlier / fewer ---------- */
  const tlBtn = document.querySelector(".tl-more");
  const tl = document.querySelector(".timeline-nn");
  if (tlBtn && tl) {
    tlBtn.addEventListener("click", () => {
      const open = tl.classList.toggle("expanded");
      tlBtn.textContent = open ? "Show fewer ↑" : "Show earlier ↓";
    });
  }

  /* ---------- scroll reveal ---------- */
  if (!reduceMotion && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
  }

  /* ---------- boot ---------- */
  window.addEventListener("resize", resize);
  resize();
  frame();
})();
