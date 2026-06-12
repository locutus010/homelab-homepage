# Homelab Start Page

A self-hosted browser start page / dashboard for your homelab. Configurable
bookmarks to the systems on your local network, grouped into categories, plus
widgets: live clock, time-of-day greeting, weather, a web search bar, and
best-effort online/offline status LEDs for each service.

Plain **HTML / CSS / JavaScript** — no build step, no dependencies, no backend.

## Run it

Just open `index.html`, or serve the folder so the status checks and weather
fetch behave like in production:

```bash
# any static server works; pick one you have
python3 -m http.server 8080      # then open http://localhost:8080
```

Set it as your browser's home / new-tab page once you're happy with it.

## Edit everything from the page (no code)

Click the **⚙ gear** (top right) to open the settings panel. From there anyone —
no technical knowledge required — can change:

- **Allgemein**: title, your name (greeting), accent color (picker), language, 24h clock
- **Wetter**: turn it on and just type your city — coordinates are looked up automatically
- **Suche** / **Statusprüfung**: toggle the search bar and the status LEDs
- **Lesezeichen**: add / edit / delete / reorder groups and links visually
- **Sichern & Übertragen**: download a `config.js` backup or load one in

Changes apply **instantly** and are saved **automatically in your browser**
(localStorage) — no file editing and no refresh needed.

To make your setup the default on every device (or to back it up), use
**„config.js herunterladen“** in the panel and drop that file into the project
folder, replacing the existing `config.js`.

## Add your own links by editing the file (optional)

You can also edit **`config.js`** directly and refresh. No rebuild. The settings
panel writes the exact same structure.

```js
groups: [
  {
    name: "Infrastructure",
    links: [
      {
        name: "Proxmox",
        url: "https://proxmox.local:8006",
        description: "Hypervisor",   // optional subtitle
        icon: "🧊",                  // emoji, image URL, or omit for a monogram
        ping: true,                  // optional: show a live status LED
      },
    ],
  },
],
```

**Icons** can be:
- an emoji — `icon: "🎬"`
- an image URL — `icon: "/icons/jellyfin.png"` or `https://…`
- omitted — an auto-generated colored monogram from the name

## Widgets & settings

All under `settings` in `config.js`:

| Setting        | What it does                                                        |
| -------------- | ------------------------------------------------------------------- |
| `accent`       | Primary accent color (any CSS color)                                |
| `owner`        | Name used in the greeting                                           |
| `locale` / `clock24h` | Clock & date formatting                                      |
| `search`       | Web search bar + engines. Bang prefixes switch engine: `!g cats`    |
| `weather`      | Weather widget via [open-meteo](https://open-meteo.com) — no API key. Set your `latitude` / `longitude` |
| `statusCheck`  | Live reachability LEDs for links with `ping: true`                  |

## Keyboard

- <kbd>/</kbd> or just start typing — focus the search bar
- typing a plain word **filters your links** live
- a query with a space or a `!bang` runs a **web search** instead
- <kbd>Esc</kbd> — clear & blur

## How the status LEDs work

Each `ping: true` link is probed with a `no-cors` `fetch`. A response of any
kind lights the LED green (host reachable); a timeout lights it red. Because
`no-cors` returns an opaque response, this is **reachability**, not an HTTP
health check — good enough to see at a glance what's up. Re-checked every
`statusIntervalMs` (default 60s).

## Files

| File         | Purpose                                  |
| ------------ | ---------------------------------------- |
| `index.html`  | Markup & widget scaffolding              |
| `styles.css`  | All styling (the "mission control" look) |
| `app.js`      | Rendering + widget logic                 |
| `settings.js` | The on-page settings panel (no-code editor) |
| `config.js`   | **Default** links, groups, and settings  |

> Note: once you edit anything in the settings panel, those edits live in your
> browser and take priority over `config.js`. Use **„Zurücksetzen“** in the
> panel to go back to whatever `config.js` contains.
