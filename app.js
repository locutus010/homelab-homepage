/* =============================================================================
 *  HOMELAB START PAGE — APP LOGIC
 *  Renders bookmark groups from the *active* config and powers the widgets:
 *  clock, greeting, weather, web search, live status LEDs, and link filtering.
 *
 *  The active config = defaults from config.js, overlaid with the user's saved
 *  edits. When the page is served by server.py those edits live centrally in a
 *  SQLite DB (shared across machines); localStorage is the offline fallback and
 *  local cache. The settings panel (settings.js) mutates the active config and
 *  calls Homelab.render() to re-draw live.
 * ========================================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "homelab.config.v1";
  // Held apart from the synced config on purpose: the token must NOT be PUT back
  // to the server, and it stays per-browser (localStorage only).
  const TOKEN_KEY = "homelab.token";
  const API_URL = "/api/config";
  // The sync API only exists when a server (server.py) is serving the page.
  // Opened directly via file:// we stay purely on localStorage.
  const serverEnabled = location.protocol === "http:" || location.protocol === "https:";
  const $ = (sel) => document.querySelector(sel);

  /* --------------------------------------------------------------------------
   *  Active config (defaults <- saved overrides)
   * ----------------------------------------------------------------------- */
  const DEFAULTS = clone(window.CONFIG || { settings: {}, groups: [] });
  let ACTIVE = loadActive();

  const settings = () => ACTIVE.settings || {};
  const groups = () => ACTIVE.groups || [];

  function loadActive() {
    return mergeSaved(readSaved());
  }

  /** Overlay a saved-config object onto the defaults to form the active config. */
  function mergeSaved(saved) {
    if (!saved) return clone(DEFAULTS);
    return {
      settings: deepMerge(clone(DEFAULTS.settings || {}), saved.settings || {}),
      groups: Array.isArray(saved.groups) ? saved.groups : clone(DEFAULTS.groups || []),
    };
  }

  function readSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /* Tell the UI (settings.js) that ACTIVE was swapped for a new object, so any
     cached references into it (e.g. a section's `set().search`) get rebuilt. */
  function notifyReplaced() {
    document.dispatchEvent(new CustomEvent("homelab:config-replaced"));
  }

  /** Immediate local cache so the page survives offline / a server restart. */
  function persistLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ACTIVE));
    } catch (e) {
      console.warn("[homelab] could not cache settings locally:", e);
    }
  }

  function persist() {
    persistLocal();
    if (serverEnabled) scheduleServerSave();
  }

  /* --------------------------------------------------------------------------
   *  Central storage (server.py + SQLite). Best-effort: any failure leaves the
   *  localStorage cache intact, so editing never blocks on the network.
   * ----------------------------------------------------------------------- */
  let serverSaveTimer = null;

  /* Optional write token (only needed if server.py runs with HOMELAB_TOKEN). */
  function readToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function apiHeaders(base) {
    const h = Object.assign({}, base || {});
    const t = readToken();
    if (t) h["X-Homelab-Token"] = t;
    return h;
  }

  function scheduleServerSave() {
    clearTimeout(serverSaveTimer);
    serverSaveTimer = setTimeout(saveToServer, 400);
  }

  async function saveToServer() {
    try {
      const res = await fetch(API_URL, {
        method: "PUT",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(ACTIVE),
        cache: "no-store",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
    } catch (e) {
      console.warn("[homelab] could not save settings to server:", e.message);
    }
  }

  /** Pull the central config on boot and re-render once it arrives. */
  async function syncFromServer() {
    if (!serverEnabled) return;
    try {
      const res = await fetch(API_URL, { cache: "no-store" });
      if (res.status === 204) return;            // nothing stored yet
      if (!res.ok) throw new Error("HTTP " + res.status);
      const saved = await res.json();
      ACTIVE = mergeSaved(saved);
      persistLocal();
      render();
      loadWeather();
      notifyReplaced();
    } catch (e) {
      console.warn("[homelab] central config unavailable, using local cache:", e.message);
    }
  }

  /* --------------------------------------------------------------------------
   *  Public API (used by settings.js)
   * ----------------------------------------------------------------------- */
  let statusTimer = null;
  let statusRunDebounce = null;
  let pubIpLoaded = false;

  window.Homelab = {
    config: () => ACTIVE,
    defaults: () => clone(DEFAULTS),
    save: persist,
    /** Re-draw everything from the active config and persist. */
    apply() {
      persist();
      render();
    },
    /** Re-draw without persisting (used during live typing is fine too). */
    render,
    refreshWeather: loadWeather,
    replaceConfig(next) {
      ACTIVE = {
        settings: deepMerge(clone(DEFAULTS.settings || {}), (next && next.settings) || {}),
        groups: Array.isArray(next && next.groups) ? next.groups : clone(DEFAULTS.groups || []),
      };
      persist();
      render();
      loadWeather();
      notifyReplaced();
    },
    /** Per-browser write token (only relevant when the server enforces one). */
    getToken: readToken,
    setToken(t) {
      try {
        const v = (t || "").trim();
        if (v) localStorage.setItem(TOKEN_KEY, v);
        else localStorage.removeItem(TOKEN_KEY);
      } catch (e) { console.warn("[homelab] could not store token:", e); }
    },
    resetDefaults() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      if (serverEnabled) {
        fetch(API_URL, { method: "DELETE", headers: apiHeaders(), cache: "no-store" })
          .catch((e) => console.warn("[homelab] could not clear server config:", e.message));
      }
      ACTIVE = clone(DEFAULTS);
      render();
      loadWeather();
      notifyReplaced();
    },
  };

  /* --------------------------------------------------------------------------
   *  Boot
   * ----------------------------------------------------------------------- */
  function init() {
    startClock();          // independent ticker, set up once
    setupSearch();         // listeners attached once, read ACTIVE at event time
    setupFilter();         // listeners attached once
    render();              // first paint (from local cache / defaults)
    loadWeather();         // initial fetch
    syncFromServer();      // overlay the central config once it loads
  }

  /* --------------------------------------------------------------------------
   *  Master render — idempotent, safe to call on every change
   * ----------------------------------------------------------------------- */
  function render() {
    const s = settings();

    if (s.accent) document.documentElement.style.setProperty("--accent", s.accent);
    document.title = `${s.title || "Homelab"} · ${s.subtitle || "Start"}`;
    $("#brand-title").textContent = s.title || "HOMELAB";
    $("#brand-subtitle").textContent = s.subtitle || "";

    renderGreeting();
    renderSearchState();
    renderWeatherVisibility();
    renderPublicIp();
    renderBoard();
    renderStats();
    scheduleStatusRun();
  }

  function renderGreeting() {
    const s = settings();
    const h = new Date().getHours();
    const part =
      h < 5 ? "Late night" :
      h < 12 ? "Good morning" :
      h < 18 ? "Good afternoon" :
      "Good evening";
    const who = s.owner ? `, <b>${escapeHtml(s.owner)}</b>` : "";
    $("#greeting").innerHTML = `${part}${who}.`;
  }

  /* --------------------------------------------------------------------------
   *  Clock
   * ----------------------------------------------------------------------- */
  function startClock() {
    const timeEl = $("#clock-time");
    const dateEl = $("#clock-date");
    const tick = () => {
      const s = settings();
      const locale = s.locale || undefined;
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString(locale, {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: !s.clock24h,
      });
      dateEl.textContent = now.toLocaleDateString(locale, {
        weekday: "short", day: "2-digit", month: "short",
      });
    };
    tick();
    setInterval(tick, 1000);
  }

  /* --------------------------------------------------------------------------
   *  Board / bookmark groups
   * ----------------------------------------------------------------------- */
  function renderBoard() {
    const board = $("#board");
    board.innerHTML = "";

    groups().forEach((group, gi) => {
      const links = group.links || [];
      const section = document.createElement("section");
      section.className = "group";
      section.style.setProperty("--delay", `${0.24 + gi * 0.08}s`);

      const head = document.createElement("div");
      head.className = "group__head";
      head.innerHTML =
        `<span class="group__name">${escapeHtml(group.name || "")}</span>` +
        `<span class="group__count">${links.length.toString().padStart(2, "0")}</span>`;
      section.appendChild(head);

      const list = document.createElement("div");
      list.className = "links";
      links.forEach((link) => list.appendChild(buildLink(link)));
      section.appendChild(list);

      board.appendChild(section);
    });

    // Re-apply any active filter text after a rebuild.
    const input = $("#search-input");
    if (input && input.value.trim() && !input.value.startsWith("!")) {
      input.dispatchEvent(new Event("input"));
    }
  }

  function buildLink(link) {
    const a = document.createElement("a");
    a.className = "link";
    a.href = link.url || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.dataset.name = (link.name || "").toLowerCase();
    a.dataset.desc = (link.description || "").toLowerCase();

    const icon = document.createElement("span");
    icon.className = "link__icon";
    const raw = (link.icon || "").trim();
    if (/^(https?:)?\/\//.test(raw) || raw.startsWith("/") || raw.startsWith("data:image")) {
      const img = document.createElement("img");
      img.src = raw; img.alt = ""; img.loading = "lazy";
      icon.appendChild(img);
    } else if (raw) {
      icon.textContent = raw;
    } else {
      const mono = monogram(link.name || "?");
      icon.textContent = mono.text;
      icon.style.color = mono.color;
      icon.style.borderColor = `color-mix(in srgb, ${mono.color} 40%, transparent)`;
    }
    a.appendChild(icon);

    const body = document.createElement("span");
    body.className = "link__body";
    body.innerHTML =
      `<span class="link__name">${escapeHtml(link.name || "")}</span>` +
      (link.description ? `<span class="link__desc">${escapeHtml(link.description)}</span>` : "");
    a.appendChild(body);

    if (link.ping && settings().statusCheck) {
      const led = document.createElement("span");
      led.className = "led";
      led.title = "Checking…";
      led.dataset.ping = link.url || "";
      a.appendChild(led);
    }
    return a;
  }

  function monogram(name) {
    const words = name.trim().split(/\s+/);
    const text =
      words.length > 1
        ? (words[0][0] + words[1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return { text, color: `hsl(${hash % 360} 65% 64%)` };
  }

  /* --------------------------------------------------------------------------
   *  Stats strip
   * ----------------------------------------------------------------------- */
  function renderStats() {
    const all = groups().flatMap((g) => g.links || []);
    $("#stat-services").textContent = all.length;
    $("#stat-groups").textContent = groups().length;
    updateOnlineCount();
  }

  function updateOnlineCount() {
    $("#stat-online").textContent = document.querySelectorAll(".led--up").length;
  }

  /* --------------------------------------------------------------------------
   *  Web search (with bang prefixes) — listeners attached once
   * ----------------------------------------------------------------------- */
  function setupSearch() {
    const form = $("#search-form");
    const input = $("#search-input");
    const badge = $("#search-engine");

    const resolve = (value) => {
      const conf = settings().search || {};
      const engines = conf.engines || {};
      const byBang = {};
      Object.values(engines).forEach((e) => { if (e.bang) byBang[e.bang.toLowerCase()] = e; });
      const fallback = engines[conf.defaultEngine] || Object.values(engines)[0];
      const m = value.match(/^!(\w+)\s+([\s\S]+)$/);
      if (m && byBang[m[1].toLowerCase()]) return { engine: byBang[m[1].toLowerCase()], query: m[2] };
      return { engine: fallback, query: value };
    };

    input.addEventListener("input", () => {
      const { engine } = resolve(input.value.trim());
      badge.textContent = shortLabel(engine && engine.label);
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      const { engine, query } = resolve(value);
      if (engine && engine.url) {
        window.location.href = engine.url.replace("%s", encodeURIComponent(query));
      }
    });
  }

  function renderSearchState() {
    const conf = settings().search || {};
    const form = $("#search-form");
    form.hidden = !conf.enabled;
    if (!conf.enabled) return;
    const engines = conf.engines || {};
    const fallback = engines[conf.defaultEngine] || Object.values(engines)[0];
    $("#search-engine").textContent = shortLabel(fallback && fallback.label);
  }

  function shortLabel(label) {
    if (!label) return "WEB";
    const map = { DuckDuckGo: "DDG", Google: "G", GitHub: "GH", Wikipedia: "WIKI" };
    return map[label] || label.slice(0, 4).toUpperCase();
  }

  /* --------------------------------------------------------------------------
   *  Live link filtering ("/" to focus, type to filter)
   * ----------------------------------------------------------------------- */
  function setupFilter() {
    const input = $("#search-input");
    const board = $("#board");
    const emptyEl = $("#filter-empty");
    const termEl = $("#filter-term");

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (!q || input.value.startsWith("!")) { clearFilter(); return; }
      filter(q);
    });

    function filter(q) {
      let visible = 0;
      board.querySelectorAll(".group").forEach((group) => {
        let has = 0;
        group.querySelectorAll(".link").forEach((link) => {
          const hit = link.dataset.name.includes(q) || link.dataset.desc.includes(q);
          link.classList.toggle("is-hidden", !hit);
          if (hit) { has++; visible++; }
        });
        group.classList.toggle("is-hidden", has === 0);
      });
      emptyEl.hidden = visible !== 0;
      termEl.textContent = q;
    }

    function clearFilter() {
      board.querySelectorAll(".is-hidden").forEach((el) => el.classList.remove("is-hidden"));
      emptyEl.hidden = true;
    }

    document.addEventListener("keydown", (e) => {
      // Ignore shortcuts while the settings panel is open or another field is focused.
      const inSettings = document.body.classList.contains("settings-open");
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      const typingElsewhere = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "/" && document.activeElement !== input && !inSettings && !typingElsewhere) {
        e.preventDefault();
        input.focus();
      } else if (e.key === "Escape" && !inSettings && document.activeElement === input) {
        input.value = "";
        input.dispatchEvent(new Event("input"));
        input.blur();
      } else if (
        !inSettings && !typingElsewhere &&
        e.key.length === 1 && /[a-z0-9]/i.test(e.key) &&
        !e.metaKey && !e.ctrlKey && !e.altKey
      ) {
        input.focus();
      }
    });
  }

  /* --------------------------------------------------------------------------
   *  Live status checks (best-effort reachability)
   * ----------------------------------------------------------------------- */
  function scheduleStatusRun() {
    if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
    if (!settings().statusCheck) return;

    // Debounce the immediate run so rapid edits don't spam the network.
    clearTimeout(statusRunDebounce);
    statusRunDebounce = setTimeout(runStatusChecks, 500);

    const every = settings().statusIntervalMs || 60000;
    if (every > 0) statusTimer = setInterval(runStatusChecks, every);
  }

  function runStatusChecks() {
    document.querySelectorAll(".led[data-ping]").forEach(checkOne);
  }

  async function checkOne(led) {
    const url = led.dataset.ping;
    if (!url) return;
    led.className = "led led--checking";
    led.title = "Checking…";

    const timeout = settings().statusTimeoutMs || 4000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      await fetch(url, { mode: "no-cors", signal: controller.signal, cache: "no-store", redirect: "follow" });
      setLed(led, true);
    } catch (err) {
      setLed(led, false);
    } finally {
      clearTimeout(timer);
    }
  }

  function setLed(led, up) {
    led.className = "led " + (up ? "led--up" : "led--down");
    led.title = up ? "Online" : "Unreachable";
    updateOnlineCount();
  }

  /* --------------------------------------------------------------------------
   *  Weather (open-meteo, no API key)
   * ----------------------------------------------------------------------- */
  function renderWeatherVisibility() {
    const w = settings().weather || {};
    if (!w.enabled) $("#weather").hidden = true;
  }

  async function loadWeather() {
    const w = settings().weather || {};
    const el = $("#weather");
    if (!w.enabled) { el.hidden = true; return; }
    try {
      const unit = w.unit === "fahrenheit" ? "fahrenheit" : "celsius";
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${w.latitude}&longitude=${w.longitude}` +
        `&current=temperature_2m,weather_code&temperature_unit=${unit}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("weather " + res.status);
      const data = await res.json();
      const cur = data.current || {};
      const deg = unit === "fahrenheit" ? "°F" : "°C";
      $("#weather-icon").textContent = weatherEmoji(cur.weather_code);
      $("#weather-temp").textContent = `${Math.round(cur.temperature_2m)}${deg}`;
      $("#weather-place").textContent = w.label || "";
      el.hidden = false;
    } catch (err) {
      el.hidden = true;
      console.warn("[homelab] weather unavailable:", err.message);
    }
  }

  function weatherEmoji(code) {
    if (code == null) return "·";
    if (code === 0) return "☀️";
    if (code <= 2) return "🌤️";
    if (code === 3) return "☁️";
    if (code <= 48) return "🌫️";
    if (code <= 57) return "🌦️";
    if (code <= 67) return "🌧️";
    if (code <= 77) return "🌨️";
    if (code <= 82) return "🌧️";
    if (code <= 86) return "❄️";
    return "⛈️";
  }

  /* --------------------------------------------------------------------------
   *  Public IP pill (internet connection's egress IP) — under the weather widget
   * ----------------------------------------------------------------------- */
  function renderPublicIp() {
    const conf = settings().publicIp || {};
    const el = $("#pubip");
    if (!el) return;
    if (!conf.enabled) { el.hidden = true; return; }
    el.hidden = false;
    if (!pubIpLoaded) loadPublicIp();
  }

  async function loadPublicIp() {
    pubIpLoaded = true;  // one-shot per session; reload the page to refresh
    const out = $("#pubip-value");
    if (out) out.textContent = "…";
    const ip = await fetchPublicIp();
    // Keep the pill visible either way so it never silently disappears.
    if (out) {
      out.textContent = ip || "n/v";
      out.title = ip ? "" : "Öffentliche IP nicht abrufbar (Internet/Blocker?)";
    }
    if (!ip) {
      pubIpLoaded = false;  // allow a retry on the next render
      console.warn("[homelab] public IP lookup failed across all sources");
    }
  }

  async function fetchPublicIp() {
    // Several CORS-friendly lookups; a homelab DNS blocker (Pi-hole/AdGuard) may
    // block some, so we try a few different providers in turn.
    const sources = [
      async () => (await (await fetch("https://api.ipify.org?format=json", { cache: "no-store" })).json()).ip,
      async () => (await (await fetch("https://ipapi.co/ip/", { cache: "no-store" })).text()).trim(),
      async () => (await (await fetch("https://api.my-ip.io/v2/ip.txt", { cache: "no-store" })).text()).trim(),
      async () => (await (await fetch("https://icanhazip.com", { cache: "no-store" })).text()).trim(),
    ];
    for (const get of sources) {
      try {
        const ip = await get();
        if (ip && /[0-9a-f:.]/i.test(ip)) return ip.trim();
      } catch (e) { /* try the next provider */ }
    }
    return null;
  }

  /* --------------------------------------------------------------------------
   *  Utils
   * ----------------------------------------------------------------------- */
  function clone(obj) {
    return typeof structuredClone === "function"
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));
  }

  function deepMerge(base, over) {
    Object.keys(over || {}).forEach((k) => {
      const bv = base[k], ov = over[k];
      if (isPlainObject(bv) && isPlainObject(ov)) base[k] = deepMerge(bv, ov);
      else base[k] = ov;
    });
    return base;
  }
  function isPlainObject(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
