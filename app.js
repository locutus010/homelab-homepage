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
   *  i18n — start page and settings drawer pick their language independently.
   *  Packs live in lang.js (window.LANGUAGES); English is always the fallback.
   * ----------------------------------------------------------------------- */
  const FALLBACK_LANG = "en";

  function packs() {
    return window.LANGUAGES || {};
  }

  /* Map a configured code ("auto" | "de" | …) onto a pack that exists.
     "auto" reads the browser: exact tag first ("de-DE"), then the primary
     subtag ("de"). Anything unresolvable ends up on English. */
  function resolveLangCode(code, available, navLang) {
    const FALLBACK_LANG = "en";
    const codes = available || [];
    const want = String(code == null ? "auto" : code);
    if (want !== "auto") {
      if (codes.indexOf(want) !== -1) return want;
    } else {
      const nav = String(navLang || "");
      if (nav) {
        if (codes.indexOf(nav) !== -1) return nav;
        const primary = nav.split("-")[0];
        if (primary && codes.indexOf(primary) !== -1) return primary;
      }
    }
    return codes.indexOf(FALLBACK_LANG) !== -1 ? FALLBACK_LANG : (codes[0] || FALLBACK_LANG);
  }

  /* Fill {placeholders}. Unknown ones are left alone so a typo shows up as
     "{name}" instead of silently rendering "undefined". */
  function interpolate(str, vars) {
    if (!vars) return String(str);
    return String(str).replace(/\{(\w+)\}/g, (whole, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole);
  }

  /** Resolved pack code for "ui" or "settings". */
  function langCode(kind) {
    const conf = settings().lang || {};
    const nav = (typeof navigator !== "undefined" && navigator.language) || "";
    return resolveLangCode(conf[kind], Object.keys(packs()), nav);
  }

  /* Chosen pack -> English pack -> the key itself. Never renders empty. */
  function lookup(kind, key, vars) {
    const all = packs();
    const chosen = (all[langCode(kind)] || {})[kind] || {};
    const fallback = (all[FALLBACK_LANG] || {})[kind] || {};
    const raw = chosen[key] != null ? chosen[key]
      : (fallback[key] != null ? fallback[key] : key);
    return interpolate(raw, vars);
  }

  const t = (key, vars) => lookup("ui", key, vars);
  const tSet = (key, vars) => lookup("settings", key, vars);

  /** BCP-47 tag of the start page's pack — clock, date, city search. */
  function activeLocale() {
    const pack = packs()[langCode("ui")];
    return (pack && pack.locale) || "en-US";
  }

  /** [{ code, name }] for the two language pickers in settings.js. */
  function languages() {
    const all = packs();
    return Object.keys(all)
      .map((code) => ({ code, name: all[code].name || code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (!window.LANGUAGES) console.warn("[homelab] lang.js missing — showing raw keys");

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
  let pubIpInFlight = false;
  let pubIpRetry = null;

  window.Homelab = {
    config: () => ACTIVE,
    defaults: () => clone(DEFAULTS),
    /* i18n — settings.js goes through these instead of holding its own texts. */
    t,
    tSet,
    activeLocale,
    langCode,
    languages,
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
    applyStaticStrings();

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

  /* Fill everything the markup tagged as translatable. Keeps index.html free
     of language-specific text, so a new pack never touches the HTML.
     The settings drawer is not covered here — settings.js builds its own DOM
     through tSet(). */
  function applyStaticStrings() {
    document.documentElement.lang = langCode("ui");

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });

    // "placeholder:search.placeholder,aria-label:search.aria"
    document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(",").forEach((pair) => {
        const idx = pair.indexOf(":");
        if (idx === -1) return;
        const attr = pair.slice(0, idx).trim();
        const key = pair.slice(idx + 1).trim();
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
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
    if (input && filterTerm(input.value)) {
      input.dispatchEvent(new Event("input"));
    }
  }

  function buildLink(link) {
    const a = document.createElement("a");
    a.className = "link";
    a.href = safeHref(link.url);
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
    const el = $("#stats");
    const conf = settings().stats || {};
    // The strip reports on the status checks, so it only makes sense while
    // those run — "0 online / 0 offline" with checking off would be a lie.
    const show = conf.enabled !== false && !!settings().statusCheck;
    el.hidden = !show;
    if (!show) return;

    // Only links flagged `ping: true` are actually watched; the rest are
    // plain bookmarks and would inflate the count.
    const monitored = groups()
      .flatMap((g) => g.links || [])
      .filter((link) => link && link.ping).length;
    $("#stat-monitored").textContent = monitored;
    $("#stat-groups").textContent = groups().length;
    updateStatusCounts();
  }

  /* Online + offline can be short of the monitored total while checks are
   * still in flight — those LEDs are neither up nor down yet. */
  function updateStatusCounts() {
    $("#stat-online").textContent = document.querySelectorAll(".led--up").length;
    $("#stat-offline").textContent = document.querySelectorAll(".led--down").length;
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
      // In filter mode the badge shows where Enter goes: a link, not an engine.
      if (filterTerm(input.value) !== null) { badge.textContent = "GO"; return; }
      const { engine } = resolve(input.value.trim());
      badge.textContent = shortLabel(engine && engine.label);
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      // Filter mode: open the first remaining link instead of handing the
      // whole "/…" string to a search engine.
      if (filterTerm(input.value) !== null) {
        const first = $("#board").querySelector(".link:not(.is-hidden)");
        if (first) first.click();
        return;
      }
      const value = input.value.trim();
      if (!value) return;
      const { engine, query } = resolve(value);
      if (engine && engine.url) {
        // Same scheme guard as the bookmark links: an engine URL also comes
        // from the config, so a "javascript:" one would otherwise run here.
        const target = safeHref(engine.url.replace("%s", encodeURIComponent(query)));
        if (target !== "#") window.location.href = target;
      }
    });
  }

  function renderSearchState() {
    const conf = settings().search || {};
    const form = $("#search-form");
    form.hidden = !conf.enabled;
    if (!conf.enabled) return;
    // Don't stomp the filter-mode badge on an unrelated re-render.
    if (filterTerm($("#search-input").value) !== null) {
      $("#search-engine").textContent = "GO";
      return;
    }
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
   *  Live link filtering ("/" starts a filter, type to narrow it down)
   * ----------------------------------------------------------------------- */

  /* Filtering is opt-in: the field stays a plain web-search box until the
   * value starts with "/", the same way "!" switches search engine. Returns
   * the search term ("" for a bare "/"), or null when this isn't a filter. */
  function filterTerm(value) {
    if (!value.startsWith("/")) return null;
    return value.slice(1).trim().toLowerCase();
  }

  function setupFilter() {
    const input = $("#search-input");
    const form = $("#search-form");
    const board = $("#board");
    const emptyEl = $("#filter-empty");
    const msgEl = $("#filter-message");

    input.addEventListener("input", () => {
      const q = filterTerm(input.value);
      // A bare "/" is filter mode with nothing typed yet — show everything.
      if (!q) { clearFilter(); return; }
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
      msgEl.textContent = t("filter.empty", { term: q });
    }

    function clearFilter() {
      board.querySelectorAll(".is-hidden").forEach((el) => el.classList.remove("is-hidden"));
      emptyEl.hidden = true;
    }

    document.addEventListener("keydown", (e) => {
      // With the search bar switched off there is nothing to focus — typing
      // into an invisible field would just swallow the keystrokes.
      if (form.hidden) return;

      // Ignore shortcuts while the settings panel is open or another field is focused.
      const inSettings = document.body.classList.contains("settings-open");
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      const typingElsewhere = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "/" && document.activeElement !== input && !inSettings && !typingElsewhere) {
        e.preventDefault();
        // Seed the "/" so filter mode is visible in the field; keep whatever
        // is already typed rather than clobbering it.
        if (!input.value) {
          input.value = "/";
          input.dispatchEvent(new Event("input"));
        }
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
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
    updateStatusCounts();
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
    if (!pubIpLoaded && !pubIpInFlight) loadPublicIp();
  }

  async function loadPublicIp() {
    if (pubIpInFlight) return;   // never run two lookups at once
    pubIpInFlight = true;
    const out = $("#pubip-value");
    if (out) out.textContent = "…";
    let ip = null;
    try {
      ip = await fetchPublicIp();
    } finally {
      pubIpInFlight = false;
    }
    // Keep the pill visible either way so it never silently disappears.
    if (out) {
      out.textContent = ip || "n/v";
      out.title = ip ? "" : "Öffentliche IP nicht abrufbar (Internet/Blocker?)";
    }
    if (ip) {
      pubIpLoaded = true;  // one-shot per session; reload the page to refresh
    } else {
      // A single delayed retry — NOT one per re-render, which would storm the
      // network with 4 provider calls on every keystroke while editing.
      console.warn("[homelab] public IP lookup failed across all sources");
      clearTimeout(pubIpRetry);
      pubIpRetry = setTimeout(() => {
        const c = settings().publicIp || {};
        if (c.enabled) loadPublicIp();
      }, 30000);
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
        const ip = (await get() || "").trim();
        // Whole string must look like an IPv4/IPv6 literal — guards against a
        // provider returning an HTML error body with a stray "." in it.
        if (/^[0-9a-f.:]+$/i.test(ip) && ip.length >= 3 && ip.length <= 45) return ip;
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

  /** Block script-y URL schemes on link hrefs (defense-in-depth for imported
   *  configs). http(s), protocol-relative, site-relative and host:port pass.
   *
   *  Testing the raw string is not enough: the browser's URL parser strips
   *  every tab/newline anywhere in the value and any leading control
   *  characters, so "jav<TAB>ascript:alert(1)" reaches it as a live
   *  "javascript:" URL while sailing past a naive scheme check. Normalise the
   *  same way *first*, and hand back the normalised form — that is what the
   *  browser would navigate to anyway. Interior spaces are left alone; the
   *  parser percent-encodes rather than removes them. */
  function safeHref(url) {
    const u = String(url || "")
      .replace(/[\t\n\r]/g, "")
      .replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
    if (!u) return "#";
    if (/^(javascript|data|vbscript|file):/i.test(u)) return "#";
    return u;
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
