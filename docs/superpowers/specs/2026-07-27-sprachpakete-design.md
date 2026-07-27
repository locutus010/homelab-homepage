# Sprachpakete (i18n) — Design

Datum: 2026-07-27

## Ziel

Die Startseite und die Einstellungs-Schublade bekommen **getrennt wählbare
Sprachen**. Ausgeliefert wird mit Englisch und Deutsch; weitere Sprachen sollen
sich später durch Anhängen eines Blocks in einer einzigen Datei ergänzen lassen,
ohne `index.html`, `app.js` oder `settings.js` anzufassen.

Die bisherige Einstellung `settings.locale` — die nur das Uhrzeit- und
Datumsformat steuerte — entfällt.

## Randbedingungen

- Kein Build-Schritt, kein Paketmanager, keine Abhängigkeiten (siehe `CLAUDE.md`).
- Die Seite muss weiterhin per `file://` vollständig funktionieren. Damit
  scheidet `fetch` von JSON-Dateien aus; Sprachdaten kommen als normales
  `<script>`-Global.
- `settings.js` darf die Seite nur über `window.Homelab` steuern.

## Datenmodell

### `lang.js` (neue Datei)

Wird in `index.html` **vor** `app.js` eingebunden und setzt ein Global:

```js
window.LANGUAGES = {
  en: {
    name: "English",     // Anzeigename in beiden Auswahlfeldern
    locale: "en-US",     // Uhr, Datum, Geocoding-Suche
    ui: {                // Startseite
      "greeting.morning": "Good morning",
      "stats.monitored": "Monitored",
      "filter.empty": "No links match “{term}”",
      // …
    },
    settings: {          // Einstellungs-Schublade
      "general.heading": "General",
      "general.owner": "Your name (for the greeting)",
      // …
    },
  },
  de: { name: "Deutsch", locale: "de-DE", ui: { … }, settings: { … } },
};
```

Entscheidungen:

- **Flache Schlüssel**, Punkte sind reine Zeichen im Schlüsselnamen. Kein
  Pfad-Auflöser nötig, und ein Diff zweier Sprachpakete ist mit bloßem Auge
  lesbar.
- **Zwei getrennte Namensräume** `ui` und `settings` pro Sprache, weil die
  beiden Bereiche unabhängig voneinander umgeschaltet werden.
- **Platzhalter** als `{name}`, per einfachem Ersetzen aufgelöst.
- Ein Sprachpaket ist **autorenseitiger, vertrauenswürdiger Inhalt** und darf
  dort Markup enthalten, wo der bestehende Code ohnehin `innerHTML` benutzt
  (z. B. die Hinweistexte im Sync-Bereich mit `<b>` und `<code>`). Werte, die
  über `{…}` eingesetzt werden, stammen dagegen aus Nutzerdaten und werden
  weiterhin durch `escapeHtml()` geschickt.
- Neue Sprache = ein weiterer Block. Sonst ändert sich keine Datei.

### Config-Schema

In `config.js` unter `settings`:

```js
lang: {
  ui: "auto",        // Startseite:  "auto" | "en" | "de" | …
  settings: "auto",  // Einstellungs-Schublade
},
clock24h: true,      // bleibt unverändert
```

`settings.locale` wird aus `config.js` entfernt. Alte gespeicherte Configs
können den Schlüssel noch enthalten; er wird schlicht ignoriert (keine
Migration, kein Aufräumen).

`"auto"` wird zur Laufzeit über `navigator.language` aufgelöst: erst exakter
Code (`de-DE`), dann Primärsprache (`de`), sonst `en`. Dadurch erkennt der
erste Aufruf die Browsersprache, ohne dass beim Booten etwas in die Config
geschrieben werden muss, und der Auslieferungszustand bleibt deklarativ
englisch.

### Was nicht übersetzt wird

Nutzerdaten bleiben unangetastet: `title`, `subtitle`, `owner`, Gruppennamen,
Linknamen und -beschreibungen — einschließlich der Beispieldaten in `config.js`,
die englisch bleiben wie bisher.

## Komponenten

### i18n-Modul in `app.js`

Ein kleiner Block oben im bestehenden IIFE, mit klarer Grenze nach außen:

| Funktion | Zweck |
| --- | --- |
| `pack(kind)` | Liefert das aufgelöste Paket für `"ui"` oder `"settings"`. Löst `"auto"` auf und fällt auf `en` zurück. |
| `t(key, vars)` | Startseiten-Text. |
| `tSet(key, vars)` | Einstellungs-Text. |
| `activeLocale()` | `locale` des Startseiten-Pakets — für Uhr, Datum, Geocoding. |
| `languages()` | `[{ code, name }, …]` aus `window.LANGUAGES`, sortiert. |

Nachschlage-Reihenfolge: gewähltes Paket → englisches Paket → der Schlüssel
selbst. Ein fehlender Schlüssel erzeugt nie eine leere Fläche. Fehlt `lang.js`
komplett, läuft die Seite mit Schlüsseln als Text weiter statt zu brechen.

`t`, `tSet`, `activeLocale` und `languages` kommen auf `window.Homelab` dazu;
`settings.js` bekommt seine Sprachliste dadurch aus derselben Quelle und pflegt
keine eigene.

### `index.html`

Statische Texte werden über Attribute gebunden statt fest im Markup zu stehen:

```html
<span class="stat__label" data-i18n="stats.monitored">Monitored</span>
<input id="search-input" data-i18n-attr="placeholder:search.placeholder" … />
```

Der englische Text bleibt als Rückfallebene im Markup stehen, damit die Seite
auch ohne JavaScript beschriftet ist. `data-i18n-attr` nimmt eine
kommagetrennte Liste `attribut:schlüssel`, damit auch `placeholder`, `title`
und `aria-label` erreichbar sind.

Betroffen: die vier Stats-Labels, Suchplatzhalter und dessen `aria-label`, das
WAN-IP-Label, die drei Footer-Texte und der Text der Filter-Leermeldung.

`render()` ruft neu `applyStaticStrings()`, das `[data-i18n]` und
`[data-i18n-attr]` durchläuft und zusätzlich `document.documentElement.lang` auf
den aufgelösten Startseiten-Sprachcode setzt. Damit muss `index.html` für eine
neue Sprache nie wieder angefasst werden.

### Dynamische Texte in `app.js`

Ersetzt werden die bisher fest englischen Literale: die vier Tageszeit-
Begrüßungen, die LED-Titel (`Checking…`, `Online`, `Unreachable`), der
Ersatzwert und der Fehler-Tooltip der öffentlichen IP. `startClock()` und die
Datumsausgabe benutzen `activeLocale()` statt `s.locale`.

### `settings.js`

Alle deutschen Literale wandern nach `lang.js` und werden zu `H.tSet(…)`. Die
Datei behält ihre Struktur; nur die Textquelle ändert sich.

In der Sektion „Allgemein" ersetzen zwei Auswahlfelder die bisherige
„Sprache / Format"-Auswahl:

- **Sprache der Startseite** → setzt `settings.lang.ui`, dann `commit()`.
- **Sprache der Einstellungen** → setzt `settings.lang.settings`, dann
  `commit()` und `rebuild()`, damit die Schublade sofort umschaltet.

Beide Felder werden aus `H.languages()` befüllt, mit „Automatisch (Browser)" als
erstem Eintrag (Wert `"auto"`).

Die Städtesuche im Wetter-Bereich schickt künftig
`language=<Primärcode der Startseiten-Sprache>` statt des fest verdrahteten
`language=de`.

## Datenfluss

1. `lang.js` setzt `window.LANGUAGES` (vor `app.js`).
2. `app.js` baut die aktive Config wie bisher (Defaults + gespeicherte Edits).
3. `render()` löst über `settings.lang.*` die Pakete auf und schreibt sowohl die
   statischen (`data-i18n`) als auch die dynamischen Texte.
4. Eine Sprachänderung im Menü mutiert die Config und ruft `apply()` — also
   denselben Pfad wie jede andere Einstellung. Kein Neuladen der Seite.
5. Gespeichert wird die Sprachwahl wie jede andere Einstellung: localStorage
   plus, falls per http(s) ausgeliefert, `PUT /api/config`. Die Sprache ist damit
   eine geteilte Einstellung für alle Geräte, kein gerätelokaler Wert.

## Fehlerfälle

| Fall | Verhalten |
| --- | --- |
| `lang.js` fehlt | Seite läuft, zeigt Schlüssel als Text. Konsolen-Warnung. |
| Gespeicherter Sprachcode ohne Paket (Paket später entfernt) | Rückfall auf `en`. |
| Einzelner Schlüssel fehlt in `de` | Englischer Wert. |
| Schlüssel fehlt auch in `en` | Der Schlüssel selbst wird angezeigt. |
| `navigator.language` unbekannt | `en`. |

## Prüfung

`check-i18n.js` im Projektwurzelverzeichnis, reines Node ohne Abhängigkeiten,
Aufruf `node check-i18n.js`. Es lädt `lang.js` in einen Sandbox-Kontext und
prüft drei Dinge:

1. **Schlüsselgleichheit** — jedes Paket hat denselben Schlüsselsatz wie `en`,
   in `ui` wie in `settings`; fehlende und überzählige Schlüssel werden benannt.
2. **Verwendung gedeckt** — jedes Literal aus `t("…")` / `tSet("…")` in
   `app.js` und `settings.js` existiert im englischen Paket.
3. **Markup gedeckt** — jeder `data-i18n`- und `data-i18n-attr`-Schlüssel aus
   `index.html` existiert im englischen Paket.

Exit-Code 1 bei Befunden, damit sich das Skript später in CI hängen lässt.
Genau diese Prüfung macht eine dritte Sprache billig — sie ist der Grund, warum
das Skript ins Repo gehört und nicht nur in die Doku.

Zusätzlich: `node --check` auf `lang.js`, `app.js`, `settings.js`,
`check-i18n.js` und ein Sichttest über `python3 -m http.server 8080` mit
Umschalten beider Sprachen.

## Doku

- README: neuer Abschnitt „Sprachpakete" — welche Sprachen dabei sind, wie man
  eine weitere hinzufügt (Block in `lang.js`, `node check-i18n.js` laufen
  lassen), und der Hinweis, dass die alte `locale`-Einstellung entfallen ist.
  Außerdem die Zeile `locale` / `clock24h` in der Settings-Tabelle (Zeile 184)
  durch `lang` / `clock24h` ersetzen.
- `CLAUDE.md`: `lang.js` und `check-i18n.js` in die Dateitabelle, der
  i18n-Hinweis in die Architektur-Notizen (neue sichtbare Texte gehören nach
  `lang.js`, nicht ins Markup) und Anpassung des Satzes über die deutschen
  Menü-Labels in `settings.js`.
