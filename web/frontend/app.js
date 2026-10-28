(() => {
  "use strict";

  const API = (window.HUB_API || "").replace(/\/$/, "");

  // ---------- Hilfsfunktionen ----------
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // lokal, nicht UTC
  const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const longDate = (s) => { const d = parseIso(s); return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
  const shortDate = (s) => { const d = parseIso(s); return `${d.getDate()}.${d.getMonth() + 1}.`; };
  const DEFAULT_COLOR = "#4f46e5";
  const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#64748b"];
  const COLOR_NAMES = ["Indigo", "Blau", "Grün", "Orange", "Rot", "Pink", "Violett", "Grau"];

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const c of children) node.append(c);
    return node;
  }

  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
  };

  // ---------- Login / API ----------
  let token = store.get("token", "");

  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 75000);
    try {
      res = await fetch(API + path, { ...opts, headers, signal: ctrl.signal, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (err) {
      throw new Error(err && err.name === "AbortError" ? "Keine Antwort vom Server (Zeitüberschreitung). Bitte nochmal versuchen." : "Server nicht erreichbar.");
    } finally { clearTimeout(timer); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) { logout(false); throw new Error(data.detail || "Bitte neu anmelden."); }
    if (!res.ok) {
      const err = new Error(typeof data.detail === "string" ? data.detail : `Fehler ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  let registerMode = false;
  function setAuthMode(register) {
    registerMode = register;
    $("a-code-wrap").hidden = !register;
    $("a-code").required = register;
    $("a-pass").autocomplete = register ? "new-password" : "current-password";
    $("a-submit").textContent = register ? "Registrieren" : "Anmelden";
    $("a-toggle").textContent = register ? "Schon ein Konto? Anmelden" : "Neu hier? Registrieren";
    $("auth-sub").textContent = register ? "Neues Konto mit Einladungscode anlegen." : "Melde dich an.";
    $("a-error").hidden = true;
  }
  $("a-toggle").addEventListener("click", () => setAuthMode(!registerMode));

  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { username: $("a-user").value.trim(), password: $("a-pass").value };
    if (registerMode) body.code = $("a-code").value.trim();
    $("a-submit").disabled = true;
    try {
      const res = await api(registerMode ? "/api/auth/register" : "/api/auth/login", { method: "POST", body });
      token = res.token;
      store.set("token", token);
      store.set("user", res.username);
      $("a-pass").value = "";
      startApp();
    } catch (err) {
      $("a-error").textContent = err.message;
      $("a-error").hidden = false;
    } finally { $("a-submit").disabled = false; }
  });

  function logout(clearChat = true) {
    token = "";
    store.del("token");
    store.del("avatar"); myAvatar = ""; // die Figur gehört zum Konto
    if (clearChat) { store.del("chat"); history = []; log.replaceChildren(); }
    $("app").hidden = true;
    $("tabbar").hidden = true;
    $("auth").hidden = false;
  }
  $("logout").addEventListener("click", () => logout(true));

  // ---------- Hell / Dunkel ----------
  const THEMES = ["light", "dark"];
  // Ohne bisherige Wahl gilt das dunkle Design; danach zählt nur noch die eigene Wahl
  function currentTheme() { const t = store.get("theme", null); return THEMES.includes(t) ? t : "dark"; }
  function applyTheme(mode, save = true) {
    document.documentElement.setAttribute("data-theme", mode);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = mode === "dark" ? "#07080d" : "#eceef5";
    if (save) store.set("theme", mode);
    document.querySelectorAll("[data-theme-set]").forEach((b) => b.classList.toggle("active", b.dataset.themeSet === mode));
    $("theme-btn").textContent = mode === "dark" ? "☀️" : "🌙"; // zeigt, wohin der Knopf umschaltet
  }
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.themeSet)));
  $("theme-btn").addEventListener("click", () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
  applyTheme(currentTheme(), false);

  // ---------- Tabs ----------
  // ---------- Bewegung: Übergänge wie in iOS ----------
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const IOS_EASE = "cubic-bezier(.32, .72, 0, 1)";
  const SUB_PARENT = { market: "today", friends: "today", friend: "friends" }; // Unterseiten und wohin „zurück“ führt
  let currentView = null;

  // push = Seite kommt von rechts, pop = zurück (kommt von links), fade = Tab-Wechsel
  function animateIn(node, kind) {
    if (!node || !kind || reduceMotion() || !node.animate) return;
    const frames = kind === "push" ? [{ transform: "translateX(30%)", opacity: 0 }, { transform: "none", opacity: 1 }]
      : kind === "pop" ? [{ transform: "translateX(-14%)", opacity: 0 }, { transform: "none", opacity: 1 }]
      : [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }];
    node.animate(frames, { duration: kind === "fade" ? 240 : 420, easing: IOS_EASE });
  }

  function showTab(name, opts = {}) {
    const prev = currentView;
    currentView = name;
    const kind = !prev || prev === name || opts.animate === false ? null
      : SUB_PARENT[name] && SUB_PARENT[prev] !== name ? "push" : SUB_PARENT[prev] ? "pop" : "fade";
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
    document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    if (name === "today") renderToday();
    if (name === "calendar") loadMonth();
    $("task-fab").hidden = !(name === "todos" && todoState.openId !== null);
    $("plan-fab").hidden = name !== "plan";
    if (name === "plan") loadPlan();
    if (name === "todos") loadTodos();
    if (name === "chat") scrollChat();
    if (name === "friends") { renderFriends(); loadFriends(); }
    if (name === "market") { loadMarket(true); loadBriefing(); }
    if (!["friends", "friend", "market"].includes(name)) store.set("tab", name); // Unterseiten nicht als Start-Tab merken
    if (kind === "push" || kind === "pop") window.scrollTo(0, 0);
    animateIn($(`view-${name}`), opts.kind || kind);
    requestAnimationFrame(updateNavbar);
  }
  document.querySelectorAll(".tabbar button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.querySelectorAll("[data-goto]").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.goto)));

  // ---------- Terminlisten ----------
  const covers = (ev, key) => ev.start_date <= key && ev.end_date >= key;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Zeitangabe passend zum angezeigten Tag (bei mehrtägigen Terminen: Start-, Zwischen- und Endtag)
  function timeLabel(ev, day) {
    if (ev.start_date === ev.end_date) {
      if (!ev.start_time) return "ganztägig";
      return ev.start_time + (ev.end_time ? `–${ev.end_time}` : "");
    }
    if (day === ev.start_date) return ev.start_time ? `ab ${ev.start_time}` : "ganztägig";
    if (day === ev.end_date) return ev.end_time ? `bis ${ev.end_time}` : "ganztägig";
    return "ganztägig";
  }

  function eventItem(ev, day, onChange) {
    const main = el("div", { className: "event-main" }, el("b", { textContent: (ev.private ? "🔒 " : "") + (ev.icon ? ev.icon + " " : "") + ev.title }));
    if (ev.start_date !== ev.end_date) main.append(el("small", { textContent: `${shortDate(ev.start_date)} – ${shortDate(ev.end_date)}` }));
    if (ev.note) main.append(el("small", { textContent: ev.note }));
    main.classList.add("clickable");
    main.addEventListener("click", () => openSheet(ev.start_date, ev.end_date, ev)); // Bearbeiten
    const del = el("button", { className: "event-del", type: "button", textContent: "✕", ariaLabel: "Termin löschen" });
    del.addEventListener("click", async () => {
      if (!confirm(`„${ev.title}" löschen?`)) return;
      try { await api(`/api/events/${ev.id}`, { method: "DELETE" }); onChange(); } catch (e) { alert(e.message); }
    });
    const color = el("span", { className: "event-color" });
    color.style.setProperty("--c", ev.color || DEFAULT_COLOR);
    const li = el("li", {}, color, el("span", { className: "event-time", textContent: timeLabel(ev, day) }), main, del);
    swipeRow(li, { left: { label: "Löschen", cls: "danger", run: () => del.click() } });
    return li;
  }

  // ---------- Aufgaben-Zeile (überall gleich: Heute, Kalender, Listen) ----------
  function checkSvg() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M5 12.5l4.5 4.5L19 7.5");
    path.setAttribute("pathLength", "24");
    svg.append(path);
    return svg;
  }

  function dueInfo(t) {
    if (!t.due_date) return null;
    const today = iso(new Date());
    const tomorrow = iso(addDays(new Date(), 1));
    const overdue = !t.done && t.due_date < today;
    const text = t.due_date === today ? "heute" : t.due_date === tomorrow ? "morgen" : overdue ? `überfällig · ${shortDate(t.due_date)}` : shortDate(t.due_date);
    return { text, overdue };
  }

  // Gedrückt halten (ca. 0,5 s) löst `handler` aus; das anschließende Antippen wird dann verschluckt.
  // Wer scrollt oder den Finger bewegt, löst nichts aus.
  function longPress(node, handler, ignore = "") {
    let timer = null, x = 0, y = 0, fired = false;
    const cancel = () => { clearTimeout(timer); timer = null; };
    node.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || (ignore && e.target.closest(ignore))) return;
      fired = false; x = e.clientX; y = e.clientY;
      cancel();
      timer = setTimeout(() => { fired = true; timer = null; if (navigator.vibrate) navigator.vibrate(15); handler(); }, 500);
    });
    node.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 10) cancel(); });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) node.addEventListener(ev, cancel);
    node.addEventListener("click", (e) => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
    node.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function taskRow(t, opts = {}) {
    const li = el("li", { className: "task" + (t.done ? " done" : "") + (opts.enter ? " enter" : "") });
    li.style.setProperty("--c", t.list_color || DEFAULT_COLOR);
    const check = el("button", { type: "button", className: "check", ariaLabel: t.done ? "Als offen markieren" : "Abhaken" });
    check.setAttribute("aria-pressed", String(t.done));
    check.append(checkSvg());
    if (opts.readOnly) check.disabled = true; // Aufgaben von Freunden: nur ansehen
    else check.addEventListener("click", () => opts.onToggle(t, li));
    const main = el("div", { className: "task-main" }, el("span", { className: "task-title", textContent: t.title }));
    const due = dueInfo(t);
    const bits = [];
    if (opts.showList) bits.push(`${t.list_emoji || ""} ${t.list_name || ""}`.trim());
    if (due) bits.push(due.text);
    if (bits.length) main.append(el("small", { className: "task-meta" + (due && due.overdue ? " overdue" : ""), textContent: bits.join(" · ") }));
    if (opts.onEdit) { main.classList.add("clickable"); main.addEventListener("click", () => opts.onEdit(t)); }
    li.append(check, main);
    if (opts.onDelete) {
      const del = el("button", { className: "event-del", type: "button", textContent: "✕", ariaLabel: "Aufgabe löschen" });
      del.addEventListener("click", () => opts.onDelete(t, li));
      li.append(del);
      longPress(li, () => { if (confirm(`„${t.title}" löschen?`)) opts.onDelete(t, li); }, ".check");
    }
    swipeRow(li, {
      right: opts.onToggle && !opts.readOnly ? { label: t.done ? "Offen" : "Erledigt", cls: "done", run: () => opts.onToggle(t, li) } : null,
      left: opts.onDelete ? { label: "Löschen", cls: "danger", run: () => opts.onDelete(t, li) } : null,
    });
    return li;
  }

  // ---------- Wischen auf Listen-Einträgen (wie in Mail) ----------
  const SWIPE_OPEN = 92;
  let openSwipe = null; // aufgeklappte Zeile (nur eine zur Zeit)
  function swipeRow(li, { left = null, right = null } = {}) {
    if (!left && !right) return;
    const content = el("div", { className: "swipe-content" });
    content.append(...li.childNodes);
    li.classList.add("swipe-row");
    const btnL = left ? el("button", { type: "button", className: `swipe-act left ${left.cls}`, textContent: left.label }) : null;
    const bgR = right ? el("div", { className: `swipe-act right ${right.cls}`, textContent: right.label }) : null;
    li.append(...[bgR, btnL].filter(Boolean), content);
    let s = null, offset = 0, swallowClick = false;
    const setX = (x, animate) => {
      offset = x;
      content.style.transition = animate ? `transform .32s ${IOS_EASE}` : "none";
      content.style.transform = x ? `translateX(${x}px)` : "";
      li.classList.toggle("swiping", x !== 0);
      if (bgR) bgR.style.opacity = x > 0 ? "1" : "0";
      if (btnL) btnL.style.opacity = x < 0 ? "1" : "0";
    };
    const close = () => { setX(0, true); if (openSwipe === close) openSwipe = null; };
    if (btnL) btnL.addEventListener("click", () => { close(); left.run(); });
    li.addEventListener("touchstart", (e) => {
      if (openSwipe && openSwipe !== close) openSwipe();
      s = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: offset, active: false, dx: offset };
    }, { passive: true });
    li.addEventListener("touchmove", (e) => {
      if (!s) return;
      const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
      if (!s.active) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) s.active = true; else { if (Math.abs(dy) > 10) s = null; return; }
      }
      e.stopPropagation(); // nicht zusätzlich den Monat wechseln
      let x = s.base + dx;
      if (!left && x < 0) x = 0;
      if (!right && x > 0) x = 0;
      const w = li.offsetWidth;
      if (Math.abs(x) > w * 0.75) x = Math.sign(x) * (w * 0.75 + (Math.abs(x) - w * 0.75) * 0.25);
      s.dx = x;
      setX(x, false);
    }, { passive: true });
    li.addEventListener("touchend", (e) => {
      const t = s; s = null;
      if (!t || !t.active) return;
      e.stopPropagation();
      swallowClick = true; setTimeout(() => { swallowClick = false; }, 350);
      const w = li.offsetWidth, x = t.dx;
      if (left && x < -w * 0.55) {
        if (!reduceMotion()) setX(-w, true); else setX(0, false);
        setTimeout(() => { setX(0, false); left.run(); }, 220);
      } else if (left && x < -50) { setX(-SWIPE_OPEN, true); openSwipe = close; }
      else if (right && x > 70) { setX(0, true); right.run(); }
      else close();
    });
    li.addEventListener("click", (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // Abhaken mit Animation: erst der Haken/Strich, dann (nach kurzer Pause) wandert die Zeile
  async function toggleTask(t, li, after) {
    const next = !t.done;
    li.classList.toggle("done", next);
    const btn = li.querySelector(".check");
    btn.setAttribute("aria-pressed", String(next));
    btn.disabled = true;
    try {
      const row = await api(`/api/todos/${t.id}`, { method: "PATCH", body: { done: next } });
      Object.assign(t, row);
      await sleep(next ? 450 : 150);
      if (after) after(next);
    } catch (e) {
      li.classList.toggle("done", !next);
      btn.setAttribute("aria-pressed", String(!next));
      btn.disabled = false;
      alert(e.message);
    }
  }

  // Termine und Aufgaben gemischt, nach Datum sortiert (Termine vor Aufgaben am selben Tag)
  function fillMixed(ul, items, emptyText, onChange) {
    ul.replaceChildren();
    if (!items.length) { ul.append(el("li", { className: "empty", textContent: emptyText })); return; }
    items.sort((a, b) => a.sortDate.localeCompare(b.sortDate) || (a.kind === "event" ? 0 : 1) - (b.kind === "event" ? 0 : 1));
    for (const it of items) {
      ul.append(it.kind === "event"
        ? eventItem(it.data, it.day, onChange)
        : taskRow(it.data, { showList: true, onToggle: (t, li) => toggleTask(t, li, onChange) }));
    }
  }

  // ---------- Heute ----------
  async function renderToday() {
    const now = new Date();
    const h = now.getHours();
    const todayKey = iso(now);
    const weekKey = iso(addDays(now, 7));
    $("today-greeting").textContent = h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
    $("today-date").textContent = longDate(todayKey);
    $("whoami").textContent = store.get("user", "") ? `Angemeldet als ${store.get("user", "")}` : "";
    renderWeather();
    loadMarket(); loadBriefing();
    try {
      const [evs, todos, classes] = await Promise.all([api(`/api/events?from=${todayKey}&to=${weekKey}`), api("/api/todos"), api("/api/timetable")]);
      renderTodayClasses(classes);
      const open = todos.filter((t) => !t.done);
      $("tile-tasks-sub").textContent = open.length ? `${open.length} offen` : "alles erledigt";
      const dated = open.filter((t) => t.due_date);
      const todayItems = [
        ...evs.filter((e) => covers(e, todayKey)).map((e) => ({ kind: "event", data: e, day: todayKey, sortDate: todayKey })),
        ...dated.filter((t) => t.due_date <= todayKey).map((t) => ({ kind: "task", data: t, sortDate: t.due_date })),
      ];
      const upcomingItems = [
        ...evs.filter((e) => e.start_date > todayKey).map((e) => ({ kind: "event", data: e, day: e.start_date, sortDate: e.start_date })),
        ...dated.filter((t) => t.due_date > todayKey && t.due_date <= weekKey).map((t) => ({ kind: "task", data: t, sortDate: t.due_date })),
      ];
      fillMixed($("today-events"), todayItems, "Heute nichts geplant.", renderToday);
      fillMixed($("upcoming-events"), upcomingItems, "Keine weiteren Termine oder Aufgaben.", renderToday);
    } catch (e) {
      if (token) $("today-events").replaceChildren(el("li", { className: "empty", textContent: e.message }));
    }
  }

  async function checkHealth() {
    try {
      const h = await api("/api/health");
      $("status-line").textContent = (h.llm_configured ? `Assistent bereit (${h.model})` : "Assistent nicht aktiv: GEMINI_API_KEY fehlt.") + ` · Speicher: ${h.storage === "SupabaseStore" ? "Supabase" : "lokal"}`;
    } catch { $("status-line").textContent = "Server nicht erreichbar."; }
  }

  // ---------- Wetter (Open-Meteo, kostenlos, ohne Key) ----------
  const W_MIN = 0, W_MAX = 22, W_STEP = 2;
  // Bewusst nicht gespeichert: bei jedem Öffnen startet der Bereich wieder bei 8–16 Uhr
  let wRange = { from: 8, to: 16 };
  const DEFAULT_LOC = { name: "Berlin", lat: 52.52, lon: 13.405 };
  const getLoc = () => store.get("loc", DEFAULT_LOC);
  let wDay = 0;
  let wCache = null; // { key, at, hourly }

  // Nachts (is_day = 0 von Open-Meteo, abhängig von Sonnenauf- und -untergang) Mond statt Sonne
  const wIcon = (c, day = true) =>
    c === 0 ? (day ? "☀️" : "🌙") : c === 1 ? (day ? "🌤️" : "🌙") : c === 2 ? (day ? "⛅" : "☁️") : c === 3 ? "☁️" :
    c <= 48 ? "🌫️" : c <= 57 ? "🌦️" : c <= 67 ? "🌧️" : c <= 77 ? "🌨️" : c <= 82 ? "🌧️" : c <= 86 ? "🌨️" : "⛈️";

  async function loadWeather() {
    const loc = getLoc();
    const key = `${loc.lat},${loc.lon}`;
    if (wCache && wCache.key === key && Date.now() - wCache.at < 30 * 60 * 1000) return wCache.hourly;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=3`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Wetterdienst nicht erreichbar.");
    const data = await res.json();
    const hourly = {};
    data.hourly.time.forEach((t, i) => { hourly[t] = { temp: data.hourly.temperature_2m[i], code: data.hourly.weather_code[i], day: data.hourly.is_day[i] === 1 }; });
    wCache = { key, at: Date.now(), hourly };
    return hourly;
  }

  async function renderWeather() {
    const box = $("weather");
    $("loc-name").textContent = getLoc().name;
    let hourly;
    try { hourly = await loadWeather(); } catch (e) {
      box.replaceChildren(el("p", { className: "w-empty", textContent: e.message }));
      return;
    }
    const day = iso(addDays(new Date(), wDay));
    box.replaceChildren();
    box.append(weatherCtrl(
      { label: "Frühere Uhrzeit hinzufügen", disabled: wRange.from <= W_MIN, onClick: () => { wRange.from -= W_STEP; saveRange(); } },
      { label: "Früheste Uhrzeit entfernen", disabled: wRange.from >= wRange.to, onClick: () => { wRange.from += W_STEP; saveRange(); } },
    ));
    for (let h = wRange.from; h <= wRange.to; h += W_STEP) {
      const w = hourly[`${day}T${pad(h)}:00`];
      box.append(el("div", { className: "w-slot" + (w && !w.day ? " night" : "") },
        el("span", { className: "t", textContent: `${pad(h)} Uhr` }),
        el("span", { className: "i", textContent: w ? wIcon(w.code, w.day) : "–" }),
        el("span", { className: "d", textContent: w ? `${Math.round(w.temp)}°` : "–" })));
    }
    box.append(weatherCtrl(
      { label: "Spätere Uhrzeit hinzufügen", disabled: wRange.to >= W_MAX, onClick: () => { wRange.to += W_STEP; saveRange(); } },
      { label: "Späteste Uhrzeit entfernen", disabled: wRange.to <= wRange.from, onClick: () => { wRange.to -= W_STEP; saveRange(); } },
    ));
    $("w-msg").textContent = "";
  }

  // Zwei Knöpfe am Rand: + fügt eine Uhrzeit hinzu, − entfernt die äußerste
  function weatherCtrl(add, remove) {
    const mk = (cfg, cls, text) => {
      const b = el("button", { type: "button", className: cls, textContent: text, ariaLabel: cfg.label, title: cfg.label, disabled: cfg.disabled });
      b.addEventListener("click", cfg.onClick);
      return b;
    };
    return el("div", { className: "w-ctrl" }, mk(add, "plus", "+"), mk(remove, "minus", "−"));
  }
  function saveRange() { renderWeather(); }

  document.querySelectorAll("[data-wday]").forEach((b) => b.addEventListener("click", () => {
    wDay = Number(b.dataset.wday);
    document.querySelectorAll("[data-wday]").forEach((x) => x.classList.toggle("active", x === b));
    renderWeather();
  }));

  $("loc-chip").addEventListener("click", () => {
    const panel = $("loc-panel");
    panel.hidden = !panel.hidden;
    $("loc-chip").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) $("loc-input").focus();
  });

  $("loc-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("loc-input").value.trim();
    const list = $("loc-results");
    if (!q) return;
    list.replaceChildren(el("li", { className: "muted", textContent: "Suche …" }));
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=de`);
      const data = await res.json();
      list.replaceChildren();
      if (!data.results || !data.results.length) { list.append(el("li", { className: "muted", textContent: "Nichts gefunden." })); return; }
      for (const r of data.results) {
        const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
        const b = el("button", { type: "button", textContent: label });
        b.addEventListener("click", () => {
          store.set("loc", { name: r.name, lat: r.latitude, lon: r.longitude });
          wCache = null; list.replaceChildren(); $("loc-input").value = "";
          $("loc-panel").hidden = true; $("loc-chip").setAttribute("aria-expanded", "false");
          renderWeather();
        });
        list.append(el("li", {}, b));
      }
    } catch { list.replaceChildren(el("li", { className: "muted", textContent: "Ortssuche nicht erreichbar." })); }
  });

  // ---------- Kalender ----------
  const state = { year: 0, month: 0, selected: "", events: [], todos: [], view: store.get("calview", "month") === "week" ? "week" : "month" };
  { const t = new Date(); state.year = t.getFullYear(); state.month = t.getMonth(); state.selected = iso(t); }

  const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

  function gridRange(s = state) {
    if (s.view === "week") {
      const start = mondayOf(parseIso(s.selected));
      return { start, end: addDays(start, 6), days: 7 };
    }
    const first = new Date(s.year, s.month, 1);
    const start = mondayOf(first);
    return { start, end: addDays(start, 41), days: 42 }; // 6 Wochen
  }

  async function loadMonth() {
    const { start, end } = gridRange();
    try {
      [state.events, state.todos] = await Promise.all([
        api(`/api/events?from=${iso(start)}&to=${iso(end)}`),
        api(`/api/todos?due_from=${iso(start)}&due_to=${iso(end)}`),
      ]);
    } catch { state.events = []; state.todos = []; }
    state.friendEvents = await loadOverlay(start, end);
    renderCalendar();
  }

  // Termine der eingeblendeten Freunde; wer nicht mehr teilt, fällt still heraus
  async function loadOverlay(start, end) {
    const lists = await Promise.all(activeOverlay().map((f) =>
      api(`/api/friends/${f.id}/events?from=${iso(start)}&to=${iso(end)}`)
        .then((evs) => evs.map((e) => ({ ...e, friend: f })))
        .catch((e) => { if (e.status === 404) loadFriends(); return []; })));
    return lists.flat();
  }

  function renderCalendar() {
    const { start, end, days } = gridRange();
    const week = state.view === "week";
    $("cal-title").textContent = week ? `${shortDate(iso(start))} – ${shortDate(iso(end))}` : `${MONTHS[state.month]} ${state.year}`;
    document.querySelectorAll("[data-cview]").forEach((b) => b.classList.toggle("active", b.dataset.cview === state.view));
    $("cal-prev").ariaLabel = week ? "Vorherige Woche" : "Vorheriger Monat";
    $("cal-next").ariaLabel = week ? "Nächste Woche" : "Nächster Monat";
    paintGrid($("cal-grid"), { start, days, week, month: state.month, events: state.events, todos: state.todos, selected: state.selected, friendEvents: state.friendEvents });
    renderDay();
  }

  // Zeichnet die Tageszellen eines Kalenders (eigener oder der eines Freundes)
  function paintGrid(grid, { start, days, week, month, events, todos, selected, friendEvents = [] }) {
    const todayKey = iso(new Date());
    grid.classList.toggle("week", week);
    grid.replaceChildren();
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      const key = iso(d);
      const evs = events.filter((e) => covers(e, key));
      const tds = todos.filter((t) => t.due_date === key);
      const cell = el("div", { className: "day", role: "button", tabIndex: 0 });
      cell.dataset.date = key;
      if (!week && d.getMonth() !== month) cell.classList.add("other");
      if (key === todayKey) cell.classList.add("today");
      if (key === selected) cell.classList.add("selected");
      cell.append(el("span", { className: "num", textContent: d.getDate() }));
      // Termine und offene Aufgaben mit Datum: Tag in der jeweiligen Farbe hinterlegt, Farbbalken und Symbol
      const marks = [
        ...evs.map((e) => ({ color: e.color || DEFAULT_COLOR, icon: e.icon || "", task: false })),
        ...tds.filter((t) => !t.done).map((t) => ({ color: t.list_color || DEFAULT_COLOR, icon: t.list_emoji || "", task: true })),
        ...friendEvents.filter((e) => covers(e, key)).map((e) => ({ color: e.color || DEFAULT_COLOR, icon: "", friend: true })),
      ];
      if (marks.length) {
        // Farbige Füllung nur für eigene Termine; eingeblendete Freundes-Termine zeigen nur gestrichelte Balken
        const own = marks.find((m) => !m.friend);
        if (own) { cell.classList.add("has-ev"); cell.style.setProperty("--tint", own.color); }
        const icon = (marks.find((m) => m.icon) || {}).icon;
        if (icon) cell.append(el("span", { className: "day-icon", textContent: icon }));
        const bars = el("div", { className: "bars" });
        for (const m of marks.slice(0, 3)) {
          const bar = el("span", { className: m.task ? "is-task" : m.friend ? "is-friend" : "" });
          bar.style.setProperty("--c", m.color);
          bars.append(bar);
        }
        cell.append(bars);
      }
      grid.append(cell);
    }
  }

  // Der "Heute"-Knopf erscheint, sobald man einen anderen Monat oder Tag angesehen hat
  function updateTodayChip() {
    const t = new Date();
    $("cal-today").hidden = state.year === t.getFullYear() && state.month === t.getMonth() && state.selected === iso(t);
  }
  $("cal-today").addEventListener("click", () => {
    const t = new Date();
    state.year = t.getFullYear(); state.month = t.getMonth(); state.selected = iso(t);
    loadMonth();
  });

  function renderDay() {
    updateTodayChip();
    $("day-title").textContent = longDate(state.selected);
    const items = [
      ...state.events.filter((e) => covers(e, state.selected)).map((e) => ({ kind: "event", data: e, day: state.selected, sortDate: state.selected })),
      ...state.todos.filter((t) => t.due_date === state.selected).map((t) => ({ kind: "task", data: t, sortDate: state.selected })),
    ];
    fillMixed($("day-events"), items, "Keine Termine oder Aufgaben.", loadMonth);
    const theirs = (state.friendEvents || []).filter((e) => covers(e, state.selected));
    if (theirs.length) {
      if (!items.length) $("day-events").replaceChildren();
      $("day-events").append(...theirs.map((e) => friendEventItem(e, e.friend.username, state.selected, e.friend)));
    }
  }

  function selectDate(key) {
    const before = gridRange();
    state.selected = key;
    const d = parseIso(key);
    if (state.view === "week") {
      state.month = d.getMonth(); state.year = d.getFullYear();
      if (key < iso(before.start) || key > iso(before.end)) loadMonth();
      else {
        document.querySelectorAll(".day").forEach((c) => c.classList.toggle("selected", c.dataset.date === key));
        renderDay();
      }
    } else if (d.getMonth() !== state.month || d.getFullYear() !== state.year) {
      state.month = d.getMonth(); state.year = d.getFullYear(); loadMonth();
    } else {
      document.querySelectorAll(".day").forEach((c) => c.classList.toggle("selected", c.dataset.date === key));
      renderDay();
    }
  }

  // Tippen = Tag wählen. Halten = Auswahl startet; ohne Loslassen ziehen = mehrere Tage; Loslassen = Formular.
  const LONG_PRESS_MS = 250;
  const WAVE_STEP_MS = 45; // Abstand zwischen den nacheinander eingefärbten Tagen
  const MOVE_TOLERANCE = 10;
  const HINT_TEXT = $("cal-hint").textContent;
  let press = null;
  let rangeGesture = false; // verhindert, dass das Ziehen als Monats-Wischen zählt

  const grid = $("cal-grid");
  const cellAt = (x, y) => { const n = document.elementFromPoint(x, y); return n && n.closest ? n.closest(".day") : null; };

  const dayDist = (a, b) => Math.abs(Math.round((parseIso(a) - parseIso(b)) / 86400000));

  function markRange() {
    const lo = press.anchor < press.end ? press.anchor : press.end;
    const hi = press.anchor < press.end ? press.end : press.anchor;
    const fresh = [];
    grid.querySelectorAll(".day").forEach((c) => {
      const inside = c.dataset.date >= lo && c.dataset.date <= hi;
      if (!inside) { c.classList.remove("inrange"); c.style.animationDelay = ""; }
      else if (!c.classList.contains("inrange")) fresh.push(c);
    });
    // Neue Tage laufen vom Startpunkt aus nacheinander ein (Welle), auch über Wochen hinweg
    fresh.sort((a, b) => dayDist(a.dataset.date, press.anchor) - dayDist(b.dataset.date, press.anchor));
    fresh.forEach((c, i) => { c.style.animationDelay = `${i * WAVE_STEP_MS}ms`; c.classList.add("inrange"); });
    const hint = $("cal-hint");
    hint.classList.add("live");
    hint.textContent = lo === hi ? longDate(lo) : `${shortDate(lo)} – ${shortDate(hi)} · loslassen zum Anlegen`;
  }

  function clearPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press.cell.classList.remove("pressing");
    grid.querySelectorAll(".inrange").forEach((c) => { c.classList.remove("inrange"); c.style.animationDelay = ""; });
    const hint = $("cal-hint");
    hint.classList.remove("live");
    hint.textContent = HINT_TEXT;
    press = null;
  }

  grid.addEventListener("contextmenu", (e) => e.preventDefault());
  grid.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".day");
    if (!cell || (e.pointerType === "mouse" && e.button !== 0)) return;
    clearPress();
    press = { cell, x: e.clientX, y: e.clientY, fired: false, anchor: cell.dataset.date, end: cell.dataset.date };
    cell.classList.add("pressing");
    press.timer = setTimeout(() => {
      press.fired = true;
      rangeGesture = true;
      cell.classList.remove("pressing");
      if (navigator.vibrate) navigator.vibrate(15);
      markRange();
    }, LONG_PRESS_MS);
  });

  grid.addEventListener("pointermove", (e) => {
    if (!press) return;
    if (!press.fired) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) clearPress();
      return;
    }
    const c = cellAt(e.clientX, e.clientY);
    if (c && c.dataset.date !== press.end) { press.end = c.dataset.date; markRange(); }
  });

  // Nach dem langen Drücken darf die Seite nicht mitscrollen
  grid.addEventListener("touchmove", (e) => { if (press && press.fired) e.preventDefault(); }, { passive: false });

  window.addEventListener("pointerup", (e) => {
    if (!press) return;
    const { fired, anchor, end } = press;
    clearPress();
    if (!fired) { if (e.target.closest && e.target.closest("#cal-grid")) selectDate(anchor); return; }
    const lo = anchor < end ? anchor : end;
    const hi = anchor < end ? end : anchor;
    selectDate(lo);
    openSheet(lo, hi);
  });
  window.addEventListener("pointercancel", clearPress);

  grid.addEventListener("keydown", (e) => {
    const cell = e.target.closest(".day");
    if (cell && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectDate(cell.dataset.date); }
  });

  // ---------- Kalender: Gleiten beim Wechseln (Wischen, Pfeile, Pfeiltasten) ----------
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SLIDE_OUT_MS = 140, SLIDE_IN_MS = 240;
  const clearAnims = (node) => node.getAnimations().forEach((a) => a.cancel());

  // Raster gleitet heraus, `change` tauscht den Inhalt, dann gleitet das neue von der Gegenseite herein.
  // dir: +1 = vorwärts (neuer Inhalt kommt von rechts), -1 = zurück. `from` = aktueller Versatz in Pixeln (beim Wischen).
  function slideGrid(grid, dir, change, from = 0) {
    clearAnims(grid);
    grid.style.transform = grid.style.opacity = "";
    if (reducedMotion.matches || !grid.animate) { change(); return; }
    const out = grid.animate(
      [{ transform: `translateX(${from}px)`, opacity: from ? 1 - Math.min(.5, Math.abs(from) / (grid.offsetWidth * 1.2)) : 1 },
       { transform: `translateX(${-dir * 36}%)`, opacity: 0 }],
      { duration: SLIDE_OUT_MS, easing: "ease-in", fill: "forwards" });
    out.finished.then(() => {
      change();
      clearAnims(grid);
      grid.animate([{ transform: `translateX(${dir * 36}%)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }],
        { duration: SLIDE_IN_MS, easing: "cubic-bezier(.2, .8, .2, 1)" });
    }).catch(() => {});
  }

  // Raster folgt dem Finger; beim Loslassen weit genug (> ¼ Breite) oder schnell: wechseln, sonst zurückfedern
  function bindSwipe(area, grid, onShift, { blocked = () => false, onStart = () => {} } = {}) {
    let s = null;
    const springBack = () => {
      const from = s ? s.dx * .55 : 0;
      grid.style.transform = grid.style.opacity = "";
      if (from && !reducedMotion.matches && grid.animate) grid.animate([{ transform: `translateX(${from}px)` }, { transform: "translateX(0)" }], { duration: 220, easing: "cubic-bezier(.2, .8, .2, 1)" });
    };
    area.addEventListener("touchstart", (e) => { onStart(); s = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp, dx: 0, active: false }; clearAnims(grid); }, { passive: true });
    area.addEventListener("touchmove", (e) => {
      if (!s || blocked()) return;
      const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
      if (!s.active) { if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) s.active = true; else return; }
      s.dx = dx;
      grid.style.transform = `translateX(${dx * .55}px)`;
      grid.style.opacity = String(1 - Math.min(.5, Math.abs(dx) / (grid.offsetWidth * 1.2)));
    }, { passive: true });
    const finish = (e) => {
      const t = s; s = null;
      if (!t || !t.active) return;
      if (blocked()) { s = t; springBack(); s = null; return; }
      const dt = Math.max(1, e.timeStamp - t.t);
      const far = Math.abs(t.dx) > Math.max(60, grid.offsetWidth * .25);
      const fast = Math.abs(t.dx) > 40 && Math.abs(t.dx) / dt > .5;
      if (far || fast) { const dir = t.dx < 0 ? 1 : -1; slideGrid(grid, dir, () => onShift(dir), t.dx * .55); }
      else { s = t; springBack(); s = null; }
    };
    area.addEventListener("touchend", finish, { passive: true });
    area.addEventListener("touchcancel", () => { if (s && s.active) springBack(); s = null; }, { passive: true });
  }

  function shiftState(s, delta) {
    if (s.view === "week") {
      const d = addDays(parseIso(s.selected), 7 * delta);
      s.selected = iso(d); s.year = d.getFullYear(); s.month = d.getMonth();
    } else {
      const d = new Date(s.year, s.month + delta, 1);
      s.year = d.getFullYear(); s.month = d.getMonth();
    }
  }
  // Sofort das neue Raster zeigen (mit den vorhandenen Daten), die Termine kommen kurz danach nach
  function shiftMonth(delta) { shiftState(state, delta); renderCalendar(); loadMonth(); }
  const slideMonth = (delta) => slideGrid($("cal-grid"), delta, () => shiftMonth(delta));
  $("cal-prev").addEventListener("click", () => slideMonth(-1));
  $("cal-next").addEventListener("click", () => slideMonth(1));

  // Umschalten zwischen Monats- und Wochenansicht (die Auswahl bleibt erhalten)
  document.querySelectorAll("[data-cview]").forEach((b) => b.addEventListener("click", () => {
    if (state.view === b.dataset.cview) return;
    state.view = b.dataset.cview;
    store.set("calview", state.view);
    const d = parseIso(state.selected);
    state.year = d.getFullYear(); state.month = d.getMonth();
    loadMonth();
  }));
  $("day-add").addEventListener("click", () => openSheet(state.selected, state.selected));

  // Wischen im Kalender wechselt Monat bzw. Woche (das Raster folgt dem Finger)
  bindSwipe($("view-calendar"), $("cal-grid"), shiftMonth, { blocked: () => rangeGesture || edgeGesture, onStart: () => { rangeGesture = false; } });

  // ---------- Termin-Formular ----------
  const swatches = $("f-colors");
  PALETTE.forEach((c, i) => {
    const input = el("input", { type: "radio", name: "color", value: c, ariaLabel: COLOR_NAMES[i] });
    const dot = el("span"); dot.style.setProperty("--c", c);
    swatches.append(el("label", {}, input, dot));
  });

  const EVENT_ICONS = ["🩺", "🎓", "💼", "🎂", "✈️", "🏋️", "📞", "🍽️", "🚗", "🎉", "🛒", "❤️"];
  EVENT_ICONS.forEach((em) => {
    const b = el("button", { type: "button", textContent: em, ariaLabel: `Symbol ${em}` });
    b.addEventListener("click", () => {
      $("f-icon").value = $("f-icon").value === em ? "" : em; // zweiter Tipp entfernt das Symbol
      markIcon();
    });
    $("f-quick").append(b);
  });
  function markIcon() { $("f-quick").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.textContent === $("f-icon").value.trim())); }
  $("f-icon").addEventListener("input", markIcon);

  let editingEventId = null;
  let editFallbackColor = DEFAULT_COLOR; // Farbe, die nicht in der Palette liegt (z. B. vom Assistenten gesetzt)

  function openSheet(startKey, endKey, ev = null) {
    $("sheet").reset();
    editingEventId = ev ? ev.id : null;
    editFallbackColor = ev ? ev.color || DEFAULT_COLOR : DEFAULT_COLOR;
    $("sheet-title").textContent = ev ? "Termin bearbeiten" : "Neuer Termin";
    $("f-date").value = startKey;
    $("f-end-date").value = endKey || startKey;
    selectColor(swatches, "color", editFallbackColor);
    if (ev) {
      $("f-title").value = ev.title;
      $("f-start").value = ev.start_time || "";
      $("f-end").value = ev.end_time || "";
      $("f-note").value = ev.note || "";
      $("f-icon").value = ev.icon || "";
      $("f-private").checked = !!ev.private;
    }
    markIcon();
    $("f-error").hidden = true;
    $("sheet-backdrop").hidden = false;
    $("sheet").hidden = false;
    setTimeout(() => $("f-title").focus(), 50);
  }
  function closeSheet() { for (const id of ["sheet", "list-sheet", "task-sheet", "pw-sheet", "class-sheet", "import-sheet", "share-sheet", "peek-sheet"]) $(id).hidden = true; $("sheet-backdrop").hidden = true; impSession++; }
  $("f-cancel").addEventListener("click", closeSheet);
  $("sheet-backdrop").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  // Fenster am grauen Strich nach unten ziehen = abbrechen (wie bei normalen Handy-Apps)
  document.querySelectorAll(".sheet").forEach((sheet) => {
    const grab = sheet.querySelector(".grabber");
    if (!grab) return;
    let startY = null, dy = 0, lastY = 0, lastT = 0, vel = 0;
    const backdrop = $("sheet-backdrop");
    grab.addEventListener("pointerdown", (e) => {
      startY = e.clientY; lastY = startY; lastT = e.timeStamp; dy = 0; vel = 0;
      try { grab.setPointerCapture(e.pointerId); } catch (_) {}
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // Tastatur zuklappen
      sheet.classList.remove("settling");
      sheet.classList.add("dragging");
    });
    grab.addEventListener("pointermove", (e) => {
      if (startY === null) return;
      dy = Math.max(0, e.clientY - startY); // nur nach unten ziehen
      const dt = e.timeStamp - lastT;
      if (dt > 0) vel = (e.clientY - lastY) / dt;
      lastY = e.clientY; lastT = e.timeStamp;
      sheet.style.transform = `translateY(${dy}px)`;
      backdrop.style.opacity = String(Math.max(0, 1 - dy / 320));
    });
    const release = () => {
      if (startY === null) return;
      startY = null;
      sheet.classList.remove("dragging");
      sheet.classList.add("settling");
      backdrop.style.opacity = "";
      if (dy > 90 || vel > 0.6) {
        // weit genug oder schnell genug gezogen: ganz nach unten wegrutschen lassen und schließen
        sheet.style.transform = "translateY(105%)";
        setTimeout(() => { closeSheet(); sheet.classList.remove("settling"); sheet.style.transform = ""; }, 190);
      } else {
        sheet.style.transform = "";
        setTimeout(() => sheet.classList.remove("settling"), 220);
      }
    };
    grab.addEventListener("pointerup", release);
    grab.addEventListener("pointercancel", release);
  });
  // Liegt "Bis" vor "Von", wird es mitgezogen
  $("f-date").addEventListener("change", () => { if ($("f-end-date").value < $("f-date").value) $("f-end-date").value = $("f-date").value; });

  $("sheet").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      title: $("f-title").value.trim(),
      start_date: $("f-date").value,
      end_date: $("f-end-date").value || $("f-date").value,
      start_time: $("f-start").value || null,
      end_time: $("f-end").value || null,
      color: (swatches.querySelector("input:checked") || {}).value || editFallbackColor,
      note: $("f-note").value.trim(),
      icon: $("f-icon").value.trim(),
      private: $("f-private").checked,
    };
    if (body.end_date < body.start_date) { showFormError("Das Ende liegt vor dem Beginn."); return; }
    if (body.end_time && !body.start_time) { showFormError("Bitte auch einen Beginn angeben."); return; }
    if (body.start_date === body.end_date && body.end_time && body.end_time < body.start_time) { showFormError("Die Endzeit liegt vor dem Beginn."); return; }
    try {
      if (editingEventId) await api(`/api/events/${editingEventId}`, { method: "PUT", body });
      else await api("/api/events", { method: "POST", body });
      closeSheet();
      state.selected = body.start_date;
      const d = parseIso(body.start_date);
      state.year = d.getFullYear(); state.month = d.getMonth();
      loadMonth();
      renderToday();
    } catch (err) { showFormError(err.message); }
  });
  function showFormError(msg) { const p = $("f-error"); p.textContent = msg; p.hidden = false; }

  // ---------- Aufgaben ----------
  const QUICK_EMOJI = ["📝", "🎓", "💼", "🛒", "🏠", "💪", "📚", "✈️", "🎯", "❤️", "🎮", "🍽️"];
  const todoState = { lists: [], todos: [], openId: null, animateId: null };

  // Wählt eine Farbe aus; liegt sie nicht in der Palette, erscheint sie als zusätzliche Auswahl
  function selectColor(box, name, color) {
    box.querySelectorAll("label.custom").forEach((l) => l.remove());
    const inputs = [...box.querySelectorAll("input")];
    inputs.forEach((i) => { i.checked = false; });
    const match = inputs.find((i) => i.value.toLowerCase() === color.toLowerCase());
    if (match) { match.checked = true; return; }
    const input = el("input", { type: "radio", name, value: color, ariaLabel: "Eigene Farbe", checked: true });
    const dot = el("span"); dot.style.setProperty("--c", color);
    box.append(el("label", { className: "custom" }, input, dot));
  }

  function buildSwatches(box, name) {
    PALETTE.forEach((c, i) => {
      const input = el("input", { type: "radio", name, value: c, ariaLabel: COLOR_NAMES[i] });
      const dot = el("span"); dot.style.setProperty("--c", c);
      box.append(el("label", {}, input, dot));
    });
  }

  async function loadTodos() {
    try {
      [todoState.lists, todoState.todos] = await Promise.all([api("/api/lists"), api("/api/todos")]);
    } catch (e) { $("list-grid").replaceChildren(el("p", { className: "w-empty", textContent: e.message })); return; }
    if (todoState.openId && !todoState.lists.some((l) => l.id === todoState.openId)) todoState.openId = null;
    renderTodos();
  }

  let todoDetailShown = false;
  function renderTodos() {
    const detail = todoState.openId !== null;
    if (detail !== todoDetailShown && $("view-todos").classList.contains("active")) animateIn(detail ? $("todo-detail") : $("todo-overview"), detail ? "push" : "pop");
    todoDetailShown = detail;
    $("todo-overview").hidden = detail;
    $("todo-detail").hidden = !detail;
    $("task-fab").hidden = !detail;
    if (detail) renderTodoDetail(); else renderListGrid();
  }

  function listStats(listId) {
    const ts = todoState.todos.filter((t) => t.list_id === listId);
    const done = ts.filter((t) => t.done).length;
    return { total: ts.length, done, open: ts.length - done };
  }

  function renderListGrid() {
    const grid = $("list-grid");
    grid.replaceChildren();
    todoState.lists.forEach((l, i) => {
      const st = listStats(l.id);
      const card = el("button", { type: "button", className: "list-card" });
      card.style.setProperty("--c", l.color);
      card.style.animationDelay = `${i * 50}ms`;
      const bar = el("div", { className: "mini-bar" }, el("div", { className: "mini-fill" }));
      bar.firstChild.style.width = st.total ? `${Math.round((st.done / st.total) * 100)}%` : "0%";
      card.append(
        el("span", { className: "list-emoji", textContent: l.emoji }),
        el("b", { textContent: l.name }),
        el("small", { textContent: st.total === 0 ? "leer" : st.open === 0 ? "alles erledigt" : `${st.open} offen` }),
        bar,
      );
      card.addEventListener("click", () => { todoState.openId = l.id; renderTodos(); window.scrollTo(0, 0); });
      grid.append(card);
    });
    const add = el("button", { type: "button", className: "list-card add", textContent: "＋ Neue Liste" });
    add.style.animationDelay = `${todoState.lists.length * 50}ms`;
    add.addEventListener("click", () => openListSheet());
    grid.append(add);
    $("list-hint").hidden = todoState.lists.length > 0;
  }

  function renderTodoDetail(celebrate = false) {
    const l = todoState.lists.find((x) => x.id === todoState.openId);
    if (!l) { todoState.openId = null; renderTodos(); return; }
    $("todo-detail").style.setProperty("--c", l.color);
    $("task-fab").style.setProperty("--c", l.color); // Schaltfläche in der Farbe der Liste
    $("td-emoji").textContent = l.emoji;
    $("td-name").textContent = l.name;
    const st = listStats(l.id);
    $("td-bar").style.width = st.total ? `${Math.round((st.done / st.total) * 100)}%` : "0%";
    $("td-count").textContent = st.total === 0 ? "Noch keine Aufgaben." : st.open === 0 ? "Alles erledigt 🎉" : `${st.done} von ${st.total} erledigt`;
    if (celebrate && st.total > 0 && st.open === 0) {
      const em = $("td-emoji");
      em.classList.remove("celebrate"); void em.offsetWidth; em.classList.add("celebrate");
    }
    const ts = todoState.todos.filter((t) => t.list_id === l.id);
    const mk = (t) => taskRow(t, {
      enter: t.id === todoState.animateId,
      onToggle: (task, li) => toggleTask(task, li, (nowDone) => renderTodoDetail(nowDone)),
      onEdit: (task) => openTaskSheet(task),
      onDelete: deleteTask,
    });
    $("task-open").replaceChildren(...ts.filter((t) => !t.done).map(mk));
    $("task-done").replaceChildren(...ts.filter((t) => t.done).map(mk));
    $("done-head").hidden = !ts.some((t) => t.done);
    $("td-empty").hidden = ts.length > 0;
    todoState.animateId = null;
  }

  async function deleteTask(t, li) {
    li.classList.add("leaving");
    try {
      await api(`/api/todos/${t.id}`, { method: "DELETE" });
      await sleep(250);
      todoState.todos = todoState.todos.filter((x) => x.id !== t.id);
      renderTodoDetail();
    } catch (e) { li.classList.remove("leaving"); alert(e.message); }
  }

  $("todo-back").addEventListener("click", () => { todoState.openId = null; renderTodos(); });

  $("td-delete").addEventListener("click", async () => {
    const l = todoState.lists.find((x) => x.id === todoState.openId);
    if (!l || !confirm(`Liste „${l.name}" mit allen Aufgaben löschen?`)) return;
    try {
      await api(`/api/lists/${l.id}`, { method: "DELETE" });
      todoState.openId = null;
      await loadTodos();
    } catch (e) { alert(e.message); }
  });

  $("clear-done").addEventListener("click", async () => {
    try {
      await api(`/api/lists/${todoState.openId}/done`, { method: "DELETE" });
      await loadTodos();
    } catch (e) { alert(e.message); }
  });

  // Neue Aufgabe: Dialog mit klarem „Hinzufügen“-Knopf (Enter auf der Tastatur geht auch)
  const dateOffset = (n) => iso(addDays(new Date(), n));
  function markChips() {
    const v = $("t-date").value;
    $("t-chips").querySelectorAll("button").forEach((b) => {
      const off = b.dataset.offset;
      b.classList.toggle("on", off === "" ? !v : v === dateOffset(Number(off)));
    });
  }
  $("t-chips").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $("t-date").value = b.dataset.offset === "" ? "" : dateOffset(Number(b.dataset.offset));
    markChips();
  }));
  $("t-date").addEventListener("change", markChips);

  let editingTaskId = null;

  function openTaskSheet(task = null) {
    $("task-sheet").reset();
    editingTaskId = task ? task.id : null;
    $("t-heading").textContent = task ? "Aufgabe bearbeiten" : "Neue Aufgabe";
    $("t-submit").textContent = task ? "Speichern" : "Hinzufügen";
    $("t-more").hidden = !!task;
    if (task) { $("t-title").value = task.title; $("t-date").value = task.due_date || ""; }
    $("t-error").hidden = true;
    markChips();
    $("sheet-backdrop").hidden = false;
    $("task-sheet").hidden = false;
    setTimeout(() => $("t-title").focus(), 50);
  }
  $("task-fab").addEventListener("click", () => openTaskSheet());
  $("t-cancel").addEventListener("click", closeSheet);

  async function saveTask(keepOpen) {
    const title = $("t-title").value.trim();
    if (!title) { $("t-error").textContent = "Bitte gib einen Titel ein."; $("t-error").hidden = false; $("t-title").focus(); return; }
    const due = $("t-date").value || null;
    try {
      if (editingTaskId) {
        const row = await api(`/api/todos/${editingTaskId}`, { method: "PATCH", body: { title, due_date: due } });
        const t = todoState.todos.find((x) => x.id === editingTaskId);
        if (t) Object.assign(t, row);
        renderTodoDetail();
        closeSheet();
        return;
      }
      const row = await api("/api/todos", { method: "POST", body: { list_id: todoState.openId, title, due_date: due } });
      todoState.todos.push(row);
      todoState.animateId = row.id;
      renderTodoDetail();
      if (keepOpen) {
        $("t-title").value = "";
        $("t-error").hidden = true;
        $("t-title").focus();
      } else closeSheet();
    } catch (err) { $("t-error").textContent = err.message; $("t-error").hidden = false; }
  }
  $("task-sheet").addEventListener("submit", (e) => { e.preventDefault(); saveTask(false); });
  $("t-more").addEventListener("click", () => saveTask(true));

  // Neue Liste
  const listSwatches = $("l-colors");
  buildSwatches(listSwatches, "lcolor");
  QUICK_EMOJI.forEach((em) => {
    const b = el("button", { type: "button", textContent: em, ariaLabel: `Symbol ${em}` });
    b.addEventListener("click", () => { $("l-emoji").value = em; });
    $("l-quick").append(b);
  });

  let editingListId = null;
  let listFallbackColor = DEFAULT_COLOR;

  function openListSheet(list = null) {
    $("list-sheet").reset();
    editingListId = list ? list.id : null;
    listFallbackColor = list ? list.color || DEFAULT_COLOR : DEFAULT_COLOR;
    $("l-heading").textContent = list ? "Liste bearbeiten" : "Neue Liste";
    $("l-submit").textContent = list ? "Speichern" : "Anlegen";
    $("l-name").value = list ? list.name : "";
    $("l-emoji").value = list ? list.emoji : "📝";
    selectColor(listSwatches, "lcolor", listFallbackColor);
    $("l-error").hidden = true;
    $("sheet-backdrop").hidden = false;
    $("list-sheet").hidden = false;
    setTimeout(() => $("l-name").focus(), 50);
  }
  $("l-cancel").addEventListener("click", closeSheet);
  $("td-edit").addEventListener("click", () => {
    const l = todoState.lists.find((x) => x.id === todoState.openId);
    if (l) openListSheet(l);
  });

  $("list-sheet").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      name: $("l-name").value.trim(),
      emoji: $("l-emoji").value.trim() || "📝",
      color: (listSwatches.querySelector("input:checked") || {}).value || listFallbackColor,
    };
    try {
      if (editingListId) {
        const row = await api(`/api/lists/${editingListId}`, { method: "PATCH", body });
        const i = todoState.lists.findIndex((x) => x.id === editingListId);
        if (i >= 0) todoState.lists[i] = row;
        // Aufgaben tragen Name, Symbol und Farbe der Liste mit
        todoState.todos.forEach((t) => { if (t.list_id === row.id) { t.list_name = row.name; t.list_emoji = row.emoji; t.list_color = row.color; } });
        closeSheet();
        renderTodos();
        return;
      }
      const row = await api("/api/lists", { method: "POST", body });
      closeSheet();
      todoState.lists.push(row);
      todoState.openId = row.id; // neue Liste direkt öffnen
      renderTodos();
      window.scrollTo(0, 0);
    } catch (err) { $("l-error").textContent = err.message; $("l-error").hidden = false; }
  });

  // Passwort ändern
  $("pw-open").addEventListener("click", () => {
    $("pw-sheet").reset();
    $("pw-error").hidden = true;
    $("sheet-backdrop").hidden = false;
    $("pw-sheet").hidden = false;
    setTimeout(() => $("pw-old").focus(), 50);
  });
  $("pw-cancel").addEventListener("click", closeSheet);
  $("pw-sheet").addEventListener("submit", async (e) => {
    e.preventDefault();
    const showErr = (m) => { $("pw-error").textContent = m; $("pw-error").hidden = false; };
    if ($("pw-new").value !== $("pw-new2").value) { showErr("Die neuen Passwörter stimmen nicht überein."); return; }
    try {
      await api("/api/auth/password", { method: "POST", body: { old_password: $("pw-old").value, new_password: $("pw-new").value } });
      closeSheet();
      $("status-line").textContent = "Passwort geändert.";
    } catch (err) { showErr(err.message); }
  });

  function refreshData() { loadMonth(); renderToday(); loadTodos(); }

  // ---------- Stundenplan ----------
  const DAY_SHORT = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const DAY_LONG = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const weekdayOf = (d) => ((d.getDay() + 6) % 7) + 1; // Montag = 1 ... Sonntag = 7
  const planState = { classes: [], day: weekdayOf(new Date()), mode: "day" };
  let editingClass = null;

  function showToast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  async function loadPlan() {
    try { planState.classes = await api("/api/timetable"); } catch (e) { $("plan-list").replaceChildren(el("li", { className: "empty", textContent: e.message })); return; }
    renderPlan();
  }

  const timeRange = (c) => c.start_time + (c.end_time ? `–${c.end_time}` : "");

  function classCard(c, opts = {}) {
    const li = el("li", { className: "class-card" + (opts.now ? " now" : "") });
    li.style.setProperty("--c", c.color || DEFAULT_COLOR);
    const time = el("div", { className: "class-time" }, el("span", { textContent: c.start_time }));
    if (c.end_time) time.append(el("small", { textContent: c.end_time }));
    const main = el("div", { className: "class-main" }, el("b", { textContent: (c.icon ? c.icon + " " : "") + c.title }));
    if (c.room) main.append(el("small", { textContent: `📍 ${c.room}` }));
    li.append(el("span", { className: "class-bar" }), time, main);
    if (opts.edit) {
      // Kein sichtbarer Knopf: Gedrückt halten (oder antippen) öffnet den Eintrag, dort lässt er sich ändern oder löschen
      main.classList.add("clickable");
      main.addEventListener("click", () => openClassSheet(c));
      longPress(li, () => openClassSheet(c));
    }
    return li;
  }

  // Lücken zwischen zwei Veranstaltungen eines Tages ("frei von 10:00 bis 12:00")
  const toMin = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const durText = (m) => { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} Std. ${r} Min.` : `${h} Std.`) : `${r} Min.`; };
  const GAP_MIN = 20; // kürzere Lücken zeigt der Plan nicht an

  function gapCard(from, to, opts = {}) {
    const li = el("li", { className: "gap-card" + (opts.now ? " now" : "") });
    li.append(
      el("span", { className: "gap-time", textContent: `${from}–${to}` }),
      el("span", { className: "gap-label", textContent: `frei · ${durText(toMin(to) - toMin(from))}` }));
    return li;
  }

  // Liefert die Einträge eines Tages in Reihenfolge, mit {gap: true, from, to} dazwischen
  function withGaps(cs) {
    const out = [];
    let latestEnd = null;
    for (const c of cs) {
      if (latestEnd !== null && c.start_time) {
        const gap = toMin(c.start_time) - latestEnd;
        if (gap >= GAP_MIN) out.push({ gap: true, from: fromMin(latestEnd), to: c.start_time });
      }
      out.push(c);
      if (c.end_time) latestEnd = Math.max(latestEnd === null ? 0 : latestEnd, toMin(c.end_time));
      else if (c.start_time) latestEnd = Math.max(latestEnd === null ? 0 : latestEnd, toMin(c.start_time));
    }
    return out;
  }

  const gapIsNow = (g) => {
    const n = new Date(); const hm = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    return hm >= g.from && hm < g.to;
  };

  const isNow = (c) => {
    if (c.weekday !== weekdayOf(new Date()) || !c.end_time) return false;
    const n = new Date(); const hm = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    return hm >= c.start_time && hm <= c.end_time;
  };

  function renderPlan() {
    const byDay = (d) => planState.classes.filter((c) => c.weekday === d);
    const pills = $("plan-days");
    pills.hidden = planState.mode === "week";
    pills.replaceChildren();
    for (let d = 1; d <= 7; d++) {
      const n = byDay(d).length;
      const b = el("button", { type: "button", className: "pill" + (d === planState.day ? " active" : "") + (d === weekdayOf(new Date()) ? " today" : "") },
        el("span", { textContent: DAY_SHORT[d] }), el("small", { textContent: n ? `${n}×` : "" }));
      b.addEventListener("click", () => { planState.day = d; renderPlan(); });
      pills.append(b);
    }
    const list = $("plan-list");
    list.replaceChildren();
    const opts = (c) => ({ edit: true, now: isNow(c) });
    if (planState.mode === "day") {
      const todayView = planState.day === weekdayOf(new Date());
      withGaps(byDay(planState.day)).forEach((c, i) => {
        const li = c.gap ? gapCard(c.from, c.to, { now: todayView && gapIsNow(c) }) : classCard(c, opts(c));
        li.style.animationDelay = `${i * 40}ms`; list.append(li);
      });
    } else {
      for (let d = 1; d <= 7; d++) {
        const cs = byDay(d);
        if (!cs.length) continue;
        list.append(el("li", { className: "week-day", textContent: DAY_LONG[d] }));
        withGaps(cs).forEach((c) => list.append(c.gap ? gapCard(c.from, c.to, { now: d === weekdayOf(new Date()) && gapIsNow(c) }) : classCard(c, opts(c))));
      }
    }
    const empty = $("plan-empty");
    const nothing = planState.classes.length === 0;
    const dayEmpty = planState.mode === "day" && !byDay(planState.day).length;
    empty.hidden = !(nothing || dayEmpty);
    empty.textContent = nothing
      ? "Noch kein Stundenplan. Tippe unten auf „Eintrag“ oder oben auf „Aus Foto“, um ihn aus einem Screenshot zu übernehmen."
      : `Am ${DAY_LONG[planState.day]} hast du frei.`;
  }

  document.querySelectorAll("[data-pmode]").forEach((b) => b.addEventListener("click", () => {
    planState.mode = b.dataset.pmode;
    document.querySelectorAll("[data-pmode]").forEach((x) => x.classList.toggle("active", x === b));
    renderPlan();
  }));

  function renderTodayClasses(classes) {
    const today = classes.filter((c) => c.weekday === weekdayOf(new Date()));
    $("today-classes-card").hidden = today.length === 0;
    $("today-classes").replaceChildren(...withGaps(today).map((c) => (c.gap ? gapCard(c.from, c.to, { now: gapIsNow(c) }) : classCard(c, { now: isNow(c) }))));
  }

  // Eintrag anlegen/ändern
  buildSwatches($("c-colors"), "ccolor");

  function openClassSheet(c = null, preset = {}) {
    $("class-sheet").reset();
    editingClass = c;
    $("c-heading").textContent = c ? "Eintrag bearbeiten" : "Neuer Eintrag";
    $("c-day").value = String(c ? c.weekday : preset.weekday || planState.day);
    if (c) { $("c-title").value = c.title; $("c-start").value = c.start_time; $("c-end").value = c.end_time || ""; $("c-room").value = c.room || ""; }
    selectColor($("c-colors"), "ccolor", c ? c.color || DEFAULT_COLOR : PALETTE[planState.classes.length % PALETTE.length]);
    $("c-delete").hidden = !c;
    $("c-error").hidden = true;
    $("sheet-backdrop").hidden = false;
    $("class-sheet").hidden = false;
    setTimeout(() => $("c-title").focus(), 50);
  }
  $("plan-fab").addEventListener("click", () => openClassSheet());
  $("c-cancel").addEventListener("click", closeSheet);

  $("class-sheet").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      title: $("c-title").value.trim(),
      weekday: Number($("c-day").value),
      start_time: $("c-start").value,
      end_time: $("c-end").value || null,
      room: $("c-room").value.trim(),
      color: ($("c-colors").querySelector("input:checked") || {}).value || DEFAULT_COLOR,
      icon: editingClass ? editingClass.icon || "" : "",
    };
    if (body.end_time && body.end_time < body.start_time) { $("c-error").textContent = "Die Endzeit liegt vor dem Beginn."; $("c-error").hidden = false; return; }
    try {
      if (editingClass) await api(`/api/timetable/${editingClass.id}`, { method: "PUT", body });
      else await api("/api/timetable", { method: "POST", body });
      planState.day = body.weekday;
      closeSheet();
      loadPlan();
      renderToday();
    } catch (err) { $("c-error").textContent = err.message; $("c-error").hidden = false; }
  });

  $("c-delete").addEventListener("click", () => { if (editingClass) deleteClass(editingClass, true); });

  async function deleteClass(c, fromSheet = false) {
    if (!confirm(`„${c.title}" (${DAY_LONG[c.weekday]} ${timeRange(c)}) aus dem Stundenplan löschen?`)) return;
    try {
      await api(`/api/timetable/${c.id}`, { method: "DELETE" });
      if (fromSheet) closeSheet();
      loadPlan();
      renderToday();
    } catch (e) { alert(e.message); }
  }

  // ---------- Bild-Import ----------
  const IMG_MAX_WIDTH = 1600, SLICE_HEIGHT = 2200, SLICE_OVERLAP = 120, MAX_FILES = 5, MAX_PIECES = 8;
  let impSession = 0;      // wird beim Schließen erhöht; laufende Analysen werden dann verworfen
  let impMode = "events";
  let impFiles = [];
  let impResult = null;    // { events, classes } nach der Analyse

  const IMP_TEXT = {
    events: ["Termine aus Bild", "Screenshot oder Foto mit Terminen, z. B. Klausurtermine aus dem Skript. Die KI schlägt Termine für den Kalender vor, du bestätigst."],
    timetable: ["Stundenplan aus Bild", "Screenshot oder Foto eines Stundenplans. Die KI schlägt die wöchentlichen Veranstaltungen vor, du bestätigst."],
  };
  function setImpMode(mode) {
    impMode = mode;
    document.querySelectorAll("[data-imode]").forEach((b) => b.classList.toggle("active", b.dataset.imode === mode));
    $("imp-title").textContent = IMP_TEXT[mode][0];
    $("imp-lead").textContent = IMP_TEXT[mode][1];
  }
  document.querySelectorAll("[data-imode]").forEach((b) => b.addEventListener("click", () => setImpMode(b.dataset.imode)));

  function currentTabName() { const a = document.querySelector(".tabbar button.active"); return a ? a.dataset.tab : "today"; }

  function openImport(mode, files = []) {
    impSession++;
    impFiles = [];
    impResult = null;
    $("import-sheet").reset();
    setImpMode(mode || "events");
    $("imp-mode").hidden = !!mode; // Auswahl nur, wenn das Bild von einer anderen Seite kommt
    impTextMode = false;
    $("imp-textbox").hidden = true;
    $("imp-select").hidden = false;
    $("imp-review").hidden = true;
    $("imp-error").hidden = true;
    $("imp-status").textContent = "";
    $("imp-submit").textContent = "Analysieren";
    $("imp-submit").disabled = true;
    addImportFiles(files);
    $("sheet-backdrop").hidden = false;
    $("import-sheet").hidden = false;
  }
  $("plan-import").addEventListener("click", () => openImport("timetable"));

  // ---------- Termine aus Text (eingefügt oder per iPhone-Kurzbefehl übergeben) ----------
  let impTextMode = false;
  function openImportText(prefill = "", auto = false) {
    openImport("events");
    impTextMode = true;
    $("imp-title").textContent = "Termine aus Text";
    $("imp-lead").textContent = "Füge Text mit Terminen ein, z. B. aus einer E-Mail oder Nachricht. Die KI schlägt die Termine vor, du bestätigst.";
    $("imp-select").hidden = true;
    $("imp-textbox").hidden = false;
    $("imp-text").value = prefill;
    $("imp-submit").disabled = !prefill.trim();
    if (auto && prefill.trim()) analyzeText();
    else setTimeout(() => $("imp-text").focus(), 50);
  }
  $("cal-text").addEventListener("click", () => openImportText());
  $("imp-text").addEventListener("input", () => { if (!impResult) $("imp-submit").disabled = !$("imp-text").value.trim(); });
  $("imp-paste").addEventListener("click", async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { $("imp-text").value = t.slice(0, 5000); $("imp-submit").disabled = false; }
    } catch { showToast("Einfügen nicht erlaubt. Halte im Feld gedrückt und wähle „Einsetzen“."); }
  });

  async function analyzeText() {
    const session = ++impSession;
    const text = $("imp-text").value.trim();
    if (!text) return;
    $("imp-error").hidden = true;
    $("imp-submit").disabled = true;
    $("imp-status").textContent = "KI liest den Text …";
    try {
      const res = await api("/api/import/text", { method: "POST", body: { text } });
      if (session !== impSession) return;
      $("imp-status").textContent = "";
      if (!res.events.length) {
        $("imp-error").textContent = "In diesem Text wurde kein Termin erkannt.";
        $("imp-error").hidden = false;
        $("imp-submit").disabled = false;
        return;
      }
      $("imp-textbox").hidden = true;
      showReview(res, res.remarks);
    } catch (e) {
      if (session !== impSession) return;
      $("imp-status").textContent = "";
      $("imp-error").textContent = e.message;
      $("imp-error").hidden = false;
      $("imp-submit").disabled = false;
    }
  }

  // Vom Kurzbefehl übergebener Text (#text=… wird nie an den Server geschickt)
  function takeSharedText() {
    const m = location.hash.match(/^#text=([\s\S]*)$/);
    if (!m) return;
    let text = m[1];
    try { text = decodeURIComponent(text); } catch { /* schon lesbar */ }
    window.history.replaceState(null, "", location.pathname + location.search);
    if (text.trim()) { showTab("calendar"); openImportText(text.slice(0, 5000), true); }
  }
  $("shortcut-url").textContent = `${location.origin}${location.pathname}#text=`;
  $("cal-import").addEventListener("click", () => openImport("events"));
  $("imp-cancel").addEventListener("click", closeSheet);

  function renderThumbs() {
    const box = $("imp-thumbs");
    box.replaceChildren();
    impFiles.forEach((f, i) => {
      const img = el("img", { alt: f.name || "Bild", src: URL.createObjectURL(f) });
      img.onload = () => URL.revokeObjectURL(img.src);
      const x = el("button", { type: "button", textContent: "✕", ariaLabel: "Bild entfernen" });
      x.addEventListener("click", () => { impFiles.splice(i, 1); renderThumbs(); });
      box.append(el("div", { className: "thumb" }, img, x));
    });
    $("imp-submit").disabled = impFiles.length === 0;
  }

  function addImportFiles(files) {
    const imgs = [...files].filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    impFiles = [...impFiles, ...imgs].slice(0, MAX_FILES);
    $("imp-error").hidden = true;
    renderThumbs();
  }
  $("imp-file").addEventListener("change", (e) => { addImportFiles(e.target.files); e.target.value = ""; });

  // Ziehen auf die Auswahlfläche, auf die ganze Seite und Einfügen aus der Zwischenablage
  const dz = $("imp-drop");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove("drag"); $("drop-overlay").hidden = true; addImportFiles(e.dataTransfer.files); });

  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  const appVisible = () => !$("app").hidden;
  window.addEventListener("dragover", (e) => {
    if (!appVisible() || !hasFiles(e)) return;
    e.preventDefault(); // verhindert, dass der Browser das Bild als Seite öffnet
    if ($("import-sheet").hidden) $("drop-overlay").hidden = false;
  });
  window.addEventListener("dragleave", (e) => { if (!e.relatedTarget) $("drop-overlay").hidden = true; });
  window.addEventListener("drop", (e) => {
    $("drop-overlay").hidden = true;
    if (!appVisible() || !hasFiles(e)) return;
    e.preventDefault();
    if (!$("import-sheet").hidden) { addImportFiles(e.dataTransfer.files); return; }
    const tab = currentTabName();
    openImport(tab === "plan" ? "timetable" : tab === "calendar" ? "events" : null, e.dataTransfer.files);
  });
  document.addEventListener("paste", (e) => {
    if (!appVisible() || !e.clipboardData) return;
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    if ($("import-sheet").hidden) { const tab = currentTabName(); openImport(tab === "plan" ? "timetable" : tab === "calendar" ? "events" : null, files); }
    else addImportFiles(files);
  });

  // Bild verkleinern (spart Datenmenge und KI-Kosten). Sehr lange Screenshots werden in überlappende Abschnitte geteilt.
  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

  async function fileToPieces(file) {
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { throw new Error(`„${file.name || "Bild"}" kann nicht gelesen werden (Format?). Bitte als JPG oder PNG versuchen.`); }
    const scale = Math.min(1, IMG_MAX_WIDTH / bmp.width);
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const pieces = [];
    for (let y = 0; y < h; y += SLICE_HEIGHT - SLICE_OVERLAP) {
      const sh = Math.min(SLICE_HEIGHT, h - y);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = sh;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, sh);
      ctx.drawImage(bmp, 0, y / scale, bmp.width, sh / scale, 0, 0, w, sh);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
      pieces.push(await blobToBase64(blob));
      if (y + sh >= h) break;
    }
    if (bmp.close) bmp.close();
    return pieces;
  }

  const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  function eventSummary(ev) {
    const d = parseIso(ev.start_date);
    const fmt = (x) => `${WEEKDAYS[x.getDay()].slice(0, 2)}, ${x.getDate()}. ${MONTH_SHORT[x.getMonth()]} ${x.getFullYear()}`;
    let when = fmt(d);
    if (ev.end_date && ev.end_date !== ev.start_date) when += ` – ${fmt(parseIso(ev.end_date))}`;
    if (ev.start_time) when += ` · ${ev.start_time}${ev.end_time ? `–${ev.end_time}` : ""}`;
    return when + (ev.note ? ` · ${ev.note}` : "") + (ev.past ? " · liegt in der Vergangenheit" : "");
  }

  function propRow(listEl, title, sub, checked, past) {
    const input = el("input", { type: "checkbox", checked });
    const main = el("span", { className: "prop-main" }, el("b", { textContent: title }), el("small", { textContent: sub }));
    const li = el("li", { className: past ? "past" : "" }, el("label", {}, input, main));
    input.addEventListener("change", updateCommitButton);
    listEl.append(li);
    return input;
  }

  function updateCommitButton() {
    const n = [...document.querySelectorAll("#imp-review input:checked")].length;
    $("imp-submit").textContent = n ? `Übernehmen (${n})` : "Nichts ausgewählt";
    $("imp-submit").disabled = n === 0;
  }

  // Stundenplan-Vorschlag direkt bearbeitbar: Titel, Tag, Zeiten und Raum; geändert wird das Objekt in impResult.classes
  function classEditRow(c) {
    const check = el("input", { type: "checkbox", checked: true, ariaLabel: "Übernehmen" });
    check.addEventListener("change", updateCommitButton);
    const title = el("input", { type: "text", value: c.title, placeholder: "Titel", ariaLabel: "Titel", className: "pe-title", maxLength: 120 });
    title.addEventListener("input", () => { c.title = title.value; });
    const day = el("select", { ariaLabel: "Wochentag" });
    for (let d = 1; d <= 7; d++) day.append(el("option", { value: String(d), textContent: DAY_SHORT[d], selected: d === c.weekday }));
    day.addEventListener("change", () => { c.weekday = Number(day.value); });
    const start = el("input", { type: "time", value: c.start_time || "", ariaLabel: "Beginn" });
    start.addEventListener("input", () => { c.start_time = start.value; });
    const end = el("input", { type: "time", value: c.end_time || "", ariaLabel: "Ende" });
    end.addEventListener("input", () => { c.end_time = end.value || null; });
    const room = el("input", { type: "text", value: c.room || "", placeholder: "Raum", ariaLabel: "Raum", className: "pe-room", maxLength: 80 });
    room.addEventListener("input", () => { c.room = room.value; });
    const li = el("li", { className: "prop-edit" },
      el("div", { className: "pe-top" }, check, title),
      el("div", { className: "pe-row" }, day, start, end, room));
    return { li, check };
  }

  function addClassRow(c) {
    const row = classEditRow(c);
    $("imp-classes").append(row.li);
    impResult.classes.push(c);
    impResult.inputs.classes.push(row.check);
    return row;
  }

  $("imp-add-class").addEventListener("click", () => {
    if (!impResult) return;
    const row = addClassRow({ title: "", weekday: 1, start_time: "08:00", end_time: "10:00", room: "", color: DEFAULT_COLOR, icon: "" });
    updateCommitButton();
    row.li.scrollIntoView({ block: "center", behavior: "smooth" });
    row.li.querySelector(".pe-title").focus();
  });

  function showReview(result, remarks) {
    impResult = { events: result.events, classes: [], inputs: { events: [], classes: [] } };
    $("imp-events").replaceChildren(); $("imp-classes").replaceChildren();
    result.events.forEach((ev) => impResult.inputs.events.push(propRow($("imp-events"), `${ev.icon ? ev.icon + " " : ""}${ev.title}`, eventSummary(ev), !ev.past, ev.past)));
    result.classes.forEach((c) => addClassRow(c));
    $("imp-events-head").hidden = !result.events.length;
    const showClasses = result.classes.length > 0 || impMode === "timetable";
    $("imp-classes-head").hidden = !showClasses;
    $("imp-add-class").hidden = !showClasses;
    $("imp-remarks").textContent = remarks ? `Hinweis der KI: ${remarks}` : "";
    $("imp-remarks").hidden = !remarks;
    $("imp-select").hidden = true;
    $("imp-review").hidden = false;
    $("imp-status").textContent = result.classes.length
      ? "Prüfe die Vorschläge. Du kannst Titel, Tag, Zeiten und Raum direkt ändern, abwählen oder fehlende Blöcke ergänzen."
      : "Prüfe die Vorschläge und wähle ab, was nicht stimmt.";
    updateCommitButton();
  }

  async function analyzeImages() {
    const session = ++impSession;
    const err = (m) => { $("imp-error").textContent = m; $("imp-error").hidden = false; };
    $("imp-error").hidden = true;
    $("imp-submit").disabled = true;
    try {
      $("imp-status").textContent = "Bilder werden vorbereitet …";
      const pieces = [];
      for (const f of impFiles) pieces.push(...(await fileToPieces(f)));
      if (pieces.length > MAX_PIECES) throw new Error("Die Bilder sind zu lang oder zu viele. Bitte zuschneiden oder weniger Bilder wählen.");
      const merged = { events: [], classes: [], remarks: [] };
      const seen = new Set();
      for (let i = 0; i < pieces.length; i++) {
        $("imp-status").textContent = `KI liest Bild ${i + 1} von ${pieces.length} … (das kann bis zu einer Minute dauern)`;
        const res = await api("/api/import/analyze", { method: "POST", body: { image: pieces[i], mime: "image/jpeg", mode: impMode } });
        if (session !== impSession) return; // inzwischen geschlossen oder neu gestartet
        for (const ev of res.events) { const k = `e|${ev.title.toLowerCase()}|${ev.start_date}|${ev.start_time}`; if (!seen.has(k)) { seen.add(k); merged.events.push(ev); } }
        for (const c of res.classes) { const k = `c|${c.title.toLowerCase()}|${c.weekday}|${c.start_time}`; if (!seen.has(k)) { seen.add(k); merged.classes.push(c); } }
        if (res.remarks) merged.remarks.push(res.remarks);
      }
      if (!merged.events.length && !merged.classes.length) {
        $("imp-status").textContent = "";
        err("Es wurden keine Termine oder Stundenplan-Einträge erkannt. Versuche einen anderen Modus oder ein schärferes, näheres Bild.");
        $("imp-submit").disabled = false;
        return;
      }
      showReview(merged, merged.remarks.join(" "));
    } catch (e) {
      if (session !== impSession) return;
      $("imp-status").textContent = "";
      err(e.message);
      $("imp-submit").disabled = impFiles.length === 0;
    }
  }

  async function commitImport() {
    const pick = (items, inputs) => items.filter((_, i) => inputs[i].checked);
    const events = pick(impResult.events, impResult.inputs.events).map(({ kind, past, ...ev }) => ev); // KI-Hilfsfelder entfernen
    const classes = pick(impResult.classes, impResult.inputs.classes).map((c) => ({ ...c, title: c.title.trim(), room: (c.room || "").trim() }));
    const bad = classes.find((c) => !c.title || !c.start_time || (c.end_time && c.end_time < c.start_time));
    if (bad) {
      $("imp-error").textContent = !bad.title ? "Ein Stundenplan-Eintrag hat keinen Titel." : !bad.start_time ? `„${bad.title}": Beginn fehlt.` : `„${bad.title}": Die Endzeit liegt vor dem Beginn.`;
      $("imp-error").hidden = false;
      return;
    }
    $("imp-error").hidden = true;
    $("imp-submit").disabled = true;
    try {
      const res = await api("/api/import/commit", { method: "POST", body: { events, classes } });
      closeSheet();
      const parts = [];
      if (res.events) parts.push(`${res.events} Termin${res.events === 1 ? "" : "e"}`);
      if (res.classes) parts.push(`${res.classes} ${res.classes === 1 ? "Stundenplan-Eintrag" : "Stundenplan-Einträge"}`);
      showToast(`${parts.join(" und ")} übernommen.`);
      refreshData();
      loadPlan();
    } catch (e) { $("imp-error").textContent = e.message; $("imp-error").hidden = false; $("imp-submit").disabled = false; }
  }

  $("import-sheet").addEventListener("submit", (e) => {
    e.preventDefault();
    if (impResult) commitImport(); else if (impTextMode) analyzeText(); else if (impFiles.length) analyzeImages();
  });

  // ---------- Börse ----------
  const mk = { watch: [], quotes: {}, series: {}, indices: [], available: true, brief: null, briefErr: "", loadedAt: 0, searchTimer: null, searchSeq: 0 };

  function fmtPrice(p, cur) {
    if (p == null) return "–";
    try { return new Intl.NumberFormat("de-DE", { style: "currency", currency: cur || "USD" }).format(p); }
    catch { return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p) + (cur ? ` ${cur}` : ""); }
  }
  const fmtPct = (v) => (v == null ? "" : `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")} %`);
  const pctClass = (v) => (v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "");
  const hm = (ts) => { const d = new Date(ts * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  // Watchlist und Kurse; höchstens alle 60 Sekunden neu (außer `force`)
  async function loadMarket(force = false) {
    if (!force && Date.now() - mk.loadedAt < 60000) { renderMarket(); return; }
    mk.loadedAt = Date.now();
    try { mk.watch = await api("/api/watchlist"); } catch { mk.watch = []; }
    try { const q = await api("/api/market/quotes"); mk.available = q.available; mk.quotes = q.quotes || {}; mk.series = q.series || {}; }
    catch { mk.available = false; mk.quotes = {}; mk.series = {}; }
    renderMarket();
    try { const o = await api("/api/market/overview"); mk.indices = o.available ? o.indices : []; } catch { mk.indices = []; }
    renderIndices();
  }

  // Kleine Verlaufskurve (SVG); grün, wenn der letzte Wert über dem ersten liegt
  function sparkline(values, w = 80, h = 24) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("class", "spark");
    svg.setAttribute("aria-hidden", "true");
    if (!values || values.length < 2) return svg;
    const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - 2 - (v - lo) / span * (h - 4)).toFixed(1)}`);
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute("points", pts.join(" "));
    line.setAttribute("class", values[values.length - 1] >= values[0] ? "up" : "down");
    svg.append(line);
    return svg;
  }

  function renderIndices() {
    const tiles = (big) => (mk.indices || []).map((ix) => el("div", { className: "ix" },
      el("span", { className: "ix-name", textContent: ix.name }),
      el("b", { className: `ix-pct ${pctClass(ix.change_pct)}`, textContent: ix.change_pct == null ? "–" : fmtPct(ix.change_pct) }),
      sparkline(ix.series, big ? 120 : 80, big ? 34 : 24)));
    $("mc-indices").replaceChildren(...tiles(false));
    $("mb-indices").replaceChildren(...tiles(true));
    $("mc-indices").hidden = $("mb-indices").hidden = !(mk.indices || []).length;
  }

  // Briefing des Tages (wird beim ersten Abruf des Tages von der KI erstellt)
  async function loadBriefing(force = false) {
    if (!force && mk.brief && !mk.brief.stale && mk.brief.day === iso(new Date())) { renderBrief(); return; }
    try { mk.brief = await api("/api/market/briefing"); mk.briefErr = ""; } catch (e) { mk.brief = null; mk.briefErr = e.message; }
    renderBrief();
  }

  function quoteBits(w) {
    const q = mk.quotes[w.symbol] || {};
    if (q.error) return { price: null, pct: null, cur: w.currency };
    // Dollar-Kurse in Euro anzeigen (vom Server umgerechnet)
    return q.price_eur != null ? { price: q.price_eur, pct: q.change_pct, cur: "EUR" } : { price: q.price, pct: q.change_pct, cur: q.currency || w.currency };
  }

  function renderMarket() {
    const list = $("watch-list");
    list.replaceChildren(...mk.watch.map((w) => {
      const b = quoteBits(w);
      const li = el("li", { className: "watch-row" },
        el("span", { className: "watch-main" }, el("b", { textContent: w.name || w.symbol }), el("small", { textContent: [w.symbol, w.exchange].filter(Boolean).join(" · ") })),
        sparkline((mk.series || {})[w.symbol], 64, 24),
        el("span", { className: "watch-quote" }, el("b", { textContent: b.price == null ? (mk.available ? "Kurs nicht verfügbar" : "–") : fmtPrice(b.price, b.cur) }),
          el("small", { className: pctClass(b.pct), textContent: fmtPct(b.pct) })));
      longPress(li, async () => {
        if (!confirm(`„${w.name || w.symbol}" aus der Watchlist entfernen?`)) return;
        try { await api(`/api/watchlist/${w.id}`, { method: "DELETE" }); } catch (e) { showToast(e.message); }
        loadMarket(true);
      });
      return li;
    }));
    if (!mk.watch.length) list.append(el("li", { className: "empty", textContent: "Noch keine Titel. Tippe auf „+ Titel“, um Aktien oder ETFs hinzuzufügen." }));
  }

  const KIND_LABEL = { fed: "Fed", earnings: "Zahlen", data: "Daten", other: "Termin" };
  const shortDay = (isoDate) => { const d = parseIso(isoDate); return { wd: WEEKDAYS[d.getDay()].slice(0, 2), dm: `${d.getDate()}.${d.getMonth() + 1}.` }; };

  const logoColor = (name) => PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  function moverRow(m, compact, maxAbs = 1) {
    const logo = el("span", { className: "mv-logo", textContent: (m.name || "?").charAt(0).toUpperCase() });
    logo.style.setProperty("--c", logoColor(m.name || "?"));
    const pill = el("span", { className: `pct-pill ${pctClass(m.change_pct)}`, textContent: fmtPct(m.change_pct) });
    const main = el("span", { className: "mv-main" }, el("b", { textContent: m.name }));
    if (!compact && m.reason) main.append(el("small", { textContent: m.reason }));
    const li = el("li", { className: "mv-row" }, el("span", { className: "mv-top" }, logo, main, pill));
    if (!compact) {
      const bar = el("span", { className: `mv-bar ${pctClass(m.change_pct)}` });
      bar.style.width = `${Math.max(8, Math.abs(m.change_pct) / maxAbs * 100)}%`;
      li.append(el("span", { className: "mv-track" }, bar));
    }
    return li;
  }
  const MOOD = { "-2": "Risk-off", "-1": "Vorsichtig", "0": "Neutral", "1": "Freundlich", "2": "Risk-on" };
  const NEWS_CAT = { politik: "Politik", zahlen: "Zahlen", fed: "Fed", konjunktur: "Konjunktur", sonstiges: "Markt" };
  const daysUntil = (isoDate) => Math.round((parseIso(isoDate) - parseIso(iso(new Date()))) / 86400000);
  const countdown = (n) => (n <= 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`);

  function renderBrief() {
    const r = mk.brief;
    const b = r && r.brief;
    const fail = mk.briefErr || "Briefing gerade nicht verfügbar.";
    const mood = b && typeof b.stimmung === "number" ? b.stimmung : null;
    const moodClass = mood == null ? "" : mood < 0 ? "down" : mood > 0 ? "up" : "";
    const news = b ? b.news.map((n) => (typeof n === "string" ? { text: n, cat: "sonstiges" } : n)) : [];
    const maxAbs = b && b.movers.length ? Math.max(...b.movers.map((m) => Math.abs(m.change_pct))) || 1 : 1;
    // Heute-Karte
    $("mc-mood").hidden = mood == null;
    if (mood != null) {
      $("mc-mood-label").textContent = MOOD[String(mood)];
      $("mc-mood-label").className = moodClass;
      $("mc-mood-fill").style.width = `${(mood + 2) / 4 * 80 + 12}%`;
      $("mc-mood-fill").className = moodClass;
    }
    $("mc-lage").textContent = b ? b.lage : fail;
    $("mc-movers").replaceChildren(...(b ? b.movers.slice(0, 1).map((m) => moverRow(m, true)) : []));
    const next = b && b.upcoming[0];
    $("mc-next").hidden = !next;
    if (next) { const d = shortDay(next.date); $("mc-next").textContent = `${d.wd} ${d.dm} · ${next.label} · ${countdown(daysUntil(next.date))}`; }
    // Börsen-Seite
    $("mb-stamp").textContent = !r ? "" : r.stale ? "Briefing von gestern" : `Stand heute, ${hm(r.created_at)} Uhr`;
    $("mb-lage").textContent = b ? b.lage : fail;
    $("mb-mood").hidden = mood == null;
    if (mood != null) {
      $("mb-mood-knob").style.left = `${(mood + 2) / 4 * 100}%`;
      $("mb-mood-label").textContent = MOOD[String(mood)];
      $("mb-mood-label").className = moodClass;
    }
    $("mb-note").hidden = !(r && r.stale);
    $("mb-note").textContent = "Das heutige Briefing konnte gerade nicht erstellt werden. Versuche es später mit „Neu laden“.";
    $("mb-movers").replaceChildren(...(b ? b.movers.map((m) => moverRow(m, false, maxAbs)) : []));
    $("mb-news").replaceChildren(...news.map((n, i) => el("li", {},
      el("span", { className: "news-no", textContent: String(i + 1) }),
      el("span", { className: "news-body" },
        el("span", { className: `news-cat cat-${n.cat}`, textContent: NEWS_CAT[n.cat] || "Markt" }),
        el("span", { className: "news-text", textContent: n.text })))));
    $("mb-upcoming").replaceChildren(...(b ? b.upcoming.map((u, i) => {
      const d = shortDay(u.date);
      return el("li", { className: "tl-item" + (i === 0 ? " next" : "") },
        el("span", { className: `tl-dot kind-${u.kind}` }),
        el("span", { className: "tl-body" },
          el("span", { className: "tl-top" }, el("b", { textContent: u.label }), el("small", { className: "tl-count", textContent: countdown(daysUntil(u.date)) })),
          el("small", { className: "tl-meta", textContent: `${d.wd} ${d.dm} · ${KIND_LABEL[u.kind] || "Termin"}` })));
    }) : []));
    for (const [id, list] of [["mb-movers", b && b.movers], ["mb-news", news], ["mb-upcoming", b && b.upcoming]]) {
      const empty = !list || !list.length;
      $(id).hidden = empty;
      $(`${id}-head`).hidden = empty;
    }
    const wait = r && !r.stale ? r.created_at + 3600 - Date.now() / 1000 : 0;
    $("mb-refresh").disabled = wait > 0;
    $("mb-refresh").textContent = wait > 0 ? `Neu ab ${hm(r.created_at + 3600)}` : "Neu laden";
  }

  $("mb-refresh").addEventListener("click", async () => {
    $("mb-refresh").disabled = true;
    $("mb-lage").textContent = "Briefing wird erstellt …";
    try { mk.brief = await api("/api/market/briefing/refresh", { method: "POST" }); mk.briefErr = ""; }
    catch (e) { showToast(e.message); }
    renderBrief();
  });

  // „+ Titel“ klappt die Suche auf und zu
  $("watch-add-btn").addEventListener("click", () => {
    const open = $("watch-add").hidden;
    $("watch-add").hidden = !open;
    $("watch-add-btn").setAttribute("aria-expanded", String(open));
    $("watch-add-btn").textContent = open ? "Fertig" : "+ Titel";
    if (open) setTimeout(() => $("watch-q").focus(), 50);
  });

  // Suche: während des Tippens Vorschläge (nur Titel mit Kursen im kostenlosen Tarif)
  $("watch-q").addEventListener("input", () => {
    clearTimeout(mk.searchTimer);
    const q = $("watch-q").value.trim();
    if (!q) { $("watch-results").replaceChildren(); return; }
    mk.searchTimer = setTimeout(async () => {
      const seq = ++mk.searchSeq;
      let hits = [];
      try { hits = await api(`/api/market/search?q=${encodeURIComponent(q)}`); }
      catch (e) { if (seq === mk.searchSeq) $("watch-results").replaceChildren(el("li", { className: "muted", textContent: e.message })); return; }
      if (seq !== mk.searchSeq) return; // inzwischen weitergetippt
      $("watch-results").replaceChildren(...hits.map((h) => {
        const b = el("button", { type: "button" }, el("b", { textContent: h.name || h.symbol }), el("small", { textContent: ` ${h.symbol} · ${h.exchange}` }));
        b.addEventListener("click", () => addWatch(h));
        return el("li", {}, b);
      }));
      if (!hits.length) $("watch-results").append(el("li", { className: "muted", textContent: "Nichts gefunden (nur Titel mit kostenlosen Kursen)." }));
    }, 350);
  });
  $("watch-form").addEventListener("submit", (e) => e.preventDefault());

  async function addWatch(h) {
    $("watch-error").hidden = true;
    try {
      await api("/api/watchlist", { method: "POST", body: { symbol: h.symbol, name: h.name, exchange: h.exchange, currency: h.currency } });
      $("watch-q").value = "";
      $("watch-results").replaceChildren();
      showToast(`${h.name || h.symbol} hinzugefügt.`);
    } catch (e) { $("watch-error").textContent = e.message; $("watch-error").hidden = false; }
    loadMarket(true);
  }

  $("market-card").addEventListener("click", () => showTab("market"));
  $("market-card").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showTab("market"); } });
  $("market-back").addEventListener("click", () => showTab("today"));

  // ---------- Mein Bild (Figur wählen) ----------
  let myAvatar = store.get("avatar", "");
  function renderAvatarPick() {
    const box = $("avatar-pick");
    if (!window.LH_AVATARS) return;
    box.replaceChildren(...LH_AVATARS.defs.map((d) => {
      const on = d.id === myAvatar;
      const b = el("button", { type: "button", className: "avatar-opt" + (on ? " on" : ""), role: "radio", ariaLabel: `Figur ${d.name}` });
      b.setAttribute("aria-checked", String(on));
      b.append(LH_AVATARS.canvas(d.id, 96));
      b.addEventListener("click", () => chooseAvatar(on ? "" : d.id)); // nochmal antippen = wieder Buchstabe
      return b;
    }));
  }
  async function chooseAvatar(id) {
    const before = myAvatar;
    myAvatar = id; store.set("avatar", id); renderAvatarPick();
    try { await api("/api/auth/avatar", { method: "PUT", body: { avatar: id } }); }
    catch (e) { myAvatar = before; store.set("avatar", before); renderAvatarPick(); showToast(e.message); }
  }
  renderAvatarPick();

  // ---------- Freunde ----------
  const friendsState = { friends: [], incoming: [], outgoing: [] };
  let sharingFriend = null;
  const SHARE_KEYS = [["calendar", "📅"], ["timetable", "🗓️"], ["todos", "✅"]];
  const friendColor = (id) => PALETTE[id % PALETTE.length];
  const initial = (name) => (name || "?").charAt(0).toUpperCase();

  // Rundes Bild einer Person: die gewählte Figur, sonst der Anfangsbuchstabe
  function paintAvatar(node, f) {
    node.style.setProperty("--c", friendColor(f.id));
    node.replaceChildren();
    if (f.avatar && window.LH_AVATARS && LH_AVATARS.has(f.avatar)) {
      node.classList.add("pixel");
      node.append(LH_AVATARS.canvas(f.avatar, 96));
    } else {
      node.classList.remove("pixel");
      node.textContent = initial(f.username);
    }
    return node;
  }
  function avatar(f) { return paintAvatar(el("span", { className: "friend-avatar" }), f); }

  async function loadFriends() {
    try { Object.assign(friendsState, await api("/api/friends")); } catch { return; }
    const n = friendsState.incoming.length;
    $("friends-badge").textContent = String(n);
    $("friends-badge").hidden = n === 0;
    if ($("view-friends").classList.contains("active")) renderFriends();
    const before = JSON.stringify(activeIds);
    renderFriendBubbles();
    if ($("view-calendar").classList.contains("active") && JSON.stringify(activeIds) !== before) loadMonth();
  }

  // Eingeblendet sind nur Freunde, die (noch) ihren Kalender teilen
  let activeIds = [];
  const calendarSharers = () => friendsState.friends.filter((f) => f.they_share.calendar);
  const activeOverlay = () => calendarSharers().filter((f) => store.get("overlay", []).includes(f.id));

  function renderFriendBubbles() {
    const sharers = calendarSharers();
    activeIds = activeOverlay().map((f) => f.id);
    const box = $("cal-friends");
    box.hidden = sharers.length === 0;
    box.replaceChildren(...sharers.map((f) => {
      const on = activeIds.includes(f.id);
      const b = el("button", { type: "button", className: "bubble" + (on ? " on" : ""), title: f.username, ariaLabel: `${f.username} ${on ? "ausblenden" : "einblenden"}` },
        paintAvatar(el("span", { className: "bubble-dot" }), f), el("small", { textContent: f.username }));
      b.setAttribute("aria-pressed", String(on));
      b.style.setProperty("--c", friendColor(f.id));
      b.addEventListener("click", () => {
        const ids = activeIds.includes(f.id) ? activeIds.filter((x) => x !== f.id) : [...activeIds, f.id];
        store.set("overlay", ids); // nicht mehr teilende Freunde fallen dabei heraus
        renderFriendBubbles();
        loadMonth();
      });
      return b;
    }));
  }

  // Aktion ausführen, Fehler im Freunde-Bereich anzeigen, danach Liste neu laden
  async function friendCall(path, opts) {
    $("friend-error").hidden = true;
    try { await api(path, opts); } catch (e) { $("friend-error").textContent = e.message; $("friend-error").hidden = false; }
    loadFriends();
  }

  function friendBtn(label, cls, fn) {
    const b = el("button", { type: "button", className: `btn small ${cls}`, textContent: label });
    b.addEventListener("click", fn);
    return b;
  }

  function renderFriends() {
    const { friends, incoming, outgoing } = friendsState;
    $("friends-incoming").replaceChildren(...incoming.map((f) => el("li", { className: "friend-row" },
      avatar(f), el("b", { className: "friend-name", textContent: f.username }),
      friendBtn("Ablehnen", "ghost", () => friendCall(`/api/friends/${f.id}`, { method: "DELETE" })),
      friendBtn("Annehmen", "primary", () => friendCall(`/api/friends/${f.id}/accept`, { method: "POST" })))));
    $("friends-outgoing").replaceChildren(...outgoing.map((f) => el("li", { className: "friend-row" },
      avatar(f), el("b", { className: "friend-name", textContent: f.username }),
      friendBtn("Zurückziehen", "ghost", () => friendCall(`/api/friends/${f.id}`, { method: "DELETE" })))));
    $("friends-incoming-head").hidden = !incoming.length;
    $("friends-outgoing-head").hidden = !outgoing.length;
    $("friends-empty").hidden = friends.length > 0;
    $("friends-list").replaceChildren(...friends.map((f) => {
      const icons = el("span", { className: "friend-shares" },
        ...SHARE_KEYS.map(([k, ic]) => el("span", { className: f.they_share[k] ? "on" : "", textContent: ic, title: f.they_share[k] ? "teilt mit dir" : "teilt nicht" })));
      const gear = el("button", { type: "button", className: "friend-gear", textContent: "⚙️", ariaLabel: `Freigaben für ${f.username}` });
      gear.addEventListener("click", (e) => { e.stopPropagation(); openShareSheet(f); });
      const li = el("li", { className: "friend-row clickable" }, avatar(f),
        el("span", { className: "friend-main" }, el("b", { className: "friend-name", textContent: f.username }), icons), gear);
      li.addEventListener("click", () => openFriend(f));
      longPress(li, () => openShareSheet(f), ".friend-gear");
      return li;
    }));
  }

  $("friend-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("friend-name").value.trim();
    if (!name) return;
    $("friend-error").hidden = true;
    try {
      const r = await api("/api/friends/request", { method: "POST", body: { username: name } });
      $("friend-name").value = "";
      showToast(r.status === "accepted" ? `Du bist jetzt mit ${name} befreundet.` : `Anfrage an ${name} gesendet.`);
    } catch (err) { $("friend-error").textContent = err.message; $("friend-error").hidden = false; }
    loadFriends();
  });

  function openShareSheet(f) {
    sharingFriend = f;
    $("share-heading").textContent = `Was darf ${f.username} von dir sehen?`;
    for (const [k] of SHARE_KEYS) $(`sh-${k}`).checked = !!f.i_share[k];
    $("sh-error").hidden = true;
    $("sheet-backdrop").hidden = false;
    $("share-sheet").hidden = false;
  }
  $("sh-cancel").addEventListener("click", closeSheet);
  $("share-sheet").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(SHARE_KEYS.map(([k]) => [k, $(`sh-${k}`).checked]));
    try {
      await api(`/api/friends/${sharingFriend.id}/share`, { method: "PUT", body });
      closeSheet();
      showToast("Freigaben gespeichert.");
      loadFriends();
    } catch (err) { $("sh-error").textContent = err.message; $("sh-error").hidden = false; }
  });
  $("sh-remove").addEventListener("click", async () => {
    const f = sharingFriend;
    if (!f || !confirm(`${f.username} als Freund entfernen? Ihr seht dann beide nichts mehr voneinander.`)) return;
    closeSheet();
    await friendCall(`/api/friends/${f.id}`, { method: "DELETE" });
  });

  // ---------- Ansicht eines Freundes (nur lesen) ----------
  const fv = { friend: null, section: "calendar", view: "month", planMode: "day", year: 0, month: 0, selected: "", day: 1, events: [], classes: [] };

  function openFriend(f) {
    const t = new Date();
    Object.assign(fv, { friend: f, view: state.view, year: t.getFullYear(), month: t.getMonth(), selected: iso(t), day: weekdayOf(t), events: [], classes: [] });
    $("fv-name").textContent = f.username;
    paintAvatar($("fv-avatar"), f);
    const avail = SHARE_KEYS.map(([k]) => k).filter((k) => f.they_share[k]);
    document.querySelectorAll("[data-fview]").forEach((b) => { b.hidden = !avail.includes(b.dataset.fview); });
    $("fv-tabs").hidden = avail.length < 2;
    $("fv-empty").textContent = `${f.username} teilt noch nichts mit dir.`;
    $("fv-empty").hidden = avail.length > 0;
    for (const s of ["calendar", "timetable", "todos"]) $(`fv-${s}`).hidden = true;
    showTab("friend");
    if (avail.length) fvShow(avail.includes(fv.section) ? fv.section : avail[0]);
  }

  function fvShow(section) {
    fv.section = section;
    document.querySelectorAll("[data-fview]").forEach((b) => b.classList.toggle("active", b.dataset.fview === section));
    for (const s of ["calendar", "timetable", "todos"]) $(`fv-${s}`).hidden = s !== section;
    if (section === "calendar") fvLoadCal();
    else if (section === "timetable") fvLoadPlan();
    else fvLoadTodos();
  }
  document.querySelectorAll("[data-fview]").forEach((b) => b.addEventListener("click", () => fvShow(b.dataset.fview)));
  $("friend-back").addEventListener("click", () => showTab("friends"));

  // Freundes-Daten holen; teilt der Freund das nicht mehr, zurück zur Freundesliste
  // Antworten, die erst eintreffen, wenn schon ein anderer Freund oder eine andere Seite offen ist, werden verworfen
  const fvStale = (f) => fv.friend !== f || !$("view-friend").classList.contains("active");
  async function fvGet(path) {
    const f = fv.friend;
    try {
      const data = await api(`/api/friends/${f.id}${path}`);
      return fvStale(f) ? null : data;
    } catch (e) {
      if (fvStale(f)) return null;
      if (e.status === 404) { showToast(`${f.username} teilt das nicht mehr mit dir.`); loadFriends(); showTab("friends"); }
      else showToast(e.message);
      return null;
    }
  }

  async function fvLoadCal() {
    const { start, end } = gridRange(fv);
    const evs = await fvGet(`/events?from=${iso(start)}&to=${iso(end)}`);
    if (!evs) return;
    fv.events = evs;
    fvRenderCal();
  }

  function fvRenderCal() {
    const { start, end, days } = gridRange(fv);
    const week = fv.view === "week";
    $("fv-cal-title").textContent = week ? `${shortDate(iso(start))} – ${shortDate(iso(end))}` : `${MONTHS[fv.month]} ${fv.year}`;
    document.querySelectorAll("[data-fcview]").forEach((b) => b.classList.toggle("active", b.dataset.fcview === fv.view));
    paintGrid($("fv-grid"), { start, days, week, month: fv.month, events: fv.events, todos: [], selected: fv.selected });
    fvRenderDay();
  }

  function friendEventItem(ev, ownerName, day, badgeFriend = null) {
    const color = el("span", { className: "event-color" });
    color.style.setProperty("--c", ev.color || DEFAULT_COLOR);
    const main = el("div", { className: "event-main clickable" }, el("b", { textContent: (ev.icon ? ev.icon + " " : "") + ev.title }));
    const li = el("li", { className: "friend-event" + (badgeFriend ? " overlay" : "") }, color, el("span", { className: "event-time", textContent: timeLabel(ev, day) }), main);
    if (badgeFriend) {
      const mini = paintAvatar(el("span", { className: "friend-mini", title: ownerName }), badgeFriend);
      li.append(mini);
    }
    li.addEventListener("click", () => peekEvent(ev, ownerName));
    return li;
  }

  function fvRenderDay() {
    $("fv-day-title").textContent = longDate(fv.selected);
    const items = fv.events.filter((e) => covers(e, fv.selected));
    const ul = $("fv-day-events");
    ul.replaceChildren(...items.map((e) => friendEventItem(e, fv.friend.username, fv.selected)));
    if (!items.length) ul.append(el("li", { className: "empty", textContent: "Keine Termine." }));
  }

  $("fv-grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".day");
    if (!cell) return;
    const { start, end } = gridRange(fv);
    fv.selected = cell.dataset.date;
    const d = parseIso(fv.selected);
    if (fv.view === "month" && (d.getMonth() !== fv.month || d.getFullYear() !== fv.year)) { fv.year = d.getFullYear(); fv.month = d.getMonth(); fvLoadCal(); return; }
    if (fv.selected < iso(start) || fv.selected > iso(end)) { fvLoadCal(); return; }
    $("fv-grid").querySelectorAll(".day").forEach((c) => c.classList.toggle("selected", c.dataset.date === fv.selected));
    fvRenderDay();
  });
  const fvShift = (delta) => { shiftState(fv, delta); fvRenderCal(); fvLoadCal(); };
  const fvSlide = (delta) => slideGrid($("fv-grid"), delta, () => fvShift(delta));
  $("fv-prev").addEventListener("click", () => fvSlide(-1));
  $("fv-next").addEventListener("click", () => fvSlide(1));
  bindSwipe($("fv-calendar"), $("fv-grid"), fvShift);

  // Pfeiltasten ←/→ blättern im sichtbaren Kalender (nicht, solange man tippt oder ein Fenster offen ist)
  document.addEventListener("keydown", (e) => {
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (!$("sheet-backdrop").hidden) return;
    const delta = e.key === "ArrowLeft" ? -1 : 1;
    if ($("view-calendar").classList.contains("active")) slideMonth(delta);
    else if ($("view-friend").classList.contains("active") && !$("fv-calendar").hidden) fvSlide(delta);
  });
  document.querySelectorAll("[data-fcview]").forEach((b) => b.addEventListener("click", () => {
    if (fv.view === b.dataset.fcview) return;
    fv.view = b.dataset.fcview;
    const d = parseIso(fv.selected); fv.year = d.getFullYear(); fv.month = d.getMonth();
    fvLoadCal();
  }));

  async function fvLoadPlan() {
    const cs = await fvGet("/timetable");
    if (!cs) return;
    fv.classes = cs;
    fvRenderPlan();
  }

  function fvRenderPlan() {
    const byDay = (d) => fv.classes.filter((c) => c.weekday === d);
    const today = weekdayOf(new Date());
    $("fv-days").replaceChildren(...[1, 2, 3, 4, 5, 6, 7].map((d) => {
      const n = byDay(d).length;
      const b = el("button", { type: "button", className: "pill" + (d === fv.day ? " active" : "") + (d === today ? " today" : "") },
        el("span", { textContent: DAY_SHORT[d] }), el("small", { textContent: n ? `${n}×` : "" }));
      b.addEventListener("click", () => { fv.day = d; fvRenderPlan(); });
      return b;
    }));
    const week = fv.planMode === "week";
    $("fv-days").hidden = week;
    document.querySelectorAll("[data-fpmode]").forEach((b) => b.classList.toggle("active", b.dataset.fpmode === fv.planMode));
    const rows = (d) => withGaps(byDay(d)).map((c) => (c.gap ? gapCard(c.from, c.to, { now: d === today && gapIsNow(c) }) : classCard(c, { now: isNow(c) })));
    const list = $("fv-plan");
    if (week) {
      list.replaceChildren();
      for (let d = 1; d <= 7; d++) if (byDay(d).length) list.append(el("li", { className: "week-day", textContent: DAY_LONG[d] }), ...rows(d));
    } else list.replaceChildren(...rows(fv.day));
    const empty = week ? fv.classes.length === 0 : byDay(fv.day).length === 0;
    $("fv-plan-empty").textContent = week ? `${fv.friend.username} hat keinen Stundenplan eingetragen.` : `Am ${DAY_LONG[fv.day]} hat ${fv.friend.username} frei.`;
    $("fv-plan-empty").hidden = !empty;
  }
  document.querySelectorAll("[data-fpmode]").forEach((b) => b.addEventListener("click", () => { fv.planMode = b.dataset.fpmode; fvRenderPlan(); }));

  async function fvLoadTodos() {
    const data = await fvGet("/todos");
    if (!data) return;
    const box = $("fv-todos");
    box.replaceChildren();
    if (!data.lists.length) { box.append(el("p", { className: "hint", textContent: `${fv.friend.username} hat noch keine Listen.` })); return; }
    for (const l of data.lists) {
      const ts = data.todos.filter((t) => t.list_id === l.id).sort((a, b) => Number(a.done) - Number(b.done));
      box.append(el("h2", { className: "section-head", textContent: `${l.emoji} ${l.name}` }));
      const ul = el("ul", { className: "task-list" }, ...ts.map((t) => taskRow(t, { readOnly: true })));
      ul.style.setProperty("--c", l.color);
      if (!ts.length) box.append(el("p", { className: "hint left", textContent: "Keine Aufgaben." }));
      else box.append(ul);
    }
  }

  // Vorschau eines Freundes-Termins mit „Übernehmen“
  let peeked = null;
  function peekEvent(ev, ownerName) {
    peeked = ev;
    $("pk-owner").textContent = `von ${ownerName}`;
    $("pk-title").textContent = (ev.icon ? ev.icon + " " : "") + ev.title;
    $("pk-when").textContent = eventSummary(ev);
    $("sheet-backdrop").hidden = false;
    $("peek-sheet").hidden = false;
  }
  $("pk-close").addEventListener("click", closeSheet);
  $("pk-take").addEventListener("click", () => { const ev = peeked; closeSheet(); openSheetPrefilled(ev); });

  // Termin-Formular als „Neuer Termin“, vorausgefüllt mit einem fremden Termin (eigene, unabhängige Kopie)
  function openSheetPrefilled(ev) {
    openSheet(ev.start_date, ev.end_date);
    $("f-title").value = ev.title;
    $("f-start").value = ev.start_time || "";
    $("f-end").value = ev.end_time || "";
    $("f-icon").value = ev.icon || "";
    editFallbackColor = ev.color || DEFAULT_COLOR;
    selectColor(swatches, "color", editFallbackColor);
    markIcon();
  }

  $("friends-btn").addEventListener("click", () => showTab("friends"));
  $("friends-back").addEventListener("click", () => showTab("today"));

  // ---------- Chat ----------
  let history = store.get("chat", []);
  const log = $("chat-log");

  // Die KI schreibt manchmal Markdown (**fett**, * Listen); angezeigt wird reiner Text
  function plainText(t) {
    return t
      .replace(/\*\*(.+?)\*\*/gs, "$1")
      .replace(/__(.+?)__/gs, "$1")
      .replace(/`/g, "")
      .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, "")
      .replace(/^([ \t]*)[*-][ \t]+/gm, "$1• ")
      .replace(/\*\*/g, "")
      .trim();
  }

  function addBubble(role, text, extra = "") {
    const b = el("div", { className: `msg ${role} ${extra}`.trim(), textContent: role === "assistant" ? plainText(text) : text });
    log.append(b);
    scrollChat();
    return b;
  }
  function scrollChat() { log.scrollTop = log.scrollHeight; }

  function renderHistory() {
    log.replaceChildren();
    if (!history.length) addBubble("assistant", "Hi! Ich kann deinen Kalender lesen und Termine anlegen. Frag z. B.: „Trag vom 20. bis 22. Oktober Klausurenphase in Rot ein“ oder „Setz Skript drucken auf meine Uni-Liste.“ Bilder mit Terminen kannst du über „📷 Bild“ im Kalender importieren.");
    history.forEach((m) => addBubble(m.role, m.content));
  }

  async function sendChat(text, spoken = false) {
    text = text.trim();
    if (!text) return;
    history.push({ role: "user", content: text });
    addBubble("user", spoken ? `🎙 ${text}` : text);
    const pending = addBubble("assistant", "…", "pending");
    $("chat-send").disabled = true;
    try {
      const res = await api("/api/chat", { method: "POST", body: { messages: history.slice(-20) } });
      pending.remove();
      history.push({ role: "assistant", content: res.reply });
      addBubble("assistant", res.reply);
      store.set("chat", history.slice(-40));
      if ((res.events_created && res.events_created.length) || res.tasks_changed) refreshData();
      if (res.timetable_changed) { loadPlan(); renderToday(); }
      if (spoken) speak(plainText(res.reply));
    } catch (err) {
      pending.remove();
      history.pop(); // fehlgeschlagene Nachricht nicht in den Verlauf übernehmen
      addBubble("error", err.message);
    } finally {
      $("chat-send").disabled = false;
    }
  }

  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("chat-input");
    const text = input.value;
    input.value = "";
    sendChat(text).then(() => input.focus());
  });

  // ---------- Sprache: Aufnahme (antippen = starten, nochmal = senden) und Vorlesen ----------
  const voice = { rec: null, stream: null, chunks: [], timer: null, started: 0, busy: false };
  const VOICE_MAX_S = 60;
  let speakOn = store.get("speak", true);

  function renderSpeakToggle() {
    $("speak-toggle").textContent = speakOn ? "🔊 Vorlesen an" : "🔇 Vorlesen aus";
    $("speak-toggle").setAttribute("aria-pressed", String(speakOn));
  }
  $("speak-toggle").addEventListener("click", () => { speakOn = !speakOn; store.set("speak", speakOn); if (!speakOn) speechSynthesis.cancel(); renderSpeakToggle(); });
  renderSpeakToggle();

  function speak(text) {
    if (!speakOn || !("speechSynthesis" in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 1200));
    u.lang = "de-DE";
    const de = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith("de"));
    if (de) u.voice = de;
    speechSynthesis.speak(u);
  }

  function setRecUi(on) {
    $("rec-bar").hidden = !on;
    $("chat-mic").classList.toggle("on", on);
    $("voice-hero").classList.toggle("on", on);
    $("chat-mic").ariaLabel = on ? "Aufnahme senden" : "Sprechen";
  }

  async function toggleVoice() {
    if (voice.busy) return;
    if (voice.rec) { voice.rec.stop(); return; }
    // iPhone: Vorlesen muss einmal durch ein Antippen freigeschaltet werden
    if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(""); speechSynthesis.speak(u); }
    if (!navigator.mediaDevices || !window.MediaRecorder) { showToast("Dieses Gerät unterstützt keine Sprachaufnahme im Browser."); return; }
    try { voice.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { showToast("Kein Zugriff auf das Mikrofon. Bitte in den Einstellungen erlauben."); return; }
    const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
    voice.rec = new MediaRecorder(voice.stream, type ? { mimeType: type } : undefined);
    voice.chunks = [];
    voice.rec.ondataavailable = (e) => { if (e.data && e.data.size) voice.chunks.push(e.data); };
    voice.rec.onstop = finishVoice;
    voice.rec.start();
    voice.started = Date.now();
    setRecUi(true);
    $("rec-time").textContent = "0:00";
    voice.timer = setInterval(() => {
      const sec = Math.floor((Date.now() - voice.started) / 1000);
      $("rec-time").textContent = `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
      if (sec >= VOICE_MAX_S && voice.rec && voice.rec.state === "recording") voice.rec.stop();
    }, 250);
  }

  async function finishVoice() {
    clearInterval(voice.timer);
    const mime = (voice.rec && voice.rec.mimeType) || "audio/mp4";
    voice.stream.getTracks().forEach((t) => t.stop());
    voice.rec = null;
    setRecUi(false);
    const blob = new Blob(voice.chunks, { type: mime });
    if (blob.size < 1000) { showToast("Die Aufnahme war zu kurz."); return; }
    voice.busy = true;
    const pending = addBubble("assistant", "Ich höre mir das an …", "pending");
    try {
      const audio = await blobToBase64(blob);
      const res = await api("/api/transcribe", { method: "POST", body: { audio, mime: mime.split(";")[0] } });
      pending.remove();
      await sendChat(res.text, true);
    } catch (e) {
      pending.remove();
      addBubble("error", e.message);
    } finally { voice.busy = false; }
  }

  $("chat-mic").addEventListener("click", toggleVoice);
  $("voice-hero").addEventListener("click", () => { showTab("chat"); toggleVoice(); });

  // ---------- Gesten: vom Rand zurückwischen, nach unten ziehen zum Aktualisieren ----------
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true || window.LH_FORCE_EDGE;
  function backAction() {
    if (SUB_PARENT[currentView]) return { node: $(`view-${currentView}`), run: () => showTab(SUB_PARENT[currentView], { kind: "pop" }) };
    if (currentView === "todos" && todoState.openId !== null) return { node: $("todo-detail"), run: () => { todoState.openId = null; renderTodos(); } };
    return null;
  }
  // Vom Rand: auf Unterseiten zurück, im Kalender zurück zu „Heute“
  let edgeGesture = false;
  const edgeAction = () => backAction() || (currentView === "calendar" ? { node: $("view-calendar"), run: () => showTab("today", { kind: "pop" }) } : null);
  {
    let g = null;
    document.addEventListener("touchstart", (e) => {
      // Im Browser (nicht vom Home-Bildschirm) gehört der Rand Safari selbst
      if (!isStandalone() || e.touches[0].clientX > 24 || !$("sheet-backdrop").hidden) return;
      const back = edgeAction();
      if (back) { g = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp, back, dx: 0, active: false }; edgeGesture = true; }
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!g) return;
      const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
      if (!g.active) { if (dx > 8 && dx > Math.abs(dy)) g.active = true; else if (Math.abs(dy) > 12) { g = null; return; } else return; }
      g.dx = Math.max(0, dx);
      g.back.node.style.transition = "none";
      g.back.node.style.transform = `translateX(${g.dx}px)`;
      g.back.node.classList.add("edge-dragging");
    }, { passive: true });
    const end = (e) => {
      const t = g; g = null;
      edgeGesture = false;
      if (!t || !t.active) return;
      const node = t.back.node, w = window.innerWidth;
      const fast = t.dx / Math.max(1, e.timeStamp - t.t) > 0.5;
      node.style.transition = `transform .3s ${IOS_EASE}`;
      if (t.dx > w * 0.33 || fast) {
        node.style.transform = `translateX(${w}px)`;
        setTimeout(() => { node.style.transition = ""; node.style.transform = ""; node.classList.remove("edge-dragging"); t.back.run(); }, 230);
      } else {
        node.style.transform = "";
        setTimeout(() => { node.style.transition = ""; node.classList.remove("edge-dragging"); }, 320);
      }
    };
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
  }

  // Auf „Heute“ nach links wischen: weiter zum Kalender (die Seite folgt dem Finger)
  {
    const today = $("view-today");
    let t = null;
    today.addEventListener("touchstart", (e) => {
      if (!$("sheet-backdrop").hidden || e.target.closest(".weather, .seg, input, textarea, button.voice-hero")) return;
      if (isStandalone() && e.touches[0].clientX <= 24) return;
      t = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp, dx: 0, active: false };
    }, { passive: true });
    today.addEventListener("touchmove", (e) => {
      if (!t) return;
      const dx = e.touches[0].clientX - t.x, dy = e.touches[0].clientY - t.y;
      if (!t.active) {
        if (dx < -12 && Math.abs(dx) > Math.abs(dy) * 1.5) t.active = true;
        else if (Math.abs(dy) > 12 || dx > 12) { t = null; return; } else return;
      }
      t.dx = Math.min(0, dx);
      today.style.transition = "none";
      today.style.transform = `translateX(${t.dx * 0.6}px)`;
      today.style.opacity = String(1 - Math.min(0.4, -t.dx / (window.innerWidth * 1.5)));
    }, { passive: true });
    const end = (e) => {
      const s = t; t = null;
      if (!s || !s.active) return;
      const fast = -s.dx / Math.max(1, e.timeStamp - s.t) > 0.5;
      const go = -s.dx > Math.max(70, window.innerWidth * 0.25) || fast;
      today.style.transition = `transform .22s ${IOS_EASE}, opacity .22s`;
      if (go && !reduceMotion()) {
        today.style.transform = "translateX(-40%)";
        today.style.opacity = "0";
        setTimeout(() => { today.style.transition = today.style.transform = today.style.opacity = ""; showTab("calendar", { kind: "push" }); }, 170);
      } else if (go) { today.style.transition = today.style.transform = today.style.opacity = ""; showTab("calendar"); }
      else { today.style.transform = ""; today.style.opacity = ""; setTimeout(() => { today.style.transition = ""; }, 240); }
    };
    today.addEventListener("touchend", end);
    today.addEventListener("touchcancel", end);
  }

  // Nach unten ziehen zum Aktualisieren (Heute, Kalender, Börse)
  const PULL_REFRESH = {
    today: () => Promise.all([renderToday(), loadMarket(true)]),
    calendar: () => loadMonth(),
    market: () => Promise.all([loadMarket(true), loadBriefing()]),
  };
  {
    const ptr = el("div", { className: "ptr", id: "ptr", ariaHidden: "true" });
    ptr.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/></svg>';
    document.body.append(ptr);
    let p = null, busy = false;
    const show = (pull) => {
      ptr.style.transform = `translate(-50%, ${pull - 52}px) rotate(${pull * 3}deg)`;
      ptr.style.opacity = String(Math.min(1, pull / 60));
      ptr.classList.toggle("ready", pull > 70);
    };
    const hide = () => { ptr.classList.remove("ready", "spinning"); ptr.style.transition = `transform .3s ${IOS_EASE}, opacity .3s`; show(0); setTimeout(() => { ptr.style.transition = ""; }, 320); };
    document.addEventListener("touchstart", (e) => {
      if (busy || window.scrollY > 0 || !PULL_REFRESH[currentView] || !$("sheet-backdrop").hidden || $("app").hidden) return;
      p = { y: e.touches[0].clientY, x: e.touches[0].clientX, pull: 0, active: false };
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!p) return;
      const dy = e.touches[0].clientY - p.y, dx = e.touches[0].clientX - p.x;
      if (!p.active) { if (dy > 10 && dy > Math.abs(dx) * 1.5 && window.scrollY <= 0 && !rangeGesture) p.active = true; else if (Math.abs(dx) > 10 || dy < -5) { p = null; return; } else return; }
      p.pull = Math.min(120, dy * 0.5);
      show(p.pull);
    }, { passive: true });
    document.addEventListener("touchend", async () => {
      const t = p; p = null;
      if (!t || !t.active) return;
      if (t.pull <= 70) { hide(); return; }
      busy = true;
      ptr.classList.add("spinning");
      ptr.style.transition = `transform .25s ${IOS_EASE}`;
      ptr.style.transform = "translate(-50%, 18px)";
      try { await PULL_REFRESH[currentView](); } catch { /* Fehler zeigen die Bereiche selbst */ }
      busy = false;
      hide();
    });
  }

  // Dialog offen: Seite dahinter schrumpft leicht (wie iOS-Karten)
  new MutationObserver(() => document.body.classList.toggle("sheet-open", !$("sheet-backdrop").hidden))
    .observe($("sheet-backdrop"), { attributes: true, attributeFilter: ["hidden"] });

  // Umschalter mit gleitendem Hintergrund
  function placeThumb(seg) {
    const thumb = seg.querySelector(":scope > .seg-thumb");
    const act = seg.querySelector(":scope > button.active:not([hidden])");
    if (!act || !seg.offsetWidth) { thumb.style.opacity = "0"; return; }
    thumb.style.opacity = "1";
    thumb.style.width = `${act.offsetWidth}px`;
    thumb.style.transform = `translateX(${act.offsetLeft}px)`;
  }
  document.querySelectorAll(".seg").forEach((seg) => {
    const thumb = el("span", { className: "seg-thumb", ariaHidden: "true" });
    seg.prepend(thumb);
    seg.classList.add("has-thumb");
    const update = () => placeThumb(seg);
    new MutationObserver(update).observe(seg, { subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
    if (window.ResizeObserver) new ResizeObserver(update).observe(seg);
    update();
    requestAnimationFrame(() => thumb.classList.add("ready")); // erst danach animieren
  });

  // ---------- Kompakte Kopfzeile beim Scrollen (große Titel wie in iOS) ----------
  const VIEW_TITLE = { today: "Heute", calendar: "Kalender", plan: "Stundenplan", todos: "Aufgaben", chat: "Assistent", market: "Börse", friends: "Freunde" };
  function navTitle() {
    if (currentView === "todos" && todoState.openId !== null) return $("td-name").textContent;
    if (currentView === "friend") return $("fv-name").textContent;
    if (currentView === "calendar") return $("cal-title").textContent;
    return VIEW_TITLE[currentView] || "";
  }
  function updateNavbar() {
    const compact = window.scrollY > 52 && !$("app").hidden;
    document.body.classList.toggle("nav-compact", compact);
    if (!compact) return;
    $("nav-title").textContent = navTitle();
    $("nav-back").hidden = !backAction();
  }
  window.addEventListener("scroll", updateNavbar, { passive: true });
  $("nav-back").addEventListener("click", () => { const b = backAction(); if (b) b.run(); });

  // ---------- Start ----------
  async function startApp() {
    // Die App erscheint sofort (der Server braucht nach Ruhezeit einige Sekunden zum Aufwachen).
    // Ob das Konto noch existiert, wird im Hintergrund geprüft.
    $("auth").hidden = true;
    $("app").hidden = false;
    $("tabbar").hidden = false;
    renderHistory();
    showTab(store.get("tab", "today"), { animate: false });
    loadFriends();
    takeSharedText();
    checkHealth();
    try {
      const me = await api("/api/auth/me");
      store.set("user", me.username);
      myAvatar = me.avatar || ""; store.set("avatar", myAvatar); renderAvatarPick();
    } catch (e) {
      if (!token) { $("a-error").textContent = e.message; $("a-error").hidden = false; } // 401: api() hat bereits abgemeldet
    }
  }

  // Beim Öffnen aus dem Home-Bildschirm ist das Netz oft noch nicht bereit: Daten neu laden, sobald die App
  // wieder sichtbar ist oder das Netz zurück ist (höchstens alle 20 Sekunden).
  let lastRefresh = Date.now();
  function refreshIfVisible(force) {
    if ($("app").hidden || document.visibilityState !== "visible") return;
    if (!force && Date.now() - lastRefresh < 20000) return;
    lastRefresh = Date.now();
    refreshData(); loadPlan(); checkHealth(); loadFriends();
  }
  document.addEventListener("visibilitychange", () => refreshIfVisible(false));
  window.addEventListener("online", () => refreshIfVisible(true));
  window.addEventListener("pageshow", (e) => { if (e.persisted) refreshIfVisible(true); });

  if (API) fetch(API + "/api/health", { mode: "cors" }).catch(() => {}); // Server schon beim Start aufwecken
  if (token) { startApp(); setTimeout(() => refreshIfVisible(true), 5000); } else $("auth").hidden = false;
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
