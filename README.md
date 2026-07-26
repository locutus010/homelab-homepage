# Homelab Start Page

A self-hosted browser start page / dashboard for your homelab. Configurable
bookmarks to the systems on your local network, grouped into categories, plus
widgets: live clock, time-of-day greeting, weather, a web search bar, your
public (WAN) IP, and best-effort online/offline status LEDs for each service.

Plain **HTML / CSS / JavaScript** — no build step, no dependencies, no
framework. Works straight from `file://`. An *optional* tiny Python server adds
central, cross-device settings storage — but is never required.

## Run it

**Simplest — open the file.** Just open `index.html` in your browser. Or serve
the folder so the status checks and weather fetch behave like in production:

```bash
# any static server works; pick one you have
python3 -m http.server 8080      # then open http://localhost:8080
```

**Shared across every device — run the sync server.** The included
`python3 server.py` serves the page *and* stores your settings centrally in a
SQLite file, so every machine on the LAN sees the same configuration and the
favicon lookup works (see below):

```bash
python3 server.py                # serves on http://<this-host>:8080/
# optional: python3 server.py 9000   or   HOMELAB_PORT=9000 python3 server.py
```

Standard library only — no `pip`, no dependencies. See
[Central settings (optional server)](#central-settings-optional-server) below.

Set it as your browser's home / new-tab page once you're happy with it.

## Run with Docker

The image runs the sync server, so central settings and the favicon lookup work
out of the box:

```bash
docker compose up -d             # then open http://<this-host>:8080/
```

Or without compose:

```bash
docker run -d --name homelab-homepage -p 8080:8080 \
  -v homelab-data:/data --restart unless-stopped \
  ghcr.io/locutus010/homelab-homepage:latest
```

Your settings live in the `/data` volume as `homelab.db` and survive an image
update. Published for `linux/amd64` and `linux/arm64`, so a Raspberry Pi works
too.

| Variable                | Default            | Purpose                                              |
| ----------------------- | ------------------ | ---------------------------------------------------- |
| `HOMELAB_DB`            | `/data/homelab.db` | Where the settings database is stored                |
| `HOMELAB_PORT`          | `8080`             | Port inside the container                            |
| `HOMELAB_HOST`          | `0.0.0.0`          | Bind address                                         |
| `HOMELAB_TOKEN`         | unset              | When set, changing settings requires this token      |
| `HOMELAB_FAVICON_ALLOW` | unset              | Comma-separated hosts the favicon fetch may reach    |

To ship your own default `config.js`, mount it over the one in the image:
`-v ./config.js:/app/config.js:ro`.

## Edit everything from the page (no code)

Click the **⚙ gear** (top right) to open the settings panel. From there anyone —
no technical knowledge required — can change:

- **Allgemein**: title, subtitle, your name (greeting), accent color (picker), language, 24h clock
- **Wetter**: turn it on and just type your city — coordinates are looked up automatically
- **Suche** / **Statusprüfung**: toggle the search bar and the status LEDs
- **Öffentliche IP**: show / hide your current WAN IP pill
- **Lesezeichen**: add / edit / delete / reorder groups and links — and **„Favicon holen“ (🌐)** auto-fetches a link's site icon
- **Sichern & Übertragen**: download a `config.js` backup or load one in

Changes apply **instantly** and are saved **automatically**. Without the server
they live in your browser (localStorage); with `server.py` they are stored
centrally and shared across every device — no file editing and no refresh
needed.

To make your setup the default on every device (or to back it up) without the
server, use **„config.js herunterladen“** in the panel and drop that file into
the project folder, replacing the existing `config.js`.

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
| `title` / `subtitle` | Brand shown top-left and the small label under it             |
| `accent`       | Primary accent color (any CSS color)                                |
| `owner`        | Name used in the greeting                                           |
| `locale` / `clock24h` | Clock & date formatting                                      |
| `search`       | Web search bar + engines. Bang prefixes switch engine: `!g cats`    |
| `weather`      | Weather widget via [open-meteo](https://open-meteo.com) — no API key. Set your `latitude` / `longitude` |
| `publicIp`     | Show your public (WAN) IP as a pill under the weather. `{ enabled: true }` |
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

## Central settings (optional server)

Run `python3 server.py` instead of a plain static server and your settings stop
living in a single browser:

- The page is served as usual, and settings are saved **centrally** in a
  `homelab.db` SQLite file next to the web files.
- Every machine on the LAN that opens the server's address sees the **same
  configuration** automatically — no exporting/importing `config.js` by hand.
- On first paint the browser still uses its local cache, then pulls the central
  config from the server and re-renders. If the server is unreachable it falls
  back to `localStorage`, so nothing breaks.

It's deliberately tiny and **standard-library only** (no `pip`). The API:

| Method   | Endpoint               | Purpose                                      |
| -------- | ---------------------- | -------------------------------------------- |
| `GET`    | `/api/config`          | Current central config (`204` if none saved) |
| `PUT`    | `/api/config`          | Store the posted config                      |
| `DELETE` | `/api/config`          | Forget it (back to `config.js` defaults)     |
| `GET`    | `/api/favicon?url=`    | Resolve a link's favicon (see below)         |

Host/port can be set via `HOMELAB_HOST` / `HOMELAB_PORT` (or `server.py <port>`),
defaulting to `0.0.0.0:8080`.

> Security note: `server.py` is meant for a **trusted home LAN**. The favicon
> endpoint fetches URLs on your behalf (it tolerates self-signed certs that
> homelab services often use) — don't expose it to the open internet.

## Favicons

In a link's icon field you can click **🌐 „Favicon holen“** to grab the site's
own icon automatically:

- **With the server**, `/api/favicon` fetches the page, parses its
  `<link rel="icon">` tags, prefers the site's **dark-mode** icon variant (this
  is a permanently dark UI), and embeds the image as a `data:` URI so it keeps
  working even for LAN-only services your browser can reach.
- **Without the server**, it falls back to the conventional
  `<origin>/favicon.ico`.

You can still set an icon by hand — an emoji, an image URL, or leave it blank for
an auto-generated monogram.

## Files

| File         | Purpose                                  |
| ------------ | ---------------------------------------- |
| `index.html`  | Markup & widget scaffolding              |
| `styles.css`  | All styling (the "mission control" look) |
| `app.js`      | Rendering + widget logic                 |
| `settings.js` | The on-page settings panel (no-code editor) |
| `config.js`   | **Default** links, groups, and settings  |
| `server.py`   | **Optional** stdlib server: serves the files + central SQLite settings store + favicon resolver |

> Note: once you edit anything in the settings panel, those edits take priority
> over `config.js` — stored centrally when the server runs, otherwise in your
> browser. Use **„Zurücksetzen“** in the panel to go back to whatever
> `config.js` contains.
