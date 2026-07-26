#!/usr/bin/env python3
# =============================================================================
#  HOMELAB START PAGE — TINY SYNC SERVER
#  Serves the static dashboard AND stores the user's settings centrally in a
#  SQLite file (homelab.db) right next to the web files. This lets every
#  machine on the network share the same configuration without exporting and
#  importing a config.js by hand.
#
#  Standard library only — no pip installs. Run:  python3 server.py
#  Then open http://<this-host>:8080/ from any machine on the LAN.
#
#  API (consumed by app.js):
#    GET  /api/config  -> 200 {settings, groups}  or  204 if nothing saved yet
#    PUT  /api/config  -> store the posted JSON as the active config
#    DELETE /api/config -> forget the saved config (back to config.js defaults)
# =============================================================================

import base64
import hmac
import ipaddress
import json
import os
import re
import signal
import socket
import sqlite3
import ssl
import sys
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
# Where the settings live. Defaults to a file next to the web files, which is
# what a bare `python3 server.py` has always done. Set HOMELAB_DB to move it
# elsewhere — the container image points it at a mounted volume so the config
# survives an image update.
DB_PATH = os.environ.get("HOMELAB_DB", "").strip() or os.path.join(HERE, "homelab.db")
API_PATH = "/api/config"
FAVICON_PATH = "/api/favicon"
MAX_BODY = 5 * 1024 * 1024  # generous ceiling; configs are tiny

# Optional write protection. When HOMELAB_TOKEN is set, PUT/DELETE on the config
# require it (header "X-Homelab-Token" or "Authorization: Bearer <token>").
# Unset (the default) keeps the endpoint open for a trusted LAN — unchanged.
AUTH_TOKEN = os.environ.get("HOMELAB_TOKEN", "").strip()

# Favicon resolution: the server fetches the target page (it can reach LAN-only
# services the browser shows), parses its <link rel="icon"> tags and returns the
# best absolute icon URL. This is a deliberate fetch-on-behalf-of-the-user
# (SSRF-shaped) feature for a trusted home network — it only follows http(s),
# and self-signed certs are tolerated since homelab services often use them.
FETCH_TIMEOUT = 6
ICON_MAX_BYTES = 200 * 1024  # cap embedded icons so the config stays small
_UA = "Mozilla/5.0 (HomelabDashboard favicon fetch)"
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

# SSRF containment for the favicon fetcher. By default every host is allowed
# EXCEPT link-local / cloud-metadata addresses (e.g. 169.254.169.254), which are
# always blocked. Set HOMELAB_FAVICON_ALLOW to a comma-separated list of hosts
# (matched exactly or as a parent domain) to restrict fetching to just those.
FAVICON_ALLOW = [h.strip().lower() for h in
                 os.environ.get("HOMELAB_FAVICON_ALLOW", "").split(",") if h.strip()]


def _host_allowed(host):
    host = (host or "").lower()
    if FAVICON_ALLOW and not any(host == a or host.endswith("." + a) for a in FAVICON_ALLOW):
        return False
    try:  # always block cloud-metadata / link-local, even when on the allowlist
        for res in socket.getaddrinfo(host, None):
            if ipaddress.ip_address(res[4][0]).is_link_local:
                return False
    except OSError:
        return False
    return True


class _GuardRedirect(urllib.request.HTTPRedirectHandler):
    """Re-check the target of every redirect so a page can't 30x us onto a
    blocked host (e.g. the metadata endpoint)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _host_allowed(urllib.parse.urlparse(newurl).hostname):
            return None
        return super().redirect_request(req, fp, code, msg, headers, newurl)


# Custom opener: carries the (cert-tolerant) SSL context AND the guarded
# redirect handler, replacing the default urlopen behaviour.
_OPENER = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=_SSL_CTX), _GuardRedirect())

_LINK_RE = re.compile(r"<link\b[^>]*>", re.IGNORECASE)
_REL_RE = re.compile(r'rel\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_HREF_RE = re.compile(r'href\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_SIZES_RE = re.compile(r'sizes\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_MEDIA_RE = re.compile(r'media\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_EXT_MIME = {
    ".ico": "image/x-icon", ".png": "image/png", ".svg": "image/svg+xml",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp",
}


def _open(url):
    # Validate every URL we fetch — this also covers the icon candidates parsed
    # out of the page's own <link> tags, not just the initial page URL.
    if not _host_allowed(urllib.parse.urlparse(url).hostname):
        raise ValueError("host not allowed")
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "*/*"})
    return _OPENER.open(req, timeout=FETCH_TIMEOUT)


def _icon_candidates(html, base_url):
    """Pull <link rel=...icon...> hrefs, best first.

    The dashboard is a permanently dark UI, so a site's dark-mode icon variant
    (declared via `media="(prefers-color-scheme: dark)"`) is preferred — it is
    designed to stay legible on dark backgrounds. Light-only variants are pushed
    to the back so they're used only when nothing better exists."""
    scored = []
    for tag in _LINK_RE.findall(html):
        rel_m = _REL_RE.search(tag)
        href_m = _HREF_RE.search(tag)
        if not rel_m or not href_m:
            continue
        # Match rel *tokens*, not substrings, so "mask-icon" / "fluid-icon"
        # (Safari pinned tab, Fluid app — not real favicons) are excluded.
        tokens = rel_m.group(1).lower().split()
        is_apple = any(t.startswith("apple-touch-icon") for t in tokens)
        if "icon" not in tokens and not is_apple:
            continue
        href = urllib.parse.urljoin(base_url, href_m.group(1).strip())
        score = 50 if is_apple else 0
        media_m = _MEDIA_RE.search(tag)
        media = media_m.group(1).lower() if media_m else ""
        if "dark" in media:
            score += 1000          # strongly prefer the site's dark variant
        elif "light" in media:
            score -= 1000          # avoid light-only icons on our dark board
        sizes_m = _SIZES_RE.search(tag)
        if sizes_m:
            try:
                score += int(sizes_m.group(1).lower().split("x")[0])
            except ValueError:
                pass
        scored.append((score, href))
    scored.sort(key=lambda t: t[0], reverse=True)
    return [h for _, h in scored]


def _fetch_data_uri(url):
    """Download an icon and return it as a `data:` URI, or None if unusable."""
    try:
        with _open(url) as r:
            if r.status != 200:
                return None
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            data = r.read(ICON_MAX_BYTES + 1)
    except Exception:
        return None
    if not data or len(data) > ICON_MAX_BYTES:
        return None
    if not ctype.startswith("image/"):
        # Servers often mislabel icons (e.g. text/plain) — infer from the path.
        ext = os.path.splitext(urllib.parse.urlparse(url).path.lower())[1]
        ctype = _EXT_MIME.get(ext)
        if not ctype:
            return None
    return "data:%s;base64,%s" % (ctype, base64.b64encode(data).decode("ascii"))


def resolve_favicon(page_url):
    """Return (icon, error). `icon` is a `data:` URI (embedded bytes), or as a
    last resort the conventional favicon URL, or None on a bad request."""
    parts = urllib.parse.urlparse(page_url)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None, "url must be http(s)"

    candidates = []
    final_url = page_url
    try:
        with _open(page_url) as r:
            final_url = r.geturl()
            html = r.read(512 * 1024).decode("utf-8", "replace")
        candidates = _icon_candidates(html, final_url)
    except Exception:
        pass  # page unreachable/unparseable — still try the default path below

    fin = urllib.parse.urlparse(final_url)
    origin = "%s://%s" % (fin.scheme, fin.netloc)
    default_ico = origin + "/favicon.ico"
    candidates.append(default_ico)

    for cand in candidates:
        data_uri = _fetch_data_uri(cand)
        if data_uri:
            return data_uri, None
    # Couldn't embed anything — hand back the conventional path so the browser
    # can still try to load it directly.
    return default_ico, None


def init_db():
    """Create the single-row config table if it does not exist yet."""
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute(
            "CREATE TABLE IF NOT EXISTS config ("
            "  id INTEGER PRIMARY KEY CHECK (id = 1),"
            "  data TEXT NOT NULL,"
            "  updated_at TEXT NOT NULL"
            ")"
        )
        con.commit()
    finally:
        con.close()


def read_config():
    con = sqlite3.connect(DB_PATH)
    try:
        row = con.execute("SELECT data FROM config WHERE id = 1").fetchone()
        return row[0] if row else None
    finally:
        con.close()


def write_config(text):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute(
            "INSERT INTO config (id, data, updated_at) VALUES (1, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET data = excluded.data, "
            "updated_at = excluded.updated_at",
            (text, now),
        )
        con.commit()
    finally:
        con.close()


def delete_config():
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("DELETE FROM config WHERE id = 1")
        con.commit()
    finally:
        con.close()


class Handler(SimpleHTTPRequestHandler):
    """Static file server (from this folder) plus the /api/config endpoint."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    # ---- helpers ----------------------------------------------------------
    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _is_database(self):
        """True when the request resolves to the settings database.

        Comparing URL text against the file's basename is not enough: the base
        handler percent-decodes the path *after* such a check (so `/homela%62.db`
        slipped through), and HOMELAB_DB may point somewhere inside the served
        folder. Resolve the request to a real filesystem path instead, and cover
        SQLite's sidecar files too.
        """
        try:
            target = os.path.realpath(self.translate_path(self.path))
        except Exception:
            return False
        db = os.path.realpath(DB_PATH)
        return target == db or target.startswith(db + "-")

    def _send_empty(self, code):
        self.send_response(code)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return None
        return self.rfile.read(length)

    def _authorized(self):
        if not AUTH_TOKEN:
            return True  # open on a trusted LAN (default)
        given = self.headers.get("X-Homelab-Token", "")
        auth = self.headers.get("Authorization", "")
        if not given and auth.startswith("Bearer "):
            given = auth[7:]
        return hmac.compare_digest(given, AUTH_TOKEN)

    # ---- routing ----------------------------------------------------------
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == FAVICON_PATH:
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            target = (params.get("url") or [""])[0].strip()
            if not target:
                return self._send_json(400, {"error": "missing url parameter"})
            icon, err = resolve_favicon(target)
            if err or not icon:
                return self._send_json(502, {"error": err or "no icon found"})
            return self._send_json(200, {"icon": icon})
        if self.path.split("?")[0] == API_PATH:
            data = read_config()
            if data is None:
                return self._send_empty(204)
            self.send_response(200)
            body = data.encode("utf-8")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        # Don't let clients fetch the database itself.
        if self._is_database():
            return self._send_empty(404)
        return super().do_GET()

    def do_HEAD(self):
        if self._is_database():
            return self._send_empty(404)
        return super().do_HEAD()

    def do_PUT(self):
        if self.path.split("?")[0] != API_PATH:
            return self._send_empty(405)
        if not self._authorized():
            return self._send_json(401, {"error": "unauthorized"})
        raw = self._read_body()
        if raw is None:
            return self._send_json(400, {"error": "empty or oversized body"})
        try:
            parsed = json.loads(raw.decode("utf-8"))
            if not isinstance(parsed, dict):
                raise ValueError("config must be a JSON object")
        except (ValueError, UnicodeDecodeError) as exc:
            return self._send_json(400, {"error": str(exc)})
        # Re-serialize compactly so we store clean, validated JSON.
        write_config(json.dumps(parsed, separators=(",", ":")))
        return self._send_json(200, {"ok": True})

    # Allow POST as an alias for clients that can't send PUT.
    do_POST = do_PUT

    def do_DELETE(self):
        if self.path.split("?")[0] != API_PATH:
            return self._send_empty(405)
        if not self._authorized():
            return self._send_json(401, {"error": "unauthorized"})
        delete_config()
        return self._send_json(200, {"ok": True})

    def log_message(self, fmt, *args):
        # Quieter: skip the noisy per-request stderr lines for static assets.
        if API_PATH in self.path:
            super().log_message(fmt, *args)


def _stop(signum, frame):
    """Turn SIGTERM into the same clean exit Ctrl-C already takes.

    Python only installs a handler for SIGINT, and the kernel drops signals with
    a default disposition sent to PID 1 — so without this a containerised server
    ignores `docker stop` and gets SIGKILLed after the 10s grace period.
    """
    raise KeyboardInterrupt


def main():
    # An empty value means "not set" for every knob here — a blank field in a
    # Portainer stack or `-e HOMELAB_PORT=` should not crash the server.
    host = os.environ.get("HOMELAB_HOST", "").strip() or "0.0.0.0"
    port_env = os.environ.get("HOMELAB_PORT", "").strip()
    port_arg = sys.argv[1] if len(sys.argv) > 1 else "8080"
    try:
        port = int(port_env or port_arg)
    except ValueError:
        sys.exit(f"Invalid port: {port_env or port_arg!r}")
    init_db()
    signal.signal(signal.SIGTERM, _stop)
    server = ThreadingHTTPServer((host, port), Handler)
    shown = host if host != "0.0.0.0" else "<this-host>"
    print(f"Homelab dashboard on  http://{shown}:{port}/")
    print(f"Settings stored in    {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
