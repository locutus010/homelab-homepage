/* =============================================================================
 *  HOMELAB START PAGE — SETTINGS PANEL
 *  A no-code settings drawer. Edits the active config (via window.Homelab),
 *  applies changes live, and autosaves them. When the page is served by
 *  server.py the save goes to the central SQLite store (shared across every
 *  machine); otherwise it stays in this browser. Export/import of a config.js
 *  file remains as an optional manual backup.
 *
 *  Language note: labels are in German (Du-form) for a non-technical owner.
 * ========================================================================== */

(function () {
  "use strict";

  const H = window.Homelab;
  if (!H) { console.error("[homelab] settings.js needs app.js (window.Homelab)"); return; }

  const cfg = () => H.config();
  const set = () => cfg().settings;

  /* ----- tiny DOM helpers ----- */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) node.setAttribute(k, "");
      else if (attrs[k] != null && attrs[k] !== false) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  }

  /* Persist + live re-render the page. */
  function commit() { H.apply(); }

  /* --------------------------------------------------------------------------
   *  Open / close
   * ----------------------------------------------------------------------- */
  let overlay, drawer;

  function open() {
    buildBookmarks();      // refresh the editor with current data
    document.body.classList.add("settings-open");
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    drawer.querySelector(".set__close").focus();
  }
  function close() {
    overlay.classList.remove("is-open");
    document.body.classList.remove("settings-open");
    setTimeout(() => { overlay.hidden = true; }, 280);
  }

  /* --------------------------------------------------------------------------
   *  Reusable field builders
   * ----------------------------------------------------------------------- */
  function field(label, control, hint) {
    return el("label", { class: "set-field" }, [
      el("span", { class: "set-field__label", text: label }),
      control,
      hint ? el("span", { class: "set-field__hint", text: hint }) : document.createTextNode(""),
    ]);
  }

  function textInput(value, onInput, opts) {
    return el("input", Object.assign({
      class: "set-input", type: "text", value: value == null ? "" : value,
      oninput: (e) => onInput(e.target.value),
    }, opts || {}));
  }

  function toggle(checked, onChange, label) {
    const input = el("input", { type: "checkbox", class: "set-switch__input", onchange: (e) => onChange(e.target.checked) });
    if (checked) input.checked = true;
    return el("label", { class: "set-switch" }, [
      input, el("span", { class: "set-switch__track" }, [el("span", { class: "set-switch__thumb" })]),
      el("span", { class: "set-switch__label", text: label || "" }),
    ]);
  }

  function selectInput(value, options, onChange) {
    const sel = el("select", { class: "set-input", onchange: (e) => onChange(e.target.value) });
    options.forEach(([v, label]) => {
      const o = el("option", { value: v, text: label });
      if (v === value) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  /* --------------------------------------------------------------------------
   *  Section: General
   * ----------------------------------------------------------------------- */
  function sectionGeneral() {
    const s = set();
    const presets = ["#f4b740", "#57d9a3", "#5aa9f0", "#f76a6a", "#c08bf0", "#ff8c42"];

    const colorRow = el("div", { class: "set-color" }, [
      el("input", {
        type: "color", class: "set-color__picker", value: s.accent || "#f4b740",
        oninput: (e) => { s.accent = e.target.value; commit(); syncSwatches(e.target.value); },
      }),
      ...presets.map((c) =>
        el("button", {
          type: "button", class: "set-swatch", "data-color": c, style: `--c:${c}`,
          title: c, "aria-label": c,
          onclick: () => { s.accent = c; commit(); rebuild(); },
        })
      ),
    ]);
    function syncSwatches(v) {
      colorRow.querySelectorAll(".set-swatch").forEach((b) =>
        b.classList.toggle("is-active", b.dataset.color.toLowerCase() === String(v).toLowerCase()));
    }
    setTimeout(() => syncSwatches(s.accent), 0);

    return section("Allgemein", "Name, Farbe und Uhrzeit", [
      field("Titel", textInput(s.title, (v) => { s.title = v; commit(); })),
      field("Untertitel", textInput(s.subtitle, (v) => { s.subtitle = v; commit(); })),
      field("Dein Name (für die Begrüßung)", textInput(s.owner, (v) => { s.owner = v; commit(); })),
      field("Akzentfarbe", colorRow, "Tippe eine eigene Farbe an oder wähle eine Vorgabe."),
      field("Sprache / Format", selectInput(s.locale || "de-DE", [
        ["de-DE", "Deutsch (de-DE)"], ["en-US", "English US (en-US)"],
        ["en-GB", "English UK (en-GB)"], ["fr-FR", "Français (fr-FR)"],
        ["es-ES", "Español (es-ES)"], ["it-IT", "Italiano (it-IT)"],
      ], (v) => { s.locale = v; commit(); })),
      el("div", { class: "set-field" }, [
        toggle(s.clock24h, (v) => { s.clock24h = v; commit(); }, "24-Stunden-Uhr"),
      ]),
    ]);
  }

  /* --------------------------------------------------------------------------
   *  Section: Weather (with city search — no coordinates needed)
   * ----------------------------------------------------------------------- */
  function sectionWeather() {
    const w = set().weather || (set().weather = { enabled: false, unit: "celsius" });
    const pip = set().publicIp || (set().publicIp = { enabled: true });

    const status = el("span", { class: "set-geo__status" });
    const cityInput = textInput(w.label || "", () => {}, { placeholder: "z. B. Berlin", class: "set-input set-geo__input" });

    async function searchCity() {
      const name = cityInput.value.trim();
      if (!name) return;
      status.textContent = "Suche…";
      status.className = "set-geo__status";
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=de&format=json`);
        const d = await r.json();
        const hit = d.results && d.results[0];
        if (!hit) { status.textContent = "Keine Stadt gefunden."; status.classList.add("is-err"); return; }
        w.label = hit.name + (hit.country_code ? `, ${hit.country_code}` : "");
        w.latitude = hit.latitude;
        w.longitude = hit.longitude;
        w.enabled = true;
        cityInput.value = w.label;
        commit();
        H.refreshWeather();
        rebuild();
        status.textContent = `✓ ${w.label}  ·  ${hit.latitude.toFixed(2)}, ${hit.longitude.toFixed(2)}`;
        status.classList.add("is-ok");
      } catch (e) {
        status.textContent = "Suche fehlgeschlagen (offline?).";
        status.classList.add("is-err");
      }
    }
    cityInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); searchCity(); } });

    const geoRow = el("div", { class: "set-geo" }, [
      cityInput,
      el("button", { type: "button", class: "set-btn set-btn--accent", text: "Suchen", onclick: searchCity }),
    ]);

    return section("Wetter", "Aktuelle Temperatur im Kopfbereich", [
      el("div", { class: "set-field" }, [
        toggle(w.enabled, (v) => { w.enabled = v; commit(); H.refreshWeather(); }, "Wetter anzeigen"),
      ]),
      field("Stadt", geoRow, "Stadt eingeben und „Suchen“ — Koordinaten werden automatisch gesetzt."),
      el("div", { class: "set-field" }, [status]),
      field("Einheit", selectInput(w.unit === "fahrenheit" ? "fahrenheit" : "celsius", [
        ["celsius", "Celsius (°C)"], ["fahrenheit", "Fahrenheit (°F)"],
      ], (v) => { w.unit = v; commit(); H.refreshWeather(); })),
      el("div", { class: "set-field" }, [
        toggle(pip.enabled, (v) => { pip.enabled = v; commit(); }, "Öffentliche IP darunter anzeigen"),
      ]),
    ]);
  }

  /* --------------------------------------------------------------------------
   *  Section: Search + Status
   * ----------------------------------------------------------------------- */
  function sectionSearch() {
    const sr = set().search || (set().search = { enabled: true, engines: {} });
    const engineOpts = Object.keys(sr.engines || {}).map((k) => [k, (sr.engines[k].label || k)]);

    return section("Suche", "Web-Suchleiste auf der Startseite", [
      el("div", { class: "set-field" }, [
        toggle(sr.enabled, (v) => { sr.enabled = v; commit(); }, "Suchleiste anzeigen"),
      ]),
      engineOpts.length
        ? field("Standard-Suchmaschine", selectInput(sr.defaultEngine, engineOpts, (v) => { sr.defaultEngine = v; commit(); }))
        : document.createTextNode(""),
    ]);
  }

  function sectionStatus() {
    const s = set();
    const st = s.stats || (s.stats = { enabled: true });
    return section("Statusprüfung", "Grüne/rote Punkte zeigen, ob ein Dienst erreichbar ist", [
      el("div", { class: "set-field" }, [
        toggle(s.statusCheck, (v) => { s.statusCheck = v; commit(); }, "Status-Punkte anzeigen"),
      ]),
      el("div", { class: "set-field" }, [
        toggle(st.enabled, (v) => { st.enabled = v; commit(); }, "Zahlenleiste anzeigen"),
        el("span", { class: "set-field__hint",
          text: "Überwacht / Gruppen / Online / Offline unter der Suchleiste. Ohne Statusprüfung immer aus." }),
      ]),
      field("Prüfintervall (Sekunden)",
        el("input", {
          class: "set-input", type: "number", min: "10", step: "5",
          value: Math.round((s.statusIntervalMs || 60000) / 1000),
          oninput: (e) => { s.statusIntervalMs = Math.max(10, Number(e.target.value) || 60) * 1000; commit(); },
        }),
        "Wie oft erneut geprüft wird."),
    ]);
  }

  /* --------------------------------------------------------------------------
   *  Section: Bookmarks editor (the big one) — rebuilt on structural change
   * ----------------------------------------------------------------------- */
  let bookmarksBody;

  function sectionBookmarks() {
    bookmarksBody = el("div", { class: "set-groups" });
    const wrap = section("Lesezeichen", "Deine Links — gruppiert", [
      bookmarksBody,
      el("button", {
        type: "button", class: "set-btn set-btn--block", html: "＋ &nbsp;Neue Gruppe",
        onclick: () => { cfg().groups.push({ name: "Neue Gruppe", links: [] }); commit(); buildBookmarks(); },
      }),
    ]);
    return wrap;
  }

  function buildBookmarks() {
    if (!bookmarksBody) return;
    bookmarksBody.innerHTML = "";
    const gs = cfg().groups;

    gs.forEach((group, gi) => {
      const links = group.links || (group.links = []);

      const linksWrap = el("div", { class: "set-links" });
      links.forEach((link, li) => linksWrap.appendChild(linkRow(group, gi, link, li)));

      const card = el("div", { class: "set-group" }, [
        el("div", { class: "set-group__head" }, [
          el("span", { class: "set-grip", text: "⋮⋮", title: "Reihenfolge" }),
          textInput(group.name, (v) => { group.name = v; commit(); }, { class: "set-input set-group__name", placeholder: "Gruppenname" }),
          iconBtn("↑", "Nach oben", gi === 0, () => moveItem(gs, gi, -1)),
          iconBtn("↓", "Nach unten", gi === gs.length - 1, () => moveItem(gs, gi, 1)),
          iconBtn("🗑", "Gruppe löschen", false, () => {
            if (confirm(`Gruppe „${group.name || ""}“ mit ${links.length} Link(s) löschen?`)) {
              gs.splice(gi, 1); commit(); buildBookmarks();
            }
          }, "set-iconbtn--danger"),
        ]),
        linksWrap,
        el("button", {
          type: "button", class: "set-btn set-btn--ghost",
          html: "＋ Link hinzufügen",
          onclick: () => { links.push({ name: "Neuer Link", url: "https://", ping: false }); commit(); buildBookmarks(); },
        }),
      ]);
      bookmarksBody.appendChild(card);
    });

    if (!gs.length) {
      bookmarksBody.appendChild(el("p", { class: "set-empty", text: "Noch keine Gruppen. Lege unten eine an." }));
    }
  }

  function linkRow(group, gi, link, li) {
    const links = group.links;
    return el("div", { class: "set-link" }, [
      el("div", { class: "set-link__main" }, [
        textInput(link.icon, (v) => { link.icon = v; commit(); }, { class: "set-input set-link__icon", placeholder: "Symbol", title: "Emoji, Bild-URL oder „Favicon holen“ — leer = Kürzel" }),
        el("button", {
          type: "button", class: "set-iconbtn set-link__favicon", text: "🌐",
          title: "Favicon von der Webseite holen",
          onclick: (e) => fetchFavicon(link, e.currentTarget),
        }),
        textInput(link.name, (v) => { link.name = v; commit(); }, { class: "set-input set-link__name", placeholder: "Name" }),
      ]),
      textInput(link.url, (v) => { link.url = v; commit(); }, { class: "set-input", placeholder: "https://dienst.local", type: "url" }),
      textInput(link.description, (v) => { link.description = v; commit(); }, { class: "set-input", placeholder: "Beschreibung (optional)" }),
      el("div", { class: "set-link__foot" }, [
        toggle(!!link.ping, (v) => { link.ping = v; commit(); }, "Status prüfen"),
        el("span", { class: "set-link__spacer" }),
        iconBtn("↑", "Nach oben", li === 0, () => moveItem(links, li, -1)),
        iconBtn("↓", "Nach unten", li === links.length - 1, () => moveItem(links, li, 1)),
        iconBtn("🗑", "Link löschen", false, () => { links.splice(li, 1); commit(); buildBookmarks(); }, "set-iconbtn--danger"),
      ]),
    ]);
  }

  function iconBtn(label, title, disabled, onClick, extra) {
    return el("button", {
      type: "button", class: "set-iconbtn " + (extra || ""), title, text: label,
      disabled: disabled || false, onclick: onClick,
    });
  }

  /* Fetch the website's favicon and drop it into the link's icon field.
     With a server (server.py) it resolves the real <link rel=icon>; otherwise
     it falls back to the conventional <origin>/favicon.ico. */
  async function fetchFavicon(link, btn) {
    const url = (link.url || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      alert("Bitte zuerst eine vollständige Adresse (http:// oder https://) im Link eintragen.");
      return;
    }

    const prev = btn.textContent;
    btn.textContent = "…";
    btn.disabled = true;

    const serverEnabled = location.protocol === "http:" || location.protocol === "https:";
    let icon = null;
    if (serverEnabled) {
      try {
        const res = await fetch("/api/favicon?url=" + encodeURIComponent(url));
        if (res.ok) {
          const data = await res.json();
          if (data && data.icon) icon = data.icon;
        }
      } catch (e) { /* fall through to the local guess */ }
    }
    if (!icon) {
      try { icon = new URL(url).origin + "/favicon.ico"; } catch (e) { icon = null; }
    }

    if (!icon) {
      btn.textContent = prev;
      btn.disabled = false;
      alert("Adresse konnte nicht verarbeitet werden.");
      return;
    }
    link.icon = icon;
    commit();
    buildBookmarks();   // reflect the new icon value in the field + live preview
  }

  function moveItem(arr, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const [it] = arr.splice(i, 1);
    arr.splice(j, 0, it);
    commit();
    buildBookmarks();
  }

  /* --------------------------------------------------------------------------
   *  Section: Backup (export / import / reset)
   * ----------------------------------------------------------------------- */
  function sectionBackup() {
    const importInput = el("input", {
      type: "file", accept: ".js,.json,application/json,text/javascript", class: "set-hidden-file",
      onchange: (e) => importFile(e.target.files[0]),
    });

    const central = location.protocol === "http:" || location.protocol === "https:";
    const note = central
      ? "Alle Einstellungen werden <b>automatisch zentral gespeichert</b> (auf dem Server) und " +
        "stehen dadurch auf <b>allen Geräten im Netzwerk</b> zur Verfügung — ein manuelles Übertragen " +
        "per Datei ist nicht mehr nötig. Der Download unten ist nur ein optionales Backup."
      : "Diese Seite wurde ohne Server geöffnet, daher werden die Einstellungen <b>nur in diesem Browser</b> " +
        "gespeichert. Für die geräteübergreifende Speicherung starte den Server mit " +
        "<code>python3 server.py</code> und öffne die Seite über dessen Adresse.";

    // Only meaningful with a server; the token guards central PUT/DELETE when
    // server.py runs with HOMELAB_TOKEN set. Stored per-browser, never synced.
    const tokenField = central
      ? field("Schreib-Token (optional)",
          el("input", {
            class: "set-input", type: "password", autocomplete: "off",
            placeholder: "nur nötig, wenn der Server ein Token verlangt",
            value: H.getToken ? H.getToken() : "",
            oninput: (e) => { if (H.setToken) H.setToken(e.target.value); },
          }),
          "Muss zum HOMELAB_TOKEN des Servers passen, sonst schlägt das Speichern fehl.")
      : document.createTextNode("");

    return section("Sichern & Übertragen", "Deine Änderungen werden automatisch gespeichert", [
      el("p", { class: "set-note", html: note }),
      tokenField,
      el("div", { class: "set-actions" }, [
        el("button", { type: "button", class: "set-btn set-btn--accent", html: "⬇ &nbsp;config.js herunterladen", onclick: exportConfig }),
        el("button", { type: "button", class: "set-btn", html: "⬆ &nbsp;Aus Datei laden", onclick: () => importInput.click() }),
      ]),
      importInput,
      el("button", { type: "button", class: "set-btn set-btn--danger-ghost", text: "Auf Werkseinstellungen zurücksetzen", onclick: resetAll }),
    ]);
  }

  function exportConfig() {
    const data = cfg();
    const body =
      "/* Homelab — exportiert am " + new Date().toLocaleString() + " */\n" +
      "/* Diese Datei in den Projektordner legen, um sie zur Vorgabe für alle zu machen. */\n" +
      "window.CONFIG = " + JSON.stringify(data, null, 2) + ";\n";
    const blob = new Blob([body], { type: "text/javascript;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "config.js" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseConfigText(String(reader.result));
        if (!parsed || typeof parsed !== "object") throw new Error("kein gültiges Format");
        H.replaceConfig(parsed);
        buildBookmarks(); rebuild();
        alert("Einstellungen geladen ✓");
      } catch (err) {
        alert("Datei konnte nicht gelesen werden:\n" + err.message);
      }
    };
    reader.readAsText(file);
  }

  function parseConfigText(text) {
    const t = text.trim();
    try { return JSON.parse(t); } catch (e) { /* not plain JSON */ }
    // config.js style: "window.CONFIG = { ... };"
    const fn = new Function("var window={};" + t + ";return window.CONFIG;");
    return fn();
  }

  function resetAll() {
    if (!confirm("Wirklich alles auf die Werkseinstellungen zurücksetzen? Deine Änderungen in diesem Browser gehen verloren.")) return;
    H.resetDefaults();
    buildBookmarks(); rebuild();
  }

  /* --------------------------------------------------------------------------
   *  Section shell + full rebuild
   * ----------------------------------------------------------------------- */
  function section(title, subtitle, children) {
    const sec = el("section", { class: "set-section" }, [
      el("div", { class: "set-section__head" }, [
        el("h3", { text: title }),
        subtitle ? el("p", { text: subtitle }) : document.createTextNode(""),
      ]),
      el("div", { class: "set-section__body" }, children),
    ]);
    return sec;
  }

  let body;
  function rebuild() {
    if (!body) return;
    const scroll = body.scrollTop;
    body.innerHTML = "";
    [sectionGeneral(), sectionWeather(), sectionSearch(), sectionStatus(), sectionBookmarks(), sectionBackup()]
      .forEach((s) => body.appendChild(s));
    buildBookmarks();
    body.scrollTop = scroll;
  }

  /* --------------------------------------------------------------------------
   *  Mount drawer + trigger button
   * ----------------------------------------------------------------------- */
  function mount() {
    body = el("div", { class: "set__body" });

    drawer = el("aside", { class: "set", role: "dialog", "aria-label": "Einstellungen", "aria-modal": "true" }, [
      el("div", { class: "set__head" }, [
        el("div", {}, [
          el("h2", { class: "set__title", text: "Einstellungen" }),
          el("p", { class: "set__sub", text: "Änderungen werden sofort gespeichert" }),
        ]),
        el("button", { class: "set__close", type: "button", "aria-label": "Schließen", html: "&times;", onclick: close }),
      ]),
      body,
    ]);

    overlay = el("div", { class: "set-overlay", hidden: true, onclick: (e) => { if (e.target === overlay) close(); } }, [drawer]);
    document.body.appendChild(overlay);

    const btn = el("button", {
      class: "gear", type: "button", title: "Einstellungen", "aria-label": "Einstellungen öffnen",
      html: gearSvg(), onclick: open,
    });
    const meta = document.querySelector(".topbar__meta");
    (meta || document.body).appendChild(btn);

    rebuild();

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("settings-open")) close();
    });

    // app.js swapped the active config (server sync, import, reset) — rebuild so
    // our section closures point at the new object instead of an orphaned one.
    document.addEventListener("homelab:config-replaced", () => { if (body) rebuild(); });
  }

  function gearSvg() {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
