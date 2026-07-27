# Sprachpakete (i18n) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Startseite und Einstellungs-Schublade bekommen getrennt wählbare Sprachen (Englisch + Deutsch), erweiterbar durch Anhängen eines Blocks in `lang.js`.

**Architecture:** Eine neue Datei `lang.js` setzt `window.LANGUAGES` mit je einem Paket pro Sprache (`name`, `locale`, `ui`, `settings`). `app.js` bekommt ein kleines i18n-Modul, das die Pakete auflöst und `t()` / `tSet()` über `window.Homelab` anbietet. Statische Texte in `index.html` werden über `data-i18n`-Attribute gebunden, damit eine neue Sprache das Markup nie anfasst. `check-i18n.js` prüft Schlüsselgleichheit und Deckung.

**Tech Stack:** Reines Browser-JavaScript (ES2019, eine IIFE pro Datei), Node ≥ 22 nur für die Prüfskripte. Keine Abhängigkeiten, kein Build-Schritt.

**Spec:** `docs/superpowers/specs/2026-07-27-sprachpakete-design.md`

## Global Constraints

- **Keine Abhängigkeiten, kein Build-Schritt, kein Framework, kein Paketmanager.** Weder im Browser-Code noch in `check-i18n.js` (nur Node-Standardbibliothek).
- **Die Seite muss per `file://` voll funktionieren.** Kein `fetch` von Sprachdaten — `lang.js` ist ein normales `<script>` mit einem Global.
- **`settings.js` steuert die Seite ausschließlich über `window.Homelab`**, niemals direkt über DOM-Board oder `localStorage`.
- **Code-Stil:** 2 Leerzeichen Einrückung, doppelte Anführungszeichen in JS, nachgestellte Kommas in mehrzeiligen Literalen.
- **Sprache der Kommentare:** englisch in `app.js`, `index.html`, `lang.js`, `check-i18n.js` (wie im Bestand). Commit-Nachrichten deutsch ohne Umlaute (wie im Bestand: „Doku: …", „CI: …").
- **Keine KI-Attribution** in Commits, Dateinamen oder Dateiinhalten.
- **Jeder Nutzertext, der `innerHTML` erreicht, muss durch `escapeHtml()`.** Sprachpaket-Texte sind autorenseitig und dürfen Markup enthalten; über `{…}` eingesetzte Werte aus Nutzerdaten nicht.
- **Fallback-Sprache ist immer `en`.** Nachschlagen: gewähltes Paket → `en` → der Schlüssel selbst.
- **Nicht übersetzt** werden Nutzerdaten: `title`, `subtitle`, `owner`, Gruppennamen, Linknamen und -beschreibungen, sowie die Beispieldaten in `config.js`.

## File Structure

| Datei | Verantwortung | Task |
| --- | --- | --- |
| `lang.js` | **Neu.** Alle Sprachpakete. Einzige Datei, die eine neue Sprache anfasst. | 1 |
| `check-i18n.js` | **Neu.** Prüft Schlüsselgleichheit + Deckung von Verwendung und Markup. | 1 |
| `app.js` | i18n-Modul, `Homelab`-API-Erweiterung, `applyStaticStrings()`, dynamische Texte, Uhr-Locale. | 2, 3, 4 |
| `config.js` | `locale` raus, `lang: { ui, settings }` rein. | 2 |
| `index.html` | `<script src="lang.js">`, `data-i18n`-Attribute, Filter-Meldung umgebaut. | 1, 3 |
| `settings.js` | Alle Literale → `H.tSet(…)`, zwei Sprach-Auswahlfelder, Geocoding-Sprache. | 5 |
| `README.md`, `CLAUDE.md` | Doku. | 6 |

## Testing-Hinweis für alle Tasks

Dieses Repo hat kein Test-Framework. Geprüft wird mit:

1. `node --check <datei>` — Syntaxfehler.
2. `node check-i18n.js` — Paket- und Deckungsprüfung (ab Task 1 verfügbar).
3. Ausschnitte reiner Funktionen aus dem Quelltext mit `new Function` heraustrennen und direkt aufrufen — das testet den ausgelieferten Code, keine Kopie. Die Extraktionsschnipsel stehen jeweils vollständig im Task.

Temporäre Dateien gehören in das Scratchpad-Verzeichnis, nicht ins Repo.

---

### Task 1: Sprachpakete + Prüfskript

**Files:**
- Create: `check-i18n.js`
- Create: `lang.js`
- Modify: `index.html:109` (Skript-Einbindung)

**Interfaces:**
- Consumes: nichts.
- Produces: `window.LANGUAGES` — ein Objekt `{ [code]: { name: string, locale: string, ui: {[key]: string}, settings: {[key]: string} } }` mit den Codes `en` und `de`. Alle folgenden Tasks lesen ausschließlich diese Struktur.

- [ ] **Step 1: Prüfskript schreiben**

Create `check-i18n.js`:

```js
#!/usr/bin/env node
/* =============================================================================
 *  HOMELAB START PAGE — LANGUAGE PACK CHECK
 *  Run with `node check-i18n.js`. No dependencies.
 *
 *  1. Key parity   — every pack carries the same keys as the English one.
 *  2. Usage covered — every t("…") / tSet("…") literal exists in English.
 *  3. Markup covered — every data-i18n key in index.html exists in English.
 *
 *  Exits 1 on findings so it can be wired into CI later.
 * ========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const FALLBACK = "en";
const problems = [];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

/* Run lang.js in a bare sandbox — it only assigns to `window`. */
function loadPacks() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read("lang.js"), sandbox, { filename: "lang.js" });
  const packs = sandbox.window.LANGUAGES;
  if (!packs || typeof packs !== "object") {
    problems.push("lang.js did not set window.LANGUAGES");
    return {};
  }
  return packs;
}

function keysOf(pack, kind) {
  return Object.keys((pack && pack[kind]) || {});
}

/* ----- 1. key parity ----- */
function checkParity(packs) {
  const base = packs[FALLBACK];
  if (!base) { problems.push(`no "${FALLBACK}" pack in lang.js`); return; }

  Object.keys(packs).forEach((code) => {
    const pack = packs[code];
    if (!pack.name) problems.push(`${code}: missing "name"`);
    if (!pack.locale) problems.push(`${code}: missing "locale"`);
    if (code === FALLBACK) return;

    ["ui", "settings"].forEach((kind) => {
      const want = keysOf(base, kind);
      const have = keysOf(pack, kind);
      want.filter((k) => have.indexOf(k) === -1)
        .forEach((k) => problems.push(`${code}.${kind}: missing key "${k}"`));
      have.filter((k) => want.indexOf(k) === -1)
        .forEach((k) => problems.push(`${code}.${kind}: unknown key "${k}" (not in ${FALLBACK})`));
    });
  });
}

/* ----- 2. usage covered ----- */
function collect(text, re) {
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

function checkUsage(packs) {
  const base = packs[FALLBACK];
  if (!base) return;
  [["app.js", "ui"], ["settings.js", "settings"]].forEach(([file, kind]) => {
    const src = read(file);
    // settings.js uses a short alias T(...) for tSet(...) — cover both.
    const used = kind === "ui"
      ? collect(src, /\bt\(\s*"([^"]+)"/g)
      : collect(src, /\b(?:tSet|T)\(\s*"([^"]+)"/g);
    const have = keysOf(base, kind);
    used.filter((k) => have.indexOf(k) === -1)
      .forEach((k) => problems.push(`${file}: uses "${k}" which is not in ${FALLBACK}.${kind}`));
  });
}

/* ----- 3. markup covered ----- */
function checkMarkup(packs) {
  const base = packs[FALLBACK];
  if (!base) return;
  const html = read("index.html");
  const have = keysOf(base, "ui");

  collect(html, /data-i18n="([^"]+)"/g).forEach((key) => {
    if (have.indexOf(key) === -1) problems.push(`index.html: data-i18n="${key}" is not in ${FALLBACK}.ui`);
  });

  collect(html, /data-i18n-attr="([^"]+)"/g).forEach((value) => {
    value.split(",").forEach((pair) => {
      const key = (pair.split(":")[1] || "").trim();
      if (!key) { problems.push(`index.html: malformed data-i18n-attr "${value}"`); return; }
      if (have.indexOf(key) === -1) problems.push(`index.html: data-i18n-attr key "${key}" is not in ${FALLBACK}.ui`);
    });
  });
}

const packs = loadPacks();
checkParity(packs);
checkUsage(packs);
checkMarkup(packs);

if (problems.length) {
  console.error(`check-i18n: ${problems.length} problem(s)`);
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}
console.log(`check-i18n: ok (${Object.keys(packs).join(", ")})`);
```

- [ ] **Step 2: Prüfskript laufen lassen — es muss scheitern**

Run: `node check-i18n.js`
Expected: FAIL, `Error: ENOENT ... lang.js` (die Datei gibt es noch nicht).

- [ ] **Step 3: Sprachpakete anlegen**

Create `lang.js`:

```js
/* =============================================================================
 *  HOMELAB START PAGE — LANGUAGE PACKS
 *
 *  Every language is one block below. To add one, copy the "en" block, keep
 *  every key, and translate the values — no other file needs to change.
 *  Run `node check-i18n.js` afterwards to verify the key set is complete.
 *
 *    name      Shown in both language pickers.
 *    locale    BCP-47 tag for clock, date and the weather city search.
 *    ui        Texts on the start page.
 *    settings  Texts in the settings drawer.
 *
 *  Values may contain markup where the page already uses innerHTML; the
 *  {placeholders} are filled with user data and are escaped by the caller.
 *  English is the fallback: a key missing elsewhere falls back to "en".
 * ========================================================================== */

window.LANGUAGES = {
  en: {
    name: "English",
    locale: "en-US",

    ui: {
      "greeting.night": "Late night",
      "greeting.morning": "Good morning",
      "greeting.afternoon": "Good afternoon",
      "greeting.evening": "Good evening",
      "greeting.plain": "{part}.",
      "greeting.withName": "{part}, <b>{name}</b>.",

      "stats.monitored": "Monitored",
      "stats.groups": "Groups",
      "stats.online": "Online",
      "stats.offline": "Offline",

      "search.placeholder": "Search the web   ·   start with  /  to filter your links",
      "search.aria": "Search",

      "filter.empty": "No links match “{term}”",

      "footer.filter": "filter links",
      "footer.clear": "clear",

      "status.checking": "Checking…",
      "status.online": "Online",
      "status.offline": "Unreachable",

      "pubip.label": "WAN IP",
      "pubip.unavailable": "n/a",
      "pubip.error": "Public IP unavailable (internet/blocker?)",
    },

    settings: {
      "drawer.title": "Settings",
      "drawer.sub": "Changes are saved immediately",
      "drawer.close": "Close",
      "drawer.open": "Open settings",

      "general.heading": "General",
      "general.sub": "Name, color, language and clock",
      "general.title": "Title",
      "general.subtitle": "Subtitle",
      "general.owner": "Your name (for the greeting)",
      "general.accent": "Accent color",
      "general.accentHint": "Tap a color of your own or pick a preset.",
      "general.langUi": "Language of the start page",
      "general.langSettings": "Language of the settings",
      "general.langAuto": "Automatic (browser)",
      "general.clock24h": "24-hour clock",

      "weather.heading": "Weather",
      "weather.sub": "Current temperature in the header",
      "weather.toggle": "Show weather",
      "weather.city": "City",
      "weather.cityHint": "Enter a city and hit “Search” — coordinates are set automatically.",
      "weather.cityPlaceholder": "e.g. Berlin",
      "weather.search": "Search",
      "weather.searching": "Searching…",
      "weather.notFound": "No city found.",
      "weather.searchFailed": "Search failed (offline?).",
      "weather.unit": "Unit",
      "weather.celsius": "Celsius (°C)",
      "weather.fahrenheit": "Fahrenheit (°F)",
      "weather.pubip": "Show public IP below",

      "search.heading": "Search",
      "search.sub": "Web search bar on the start page",
      "search.toggle": "Show search bar",
      "search.default": "Default search engine",

      "status.heading": "Status check",
      "status.sub": "Green/red dots show whether a service is reachable",
      "status.toggle": "Show status dots",
      "status.statsToggle": "Show number strip",
      "status.statsHint": "Monitored / groups / online / offline under the search bar. Always off without status checks.",
      "status.interval": "Check interval (seconds)",
      "status.intervalHint": "How often it re-checks.",

      "bookmarks.heading": "Bookmarks",
      "bookmarks.sub": "Your links — grouped",
      "bookmarks.addGroup": "＋ &nbsp;New group",
      "bookmarks.newGroupName": "New group",
      "bookmarks.groupNamePlaceholder": "Group name",
      "bookmarks.reorder": "Order",
      "bookmarks.moveUp": "Move up",
      "bookmarks.moveDown": "Move down",
      "bookmarks.deleteGroup": "Delete group",
      "bookmarks.deleteGroupConfirm": "Delete group “{name}” with {count} link(s)?",
      "bookmarks.addLink": "＋ Add link",
      "bookmarks.newLinkName": "New link",
      "bookmarks.empty": "No groups yet. Create one below.",
      "bookmarks.iconPlaceholder": "Icon",
      "bookmarks.iconTitle": "Emoji, image URL or “Fetch favicon” — empty = monogram",
      "bookmarks.faviconTitle": "Fetch favicon from the website",
      "bookmarks.namePlaceholder": "Name",
      "bookmarks.urlPlaceholder": "https://service.local",
      "bookmarks.descPlaceholder": "Description (optional)",
      "bookmarks.ping": "Check status",
      "bookmarks.deleteLink": "Delete link",
      "bookmarks.faviconNeedsUrl": "Please enter a full address (http:// or https://) in the link first.",
      "bookmarks.faviconFailed": "The address could not be processed.",

      "backup.heading": "Backup & transfer",
      "backup.sub": "Your changes are saved automatically",
      "backup.noteServer": "All settings are <b>saved centrally and automatically</b> (on the server) and are therefore available on <b>every device on the network</b> — copying a file across by hand is no longer needed. The download below is only an optional backup.",
      "backup.noteLocal": "This page was opened without a server, so the settings are stored <b>in this browser only</b>. For storage across devices start the server with <code>python3 server.py</code> and open the page through its address.",
      "backup.token": "Write token (optional)",
      "backup.tokenPlaceholder": "only needed if the server requires a token",
      "backup.tokenHint": "Must match the server's HOMELAB_TOKEN, otherwise saving fails.",
      "backup.download": "⬇ &nbsp;Download config.js",
      "backup.upload": "⬆ &nbsp;Load from file",
      "backup.reset": "Reset to factory settings",
      "backup.resetConfirm": "Really reset everything to factory settings? Your changes in this browser will be lost.",
      "backup.exportHeader": "/* Homelab — exported on {date} */",
      "backup.exportHint": "/* Drop this file into the project folder to make it the default for everyone. */",
      "backup.importBadFormat": "not a valid format",
      "backup.importOk": "Settings loaded ✓",
      "backup.importFailed": "The file could not be read:\n{error}",
    },
  },

  de: {
    name: "Deutsch",
    locale: "de-DE",

    ui: {
      "greeting.night": "Gute Nacht",
      "greeting.morning": "Guten Morgen",
      "greeting.afternoon": "Guten Tag",
      "greeting.evening": "Guten Abend",
      "greeting.plain": "{part}.",
      "greeting.withName": "{part}, <b>{name}</b>.",

      "stats.monitored": "Überwacht",
      "stats.groups": "Gruppen",
      "stats.online": "Online",
      "stats.offline": "Offline",

      "search.placeholder": "Web durchsuchen   ·   mit  /  beginnen, um Links zu filtern",
      "search.aria": "Suche",

      "filter.empty": "Keine Links passen zu „{term}“",

      "footer.filter": "Links filtern",
      "footer.clear": "leeren",

      "status.checking": "Prüfe…",
      "status.online": "Online",
      "status.offline": "Nicht erreichbar",

      "pubip.label": "WAN-IP",
      "pubip.unavailable": "n/v",
      "pubip.error": "Öffentliche IP nicht abrufbar (Internet/Blocker?)",
    },

    settings: {
      "drawer.title": "Einstellungen",
      "drawer.sub": "Änderungen werden sofort gespeichert",
      "drawer.close": "Schließen",
      "drawer.open": "Einstellungen öffnen",

      "general.heading": "Allgemein",
      "general.sub": "Name, Farbe, Sprache und Uhrzeit",
      "general.title": "Titel",
      "general.subtitle": "Untertitel",
      "general.owner": "Dein Name (für die Begrüßung)",
      "general.accent": "Akzentfarbe",
      "general.accentHint": "Tippe eine eigene Farbe an oder wähle eine Vorgabe.",
      "general.langUi": "Sprache der Startseite",
      "general.langSettings": "Sprache der Einstellungen",
      "general.langAuto": "Automatisch (Browser)",
      "general.clock24h": "24-Stunden-Uhr",

      "weather.heading": "Wetter",
      "weather.sub": "Aktuelle Temperatur im Kopfbereich",
      "weather.toggle": "Wetter anzeigen",
      "weather.city": "Stadt",
      "weather.cityHint": "Stadt eingeben und „Suchen“ — Koordinaten werden automatisch gesetzt.",
      "weather.cityPlaceholder": "z. B. Berlin",
      "weather.search": "Suchen",
      "weather.searching": "Suche…",
      "weather.notFound": "Keine Stadt gefunden.",
      "weather.searchFailed": "Suche fehlgeschlagen (offline?).",
      "weather.unit": "Einheit",
      "weather.celsius": "Celsius (°C)",
      "weather.fahrenheit": "Fahrenheit (°F)",
      "weather.pubip": "Öffentliche IP darunter anzeigen",

      "search.heading": "Suche",
      "search.sub": "Web-Suchleiste auf der Startseite",
      "search.toggle": "Suchleiste anzeigen",
      "search.default": "Standard-Suchmaschine",

      "status.heading": "Statusprüfung",
      "status.sub": "Grüne/rote Punkte zeigen, ob ein Dienst erreichbar ist",
      "status.toggle": "Status-Punkte anzeigen",
      "status.statsToggle": "Zahlenleiste anzeigen",
      "status.statsHint": "Überwacht / Gruppen / Online / Offline unter der Suchleiste. Ohne Statusprüfung immer aus.",
      "status.interval": "Prüfintervall (Sekunden)",
      "status.intervalHint": "Wie oft erneut geprüft wird.",

      "bookmarks.heading": "Lesezeichen",
      "bookmarks.sub": "Deine Links — gruppiert",
      "bookmarks.addGroup": "＋ &nbsp;Neue Gruppe",
      "bookmarks.newGroupName": "Neue Gruppe",
      "bookmarks.groupNamePlaceholder": "Gruppenname",
      "bookmarks.reorder": "Reihenfolge",
      "bookmarks.moveUp": "Nach oben",
      "bookmarks.moveDown": "Nach unten",
      "bookmarks.deleteGroup": "Gruppe löschen",
      "bookmarks.deleteGroupConfirm": "Gruppe „{name}“ mit {count} Link(s) löschen?",
      "bookmarks.addLink": "＋ Link hinzufügen",
      "bookmarks.newLinkName": "Neuer Link",
      "bookmarks.empty": "Noch keine Gruppen. Lege unten eine an.",
      "bookmarks.iconPlaceholder": "Symbol",
      "bookmarks.iconTitle": "Emoji, Bild-URL oder „Favicon holen“ — leer = Kürzel",
      "bookmarks.faviconTitle": "Favicon von der Webseite holen",
      "bookmarks.namePlaceholder": "Name",
      "bookmarks.urlPlaceholder": "https://dienst.local",
      "bookmarks.descPlaceholder": "Beschreibung (optional)",
      "bookmarks.ping": "Status prüfen",
      "bookmarks.deleteLink": "Link löschen",
      "bookmarks.faviconNeedsUrl": "Bitte zuerst eine vollständige Adresse (http:// oder https://) im Link eintragen.",
      "bookmarks.faviconFailed": "Adresse konnte nicht verarbeitet werden.",

      "backup.heading": "Sichern & Übertragen",
      "backup.sub": "Deine Änderungen werden automatisch gespeichert",
      "backup.noteServer": "Alle Einstellungen werden <b>automatisch zentral gespeichert</b> (auf dem Server) und stehen dadurch auf <b>allen Geräten im Netzwerk</b> zur Verfügung — ein manuelles Übertragen per Datei ist nicht mehr nötig. Der Download unten ist nur ein optionales Backup.",
      "backup.noteLocal": "Diese Seite wurde ohne Server geöffnet, daher werden die Einstellungen <b>nur in diesem Browser</b> gespeichert. Für die geräteübergreifende Speicherung starte den Server mit <code>python3 server.py</code> und öffne die Seite über dessen Adresse.",
      "backup.token": "Schreib-Token (optional)",
      "backup.tokenPlaceholder": "nur nötig, wenn der Server ein Token verlangt",
      "backup.tokenHint": "Muss zum HOMELAB_TOKEN des Servers passen, sonst schlägt das Speichern fehl.",
      "backup.download": "⬇ &nbsp;config.js herunterladen",
      "backup.upload": "⬆ &nbsp;Aus Datei laden",
      "backup.reset": "Auf Werkseinstellungen zurücksetzen",
      "backup.resetConfirm": "Wirklich alles auf die Werkseinstellungen zurücksetzen? Deine Änderungen in diesem Browser gehen verloren.",
      "backup.exportHeader": "/* Homelab — exportiert am {date} */",
      "backup.exportHint": "/* Diese Datei in den Projektordner legen, um sie zur Vorgabe für alle zu machen. */",
      "backup.importBadFormat": "kein gültiges Format",
      "backup.importOk": "Einstellungen geladen ✓",
      "backup.importFailed": "Datei konnte nicht gelesen werden:\n{error}",
    },
  },
};
```

- [ ] **Step 4: Prüfskript laufen lassen — jetzt muss es bestehen**

Run: `node check-i18n.js`
Expected: PASS, Ausgabe `check-i18n: ok (en, de)`.

(Die Prüfungen 2 und 3 finden noch nichts, weil es noch keine `t(…)`-Aufrufe und keine `data-i18n`-Attribute gibt — das ist in diesem Task korrekt.)

- [ ] **Step 5: Gegenprobe — das Skript muss eine Lücke auch finden**

Entferne testweise die Zeile `"stats.groups": "Gruppen",` aus dem `de`-Block.

Run: `node check-i18n.js`
Expected: FAIL mit `de.ui: missing key "stats.groups"`, Exit-Code 1 (`echo $?` → `1`).

Zeile danach wieder einfügen und erneut `node check-i18n.js` laufen lassen → PASS.

- [ ] **Step 6: `lang.js` in die Seite einbinden**

Modify `index.html:109` — `lang.js` muss **vor** `app.js` geladen werden:

```html
  <script src="config.js"></script>
  <script src="lang.js"></script>
  <script src="app.js"></script>
  <script src="settings.js"></script>
```

- [ ] **Step 7: Syntax prüfen und committen**

```bash
node --check lang.js && node --check check-i18n.js && node check-i18n.js
git add lang.js check-i18n.js index.html
git commit -m "i18n: Sprachpakete fuer Englisch und Deutsch plus Pruefskript"
```

---

### Task 2: i18n-Modul in app.js + Config-Schema

**Files:**
- Modify: `app.js:24` (nach `const $ = …` das i18n-Modul einfügen)
- Modify: `app.js:140-182` (`window.Homelab` erweitern)
- Modify: `config.js:16-17` (`locale` raus, `lang` rein)

**Interfaces:**
- Consumes: `window.LANGUAGES` aus Task 1.
- Produces — auf `window.Homelab` und modulintern:
  - `t(key: string, vars?: object) => string` — Startseiten-Text.
  - `tSet(key: string, vars?: object) => string` — Einstellungs-Text.
  - `activeLocale() => string` — BCP-47-Tag des Startseiten-Pakets, z. B. `"en-US"`.
  - `langCode(kind: "ui" | "settings") => string` — aufgelöster Paketcode, z. B. `"de"`.
  - `languages() => Array<{ code: string, name: string }>` — nach `name` sortiert.
  - Modulintern zusätzlich: `resolveLangCode(code, available, navLang) => string` und `interpolate(str, vars) => string`.
- Config-Schema: `settings.lang = { ui: "auto", settings: "auto" }`; `settings.locale` existiert nicht mehr.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `/tmp/homelab-test-i18n.js` — bewusst **außerhalb** des Repos, damit nichts versehentlich eingecheckt wird. Wer ein eigenes Scratchpad-Verzeichnis hat, legt die Datei dort ab und passt die Pfade in Step 2 und 4 entsprechend an:

```js
/* Pulls the pure i18n helpers out of app.js and exercises them directly. */
const fs = require("fs");
const assert = require("assert");
const src = fs.readFileSync("app.js", "utf8");

function extract(startMarker) {
  const start = src.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `not found in app.js: ${startMarker}`);
  const end = src.indexOf("\n  }", start);
  assert.notStrictEqual(end, -1, `no end brace for: ${startMarker}`);
  return src.slice(start, end + 4);
}

const resolveLangCode = new Function(
  extract("function resolveLangCode(") + "; return resolveLangCode;")();
const interpolate = new Function(
  extract("function interpolate(") + "; return interpolate;")();

const codes = ["en", "de"];

// explicit choice wins
assert.strictEqual(resolveLangCode("de", codes, "en-US"), "de");
// unknown explicit choice falls back to English
assert.strictEqual(resolveLangCode("fr", codes, "de-DE"), "en");
// auto: exact browser tag has no pack, primary subtag does
assert.strictEqual(resolveLangCode("auto", codes, "de-DE"), "de");
// auto: exact match when the pack is named that way
assert.strictEqual(resolveLangCode("auto", ["en", "de-DE"], "de-DE"), "de-DE");
// auto: unknown browser language falls back to English
assert.strictEqual(resolveLangCode("auto", codes, "fr-FR"), "en");
// auto: no browser language at all
assert.strictEqual(resolveLangCode("auto", codes, ""), "en");
// missing/garbage input
assert.strictEqual(resolveLangCode(undefined, codes, "de"), "de");
assert.strictEqual(resolveLangCode("auto", [], "de-DE"), "en");

// interpolation
assert.strictEqual(interpolate("Hi {name}!", { name: "Sven" }), "Hi Sven!");
assert.strictEqual(interpolate("{a} and {b}", { a: "1", b: "2" }), "1 and 2");
assert.strictEqual(interpolate("{count} link(s)", { count: 3 }), "3 link(s)");
// unknown placeholder stays put rather than becoming "undefined"
assert.strictEqual(interpolate("Hi {nope}!", { name: "x" }), "Hi {nope}!");
// no vars at all
assert.strictEqual(interpolate("plain"), "plain");

console.log("test-i18n: ok");
```

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `node /tmp/homelab-test-i18n.js` (aus dem Projektverzeichnis)
Expected: FAIL mit `not found in app.js: function resolveLangCode(`.

- [ ] **Step 3: Das i18n-Modul einbauen**

Modify `app.js` — direkt nach `const $ = (sel) => document.querySelector(sel);` (Zeile 24) einfügen:

```js

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
```

`settings()` ist unterhalb definiert, wird aber erst zur Aufrufzeit gebraucht — Funktionsdeklarationen und `const settings = …` sind vor dem ersten `langCode()`-Aufruf ausgewertet. Die `console.warn`-Zeile steht bewusst nach den Definitionen und läuft einmalig beim Laden.

- [ ] **Step 4: Test laufen lassen — er muss bestehen**

Run: `node /tmp/homelab-test-i18n.js`
Expected: PASS, Ausgabe `test-i18n: ok`.

- [ ] **Step 5: Die neuen Funktionen auf `window.Homelab` legen**

Modify `app.js` — im `window.Homelab`-Literal (beginnt Zeile 140) direkt nach `defaults: () => clone(DEFAULTS),` einfügen:

```js
    /* i18n — settings.js goes through these instead of holding its own texts. */
    t,
    tSet,
    activeLocale,
    langCode,
    languages,
```

- [ ] **Step 6: Config-Schema umstellen**

Modify `config.js` — Zeile 16 (`locale: "de-DE", // Locale for clock/date formatting`) ersetzen durch:

```js
    // Language packs (lang.js). The start page and the settings drawer are set
    // separately. "auto" follows the browser and falls back to English; use a
    // pack code like "en" or "de" to pin one.
    lang: {
      ui: "auto",
      settings: "auto",
    },
```

`clock24h: true,` in Zeile 17 bleibt unverändert stehen.

- [ ] **Step 7: Prüfen und committen**

```bash
node --check app.js && node --check config.js && node check-i18n.js
node /tmp/homelab-test-i18n.js
git add app.js config.js
git commit -m "i18n: Sprachaufloesung und t/tSet in app.js, lang-Schema in config.js"
```

---

### Task 3: Statische Texte in index.html binden

**Files:**
- Modify: `index.html:2` (`lang`-Attribut), `:48-49` (WAN-IP), `:61-68` (Suchfeld), `:74-89` (Stats), `:96-98` (Filter-Meldung), `:100-106` (Footer)
- Modify: `app.js` (`applyStaticStrings()` neu, Aufruf in `render()`, Filter-Meldung in `setupFilter()`)

**Interfaces:**
- Consumes: `t(key, vars)` aus Task 2.
- Produces: `applyStaticStrings()` — setzt jedes `[data-i18n]` per `textContent`, jedes `[data-i18n-attr]` per `setAttribute` und `document.documentElement.lang`. Das Attributformat ist `attribut:schlüssel`, mehrere durch Komma getrennt. Die Filter-Leermeldung hängt an `#filter-message`.

- [ ] **Step 1: Markup umstellen**

Modify `index.html` Zeile 2 — das feste `lang="de"` wird zur Startvorgabe, `applyStaticStrings()` überschreibt es zur Laufzeit:

```html
<html lang="en">
```

Zeilen 48-49 (WAN-IP-Label):

```html
          <span class="pubip__value" id="pubip-value">—</span>
          <span class="pubip__label" data-i18n="pubip.label">WAN IP</span>
```

Zeilen 61-68 (Suchfeld — Platzhalter und `aria-label` kommen jetzt aus dem Paket):

```html
        <input
          class="search__input"
          id="search-input"
          type="text"
          placeholder="Search the web   ·   start with  /  to filter your links"
          aria-label="Search"
          data-i18n-attr="placeholder:search.placeholder,aria-label:search.aria"
          spellcheck="false"
        />
```

Zeilen 74-89 (Stats-Labels):

```html
        <div class="stat">
          <span class="stat__value" id="stat-monitored">0</span>
          <span class="stat__label" data-i18n="stats.monitored">Monitored</span>
        </div>
        <div class="stat">
          <span class="stat__value" id="stat-groups">0</span>
          <span class="stat__label" data-i18n="stats.groups">Groups</span>
        </div>
        <div class="stat">
          <span class="stat__value stat__value--ok" id="stat-online">0</span>
          <span class="stat__label" data-i18n="stats.online">Online</span>
        </div>
        <div class="stat">
          <span class="stat__value stat__value--down" id="stat-offline">0</span>
          <span class="stat__label" data-i18n="stats.offline">Offline</span>
        </div>
```

Zeilen 96-98 (Filter-Meldung) — der ganze Satz kommt jetzt aus einem Schlüssel mit `{term}`, deshalb entfällt `#filter-term`:

```html
    <div class="empty" id="filter-empty" hidden>
      <span id="filter-message"></span>
    </div>
```

Zeilen 100-106 (Footer) — `data-i18n` sitzt auf inneren Spans, damit die `<kbd>`-Elemente erhalten bleiben. „Copyright by locutus010" ist ein Namensvermerk und bleibt bewusst unübersetzt:

```html
    <footer class="footer">
      <span>Copyright by locutus010</span>
      <span class="footer__dot">·</span>
      <span><kbd>/</kbd> <span data-i18n="footer.filter">filter links</span></span>
      <span class="footer__dot">·</span>
      <span><kbd>Esc</kbd> <span data-i18n="footer.clear">clear</span></span>
    </footer>
```

- [ ] **Step 2: Deckungsprüfung laufen lassen**

Run: `node check-i18n.js`
Expected: PASS — alle sechs im Markup verwendeten Schlüssel stehen bereits im `en`-Paket.

Gegenprobe, dass die Prüfung wirklich greift: ändere in `index.html` testweise `data-i18n="stats.groups"` zu `data-i18n="stats.gruppen"`.

Run: `node check-i18n.js`
Expected: FAIL mit `index.html: data-i18n="stats.gruppen" is not in en.ui`.

Danach zurückändern und erneut laufen lassen → PASS.

- [ ] **Step 3: `applyStaticStrings()` einbauen**

Modify `app.js` — direkt vor `function renderGreeting()` (aktuell Zeile 216) einfügen:

```js
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
```

- [ ] **Step 4: `applyStaticStrings()` in `render()` aufrufen**

Modify `app.js` — in `render()` (Zeile 199) direkt nach `const s = settings();` einfügen:

```js
    applyStaticStrings();
```

- [ ] **Step 5: Filter-Meldung auf den Sprachschlüssel umstellen**

Modify `app.js` in `setupFilter()` — Zeile 452 ersetzen:

```js
    const msgEl = $("#filter-message");
```

und in `function filter(q)` die Zeilen 472-473 ersetzen:

```js
      emptyEl.hidden = visible !== 0;
      msgEl.textContent = t("filter.empty", { term: q });
```

`textContent` statt `innerHTML` — der Filterbegriff kommt aus dem Eingabefeld und wird dadurch nie als Markup gedeutet.

- [ ] **Step 6: Sichttest im Browser**

```bash
python3 -m http.server 8080
```

Öffne `http://localhost:8080`, dann in der Browser-Konsole:

```js
Homelab.config().settings.lang.ui = "de"; Homelab.render();
```

Expected: Stats-Leiste zeigt „Überwacht / Gruppen / Online / Offline", der Suchplatzhalter ist deutsch, der Footer zeigt „Links filtern" / „leeren", `document.documentElement.lang` ist `"de"`. Danach `/xyzxyz` ins Suchfeld tippen → „Keine Links passen zu „xyzxyz"".

Mit `Homelab.config().settings.lang.ui = "en"; Homelab.render();` zurückschalten und prüfen, dass alles wieder englisch ist.

- [ ] **Step 7: Prüfen und committen**

```bash
node --check app.js && node check-i18n.js
git add index.html app.js
git commit -m "i18n: statische Texte der Startseite ueber data-i18n gebunden"
```

---

### Task 4: Dynamische Texte in app.js

**Files:**
- Modify: `app.js:216-226` (`renderGreeting`), `:231-247` (`startClock`), `:317-323` (LED-Titel beim Bauen), `:534-557` (`checkOne` / `setLed`), `:617-645` (`loadPublicIp`)

**Interfaces:**
- Consumes: `t(key, vars)` und `activeLocale()` aus Task 2.
- Produces: keine neuen Signaturen — ersetzt die fest englischen Literale im Bestand.

- [ ] **Step 1: Begrüßung übersetzen**

Modify `app.js` — `renderGreeting()` (Zeilen 216-226) vollständig ersetzen:

```js
  function renderGreeting() {
    const s = settings();
    const h = new Date().getHours();
    const part = t(
      h < 5 ? "greeting.night" :
      h < 12 ? "greeting.morning" :
      h < 18 ? "greeting.afternoon" :
      "greeting.evening"
    );
    // The pack's sentence carries the markup; the owner name is user data and
    // stays escaped on its way into innerHTML.
    $("#greeting").innerHTML = s.owner
      ? t("greeting.withName", { part, name: escapeHtml(s.owner) })
      : t("greeting.plain", { part });
  }
```

- [ ] **Step 2: Uhr auf `activeLocale()` umstellen**

Modify `app.js` — in `startClock()` Zeile 236 ersetzen:

```js
      const locale = activeLocale();
```

Die Zeilen darunter (`toLocaleTimeString(locale, …)`, `toLocaleDateString(locale, …)`) bleiben unverändert; `hour12: !s.clock24h` bleibt ebenfalls, der Schalter ist weiterhin unabhängig von der Sprache.

- [ ] **Step 3: LED-Texte übersetzen**

Modify `app.js` — Zeile 320 (im Aufbau der Link-Kachel):

```js
      led.title = t("status.checking");
```

Zeile 538 (in `checkOne`):

```js
    led.title = t("status.checking");
```

Zeile 555 (in `setLed`):

```js
    led.title = up ? t("status.online") : t("status.offline");
```

- [ ] **Step 4: Texte der öffentlichen IP übersetzen**

Modify `app.js` — Zeilen 630-631 in `loadPublicIp()`:

```js
      out.textContent = ip || t("pubip.unavailable");
      out.title = ip ? "" : t("pubip.error");
```

- [ ] **Step 5: Sichttest im Browser**

```bash
python3 -m http.server 8080
```

Öffne `http://localhost:8080` und prüfe in der Konsole beide Sprachen:

```js
Homelab.config().settings.lang.ui = "de"; Homelab.render();
```

Expected: Begrüßung deutsch („Guten Morgen, **Sven**." je nach Uhrzeit), Datum unter der Uhr deutsch abgekürzt, LED-Tooltip beim Darüberfahren „Prüfe…" bzw. „Nicht erreichbar", WAN-IP-Feld bei Fehlschlag „n/v".

```js
Homelab.config().settings.lang.ui = "en"; Homelab.render();
```

Expected: „Good morning, **Sven**.", englisches Datumsformat (`en-US`, also z. B. „Mon, 07/27"), Tooltip „Checking…" / „Unreachable".

Zusätzlich prüfen, dass ein leerer Name sauber fällt:

```js
Homelab.config().settings.owner = ""; Homelab.render();
```

Expected: „Good morning." ohne Komma und ohne leeres `<b>`.

- [ ] **Step 6: Prüfen und committen**

```bash
node --check app.js && node check-i18n.js
git add app.js
git commit -m "i18n: Begruessung, Uhr-Locale, LED- und WAN-IP-Texte aus dem Sprachpaket"
```

---

### Task 5: settings.js auf tSet umstellen + Sprach-Auswahlfelder

**Files:**
- Modify: `settings.js` durchgehend (Zeilen 9, 120-134, 144-190, 200-230, 239-309, 321-356, 378-408, 413-414, 428-448, 484-501)

**Interfaces:**
- Consumes: `H.tSet(key, vars)`, `H.langCode(kind)`, `H.languages()` aus Task 2.
- Produces: `applyChromeStrings()` — schreibt die Texte des Schubladen-Rahmens (Titel, Untertitel, Schließen-Knopf, Zahnrad) neu, wird von `rebuild()` aufgerufen, damit ein Sprachwechsel auch den Rahmen erfasst.

- [ ] **Step 1: Kopfkommentar korrigieren**

Modify `settings.js` Zeile 9 — der Hinweis auf feste deutsche Labels stimmt nicht mehr:

```js
 *  Language note: every visible string comes from lang.js via H.tSet(); the
 *  drawer's language is set independently from the start page's.
```

- [ ] **Step 2: Kurzhelfer anlegen**

Modify `settings.js` — nach `const set = () => cfg().settings;` (Zeile 19) einfügen:

```js
  const T = (key, vars) => H.tSet(key, vars);
```

- [ ] **Step 3: Sektion „Allgemein" umstellen**

Modify `settings.js` — den `return section(…)`-Block in `sectionGeneral()` (Zeilen 120-133) vollständig ersetzen. Die alte „Sprache / Format"-Auswahl entfällt, zwei Sprachfelder kommen dazu:

```js
    const langOpts = [["auto", T("general.langAuto")]]
      .concat(H.languages().map((l) => [l.code, l.name]));
    const lang = set().lang || (set().lang = { ui: "auto", settings: "auto" });

    return section(T("general.heading"), T("general.sub"), [
      field(T("general.title"), textInput(s.title, (v) => { s.title = v; commit(); })),
      field(T("general.subtitle"), textInput(s.subtitle, (v) => { s.subtitle = v; commit(); })),
      field(T("general.owner"), textInput(s.owner, (v) => { s.owner = v; commit(); })),
      field(T("general.accent"), colorRow, T("general.accentHint")),
      field(T("general.langUi"), selectInput(lang.ui || "auto", langOpts,
        (v) => { lang.ui = v; commit(); })),
      // The drawer's own labels change with this one, so rebuild it.
      field(T("general.langSettings"), selectInput(lang.settings || "auto", langOpts,
        (v) => { lang.settings = v; commit(); rebuild(); })),
      el("div", { class: "set-field" }, [
        toggle(s.clock24h, (v) => { s.clock24h = v; commit(); }, T("general.clock24h")),
      ]),
    ]);
```

- [ ] **Step 4: Sektion „Wetter" umstellen**

Modify `settings.js` — in `sectionWeather()` Zeile 144 (Platzhalter):

```js
    const cityInput = textInput(w.label || "", () => {}, { placeholder: T("weather.cityPlaceholder"), class: "set-input set-geo__input" });
```

Zeile 149 (Statusmeldung):

```js
      status.textContent = T("weather.searching");
```

Zeile 152 — die Städtesuche folgt der Sprache der **Startseite**, weil die Ortsnamen dort landen:

```js
        const geoLang = H.langCode("ui").split("-")[0];
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=${encodeURIComponent(geoLang)}&format=json`);
```

Zeile 155:

```js
        if (!hit) { status.textContent = T("weather.notFound"); status.classList.add("is-err"); return; }
```

Zeile 167:

```js
        status.textContent = T("weather.searchFailed");
```

Zeile 175 (Suchknopf):

```js
      el("button", { type: "button", class: "set-btn set-btn--accent", text: T("weather.search"), onclick: searchCity }),
```

Zeilen 178-190 (Sektionsrumpf):

```js
    return section(T("weather.heading"), T("weather.sub"), [
      el("div", { class: "set-field" }, [
        toggle(w.enabled, (v) => { w.enabled = v; commit(); H.refreshWeather(); }, T("weather.toggle")),
      ]),
      field(T("weather.city"), geoRow, T("weather.cityHint")),
      el("div", { class: "set-field" }, [status]),
      field(T("weather.unit"), selectInput(w.unit === "fahrenheit" ? "fahrenheit" : "celsius", [
        ["celsius", T("weather.celsius")], ["fahrenheit", T("weather.fahrenheit")],
      ], (v) => { w.unit = v; commit(); H.refreshWeather(); })),
      el("div", { class: "set-field" }, [
        toggle(pip.enabled, (v) => { pip.enabled = v; commit(); }, T("weather.pubip")),
      ]),
    ]);
```

- [ ] **Step 5: Sektionen „Suche" und „Statusprüfung" umstellen**

Modify `settings.js` — Zeilen 200-207 (`sectionSearch`):

```js
    return section(T("search.heading"), T("search.sub"), [
      el("div", { class: "set-field" }, [
        toggle(sr.enabled, (v) => { sr.enabled = v; commit(); }, T("search.toggle")),
      ]),
      engineOpts.length
        ? field(T("search.default"), selectInput(sr.defaultEngine, engineOpts, (v) => { sr.defaultEngine = v; commit(); }))
        : document.createTextNode(""),
    ]);
```

Zeilen 213-229 (`sectionStatus`):

```js
    return section(T("status.heading"), T("status.sub"), [
      el("div", { class: "set-field" }, [
        toggle(s.statusCheck, (v) => { s.statusCheck = v; commit(); }, T("status.toggle")),
      ]),
      el("div", { class: "set-field" }, [
        toggle(st.enabled, (v) => { st.enabled = v; commit(); }, T("status.statsToggle")),
        el("span", { class: "set-field__hint", text: T("status.statsHint") }),
      ]),
      field(T("status.interval"),
        el("input", {
          class: "set-input", type: "number", min: "10", step: "5",
          value: Math.round((s.statusIntervalMs || 60000) / 1000),
          oninput: (e) => { s.statusIntervalMs = Math.max(10, Number(e.target.value) || 60) * 1000; commit(); },
        }),
        T("status.intervalHint")),
    ]);
```

- [ ] **Step 6: Lesezeichen-Editor umstellen**

Modify `settings.js` — Zeilen 239-245 (`sectionBookmarks`):

```js
    const wrap = section(T("bookmarks.heading"), T("bookmarks.sub"), [
      bookmarksBody,
      el("button", {
        type: "button", class: "set-btn set-btn--block", html: T("bookmarks.addGroup"),
        onclick: () => { cfg().groups.push({ name: T("bookmarks.newGroupName"), links: [] }); commit(); buildBookmarks(); },
      }),
    ]);
```

Zeilen 261-277 (Gruppenkarte in `buildBookmarks`):

```js
        el("div", { class: "set-group__head" }, [
          el("span", { class: "set-grip", text: "⋮⋮", title: T("bookmarks.reorder") }),
          textInput(group.name, (v) => { group.name = v; commit(); }, { class: "set-input set-group__name", placeholder: T("bookmarks.groupNamePlaceholder") }),
          iconBtn("↑", T("bookmarks.moveUp"), gi === 0, () => moveItem(gs, gi, -1)),
          iconBtn("↓", T("bookmarks.moveDown"), gi === gs.length - 1, () => moveItem(gs, gi, 1)),
          iconBtn("🗑", T("bookmarks.deleteGroup"), false, () => {
            if (confirm(T("bookmarks.deleteGroupConfirm", { name: group.name || "", count: links.length }))) {
              gs.splice(gi, 1); commit(); buildBookmarks();
            }
          }, "set-iconbtn--danger"),
        ]),
        linksWrap,
        el("button", {
          type: "button", class: "set-btn set-btn--ghost",
          html: T("bookmarks.addLink"),
          onclick: () => { links.push({ name: T("bookmarks.newLinkName"), url: "https://", ping: false }); commit(); buildBookmarks(); },
        }),
```

Zeile 283 (Leerzustand):

```js
      bookmarksBody.appendChild(el("p", { class: "set-empty", text: T("bookmarks.empty") }));
```

Zeilen 289-308 (`linkRow`):

```js
    return el("div", { class: "set-link" }, [
      el("div", { class: "set-link__main" }, [
        textInput(link.icon, (v) => { link.icon = v; commit(); }, { class: "set-input set-link__icon", placeholder: T("bookmarks.iconPlaceholder"), title: T("bookmarks.iconTitle") }),
        el("button", {
          type: "button", class: "set-iconbtn set-link__favicon", text: "🌐",
          title: T("bookmarks.faviconTitle"),
          onclick: (e) => fetchFavicon(link, e.currentTarget),
        }),
        textInput(link.name, (v) => { link.name = v; commit(); }, { class: "set-input set-link__name", placeholder: T("bookmarks.namePlaceholder") }),
      ]),
      textInput(link.url, (v) => { link.url = v; commit(); }, { class: "set-input", placeholder: T("bookmarks.urlPlaceholder"), type: "url" }),
      textInput(link.description, (v) => { link.description = v; commit(); }, { class: "set-input", placeholder: T("bookmarks.descPlaceholder") }),
      el("div", { class: "set-link__foot" }, [
        toggle(!!link.ping, (v) => { link.ping = v; commit(); }, T("bookmarks.ping")),
        el("span", { class: "set-link__spacer" }),
        iconBtn("↑", T("bookmarks.moveUp"), li === 0, () => moveItem(links, li, -1)),
        iconBtn("↓", T("bookmarks.moveDown"), li === links.length - 1, () => moveItem(links, li, 1)),
        iconBtn("🗑", T("bookmarks.deleteLink"), false, () => { links.splice(li, 1); commit(); buildBookmarks(); }, "set-iconbtn--danger"),
      ]),
    ]);
```

Zeile 324 und Zeile 350 (`fetchFavicon`):

```js
      alert(T("bookmarks.faviconNeedsUrl"));
```

```js
      alert(T("bookmarks.faviconFailed"));
```

- [ ] **Step 7: Sektion „Sichern & Übertragen" umstellen**

Modify `settings.js` — Zeilen 377-383 (Hinweistext):

```js
    const note = central ? T("backup.noteServer") : T("backup.noteLocal");
```

Zeilen 387-396 (Token-Feld):

```js
    const tokenField = central
      ? field(T("backup.token"),
          el("input", {
            class: "set-input", type: "password", autocomplete: "off",
            placeholder: T("backup.tokenPlaceholder"),
            value: H.getToken ? H.getToken() : "",
            oninput: (e) => { if (H.setToken) H.setToken(e.target.value); },
          }),
          T("backup.tokenHint"))
      : document.createTextNode("");
```

Zeilen 398-407 (Sektionsrumpf):

```js
    return section(T("backup.heading"), T("backup.sub"), [
      el("p", { class: "set-note", html: note }),
      tokenField,
      el("div", { class: "set-actions" }, [
        el("button", { type: "button", class: "set-btn set-btn--accent", html: T("backup.download"), onclick: exportConfig }),
        el("button", { type: "button", class: "set-btn", html: T("backup.upload"), onclick: () => importInput.click() }),
      ]),
      importInput,
      el("button", { type: "button", class: "set-btn set-btn--danger-ghost", text: T("backup.reset"), onclick: resetAll }),
    ]);
```

Zeilen 412-415 (`exportConfig` — der Kommentarkopf der exportierten Datei):

```js
    const body =
      T("backup.exportHeader", { date: new Date().toLocaleString(H.activeLocale()) }) + "\n" +
      T("backup.exportHint") + "\n" +
      "window.CONFIG = " + JSON.stringify(data, null, 2) + ";\n";
```

Zeilen 428-433 (`importFile`):

```js
        if (!parsed || typeof parsed !== "object") throw new Error(T("backup.importBadFormat"));
        H.replaceConfig(parsed);
        buildBookmarks(); rebuild();
        alert(T("backup.importOk"));
      } catch (err) {
        alert(T("backup.importFailed", { error: err.message }));
      }
```

Zeile 448 (`resetAll`):

```js
    if (!confirm(T("backup.resetConfirm"))) return;
```

- [ ] **Step 8: Schubladen-Rahmen sprachfähig machen**

Der Rahmen (Titel, Untertitel, Schließen-Knopf, Zahnrad) wird nur einmal in `mount()` gebaut. Ohne diesen Schritt bliebe er beim Sprachwechsel stehen.

Modify `settings.js` — Zeilen 484-501 in `mount()`:

```js
    drawer = el("aside", { class: "set", role: "dialog", "aria-modal": "true" }, [
      el("div", { class: "set__head" }, [
        el("div", {}, [
          el("h2", { class: "set__title" }),
          el("p", { class: "set__sub" }),
        ]),
        el("button", { class: "set__close", type: "button", html: "&times;", onclick: close }),
      ]),
      body,
    ]);

    overlay = el("div", { class: "set-overlay", hidden: true, onclick: (e) => { if (e.target === overlay) close(); } }, [drawer]);
    document.body.appendChild(overlay);

    const btn = el("button", {
      class: "gear", type: "button",
      html: gearSvg(), onclick: open,
    });
```

Modify `settings.js` — direkt vor `let body;` (Zeile 467) einfügen:

```js
  /* The drawer's frame is built once in mount(), so its texts need refreshing
     separately whenever the settings language changes. */
  function applyChromeStrings() {
    if (!drawer) return;
    drawer.setAttribute("aria-label", T("drawer.title"));
    drawer.querySelector(".set__title").textContent = T("drawer.title");
    drawer.querySelector(".set__sub").textContent = T("drawer.sub");
    const closeBtn = drawer.querySelector(".set__close");
    closeBtn.setAttribute("aria-label", T("drawer.close"));
    closeBtn.title = T("drawer.close");
    const gear = document.querySelector(".gear");
    if (gear) {
      gear.title = T("drawer.title");
      gear.setAttribute("aria-label", T("drawer.open"));
    }
  }
```

Modify `settings.js` — in `rebuild()` (Zeile 468) als erste Anweisung nach `if (!body) return;` einfügen:

```js
    applyChromeStrings();
```

- [ ] **Step 9: Deckungsprüfung laufen lassen**

Run: `node --check settings.js && node check-i18n.js`
Expected: PASS, `check-i18n: ok (en, de)` — jeder `tSet`-Schlüssel ist gedeckt.

Gegenprobe: ändere testweise ein `T("backup.reset")` zu `T("backup.resett")`.

Run: `node check-i18n.js`
Expected: FAIL mit `settings.js: uses "backup.resett" which is not in en.settings`.

Zurückändern und erneut laufen lassen → PASS.

`check-i18n.js` erfasst sowohl `tSet("…")` als auch den Kurzhelfer `T("…")`. Was es nicht sehen kann, sind *übersehene* Literale — deshalb zusätzlich per Hand nachsehen:

```bash
grep -n '[„"][A-ZÄÖÜ][a-zäöüß]' settings.js | grep -v 'T("' | grep -v '^\s*[0-9]*:\s*\*'
```

Expected: keine deutschen Literale mehr außerhalb von Kommentaren. Treffer in Kommentarblöcken und in `gearSvg()` ignorieren.

- [ ] **Step 10: Sichttest im Browser**

```bash
python3 server.py
```

Öffne `http://localhost:8080`, klicke das Zahnrad.

Expected: Die Schublade ist **englisch** (Vorgabe `auto` → Browsersprache; bei deutschem Browser deutsch — dann in „Sprache der Einstellungen" auf „English" stellen und prüfen, dass Überschriften, Knöpfe und Platzhalter sofort umschalten, inklusive Titel „Settings" und Untertitel im Kopf der Schublade).

Weiter prüfen:
1. „Sprache der Startseite" auf Deutsch stellen → die Seite hinter der Schublade wird deutsch, die Schublade bleibt englisch. Genau das ist der Kern der Änderung.
2. Schublade schließen, neu laden → beide Einstellungen sind erhalten (Server-Sync).
3. Im Wetter-Bereich eine Stadt suchen (z. B. „Munich" bei Startseite=en, „München" bei Startseite=de) → Treffer erscheint, Statuszeile ist in der Menü-Sprache.
4. Eine Gruppe löschen wollen → der Bestätigungsdialog nennt Name und Anzahl in der Menü-Sprache; danach abbrechen.
5. „config.js herunterladen" → der Kommentarkopf der Datei ist in der Menü-Sprache.

- [ ] **Step 11: Prüfen und committen**

```bash
node --check settings.js && node check-i18n.js
git add settings.js
git commit -m "i18n: Einstellungsmenue aus dem Sprachpaket, zwei Sprachauswahlen"
```

---

### Task 6: Dokumentation

**Files:**
- Modify: `CLAUDE.md` (Dateitabelle, Architektur-Notizen, Testabschnitt)
- Modify: `README.md:184` (Settings-Tabelle) und ein neuer Abschnitt

**Interfaces:**
- Consumes: alles aus Task 1-5.
- Produces: nichts Ausführbares.

- [ ] **Step 1: `CLAUDE.md` — Dateitabelle ergänzen**

Modify `CLAUDE.md` — in der Tabelle unter „## Files" nach der `config.js`-Zeile einfügen:

```markdown
| `lang.js`     | **Language packs.** `window.LANGUAGES = { <code>: { name, locale, ui, settings } }`. The only file a new language touches. `ui` = start page, `settings` = settings drawer; the two are chosen independently. English is the fallback for any missing key. |
| `check-i18n.js` | `node check-i18n.js` — verifies every pack carries the same keys as `en`, and that every `t()` / `tSet()` literal and `data-i18n` attribute is covered. Exits 1 on findings. |
```

- [ ] **Step 2: `CLAUDE.md` — Architektur-Notizen ergänzen**

Modify `CLAUDE.md` — unter „## Architecture notes" nach dem Punkt „**`window.Homelab` is the seam**…" einfügen:

```markdown
- **No visible text belongs in the markup or in JS.** Every user-facing string
  lives in `lang.js` and is read through `t(key, vars)` (start page) or
  `tSet(key, vars)` (settings drawer), both on `window.Homelab`. Static text in
  `index.html` is bound with `data-i18n="key"` or
  `data-i18n-attr="placeholder:key,aria-label:key"` and filled by
  `applyStaticStrings()` on every `render()` — so adding a language never
  touches the HTML. Placeholders are `{name}`; values interpolated into them
  come from user data and must still go through `escapeHtml()` wherever the
  result reaches `innerHTML`.
- **Two languages, independently set.** `settings.lang.ui` and
  `settings.lang.settings` each hold a pack code or `"auto"` (browser language,
  falling back to English). Clock, date and the weather city search follow the
  start page's pack via `activeLocale()`. There is no `settings.locale` any
  more. The drawer's frame is built once in `mount()`, so `settings.js` refreshes
  it through `applyChromeStrings()` from `rebuild()`.
```

- [ ] **Step 3: `CLAUDE.md` — Testabschnitt ergänzen**

Modify `CLAUDE.md` — am Ende des Abschnitts „## Testing" anfügen:

```markdown
After touching any visible string, run `node check-i18n.js`. It catches the
usual language-pack mistakes: a key added to `en` but forgotten in `de`, a typo
in a `t()` call, a `data-i18n` attribute pointing at nothing.
```

- [ ] **Step 4: `README.md` — Settings-Tabelle korrigieren**

Modify `README.md` Zeile 184 — die Zeile

```markdown
| `locale` / `clock24h` | Clock & date formatting                                      |
```

ersetzen durch:

```markdown
| `lang`         | Language of the start page and of the settings drawer, set separately: `{ ui: "auto", settings: "auto" }`. `"auto"` follows the browser; `"en"` / `"de"` pin a pack |
| `clock24h`     | 24-hour clock. The date format itself comes from the start page's language pack |
```

- [ ] **Step 5: `README.md` — Abschnitt „Languages" ergänzen**

Modify `README.md` — direkt vor dem Abschnitt, der die `settings`-Tabelle einleitet („All under `settings` in `config.js`:", Zeile 177), einen neuen Abschnitt einfügen:

```markdown
## Languages

The start page and the settings drawer have **separate** languages. Both are set
in the settings drawer under *General*, and both default to `auto` — the browser
language if a pack for it exists, English otherwise. English and German ship with
the page.

The language of the start page also drives the clock/date format and the weather
city search. (The old `locale` setting is gone; `clock24h` stays.)

### Adding a language

Everything lives in `lang.js` — no other file changes.

1. Copy the `en` block in `lang.js`, rename the key to your language code
   (e.g. `fr`).
2. Set `name` (as shown in the picker) and `locale` (a BCP-47 tag such as
   `fr-FR`, used for clock, date and city search).
3. Translate the values. Keep every key and keep the `{placeholders}` intact.
4. Run `node check-i18n.js` — it reports any key you missed.

The new language appears in both pickers on the next reload. Markup and logic
stay untouched, which is the point of the layout.
```

- [ ] **Step 6: Doku gegen den Code prüfen**

```bash
node check-i18n.js
grep -n "locale" README.md CLAUDE.md config.js
```

Expected: `check-i18n: ok (en, de)`. Der `grep` darf nur noch Treffer zeigen, die sich auf das `locale`-**Feld im Sprachpaket** beziehen (README-Abschnitt „Adding a language", `CLAUDE.md`-Dateitabelle) — kein Verweis mehr auf eine `settings.locale`-Einstellung.

- [ ] **Step 7: Committen**

```bash
git add README.md CLAUDE.md
git commit -m "Doku: Sprachpakete in README und CLAUDE.md beschrieben"
```

---

## Abschlussprüfung

Nach Task 6, vor dem Zusammenführen:

- [ ] `node --check app.js && node --check settings.js && node --check config.js && node --check lang.js && node --check check-i18n.js` → alle still.
- [ ] `node check-i18n.js` → `check-i18n: ok (en, de)`.
- [ ] `python3 server.py`, dann im Browser: Startseite deutsch + Menü englisch einstellen, neu laden, beides bleibt erhalten.
- [ ] Seite per `file://` öffnen (`index.html` direkt im Browser): Sprachwahl funktioniert, Einstellungen landen im localStorage, keine Konsolenfehler.
- [ ] `git status` → sauber, keine Scratchpad-Dateien im Repo.
