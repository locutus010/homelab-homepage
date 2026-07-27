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
out of the box. It is published for `linux/amd64` and `linux/arm64`, so a
Raspberry Pi works too.

There are two compose files, and which one you want depends on how you deploy:

| File                  | Use it when                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `compose.yaml`        | You have the repository checked out. Builds the image locally as `homelab-homepage:local`. |
| `portainer-stack.yml` | You deploy through Portainer, or want to pull the published image instead of building. |

### With the repository checked out

```bash
docker compose up -d --build     # then open http://<this-host>:8080/
```

`--build` is the habit worth keeping: without it compose reuses the existing
`homelab-homepage:local` image and your edits to `config.js` and friends never
reach the container.

### Without cloning anything

```bash
docker run -d --name homelab-homepage -p 8080:8080 \
  -v homelab-data:/data --restart unless-stopped \
  ghcr.io/locutus010/homelab-homepage:latest
```

### With Portainer

Use `portainer-stack.yml`, not `compose.yaml`. `compose.yaml` uses `build: .`,
which the **Web editor** cannot do — it has no repository to build from. (The
**Repository** build method clones this repo and *could* build, but pulling the
ready-made multi-arch image is faster and spares a Raspberry Pi the build.)

**Web editor (simplest):**

1. **Stacks → Add stack**, give it a name (e.g. `homelab-homepage`).
2. Build method **Web editor**, then paste the contents of
   `portainer-stack.yml`.
3. Optionally add environment variables (see the table below) — the file has
   working defaults, so you can skip this.
4. **Deploy the stack**, then open `http://<this-host>:8080/`.

**From this repository instead:** build method **Repository**, URL
`https://github.com/locutus010/homelab-homepage`, reference
`refs/heads/main`, compose path `portainer-stack.yml`. Portainer then redeploys
from git whenever you ask it to.

Updating later: **Stacks → your stack → Update the stack**, tick
*Re-pull image*. Your settings are on the volume and are not touched.

### Settings and environment

Your settings live in the `homelab-data` volume as `/data/homelab.db` and
survive an image update or a container recreate.

| Variable                | Default            | Purpose                                            |
| ----------------------- | ------------------ | -------------------------------------------------- |
| `HOMELAB_DB`            | `/data/homelab.db` | Where the settings database is stored              |
| `HOMELAB_PORT`          | `8080`             | Port the server listens on *inside* the container  |
| `HOMELAB_HOST`          | `0.0.0.0`          | Bind address — leave this alone in a container     |
| `HOMELAB_TOKEN`         | unset              | When set, changing settings requires this token    |
| `HOMELAB_FAVICON_ALLOW` | unset              | Comma-separated hosts the favicon fetch may reach; parent domains match |

To change the port you reach the page on, change the **left** side of the port
mapping (`-p 9000:8080`), not `HOMELAB_PORT` — that one only moves the listener
inside the container and you would have to change the mapping to match anyway.
`portainer-stack.yml` exposes the host side as its own variable,
`HOMELAB_HOST_PORT`.

Do not set `HOMELAB_HOST` in a container. Binding to `127.0.0.1` makes the page
unreachable from outside while the container still reports itself healthy — the
server *is* running, just only on the container's own loopback. Any other
address fails to bind at all.

Leaving `HOMELAB_TOKEN` and `HOMELAB_FAVICON_ALLOW` empty means "off", which is
the sensible default on a trusted LAN. Link-local and cloud-metadata addresses
are blocked for the favicon fetch either way.

If you set `HOMELAB_TOKEN`, enter the same value under **Sichern & Übertragen →
Schreib-Token** in the settings panel, or the page cannot save.

To ship your own default `config.js`, mount it over the one in the image:
`-v ./config.js:/app/config.js:ro`.

## Edit everything from the page (no code)

Click the **⚙ gear** (top right) to open the settings panel. From there anyone —
no technical knowledge required — can change:

- **Allgemein**: title, subtitle, your name (greeting), accent color (picker), language, 24h clock
- **Wetter**: turn it on and just type your city — coordinates are looked up automatically. °C / °F, and the toggle for the public (WAN) IP pill lives here too, since it sits right below the weather
- **Suche**: toggle the search bar and pick the default engine
- **Statusprüfung**: toggle the status LEDs, show or hide the number strip
  (monitored / groups / online / offline), and set how often they re-check
- **Lesezeichen**: add / edit / delete / reorder groups and links — and the **🌐 button** on a link's icon field auto-fetches its site icon
- **Sichern & Übertragen**: the optional write token, download a `config.js` backup or load one in, and reset everything to factory settings

Changes apply **instantly** and are saved **automatically**. Without the server
they live in your browser (localStorage); with `server.py` they are stored
centrally and shared across every device — no file editing and no refresh
needed.

To make your setup the default on every device (or to back it up) without the
server, use the **⬇ download button** under *Backup & transfer* in the panel
and drop that file into the project folder, replacing the existing
`config.js`.

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

## Widgets & settings

All under `settings` in `config.js`:

| Setting        | What it does                                                        |
| -------------- | ------------------------------------------------------------------- |
| `title` / `subtitle` | Brand shown top-left and the small label under it             |
| `accent`       | Primary accent color (any CSS color)                                |
| `owner`        | Name used in the greeting                                           |
| `lang`         | Language of the start page and of the settings drawer, set separately: `{ ui: "auto", settings: "auto" }`. `"auto"` follows the browser; `"en"` / `"de"` pin a pack |
| `clock24h`     | 24-hour clock. The date format itself comes from the start page's language pack |
| `search`       | Web search bar + engines. Bang prefixes switch engine: `!g cats`    |
| `weather`      | Weather widget via [open-meteo](https://open-meteo.com) — no API key. Set your `latitude` / `longitude` |
| `publicIp`     | Show your public (WAN) IP as a pill under the weather. `{ enabled: true }` |
| `statusCheck`  | Live reachability LEDs for links with `ping: true`                  |
| `stats`        | The number strip (monitored / groups / online / offline). `{ enabled: true }` — only shown while `statusCheck` is on |

## Keyboard

- <kbd>/</kbd> or just start typing — focus the search bar
- a plain word runs a **web search** — <kbd>Enter</kbd> sends it to your engine
- start the line with **`/`** to **filter your links** live instead; <kbd>Enter</kbd>
  then opens the first match (the badge switches to `GO`)
- a `!bang` prefix picks a different **search engine** for that one query
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

Both writes are refused (`403`) when the browser marks the request as
cross-site, and `PUT` requires `Content-Type: application/json` (`415`
otherwise) — together that stops any page you happen to visit from quietly
rewriting your bookmarks. Scripting the API with `curl` still works; just send
the JSON content type.

Host/port can be set via `HOMELAB_HOST` / `HOMELAB_PORT` (or `server.py <port>`),
defaulting to `0.0.0.0:8080`. `HOMELAB_DB` moves the SQLite file elsewhere —
that is how the container keeps it on a volume. `HOMELAB_TOKEN` and
`HOMELAB_FAVICON_ALLOW` work here too; see the table above.

> Security note: `server.py` is meant for a **trusted home LAN**. The favicon
> endpoint fetches URLs on your behalf (it tolerates self-signed certs that
> homelab services often use) — don't expose it to the open internet.

## Favicons

In a link's icon field you can click the **🌐 button** to grab the site's own
icon automatically:

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
| `lang.js`     | Language packs (English, German) — see [Languages](#languages) above |
| `check-i18n.js` | Dev tool: `node check-i18n.js` checks the language packs are complete and in sync with the code |
| `server.py`   | **Optional** stdlib server: serves the files + central SQLite settings store + favicon resolver |
| `Dockerfile`  | Container image (`python:3.13-alpine`, no pip)          |
| `compose.yaml` | Compose file that builds the image locally             |
| `portainer-stack.yml` | Compose file for Portainer stacks — pulls the published image |

For how the parts fit together and which constraints to keep when changing
things, see [`docs/architecture.md`](docs/architecture.md).

> Note: once you edit anything in the settings panel, those edits take priority
> over `config.js` — stored centrally when the server runs, otherwise in your
> browser. Use the **reset-to-factory-settings button** under *Backup &
> transfer* in the panel to go back to whatever `config.js` contains.
