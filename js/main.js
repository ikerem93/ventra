/* =========================================================
   Ventra — Landing page interactions (vanilla JS)
   ========================================================= */
(function () {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  const nav = $("#mainNav");

  /* One rAF-throttled loop for everything scroll-linked */
  const scrollFns = [];
  let ticking = false;
  const tick = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; scrollFns.forEach((fn) => fn()); });
  };
  window.addEventListener("scroll", tick, { passive: true });
  window.addEventListener("resize", tick);

  const scrollToY = (top) => window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  const scrollToEl = (target) => scrollToY(target.getBoundingClientRect().top + window.scrollY - nav.offsetHeight + 1);

  /* ---------- Anchors, navbar, progress, back-to-top ---------- */
  $$('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href");
      if (id.length < 2) return;
      const target = $(id);
      if (!target) return;
      e.preventDefault();
      if (id === "#top") scrollToY(0); else scrollToEl(target);
    });
  });

  const toTop = $(".to-top");
  const progress = $(".scroll-progress span");
  scrollFns.push(() => {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    nav.classList.toggle("scrolled", y > 40);
    toTop.classList.toggle("show", y > 900);
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  });

  new bootstrap.ScrollSpy(document.body, { target: "#mainNav", rootMargin: "0px 0px -45%" });

  const menu = $("#navMenu");
  $$("a", menu).forEach((link) => {
    link.addEventListener("click", () => {
      if (menu.classList.contains("show")) bootstrap.Collapse.getOrCreateInstance(menu).hide();
    });
  });

  /* ---------- Headings are scanned into view ---------- */
  const reveals = $$(".scan-reveal");
  reveals.forEach((h) => {
    const text = el("span", "sr-text");
    while (h.firstChild) text.appendChild(h.firstChild);
    const line = el("span", "sr-line");
    line.setAttribute("aria-hidden", "true");
    h.append(text, line);
  });
  const stmtAnswer = $(".stmt-answer");
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    reveals.forEach((h) => { if (h !== stmtAnswer) io.observe(h); });
  } else {
    reveals.forEach((h) => h.classList.add("in"));
  }

  const onView = (node, cb, opts) => {
    if (!node) return;
    if (!("IntersectionObserver" in window)) { cb(true); return; }
    new IntersectionObserver((entries) => entries.forEach((e) => cb(e.isIntersecting)), opts).observe(node);
  };

  /* =========================================================
     HERO — a warehouse aisle drawn in perspective, with a
     scanning gate sweeping down it
     ========================================================= */
  const hero = $("#top");
  const canvas = $("#aisle");
  if (canvas && canvas.getContext) initAisle();

  function initAisle() {
    const ctx = canvas.getContext("2d");
    const tagsBox = $("#scanTags");
    const hudBay = $("#hudBay");
    const hudCount = $("#hudCount");

    const W = 1.7;          // half aisle width (m)
    const L = 2.6;          // bay length
    const TOP = 3.9;        // upright height
    const LEVELS = [0.12, 1.02, 1.92, 2.82];
    let bayCount = 15;     // drops on slow devices (see loop)
    const EYE = 1.6;
    const NEAR = 0.4;
    const FAR = 40;
    const PRODUCTS = [
      ["Soft Close Hinge 110°", "758 in stock, Aisle 3"],
      ["Black Bottom Track", "132 in stock, Bay 7"],
      ["Glass Shelf 8mm", "96 in stock, Glass-02"],
      ["Runner Ball Bearing 350", "Low stock, 4 left"],
      ["Black Grip Profiles", "1,240 in stock"],
      ["Edge Banding White", "310 m in stock"],
      ["Drawer Runner 450", "64 in stock, Shelf R2"],
      ["Glass Mirror 1070×2760", "Low stock, 3 left"],
    ];

    let w = 0, h = 0, cx = 0, cy = 0, f = 1, glow = null;
    let walk = 0, camZ = 0, camX = 0, camY = 0, tx = 0, ty = 0;
    let scanZ = 3, scanned = 0, lastTag = 0, raf = 0, last = 0, visible = true;
    let maxDpr = 1.5, cost = 0, frames = 0, quality = 2;
    const bays = new Map();
    const tags = [];

    const seeded = (seed) => {
      let s = seed >>> 0;
      return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    };

    function bay(k) {
      let b = bays.get(k);
      if (b) return b;
      const r = seeded(k * 7919 + 104729);
      const boxes = [];
      [-1, 1].forEach((side) => {
        LEVELS.forEach((y) => {
          let z = k * L + 0.14;
          const end = (k + 1) * L - 0.14;
          while (z < end - 0.4) {
            const len = 0.45 + r() * 0.7;
            if (z + len > end) break;
            if (r() > 0.16) {
              const hgt = 0.34 + r() * 0.42;
              boxes.push({
                side, z0: z, z1: z + len, y0: y + 0.1, y1: y + 0.1 + hgt,
                depth: 0.55 + r() * 0.4, tone: r(), glow: 0, counted: false,
                product: PRODUCTS[(r() * PRODUCTS.length) | 0],
              });
            }
            z += len + 0.06 + r() * 0.14;
          }
        });
      });
      boxes.sort((a, b2) => b2.z0 - a.z0);
      b = { boxes };
      bays.set(k, b);
      return b;
    }

    const P = (x, y, z) => {
      const s = f / (z - camZ);
      return [cx + (x - camX) * s, cy - (y - camY) * s];
    };
    const fog = (z) => { const t = clamp(1 - (z - camZ) / FAR); return t * t; };
    const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;
    const quad = (a, b, c, d) => {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
      ctx.closePath();
    };
    // A rectangle on a plane of constant x (rack faces)
    const xRect = (x, y0, y1, z0, z1) => quad(P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1));
    // A rectangle on a plane of constant y (floor, ceiling)
    const yRect = (y, x0, x1, z0, z1) => quad(P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1));

    function resize() {
      const nw = canvas.clientWidth, nh = canvas.clientHeight;
      if (nw === w && nh === h) return false;
      w = nw; h = nh;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2; cy = h * 0.4;
      f = Math.min(h * 0.95, w * 1.1);
      glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
      glow.addColorStop(0, "rgba(10,87,224,0.22)");
      glow.addColorStop(0.45, "rgba(10,87,224,0.07)");
      glow.addColorStop(1, "rgba(10,87,224,0)");
      return true;
    }

    function drawBox(bx) {
      const z0 = Math.max(bx.z0, camZ + NEAR);
      if (bx.z1 <= z0) return;
      const fz = fog((z0 + bx.z1) / 2);
      if (fz < 0.01) return;
      const g = bx.glow;
      let r = 10 + bx.tone * 8, gg = 25 + bx.tone * 16, b = 60 + bx.tone * 30;
      r += (8 - r) * g * 0.75; gg += (184 - gg) * g * 0.75; b += (248 - b) * g * 0.75;
      const x = bx.side * (W + 0.06);
      const xd = x + bx.side * bx.depth;

      if (bx.z0 >= camZ + NEAR) {                     // end face, towards the camera
        quad(P(x, bx.y0, z0), P(x, bx.y1, z0), P(xd, bx.y1, z0), P(xd, bx.y0, z0));
        ctx.fillStyle = rgba(r * 0.6, gg * 0.6, b * 0.6, fz);
        ctx.fill();
      }
      if (bx.y1 < camY) {                             // top face, visible below eye level
        quad(P(x, bx.y1, z0), P(x, bx.y1, bx.z1), P(xd, bx.y1, bx.z1), P(xd, bx.y1, z0));
        ctx.fillStyle = rgba(r * 1.3, gg * 1.25, b * 1.15, fz);
        ctx.fill();
      }
      xRect(x, bx.y0, bx.y1, z0, bx.z1);              // front face, towards the aisle
      ctx.fillStyle = rgba(r, gg, b, fz);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(110 + g * 90, 170 + g * 70, 255, 0.13 * fz + g * 0.45);
      ctx.stroke();

      const mid = (bx.z0 + bx.z1) / 2;               // label sticker
      if (fz > 0.2 && mid - 0.1 > camZ + NEAR) {
        xRect(x - bx.side * 0.002, bx.y0 + 0.08, bx.y0 + 0.2, mid - 0.1, mid + 0.1);
        ctx.fillStyle = rgba(225, 236, 255, (0.2 + g * 0.5) * fz);
        ctx.fill();
      }
    }

    function drawStructure(k) {
      const zA = Math.max(k * L, camZ + NEAR), zB = (k + 1) * L;
      if (zB <= zA) return;
      const fz = fog((zA + zB) / 2);
      if (fz < 0.01) return;
      [-1, 1].forEach((side) => {
        const x = side * W;
        ctx.fillStyle = rgba(50, 105, 210, 0.6 * fz);  // shelf beams
        LEVELS.forEach((y) => { xRect(x, y, y + 0.1, zA, zB); ctx.fill(); });
        const zu = k * L;                              // upright at the near end of the bay
        if (zu - 0.05 > camZ + NEAR) {
          xRect(x, 0, TOP, zu - 0.05, zu + 0.05);
          ctx.fillStyle = rgba(30, 72, 170, 0.8 * fog(zu));
          ctx.fill();
        }
        yRect(0.001, side * (W - 0.22), side * (W - 0.14), zA, zB);  // floor safety line
        ctx.fillStyle = rgba(245, 165, 36, 0.42 * fz);
        ctx.fill();
      });
      yRect(0, -W, W, zA, zA + 0.03);                  // floor joint
      ctx.fillStyle = rgba(90, 140, 255, 0.18 * fz);
      ctx.fill();
      const lz = k * L + 0.7;                          // ceiling light
      if (lz > camZ + NEAR) {
        yRect(5.2, -0.32, 0.32, lz, lz + 1.2);
        ctx.fillStyle = rgba(190, 225, 255, 0.7 * fz);
        ctx.fill();
        yRect(5.2, -0.9, 0.9, lz - 0.4, lz + 1.6);
        ctx.fillStyle = rgba(120, 180, 255, 0.08 * fz);
        ctx.fill();
      }
    }

    function drawScanGate() {
      if (scanZ <= camZ + NEAR) return;
      const fz = fog(scanZ);
      quad(P(-W, 0, scanZ), P(-W, TOP, scanZ), P(W, TOP, scanZ), P(W, 0, scanZ));
      ctx.fillStyle = rgba(8, 184, 248, 0.05 * fz);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(8, 184, 248, 0.75 * fz);
      ctx.stroke();
      yRect(0.002, -W, W, scanZ - 0.06, scanZ + 0.06);
      ctx.fillStyle = rgba(8, 184, 248, 0.6 * fz);
      ctx.fill();
    }

    function addTag(bx) {
      const tag = el("div", "scan-tag");
      const icon = el("i", "bi bi-upc-scan");
      const copy = el("span");
      const name = el("b"); name.textContent = bx.product[0];
      const meta = el("span"); meta.textContent = bx.product[1];
      copy.append(name, meta);
      tag.append(icon, copy);
      tagsBox.appendChild(tag);
      const t = { el: tag, bx, born: performance.now(), tw: tag.offsetWidth, th: tag.offsetHeight, dying: false };
      tags.push(t);
      requestAnimationFrame(() => tag.classList.add("show"));
    }
    function killTag(t) {
      if (t.dying) return;
      t.dying = true;
      t.el.classList.remove("show");
      setTimeout(() => { t.el.remove(); tags.splice(tags.indexOf(t), 1); }, 400);
    }
    function updateTags(now) {
      tags.forEach((t) => {
        const zc = (t.bx.z0 + t.bx.z1) / 2;
        if (zc - camZ < 1.4) { killTag(t); return; }
        const p = P(t.bx.side * (W + 0.06), (t.bx.y0 + t.bx.y1) / 2, zc);
        const x = clamp(t.bx.side > 0 ? p[0] + 14 : p[0] - 14 - t.tw, 12, w - t.tw - 12);
        const y = clamp(p[1] - t.th / 2, 90, h - t.th - 12);
        t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        if (now - t.born > 2600) killTag(t);
      });
    }

    function render(dt, now) {
      const heroP = clamp(window.scrollY / Math.max(1, hero.offsetHeight));
      walk += dt * 0.6;
      camZ = walk + heroP * 7;
      const ease = Math.min(1, dt * 3);
      camX += (tx * 0.5 - camX) * ease;
      camY += (EYE - ty * 0.3 - camY) * ease;
      scanZ += dt * 8;
      if (scanZ > camZ + 26 || scanZ < camZ + 2) scanZ = camZ + 2.5;

      ctx.fillStyle = "#040A18";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const kNear = Math.floor((camZ + NEAR) / L);
      const kScan = Math.floor(scanZ / L);
      const wideEnough = w >= 992;
      for (let k = kNear + bayCount; k >= kNear; k--) {
        if (k === kScan) drawScanGate();
        bay(k).boxes.forEach((bx) => {
          if (dt > 0 && bx.z0 <= scanZ && scanZ <= bx.z1) {
            bx.glow = 1;
            if (!bx.counted) {
              bx.counted = true;
              scanned++;
              const dz = (bx.z0 + bx.z1) / 2 - camZ;
              const yc = (bx.y0 + bx.y1) / 2;
              if (wideEnough && dz > 2.6 && dz < 4.4 && yc > 0.6 && yc < 2.6 && now - lastTag > 1300 && tags.length < 2) {
                lastTag = now;
                addTag(bx);
              }
            }
          } else if (bx.glow > 0) {
            bx.glow = Math.max(0, bx.glow - dt * 0.8);
          }
          drawBox(bx);
        });
        drawStructure(k);
      }
      bays.forEach((_, k) => { if (k < kNear - 1) bays.delete(k); });

      updateTags(now);
      hudBay.textContent = String((kNear % 99) + 1).padStart(2, "0");
      hudCount.textContent = scanned.toLocaleString("en-AU");
    }

    function loop(now) {
      if (!visible || document.hidden) { raf = 0; return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t1 = performance.now();
      render(dt, now);
      cost = cost * 0.9 + (performance.now() - t1) * 0.1;
      if (++frames > 90 && cost > 9 && quality > 0) {  // too slow: lower resolution, then draw fewer bays
        quality--;
        frames = 0;
        if (quality === 1) { maxDpr = 1; w = 0; resize(); } else bayCount = 9;
      }
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (raf || reduce || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    camY = EYE;
    resize();
    render(0, performance.now());
    window.addEventListener("resize", () => { if (resize() && (reduce || !raf)) render(0, performance.now()); });
    document.addEventListener("visibilitychange", start);
    onView(canvas, (v) => { visible = v; start(); });
    hero.addEventListener("pointermove", (e) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    });
    hero.addEventListener("pointerleave", () => { tx = 0; ty = 0; });
    start();
  }

  /* Side phones fan out as the hero scrolls away */
  const devices = $("#heroDevices");
  scrollFns.push(() => {
    if (window.scrollY > hero.offsetHeight) return;
    devices.style.setProperty("--p", clamp(window.scrollY / (window.innerHeight * 0.9)).toFixed(3));
  });

  /* =========================================================
     ACTIVITY — a change confirmed on the phone travels to the
     dashboard log: who, what and how many, where and when
     ========================================================= */
  const relay = $("#relay");
  const log = $("#log");
  const logCard = $("#logCard");
  const packet = $("#packet");
  const ru = {
    avatar: $("#ruAvatar"), name: $("#ruName"), branch: $("#ruBranch"), item: $("#ruItem"),
    stock: $("#ruStock"), qty: $("#ruQty"), reason: $("#ruReason"), reasonRow: $("#ruReasonRow"),
    confirm: $("#ruConfirm"), saved: $("#ruSaved"), segs: $$(".mu-seg span", relay), ui: $(".mini-ui", relay),
  };
  const PEOPLE = ["Sarah K.", "James T.", "Ali R.", "Mia O.", "Tom W.", "Priya S."];
  const ITEMS = ["Black Bottom Track", "Soft Close Hinge 110°", "Glass Shelf 8mm", "Runner Ball Bearing 350", "Black Grip Profiles", "Edge Banding White", "Drawer Runner 450", "Glass Mirror 1070×2760", "Wardrobe Rail 2400", "Cabinet Leg 150"];
  const BRANCHES = ["Melbourne", "Sydney", "Brisbane"];
  const REASONS = { added: ["Purchase", "Return"], removed: ["Sale", "Move"], damaged: [""] };
  const LOG_SIZE = 4;
  const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const ago = (t) => {
    const min = Math.round((Date.now() - t) / 60000);
    return min < 1 ? "just now" : `${min} min ago`;
  };
  const initials = (name) => name.split(/\s+/).map((p) => p[0]).join("");
  const signed = (m) => (m.kind === "added" ? "+" : "−") + m.n;
  const stockAfter = (m) => (m.kind === "added" ? m.stock + m.n : Math.max(0, m.stock - m.n));

  function makeMove(at) {
    const r = Math.random();
    const kind = r < 0.55 ? "added" : r < 0.9 ? "removed" : "damaged";
    const n = kind === "added" ? pick([10, 12, 20, 24, 40, 50, 60, 100, 120])
      : kind === "removed" ? pick([1, 2, 3, 4, 5, 6, 8, 10, 12]) : 1 + ((Math.random() * 2) | 0);
    return {
      at, time: hhmm(new Date(at)), who: pick(PEOPLE), item: pick(ITEMS), kind, n,
      reason: pick(REASONS[kind]), where: pick(BRANCHES), stock: 40 + ((Math.random() * 760) | 0),
    };
  }

  function logRow(m) {
    const li = el("li", `lg k-${m.kind}`);
    const who = el("div", "lg-who");
    const av = el("span", `avatar a${(PEOPLE.indexOf(m.who) % 3) + 1}`);
    av.textContent = initials(m.who);
    const name = el("b");
    name.textContent = m.who;
    who.append(av, name);
    const what = el("div", "lg-what");
    const qty = el("span", "lg-qty");
    qty.textContent = signed(m);
    const item = el("div", "lg-item");
    const itemName = el("span");
    itemName.textContent = m.item;
    const reason = el("small");
    reason.textContent = m.kind === "damaged" ? "Damaged" : m.reason;
    item.append(itemName, reason);
    what.append(qty, item);
    const where = el("div", "lg-where");
    const place = el("span");
    place.textContent = m.where;
    const when = el("small");
    when.dataset.at = m.at;
    where.append(place, when);
    li.append(who, what, where);
    return li;
  }
  function addLog(m, animate) {
    const li = logRow(m);
    if (animate) li.classList.add("arrive");
    log.prepend(li);
    while (log.children.length > LOG_SIZE) log.lastElementChild.remove();
    $$("small[data-at]", log).forEach((s) => {
      const at = Number(s.dataset.at);
      s.textContent = `${hhmm(new Date(at))}, ${ago(at)}`;
    });
  }
  function showOnPhone(m) {
    ru.avatar.textContent = initials(m.who);
    ru.name.textContent = m.who;
    ru.branch.textContent = m.where;
    ru.item.textContent = m.item;
    ru.stock.textContent = `${m.stock} in stock`;
    ru.qty.textContent = m.n;
    ru.reason.textContent = m.reason;
    ru.reasonRow.classList.toggle("off", !m.reason);
    ru.segs.forEach((s) => s.classList.toggle("on", s.dataset.k === m.kind));
    ru.saved.classList.remove("show");
  }

  const t0 = Date.now();
  [17, 11, 6, 2].forEach((min) => addLog(makeMove(t0 - min * 60000), false));
  let nextMove = makeMove(t0);
  showOnPhone(nextMove);

  let relayVisible = false;
  onView(relay, (v) => { relayVisible = v; }, { threshold: 0.2 });

  function relayCycle() {
    if (document.hidden) return;
    const m = nextMove;
    m.at = Date.now();
    m.time = hhmm(new Date(m.at));
    const land = (animate) => {
      addLog(m, animate);
      document.dispatchEvent(new CustomEvent("ventra:move", { detail: m }));
    };
    const prepareNext = () => { nextMove = makeMove(Date.now()); showOnPhone(nextMove); };

    if (!relayVisible || reduce) { land(false); prepareNext(); return; }

    restart(ru.confirm, "press");                       // 1. staff taps Confirm
    setTimeout(() => {                                  // 2. saved on the phone, sent down the wire
      ru.stock.textContent = `${stockAfter(m)} in stock`;
      ru.saved.classList.add("show");
      packet.textContent = signed(m);
      packet.className = `packet k-${m.kind}`;
      restart(packet, "go");
    }, 250);
    setTimeout(() => { land(true); restart(logCard, "ping"); }, 1150);   // 3. lands in the log
    setTimeout(() => {                                  // 4. the next person picks up the phone
      ru.ui.classList.add("swap");
      setTimeout(() => { prepareNext(); ru.ui.classList.remove("swap"); }, 300);
    }, 2700);
  }
  setInterval(relayCycle, 4600);

  /* =========================================================
     STATEMENT — scattered words settle into a sentence
     ========================================================= */
  const stmtSec = $("#statement");
  const stmt = $("#stmtText");
  const words = stmt.textContent.trim().split(/\s+/).map((t) => {
    const s = el("span", "w");
    s.textContent = t;
    return { el: s, dx: Math.random() * 2 - 1, dy: Math.random() * 2 - 1, r: Math.random() * 2 - 1 };
  });
  stmt.textContent = "";
  words.forEach((wd, i) => { stmt.append(wd.el); if (i < words.length - 1) stmt.append(" "); });

  scrollFns.push(() => {
    const r = stmtSec.getBoundingClientRect(), vh = window.innerHeight;
    if (r.bottom < 0 || r.top > vh) return;
    const p = reduce ? 1 : clamp((vh * 0.95 - r.top) / (vh * 0.6));
    const amp = Math.min(1, window.innerWidth / 1200);
    words.forEach((wd, i) => {
      const e0 = clamp((p - (i / words.length) * 0.35) / 0.65);
      const e = 1 - Math.pow(1 - e0, 3);
      const k = 1 - e;
      wd.el.style.transform = k > 0.001
        ? `translate(${(wd.dx * 150 * amp * k).toFixed(1)}px, ${(wd.dy * 90 * k).toFixed(1)}px) rotate(${(wd.r * 26 * k).toFixed(1)}deg)`
        : "";
      wd.el.style.setProperty("--e", e.toFixed(3));
    });
    if (p >= 0.98) stmtAnswer.classList.add("in");
  });

  /* =========================================================
     APP — pinned story: scroll moves through six screens
     ========================================================= */
  const story = $("#app");
  const steps = $$("#storySteps > li");
  const screens = $$("#app .screen");
  const wipe = $("#app .wipe");
  const dialFill = $("#dialFill");
  const sdNum = $("#sdNum");
  let stepNow = 0, zTop = 1, settle = 0;

  function setStep(i) {
    if (i === stepNow) return;
    stepNow = i;
    steps.forEach((li, k) => {
      li.classList.toggle("on", k === i);
      const b = $("button", li);
      if (k === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    const s = screens[i];
    s.style.zIndex = ++zTop;
    s.classList.add("on");
    wipe.style.zIndex = zTop + 1;
    if (!reduce) restart(wipe, "go");
    clearTimeout(settle);
    settle = setTimeout(() => screens.forEach((sc, k) => { if (k !== stepNow) sc.classList.remove("on"); }), 750);
    sdNum.textContent = String(i + 1).padStart(2, "0");
  }

  scrollFns.push(() => {
    const r = story.getBoundingClientRect(), vh = window.innerHeight;
    if (r.bottom < 0 || r.top > vh) return;
    const p = clamp(-r.top / Math.max(1, r.height - vh));
    dialFill.style.strokeDashoffset = (100 - p * 100).toFixed(2);
    setStep(Math.min(screens.length - 1, Math.floor(p * screens.length)));
  });

  steps.forEach((li, i) => {
    $("button", li).addEventListener("click", () => {
      const span = story.offsetHeight - window.innerHeight;
      scrollToY(story.getBoundingClientRect().top + window.scrollY + span * ((i + 0.5) / screens.length));
    });
  });

  /* =========================================================
     DASHBOARD — tabs, branch switcher, live rows, approvals
     ========================================================= */
  const tabs = $$('.dash-nav [role="tab"]');
  const views = $$(".dash-view");
  function openView(id, focus) {
    tabs.forEach((t) => {
      const on = t.dataset.view === id;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    views.forEach((v) => {
      const on = v.id === id;
      v.hidden = !on;
      v.classList.toggle("on", on);
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => openView(t.dataset.view));
    t.addEventListener("keydown", (e) => {
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      openView(tabs[(i + d + tabs.length) % tabs.length].dataset.view, true);
    });
  });
  $$("[data-goto]").forEach((b) => b.addEventListener("click", () => openView(b.dataset.goto, true)));

  const dashToast = $("#dashToast");
  let toastTimer = 0;
  function toast(msg, icon) {
    dashToast.textContent = "";
    dashToast.append(el("i", `bi bi-${icon}`), document.createTextNode(msg));
    dashToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dashToast.classList.remove("show"), 2800);
  }
  $("#pdfBtn").addEventListener("click", () => toast("In Ventra, this downloads the report as a PDF", "file-earmark-pdf"));

  /* Branch switcher with counting KPIs */
  const BRANCH_DATA = [
    { name: "All branches", sub: "All locations, live inventory snapshot", k: [184, 24560, 33, 12] },
    { name: "Melbourne", sub: "Melbourne warehouse, live inventory snapshot", k: [142, 11240, 14, 5] },
    { name: "Sydney", sub: "Sydney branch, live inventory snapshot", k: [97, 8310, 12, 4] },
    { name: "Brisbane", sub: "Brisbane branch, live inventory snapshot", k: [61, 5010, 7, 3] },
  ];
  const kpis = $$("[data-kpi]");
  let branchNow = 0;
  const kpiVals = BRANCH_DATA[0].k.slice();
  function countTo(node, from, to) {
    if (reduce) { node.textContent = to.toLocaleString("en-AU"); return; }
    const t0 = performance.now();
    const step = (t) => {
      const q = clamp((t - t0) / 700);
      node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - q, 3))).toLocaleString("en-AU");
      if (q < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  $("#branchBtn").addEventListener("click", (e) => {
    branchNow = (branchNow + 1) % BRANCH_DATA.length;
    const b = BRANCH_DATA[branchNow];
    $("#branchName").textContent = b.name;
    $("#branchSub").textContent = b.sub;
    e.currentTarget.setAttribute("aria-label", `Change branch, currently ${b.name}`);
    kpis.forEach((node, i) => { countTo(node, kpiVals[i], b.k[i]); kpiVals[i] = b.k[i]; });
  });

  onView($("#barChart"), (v) => { if (v) $("#barChart").classList.add("in"); }, { threshold: 0.4 });

  /* Feed movements flow into the dashboard */
  const recentBody = $("#recentBody");
  const auditBody = $("#auditBody");
  const todayCount = $("#todayCount");
  const LABELS = { added: ["Stock added", "t-green"], removed: ["Stock removed", "t-red"], damaged: ["Damaged", "t-amber"] };
  const QTY_CLASS = { added: "q-pos", removed: "q-neg", damaged: "q-dmg" };
  const prettyQty = (m) => (m.kind === "added" ? "+" : "−") + m.n;

  function addRow(body, cells, max) {
    const tr = el("tr", "fresh");
    cells.forEach(([content, cls]) => {
      const td = el("td", cls);
      if (content instanceof Node) td.appendChild(content); else td.textContent = content;
      tr.appendChild(td);
    });
    body.prepend(tr);
    while (body.children.length > max) body.lastElementChild.remove();
  }
  function tagEl(text, cls) { const s = el("span", `tag ${cls}`); s.textContent = text; return s; }
  function addAudit(who, label, cls, details) {
    addRow(auditBody, [[hhmm(new Date())], [who], [tagEl(label, cls)], [details]], 6);
  }

  document.addEventListener("ventra:move", (e) => {
    const m = e.detail;
    todayCount.textContent = String(Number(todayCount.textContent) + 1);
    addRow(recentBody, [[m.time], [m.who], [m.item], [prettyQty(m), `text-end ${QTY_CLASS[m.kind]}`]], 4);
    addAudit(m.who, LABELS[m.kind][0], LABELS[m.kind][1], `${m.item}, ${prettyQty(m)}`);
  });

  /* Product requests: approve or reject */
  const reqList = $("#reqList");
  const reqEmpty = $("#reqEmpty");
  const reqBadge = $("#reqBadge");
  const reqInitial = reqList.innerHTML;
  function syncRequests() {
    const n = reqList.children.length;
    reqBadge.textContent = n ? String(n) : "";
    reqList.hidden = n === 0;
    reqEmpty.hidden = n > 0;
  }
  reqList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const card = btn.closest(".req");
    if (card.classList.contains("leaving")) return;
    const item = card.dataset.item;
    const ok = btn.dataset.act === "approve";
    const hadFocus = card.contains(document.activeElement);
    card.classList.add("leaving");
    setTimeout(() => {
      card.remove();
      syncRequests();
      if (hadFocus) ($("button", reqList) || $("#reqReset")).focus({ preventScroll: true });
    }, reduce ? 0 : 350);
    toast(ok ? `Approved: ${item} is now in the catalogue` : `Rejected: ${item}`, ok ? "check-circle-fill" : "x-circle-fill");
    addAudit("Admin", ok ? "Request approved" : "Request rejected", ok ? "t-green" : "t-red", item);
  });
  $("#reqReset").addEventListener("click", () => {
    reqList.innerHTML = reqInitial;
    syncRequests();
    $("button", reqList).focus({ preventScroll: true });
  });

  /* Gentle 3D tilt that follows the pointer */
  const dashStage = $("#dashStage");
  const browser = $("#dashBrowser");
  if (!reduce && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    dashStage.addEventListener("pointermove", (e) => {
      const r = dashStage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      browser.style.setProperty("--ry", `${(x * 5).toFixed(2)}deg`);
      browser.style.setProperty("--rx", `${(-y * 4).toFixed(2)}deg`);
    });
    dashStage.addEventListener("pointerleave", () => {
      browser.style.setProperty("--ry", "0deg");
      browser.style.setProperty("--rx", "0deg");
    });
  }

  /* =========================================================
     PACKAGES — a working preview: define a kit, order it,
     follow the order, pick the parts and adjust stock
     ========================================================= */
  const pkTabs = $$('.pk-steps [role="tab"]');
  const pkViews = $$(".pk-view");
  const pkToastEl = $("#pkToast");
  const PARTS = [
    { name: "Wood Panel", icon: "wood", per: 4, stock: 150 },
    { name: "Screw", icon: "bi-nut-fill", per: 20, stock: 1000 },
    { name: "Support Bracket", icon: "bi-bounding-box", per: 4, stock: 200 },
    { name: "Shelf Clip", icon: "bi-paperclip", per: 8, stock: 120 },
  ];
  const PK_STATUS = { new: ["New", "st-new"], progress: ["In progress", "st-progress"], done: ["Completed", "st-done"] };
  const pkOrders = [
    { id: 1058, product: "Rack Spacer", icon: "bi-bookshelf", qty: 5, status: "new", when: "Today, 10:24", picked: [false, false, false, false] },
    { id: 1057, product: "Cabinet", icon: "bi-archive", qty: 2, status: "progress", when: "Today, 09:17" },
    { id: 1056, product: "Door", icon: "bi-door-closed", qty: 10, status: "done", when: "Yesterday, 16:40" },
  ];
  const CRUMBS = [["Packages", "Rack Spacer"], ["Packages", "Create order"], ["Orders"], ["Orders", ""]];
  let pkQty = 5, pkNextId = 1059, pkFilter = "all", pkToastTimer = 0;
  let pkCurrent = pkOrders[0];
  const fmtN = (n) => n.toLocaleString("en-AU");

  function pkToast(msg, icon) {
    pkToastEl.textContent = "";
    pkToastEl.append(el("i", `bi bi-${icon}`), document.createTextNode(msg));
    pkToastEl.classList.add("show");
    clearTimeout(pkToastTimer);
    pkToastTimer = setTimeout(() => pkToastEl.classList.remove("show"), 2600);
  }
  function partCell(p, labelFor) {
    const wrap = el(labelFor ? "label" : "span", "part");
    if (labelFor) wrap.htmlFor = labelFor;
    const ico = el("span", `part-ico${p.icon === "wood" ? " wood" : ""}`);
    if (p.icon !== "wood") ico.appendChild(el("i", `bi ${p.icon}`));
    wrap.append(ico, document.createTextNode(p.name));
    return wrap;
  }
  function cell(content, cls) {
    const td = el("td", cls);
    if (content instanceof Node) td.appendChild(content); else td.textContent = content;
    return td;
  }

  function openPk(n, focus) {
    pkTabs.forEach((t, i) => {
      const on = i === n - 1;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    pkViews.forEach((v, i) => { v.hidden = i !== n - 1; v.classList.toggle("on", i === n - 1); });
    $("#pkCaption").textContent = $("small", pkTabs[n - 1]).textContent;
    const crumbs = CRUMBS[n - 1].slice();
    if (n === 4) crumbs[1] = `#PKG-${pkCurrent.id}`;
    const box = $("#pkCrumbs");
    box.textContent = "";
    crumbs.forEach((c, i) => { if (i) box.append(" ", el("i", "bi bi-chevron-right"), " "); box.append(c); });
    if (n === 3) renderOrders();
    if (n === 4) renderPrep();
  }

  function renderBom() {
    const body = $("#pkBom");
    body.textContent = "";
    PARTS.forEach((p) => {
      const tr = el("tr");
      tr.append(cell(partCell(p)), cell(`${p.per} pcs`, "text-end"));
      body.appendChild(tr);
    });
  }

  function renderCalc(animate) {
    $("#pkQty").textContent = pkQty;
    $("#pkQtyX").textContent = `×${pkQty}`;
    $("#pkMinus").setAttribute("aria-disabled", String(pkQty <= 1));
    $("#pkPlus").setAttribute("aria-disabled", String(pkQty >= 20));
    const body = $("#pkCalc");
    body.textContent = "";
    PARTS.forEach((p) => {
      const total = el("span", "pk-total");
      total.textContent = fmtN(p.per * pkQty);
      if (animate && !reduce) total.classList.add("num-bump");
      const tr = el("tr");
      tr.append(cell(partCell(p)), cell(String(p.per), "text-end"), cell(total, "text-end"));
      body.appendChild(tr);
    });
  }

  function renderOrders() {
    const counts = { all: pkOrders.length, new: 0, progress: 0, done: 0 };
    pkOrders.forEach((o) => { counts[o.status]++; });
    $$("#pkFilter button").forEach((b) => {
      const f = b.dataset.f;
      b.textContent = `${f === "all" ? "All" : PK_STATUS[f][0]} (${counts[f]})`;
      b.setAttribute("aria-pressed", String(f === pkFilter));
    });
    const list = $("#pkOrders");
    list.textContent = "";
    const shown = pkOrders.filter((o) => pkFilter === "all" || o.status === pkFilter);
    if (!shown.length) {
      const li = el("li", "pk-empty");
      li.textContent = "No orders here yet.";
      list.appendChild(li);
      return;
    }
    shown.forEach((o) => {
      const li = el("li");
      const canOpen = Boolean(o.picked);
      const row = el(canOpen ? "button" : "div", `pk-order${o.fresh ? " fresh" : ""}`);
      if (canOpen) { row.type = "button"; row.addEventListener("click", () => { pkCurrent = o; openPk(4, true); }); }
      o.fresh = false;
      const thumb = el("span", "pk-thumb");
      thumb.appendChild(el("i", `bi ${o.icon}`));
      const copy = el("span", "pk-order-copy");
      const id = el("b"); id.textContent = `#PKG-${o.id}`;
      const what = el("span"); what.textContent = `${o.product}, quantity ${o.qty}`;
      const when = el("small"); when.textContent = o.when;
      copy.append(id, what, when);
      const st = el("span", `pk-status ${PK_STATUS[o.status][1]}`);
      st.textContent = PK_STATUS[o.status][0];
      row.append(thumb, copy, st);
      if (canOpen) row.appendChild(el("i", "bi bi-chevron-right"));
      li.appendChild(row);
      list.appendChild(li);
    });
  }

  function renderPrep() {
    const o = pkCurrent;
    $("#pkOid").textContent = `#PKG-${o.id}`;
    $("#pkOqty").textContent = o.qty;
    const st = $("#pkOstatus");
    st.textContent = PK_STATUS[o.status][0];
    st.className = `pk-status ${PK_STATUS[o.status][1]}`;
    const body = $("#pkPrep");
    body.textContent = "";
    const short = [];
    PARTS.forEach((p, i) => {
      const need = p.per * o.qty;
      const tr = el("tr", o.picked[i] ? "picked" : "");
      const box = el("input", "form-check-input");
      box.type = "checkbox";
      box.id = `pkp${i}`;
      box.checked = o.picked[i];
      box.disabled = o.status === "done";
      box.addEventListener("change", () => {
        o.picked[i] = box.checked;
        if (o.status === "new" && box.checked) o.status = "progress";
        renderPrep();
        $(`#pkp${i}`).focus();
      });
      const stock = el("span", p.stock >= need || o.status === "done" ? "ok-stock" : "short");
      stock.textContent = fmtN(p.stock);
      if (p.stock < need && o.status !== "done") {
        short.push(p.name);
        const note = el("small");
        note.textContent = `Short by ${fmtN(need - p.stock)}`;
        stock.appendChild(note);
      }
      tr.append(cell(box), cell(partCell(p, box.id)), cell(fmtN(need), "text-end"), cell(stock, "text-end"));
      body.appendChild(tr);
    });
    const allPicked = o.picked.every(Boolean);
    const btn = $("#pkConfirm");
    const hint = $("#pkHint");
    if (o.status === "done") {
      btn.disabled = true;
      btn.lastChild.textContent = " Stock adjusted";
      hint.textContent = "This order is complete.";
    } else {
      btn.disabled = !allPicked || short.length > 0;
      btn.lastChild.textContent = " Confirm and adjust stock";
      hint.textContent = short.length ? `Not enough ${short.join(" and ")} in stock.` : allPicked ? "All parts picked. Ready to confirm." : "Tick each part as you pick it.";
    }
  }

  pkTabs.forEach((t, i) => {
    t.addEventListener("click", () => openPk(i + 1));
    t.addEventListener("keydown", (e) => {
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      openPk(((i + d + pkTabs.length) % pkTabs.length) + 1, true);
    });
  });
  $("#pkSave").addEventListener("click", () => { pkToast("Package saved", "check-circle-fill"); openPk(2, true); });
  [["#pkMinus", -1], ["#pkPlus", 1]].forEach(([id, d]) => $(id).addEventListener("click", () => {
    const next = clamp(pkQty + d, 1, 20);
    if (next === pkQty) return;
    pkQty = next;
    renderCalc(true);
  }));
  $("#pkCreate").addEventListener("click", () => {
    const o = { id: pkNextId++, product: "Rack Spacer", icon: "bi-bookshelf", qty: pkQty, status: "new", when: "Just now", picked: PARTS.map(() => false), fresh: true };
    pkOrders.unshift(o);
    pkCurrent = o;
    pkFilter = "all";
    pkToast(`Order #PKG-${o.id} created`, "cart-check-fill");
    openPk(3, true);
  });
  $$("#pkFilter button").forEach((b) => b.addEventListener("click", () => { pkFilter = b.dataset.f; renderOrders(); }));
  $("#pkConfirm").addEventListener("click", () => {
    const o = pkCurrent;
    PARTS.forEach((p) => { p.stock -= p.per * o.qty; });
    o.status = "done";
    o.when = `${o.when}, completed`;
    renderPrep();
    pkToast(`Stock adjusted for #PKG-${o.id}: ${PARTS.length} parts updated`, "check-circle-fill");
  });

  renderBom();
  renderCalc(false);

  /* =========================================================
     BRANDING — name, colour and the customer's own logo, live
     ========================================================= */
  const brandStage = $("#brandStage");
  const nameIn = $("#bName");
  const colorRadios = $$('input[name="bColor"]');
  const custom = $("#bCustom");
  const customWrap = custom.closest(".sw-custom");

  const brightness = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };
  function setColor(hex) {
    brandStage.style.setProperty("--brand", hex);
    brandStage.style.setProperty("--on-brand", brightness(hex) > 0.6 ? "#0B1B3A" : "#fff");
  }
  function setName(value) {
    const name = value.trim() || "Your company";
    const parts = name.split(/\s+/).filter(Boolean);
    const mark = (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0][0]).toUpperCase();
    $$(".brand-name", brandStage).forEach((n) => { n.textContent = name; });
    if (!logoUrl) $$(".brand-mark", brandStage).forEach((n) => { n.textContent = mark; });
  }

  /* The visitor's logo is read locally for the preview; nothing is uploaded */
  const logoIn = $("#bLogo");
  const logoDrop = $("#logoDrop");
  const logoRemove = $("#bLogoRemove");
  let logoUrl = "";
  function setLogo(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      $("#ldTitle").textContent = "That file isn't an image";
      $("#ldText").textContent = "Choose a PNG, JPG or SVG file of your logo.";
      logoDrop.classList.add("bad");
      return;
    }
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    logoUrl = URL.createObjectURL(file);
    $$(".brand-mark", brandStage).forEach((m) => {
      const img = el("img");
      img.src = logoUrl;
      img.alt = "";
      m.textContent = "";
      m.appendChild(img);
      m.classList.add("has-logo");
    });
    const thumb = $("#ldIcon");
    thumb.textContent = "";
    const t = el("img");
    t.src = logoUrl;
    t.alt = "";
    thumb.appendChild(t);
    logoDrop.classList.remove("bad");
    logoDrop.classList.add("done");
    $("#ldTitle").textContent = "Your logo is in the preview";
    $("#ldText").textContent = file.name;
    logoRemove.hidden = false;
  }
  function clearLogo() {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    logoUrl = "";
    logoIn.value = "";
    $$(".brand-mark", brandStage).forEach((m) => m.classList.remove("has-logo"));
    $("#ldIcon").innerHTML = '<i class="bi bi-cloud-arrow-up"></i>';
    logoDrop.classList.remove("done", "bad");
    $("#ldTitle").textContent = "Upload your logo";
    $("#ldText").textContent = "Click or drop an image here (PNG, JPG or SVG). It appears in the preview straight away and stays on your device.";
    logoRemove.hidden = true;
    setName(nameIn.value);
  }
  logoIn.addEventListener("change", () => setLogo(logoIn.files[0]));
  logoRemove.addEventListener("click", () => { clearLogo(); logoIn.focus(); });
  ["dragenter", "dragover"].forEach((ev) => logoDrop.addEventListener(ev, (e) => { e.preventDefault(); logoDrop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => logoDrop.addEventListener(ev, () => logoDrop.classList.remove("over")));
  logoDrop.addEventListener("drop", (e) => { e.preventDefault(); setLogo(e.dataTransfer.files[0]); });
  setName(nameIn.value);
  nameIn.addEventListener("input", () => setName(nameIn.value));
  colorRadios.forEach((r) => r.addEventListener("change", () => {
    if (!r.checked) return;
    customWrap.classList.remove("active");
    setColor(r.value);
  }));
  custom.addEventListener("input", () => {
    colorRadios.forEach((r) => { r.checked = false; });
    customWrap.classList.add("active");
    setColor(custom.value);
  });

  const PRESETS = [
    ["Greenfield Supply", "#059669"],
    ["Redline Hardware", "#DC2626"],
    ["Violet & Co", "#7C3AED"],
    ["Ember Trade", "#EA580C"],
    ["Northwind Parts", "#0F766E"],
    ["Harbour Tiles", "#0369A1"],
    ["Sunrise Foods", "#EAB308"],
    ["Graphite Joinery", "#334155"],
  ];
  let presetNow = -1;
  $("#bShuffle").addEventListener("click", () => {
    let i;
    do { i = (Math.random() * PRESETS.length) | 0; } while (i === presetNow);
    presetNow = i;
    const [name, hex] = PRESETS[i];
    nameIn.value = name;
    setName(name);
    const match = colorRadios.find((r) => r.value.toLowerCase() === hex.toLowerCase());
    if (match) { match.checked = true; customWrap.classList.remove("active"); }
    else { colorRadios.forEach((r) => { r.checked = false; }); custom.value = hex.toLowerCase(); customWrap.classList.add("active"); }
    setColor(hex);
  });

  /* =========================================================
     HOW IT WORKS — a parcel rides the conveyor
     ========================================================= */
  const conveyor = $("#conveyor");
  const stations = $$("#conveyor .station");
  const parcel = $("#conveyor .parcel");
  let litNow = -1, pingTimer = 0;
  scrollFns.push(() => {
    const r = conveyor.getBoundingClientRect(), vh = window.innerHeight;
    if (r.bottom < -100 || r.top > vh + 100) return;
    const p = reduce ? 1 : clamp((vh * 0.8 - r.top) / (vh * 0.35 + r.height));
    conveyor.style.setProperty("--p", p.toFixed(4));
    let n = -1;
    stations.forEach((_, i) => { if (p >= Math.max(0.02, i / (stations.length - 1)) - 0.001) n = i; });
    if (n === litNow) return;
    stations.forEach((s, i) => s.classList.toggle("lit", i <= n));
    if (n > litNow && !reduce) {
      restart(parcel, "ping");
      clearTimeout(pingTimer);
      pingTimer = setTimeout(() => parcel.classList.remove("ping"), 500);
    }
    litNow = n;
  });

  /* =========================================================
     PLANS — set staff, products and branches, and watch the
     business take shape; then carry the setup into the form
     ========================================================= */
  const szStaff = $("#szStaff"), szProducts = $("#szProducts"), szBranches = $("#szBranches");
  const PRODUCT_STEPS = [100, 250, 500, 1000, 2500, 5000, 10000];
  const STACK = [1, 2, 3, 4, 6, 8, 10, 12];
  const CITIES = ["Melbourne", "Sydney", "Brisbane", "Perth", "Adelaide", "Canberra", "Hobart", "Gold Coast", "Newcastle", "Darwin"];
  const MAX_FACES = 7;
  const setup = { staff: "", products: "", branches: "" };
  const psBody = $("#psBody"), psHub = $("#psHub"), psGrid = $("#psGrid"), psWires = $("#psWires"), psStack = $("#psStack");

  function syncIcons(box, count, cls, more) {
    const icons = $$("i", box);
    for (let i = icons.length; i < count; i++) box.insertBefore(el("i", `bi ${cls}`), $(".more", box));
    for (let i = icons.length - 1; i >= count; i--) icons[i].remove();
    let m = $(".more", box);
    if (more) { if (!m) { m = el("span", "more"); box.appendChild(m); } m.textContent = more; }
    else if (m) m.remove();
  }
  function setOutput(id, text) {
    const o = $(id);
    if (o.textContent === text) return;
    o.textContent = text;
    if (!reduce) restart(o, "bump");
  }

  /* Branch cards: one per branch (up to nine, then "more"), staff shared between them */
  function renderBranches(b, s) {
    const real = b > 10 ? 9 : b;
    const people = Math.min(s, 50);
    const cards = $$(".br-card:not(.br-more)", psGrid);
    for (let i = cards.length; i < real; i++) {
      const c = el("div", "br-card");
      if (!reduce) { c.classList.add("pop"); c.style.animationDelay = `${(i - cards.length) * 60}ms`; }
      const name = el("span", "br-name");
      name.append(el("i", "bi bi-building"), document.createTextNode(` ${CITIES[i]}`));
      c.append(name, el("div", "br-staff"), el("small"));
      psGrid.insertBefore(c, $(".br-more", psGrid));
    }
    for (let i = cards.length - 1; i >= real; i--) cards[i].remove();

    let more = $(".br-more", psGrid);
    if (b > 10 && !more) {
      more = el("div", "br-card br-more");
      const label = el("span");
      label.textContent = "More branches";
      more.append(el("i", "bi bi-plus-lg"), label);
      if (!reduce) more.classList.add("pop");
      psGrid.appendChild(more);
    } else if (b <= 10 && more) {
      more.remove();
    }

    $$(".br-card:not(.br-more)", psGrid).forEach((c, i) => {
      const n = Math.floor(people / real) + (i < people % real ? 1 : 0);
      syncIcons($(".br-staff", c), Math.min(n, MAX_FACES), "bi-person-fill", n > MAX_FACES ? `+${n - MAX_FACES}` : "");
      $("small", c).textContent = n ? `${n} staff` : "No staff yet";
    });
  }

  /* Flowing lines from the account to every branch */
  function drawWires() {
    psWires.setAttribute("viewBox", `0 0 ${psBody.clientWidth} ${psBody.clientHeight}`);
    const hx = psHub.offsetLeft + psHub.offsetWidth / 2;
    const hy = psHub.offsetTop + psHub.offsetHeight;
    psWires.textContent = "";
    $$(".br-card", psGrid).forEach((c) => {
      const cx = psGrid.offsetLeft + c.offsetLeft + c.offsetWidth / 2;
      const cy = psGrid.offsetTop + c.offsetTop;
      const dy = Math.max(26, (cy - hy) / 2);
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", `M${hx} ${hy} C${hx} ${hy + dy}, ${cx} ${cy - dy}, ${cx} ${cy}`);
      psWires.appendChild(p);
    });
  }

  function updatePlanner() {
    const s = Number(szStaff.value), p = Number(szProducts.value), b = Number(szBranches.value);
    setup.staff = s > 50 ? "50+" : String(s);
    setup.products = p >= PRODUCT_STEPS.length ? "10,000+" : PRODUCT_STEPS[p].toLocaleString("en-AU");
    setup.branches = b > 10 ? "10+" : String(b);
    setOutput("#oStaff", setup.staff);
    setOutput("#oProducts", setup.products);
    setOutput("#oBranches", setup.branches);
    szStaff.setAttribute("aria-valuetext", `${setup.staff} staff`);
    szProducts.setAttribute("aria-valuetext", `${setup.products} products`);
    szBranches.setAttribute("aria-valuetext", `${setup.branches} branches`);

    $("#hubProducts").textContent = setup.products;
    syncIcons(psStack, STACK[p], "bi-box-seam-fill", p >= PRODUCT_STEPS.length ? "+" : "");
    renderBranches(b, s);
    $("#psSummary").textContent = `${setup.staff} staff, ${setup.products} products, ${setup.branches} ${b === 1 ? "branch" : "branches"}`;

    $$(".pl-btn").forEach((btn) => {
      const r = $(`#${btn.dataset.for}`);
      const atEnd = Number(btn.dataset.d) < 0 ? Number(r.value) <= Number(r.min) : Number(r.value) >= Number(r.max);
      btn.setAttribute("aria-disabled", String(atEnd));
    });
    requestAnimationFrame(drawWires);
  }

  [szStaff, szProducts, szBranches].forEach((r) => r.addEventListener("input", updatePlanner));
  $$(".pl-btn").forEach((btn) => btn.addEventListener("click", () => {
    if (btn.getAttribute("aria-disabled") === "true") return;
    const r = $(`#${btn.dataset.for}`);
    r.value = clamp(Number(r.value) + Number(btn.dataset.d), Number(r.min), Number(r.max));
    r.dispatchEvent(new Event("input"));
  }));
  let wireResize = 0;
  window.addEventListener("resize", () => { clearTimeout(wireResize); wireResize = setTimeout(drawWires, 120); });
  window.addEventListener("load", drawWires);
  updatePlanner();

  const form = $("#demoForm");
  const fMsg = $("#fMsg");
  const goToForm = (onArrive) => {
    scrollToEl($("#contact"));
    setTimeout(() => {
      $("#fName").focus({ preventScroll: true });
      if (!reduce) restart(form, "flash");
      if (onArrive) onArrive();
    }, reduce ? 0 : 800);
  };

  /* The chosen setup goes on the first line of the message, replacing any earlier one */
  $("#quoteBtn").addEventListener("click", () => {
    const b = Number(szBranches.value);
    const line = `My setup: ${setup.staff} staff, ${setup.products} products, ${setup.branches} ${b === 1 ? "branch" : "branches"}.`;
    const rest = fMsg.value.replace(/^My setup:.*(\n|$)/, "");
    fMsg.value = rest ? `${line}\n${rest}` : line;
    goToForm(() => { if (!reduce) restart(fMsg, "filled"); });
  });

  /* Online store / sales system connections are built on request */
  $("#connectBtn").addEventListener("click", () => {
    const line = "I'd like to connect Ventra to our online store or sales system.";
    if (!fMsg.value.includes(line)) fMsg.value = fMsg.value ? `${fMsg.value}\n${line}` : line;
    goToForm();
  });

  /* =========================================================
     DEMO FORM (FormSubmit → info@v-tech.com.au)
     ========================================================= */
  const status = $("#formStatus");
  const submitBtn = $("button[type=submit]", form);
  const spinner = $(".spinner-border", submitBtn);
  const label = $(".btn-label", submitBtn);
  const setStatus = (msg, type) => { status.textContent = msg; status.className = `form-status ${type || ""}`; };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      $(":invalid", form).focus();
      return;
    }
    if (location.protocol === "file:") {
      setStatus("The form only sends from the live website. Please email us at info@v-tech.com.au.", "err");
      console.warn("Ventra: FormSubmit rejects pages opened as local files; test the form on the live site.");
      return;
    }
    submitBtn.disabled = true;
    spinner.classList.remove("d-none");
    label.textContent = "Sending…";
    setStatus("", "");
    try {
      const res = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      // FormSubmit answers 200 with success "false" (e.g. before activation), so check the body too
      if (!res.ok || String(data.success) !== "true") throw new Error(data.message || `HTTP ${res.status}`);
      form.reset();
      form.classList.remove("was-validated");
      setStatus("Thanks! We've received your request and will be in touch soon.", "ok");
    } catch (err) {
      console.warn("Ventra form:", err.message);
      // Until the owner clicks "Activate Form" in the FormSubmit email, every send is refused
      setStatus(/activat/i.test(err.message)
        ? "This form is waiting for activation. Check the info@v-tech.com.au inbox (and spam) for the FormSubmit email and click Activate Form, then send again."
        : "Something went wrong. Please try again, or email info@v-tech.com.au.", "err");
    } finally {
      submitBtn.disabled = false;
      spinner.classList.add("d-none");
      label.textContent = "Request my demo";
    }
  });

  $("#year").textContent = new Date().getFullYear();
  tick();
})();
