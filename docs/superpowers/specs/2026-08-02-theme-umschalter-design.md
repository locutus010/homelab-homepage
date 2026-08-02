# Theme-Umschalter (Dunkel / Hell) — Design

Datum: 2026-08-02

## Ziel

Die Startseite bekommt einen **hellen Modus** und einen Knopf in der Kopfzeile,
der zwischen dunkel und hell umschaltet. Die Wahl gilt **pro Gerät** und wird
nicht über den zentralen Config-Server verteilt.

Gleichzeitig wandert das Zahnrad der Einstellungs-Schublade eine Zeile nach
unten, auf die Höhe der WAN-IP-Pille; der neue Umschalter besetzt die Zeile
darüber, auf Höhe des Wetter-Widgets.

## Randbedingungen

- Kein Build-Schritt, kein Paketmanager, keine Abhängigkeiten (siehe `CLAUDE.md`).
- Die Seite muss weiterhin per `file://` vollständig funktionieren.
- `settings.js` darf die Seite nur über `window.Homelab` steuern.
- Kein sichtbarer Text in Markup oder JS — alles über `lang.js`.
- Die Akzentfarbe bleibt aus der Config gesteuert (`--accent`); das helle Theme
  darf sie nicht hartcodieren.

## Entscheidungen

| Frage | Entscheidung | Begründung |
| --- | --- | --- |
| Speicherort | `localStorage`, pro Gerät | Das Theme gehört zum Bildschirm, vor dem man sitzt, nicht zum LAN. Ein Handy im Hellmodus darf das Wanddisplay nicht umschalten. |
| Zustände | Nur dunkel ↔ hell | Ein Klick, ein Wechsel. Beim allerersten Besuch entscheidet `prefers-color-scheme`, danach gilt die Wahl. Kein Auto-Zustand. |
| Heller Farbton | Warmes Papier-Weiß | Hält die warme Amber-Anmutung; ein neutralgraues Weiß isoliert den Akzent. |
| Bedienung im Drawer | Nein | Ein zweiter Ort im Drawer würde suggerieren, das Theme sei Teil der zentral synchronisierten Config. |
| Abschaltbar | Nein, kein Config-Flag | Wer den Knopf ausblendet, sperrt sich aus dem Theme-Wechsel aus. Weniger Schalter, weniger Code. |

## Datenmodell

Das Theme ist **bewusst kein Teil von `window.CONFIG`**. Es lebt allein in

```
localStorage["homelab.theme.v1"] = "dark" | "light"
```

Damit erreicht es weder `persist()` noch `PUT /api/config`, und Import/Export
der Config bleibt davon unberührt. Der aktive Zustand steht als
`document.documentElement.dataset.theme` am `<html>`-Element.

Fehlt der Schlüssel (erster Besuch, privater Modus, `localStorage` gesperrt),
entscheidet `matchMedia("(prefers-color-scheme: light)")`. Alle Zugriffe auf
`localStorage` sind in `try`/`catch` gekapselt — im `file://`-Kontext mancher
Browser wirft schon das Lesen.

## Aufbau

### `styles.css` — zweiter Token-Satz

Das helle Theme ist **kein zweites Stylesheet**, sondern ein Block

```css
:root[data-theme="light"] { /* … */ }
```

der dieselben Custom Properties neu belegt. Keine Regel unterhalb davon weiß,
welches Theme aktiv ist. Voraussetzung dafür sind zwei Vorarbeiten:

1. **Fünf hartcodierte Farben tokenisieren.** Bisher stecken sie fest in den
   Regeln: der kühle Hintergrund-Glow (`#14202a`), das Punktraster
   (`rgba(255,255,255,.04)`), die Deckkraft der Körnung (`.045`), die Vignette
   (`rgba(0,0,0,.5)`) und `--shadow`. Sie werden zu `--glow-cool`, `--dot`,
   `--grain-opacity`, `--vignette` und bleiben im Dunkeln unverändert.

2. **`--accent-text` einführen.** Amber ist auf hellem Grund als *Textfarbe*
   unlesbar (gemessen 2.8:1). Neuer Token, im Dunkeln schlicht `var(--accent)`,
   im Hellen eine abgedunkelte Mischung aus derselben Config-Farbe. Betrifft die
   sechs Stellen, an denen der Akzent als Schrift erscheint: `.hero__greeting b`,
   `.search__engine`, `.link::after`, `.link.is-match b`, `.gear:hover`,
   `.theme-toggle:hover`. Als Rahmen-, Glüh- und Flächenfarbe bleibt `--accent`
   unangetastet.

Kontrastwerte des hellen Satzes, im Browser nachgemessen statt geschätzt:

| Rolle | Verhältnis | Grenze |
| --- | --- | --- |
| Fließtext (`--text`) | 15.8:1 | 4.5 |
| Beschreibungen (`--text-dim`) | 5.5:1 | 4.5 |
| Mono-Labels (`--text-mut`) | 4.6:1 | 4.5 |
| Akzent als Text (`--accent-text`) | 4.3:1 | 4.5 · klein, fett |
| Status Online / Offline | 4.1 / 4.6:1 | 3.0 · große Schrift |

Zusätzlich ein kurzer Übergang auf Hintergrund-, Rahmen- und Schriftfarbe der
Flächen, damit der Wechsel wie ein Lichtschalter wirkt und nicht wie ein
Seiten-Neuaufbau. Der bestehende `prefers-reduced-motion`-Block deckt ihn ab.

### `index.html` — Aktionsspalte

Neben dem `.weather-stack` entsteht eine zweite Spalte:

```
.topbar__meta →  [ clock ]   [ weather ]   [ ☾ / ☀ ]     ← Wetter-Ebene
                             [ WAN IP  ]   [   ⚙   ]     ← WAN-Ebene
```

`.meta-actions` ist eine Flex-Spalte mit derselben Lücke (8 px) wie der
Wetter-Stapel. Der Umschalter ist statisches Markup mit
`data-i18n-attr="title:theme.toggle,aria-label:theme.toggle"`. Beide Knöpfe
werden **48×48 px** — die Höhe der Pillen —, damit die Zeilen bündig liegen;
das Zahnrad wächst dafür von 44 auf 48 px.

Der Knopf trägt beide Glyphen in einem SVG (`.icon-sun`, `.icon-moon`); die
inaktive wird per CSS weggeblendet und -skaliert. So ist der Zustand ohne
JavaScript-Icon-Tausch beschrieben, und `aria-pressed` meldet ihn zusätzlich.

`<meta name="color-scheme">` wird von `dark` auf `dark light` gesetzt, damit der
Browser Scrollbalken und Formularelemente passend einfärbt.

### `app.js` — Zustand

Neuer Abschnitt mit `THEME_KEY`, `storedTheme()`, `applyTheme()` und
`setupTheme()`. `setupTheme()` läuft als **erste** Zeile in `init()`, noch vor
`render()`, damit die Seite nicht sichtbar von dunkel nach hell springt.

Der Listener wird — wie alle anderen — genau einmal in `init()` gehängt.
`render()` fasst das Theme nicht an; es ist kein Teil der aktiven Config und
damit auch keine Sorge von `applyStaticStrings()` außer für die Beschriftung.

`window.Homelab` bekommt **keine** neue Methode: `settings.js` schaltet das
Theme nicht.

### `lang.js` — ein Schlüssel

`ui."theme.toggle"` in `en` und `de`. Der Text beschreibt die Handlung, nicht
den Zustand („Zwischen dunklem und hellem Modus wechseln"), damit er in beiden
Stellungen stimmt.

### `settings.js` — ein Zeilenwechsel

`mount()` hängt das Zahnrad an `.meta-actions` statt an `.topbar__meta`, mit
Rückfall auf das bisherige Ziel und weiter auf `document.body`. Sonst nichts.

### Die Schublade — zwei Ausbesserungen

Die `.set-*`-Regeln greifen fast durchweg auf dieselben Tokens zu und ziehen
darum von selbst mit. Zwei Stellen tun es nicht und fallen im hellen Theme auf:

- `.set-swatch.is-active { border-color: #fff }` — ein weißer Ring auf einer
  weißen Fläche. Wird zu `var(--text)`, dann markiert er in beiden Themes.
- `.set { box-shadow: … rgba(0,0,0,.8) }` — ein fast schwarzer Schlagschatten,
  auf hellem Grund ein schmutziger Rand. Wird auf einen Token gelegt, der im
  hellen Satz weicher ausfällt.

Der Scrim `rgba(4,5,7,.62)` hinter der Schublade bleibt bewusst dunkel: ein
abdunkelnder Überzug ist auch in hellen Oberflächen die übliche Lesart.

## Randfälle

- **Wetter oder WAN-IP abgeschaltet.** Beide Pillen tragen `hidden`; der Stapel
  schrumpft, die Aktionsspalte bleibt. Umschalter und Zahnrad stehen dann
  untereinander neben der Uhr — kein Sonderfall im Code nötig.
- **Schmale Bildschirme.** Unter 640 px klappt `.topbar` ohnehin zur Spalte mit
  `justify-content: space-between`; die Aktionsspalte rutscht als Ganzes an den
  rechten Rand.
- **`localStorage` nicht verfügbar.** Lesen und Schreiben gekapselt; die Seite
  startet im Systemtheme und der Knopf wirkt für die Sitzung, merkt sich aber
  nichts.
- **`lang.js` fehlt.** `applyStaticStrings()` steigt früh aus, der Knopf behält
  seinen englischen Markup-Text — dasselbe Verhalten wie bei allen anderen
  Beschriftungen.

## Prüfung

- `node --check` auf `app.js`, `settings.js`, `lang.js`.
- `node check-i18n.js` — der neue Schlüssel muss in beiden Paketen liegen.
- Optisch über `python3 -m http.server`: Zeilen bündig, Umschalten in beide
  Richtungen, Zustand übersteht einen Reload, Kontraste im hellen Theme.
- Gegenprobe mit abgeschaltetem Wetter und abgeschalteter WAN-IP.

## Ausdrücklich nicht Teil davon

- Kein dritter „Auto"-Zustand.
- Kein Eintrag in der Einstellungs-Schublade.
- Kein Config-Flag zum Ausblenden des Knopfes.
- Kein eigener Entwurf für die Einstellungs-Schublade — sie folgt den Tokens,
  abgesehen von den zwei oben genannten Ausbesserungen.
