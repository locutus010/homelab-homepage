# CLAUDE.md

Guidance for working in this repository.

## What this is

A self-hosted **homelab start page / dashboard**. A static browser homepage
that shows configurable bookmarks to systems on the local network, grouped
into categories, plus widgets (clock, greeting, weather, web search, live
service-status LEDs).

**Plain HTML / CSS / JavaScript. No build step, no framework, no dependencies.**
Do not introduce a bundler, package manager, or framework unless the user
explicitly asks — keeping it zero-dependency and openable as a single file is a
core constraint.

The one exception is `server.py` (Python standard library only — no pip): an
*optional* tiny server that both serves the files and stores settings centrally
in SQLite so every machine on the LAN shares one config. The page still works
fully via `file://` (and any static server) by falling back to `localStorage`;
the server must remain optional and dependency-free.

## Files

| File         | Purpose                                                          |
| ------------ | ---------------------------------------------------------------- |
| `index.html`  | Markup and the static scaffolding for each widget              |
| `styles.css`  | All styling. Aesthetic: industrial "mission control" — ink bg, single amber accent (`--accent`), Archivo display + JetBrains Mono labels, grain + dot-grid texture. Settings-drawer styles are appended at the end (`.set-*`, `.gear`). |
| `app.js`      | Core logic + the `window.Homelab` API. One IIFE.               |
| `settings.js` | The on-page no-code settings drawer. One IIFE. Drives the page only through `window.Homelab`. German UI labels (Du-form). |
| `config.js`   | **Default** data. Defines `window.CONFIG = { settings, groups }` |
| `server.py`   | Optional stdlib server: serves the files + central settings store. `GET`/`PUT`/`DELETE /api/config` backed by SQLite (`homelab.db`). |

## Architecture notes

- **Active config vs. defaults.** `config.js` provides *defaults*. On boot
  `app.js` overlays the user's saved edits to form the *active* config. Settings
  (objects) are deep-merged so new default keys appear; `groups` (array) is
  taken wholesale from the save if present. The active config — not
  `window.CONFIG` — is the source of truth at runtime.
- **Where saved edits live.** First paint uses the `localStorage` cache
  (`homelab.config.v1`); then `syncFromServer()` pulls the central config from
  `GET /api/config` and re-renders. `persist()` always writes the localStorage
  cache immediately and, when served over http(s), debounce-`PUT`s to the
  server (`serverEnabled`). Over `file://` the API is skipped entirely and
  localStorage is the only store — the page stays self-contained.
- **`window.Homelab` is the seam** between logic and UI. `settings.js` must go
  through it, never touch the DOM board or `localStorage` directly. API:
  `config()` (live mutable object), `defaults()`, `apply()` (persist + render),
  `render()`, `refreshWeather()`, `replaceConfig(obj)`, `resetDefaults()`.
- `render()` is idempotent and safe to call on every keystroke. Event listeners
  (clock, search, filter, keyboard) are attached **once** in `init()` and read
  the active config at event time; `render()` only updates DOM content. The
  status-check interval is the exception — it's cleared and rescheduled in
  `scheduleStatusRun()`.
- **`config.js` is user data, not code to refactor.** Treat its shape as the
  public API shared by `app.js`, `settings.js`, and import/export. When adding a
  feature, extend the config schema rather than hardcoding, and add a matching
  control in `settings.js`. Keep its inline comments — user documentation.
- Settings edits mutate the live `Homelab.config()` object by reference, then
  call `apply()`. Text inputs do **not** rebuild the settings DOM (would lose
  focus); only structural actions (add/delete/reorder) call `buildBookmarks()`.
- Import parses both pure JSON and `window.CONFIG = {…};` files (via a `Function`
  shim). It's a homelab tool editing the user's own file, so this is acceptable;
  don't extend it to fetch/eval remote input.
- Rendering is plain DOM construction (`document.createElement`). Any user
  string that reaches `innerHTML` must go through `escapeHtml()`.
- Status checks use `fetch(url, { mode: "no-cors" })` — this is a best-effort
  *reachability* probe, not an HTTP health check (opaque responses can't be
  read). Don't claim it reports HTTP status.
- Config is loaded as a plain `<script>` global (not `fetch` of JSON) on
  purpose, so the page also works when opened directly via `file://`.

## Conventions

- 2-space indent; double quotes in JS; trailing commas in multiline literals.
- Style via CSS custom properties on `:root`; the accent color is driven from
  config through `--accent`. Don't hardcode the accent in new rules — use
  `var(--accent)` and the `--accent-soft` / `--accent-line` derivatives.
- Respect `@media (prefers-reduced-motion: reduce)` for any new animation.
- New widgets: add static scaffolding to `index.html` (hidden by default), a
  config flag under `settings`, and an init call in `app.js`'s `init()`.

## Testing

No test framework. `node` is not available in this environment. To sanity-check
JS, use a tokenizer-aware brace/paren balance check rather than a naive one
(regex literals and comments break naive checkers). Otherwise verify visually
by serving the folder: `python3 -m http.server 8080`.
