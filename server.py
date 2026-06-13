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

import json
import os
import sqlite3
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "homelab.db")
API_PATH = "/api/config"
MAX_BODY = 5 * 1024 * 1024  # generous ceiling; configs are tiny


def init_db():
    """Create the single-row config table if it does not exist yet."""
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

    # ---- routing ----------------------------------------------------------
    def do_GET(self):
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
        if self.path.split("?")[0].lstrip("/") == os.path.basename(DB_PATH):
            return self._send_empty(404)
        return super().do_GET()

    def do_PUT(self):
        if self.path.split("?")[0] != API_PATH:
            return self._send_empty(405)
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
        delete_config()
        return self._send_json(200, {"ok": True})

    def log_message(self, fmt, *args):
        # Quieter: skip the noisy per-request stderr lines for static assets.
        if API_PATH in self.path:
            super().log_message(fmt, *args)


def main():
    host = os.environ.get("HOMELAB_HOST", "0.0.0.0")
    port = int(os.environ.get("HOMELAB_PORT", sys.argv[1] if len(sys.argv) > 1 else 8080))
    init_db()
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
