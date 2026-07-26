# Docker Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a container image that runs the start page together with its optional sync server, persist the settings database in a volume, and publish the image to GHCR from CI.

**Architecture:** One runtime source change makes the SQLite path configurable (`HOMELAB_DB`). A single-stage `python:3.13-slim` image copies the six runtime files, runs `server.py` as a non-root user, and keeps the database on a `/data` volume. `compose.yaml` wires that up for users; a GitHub Actions workflow builds the same Dockerfile for amd64 and arm64 and pushes it to GHCR.

**Tech Stack:** Python 3.13 standard library, Docker, Docker Compose v2, GitHub Actions (`docker/build-push-action`, `docker/metadata-action`).

## Global Constraints

- No `pip install`, no `requirements.txt`, no bundler, no package manager. Python standard library only.
- Running without Docker must be unchanged: `open index.html`, `python3 -m http.server 8080`, and `python3 server.py` behave exactly as they do today.
- Base image: `python:3.13-slim`.
- Container port and default published port: `8080`.
- Database inside the container: `/data/homelab.db`, with `/data` as the volume mount point.
- Container user: uid 1000, gid 1000, non-root.
- Image name: `ghcr.io/locutus010/homelab-homepage`.
- CI platforms: `linux/amd64,linux/arm64`.
- Repo conventions: 2-space indent, double quotes in JS, keep `config.js` comments intact.
- README is English; the settings UI stays German.

---

### Task 1: Make the database path configurable

**Files:**
- Modify: `server.py:33` (the `DB_PATH` constant) and `server.py:202-215` (`init_db`)
- Test: none — no test framework in this repo; verified by running the server (Steps 2 and 5)

**Interfaces:**
- Consumes: nothing.
- Produces: environment variable `HOMELAB_DB` (string, absolute path to the SQLite file). Empty or unset means the previous default. Task 2 sets it to `/data/homelab.db`.

- [ ] **Step 1: Verify the current default behaviour first**

Run from the repo root:

```bash
rm -f /tmp/homelab-probe.db
python3 - <<'PY'
import os, sys
sys.argv = ["server.py"]
sys.path.insert(0, ".")
import server
print("DB_PATH:", server.DB_PATH)
PY
```

Expected: prints the repo path ending in `/homelab.db`. This is the behaviour that must not change.

- [ ] **Step 2: Verify HOMELAB_DB is currently ignored**

```bash
HOMELAB_DB=/tmp/homelab-probe.db python3 - <<'PY'
import sys
sys.argv = ["server.py"]
sys.path.insert(0, ".")
import server
print("DB_PATH:", server.DB_PATH)
PY
```

Expected: still prints the repo path — the variable has no effect yet. This is the failing check.

- [ ] **Step 3: Change the constant**

Replace line 33 of `server.py`:

```python
DB_PATH = os.path.join(HERE, "homelab.db")
```

with:

```python
# Where the settings live. Defaults to a file next to the web files, which is
# what a bare `python3 server.py` has always done. Set HOMELAB_DB to move it
# elsewhere — the container image points it at a mounted volume so the config
# survives an image update.
DB_PATH = os.environ.get("HOMELAB_DB", "").strip() or os.path.join(HERE, "homelab.db")
```

- [ ] **Step 4: Create the parent directory in `init_db`**

In `init_db()` (line 202), insert one statement before `con = sqlite3.connect(DB_PATH)`:

```python
def init_db():
    """Create the single-row config table if it does not exist yet."""
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    con = sqlite3.connect(DB_PATH)
```

Leave the rest of the function untouched.

- [ ] **Step 5: Re-run both checks**

Run the Step 1 command. Expected: unchanged repo path.
Run the Step 2 command. Expected: now prints `/tmp/homelab-probe.db`.

- [ ] **Step 6: Verify a nested path is created**

```bash
rm -rf /tmp/homelab-nested
HOMELAB_DB=/tmp/homelab-nested/sub/homelab.db python3 - <<'PY'
import sys
sys.argv = ["server.py"]
sys.path.insert(0, ".")
import server
server.init_db()
PY
ls -l /tmp/homelab-nested/sub/homelab.db
```

Expected: the file exists. Then clean up: `rm -rf /tmp/homelab-nested /tmp/homelab-probe.db`.

- [ ] **Step 7: Verify the plain server still starts**

```bash
python3 server.py 8099 &
sleep 1
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8099/
kill %1
```

Expected: `200`. Then `rm -f homelab.db` to avoid committing the probe database.

- [ ] **Step 8: Commit**

```bash
git add server.py
git commit -m "server.py: DB-Pfad über HOMELAB_DB konfigurierbar"
```

---

### Task 2: Dockerfile, .dockerignore and compose.yaml

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `compose.yaml`
- Test: none as code; verified by building and running the image (Steps 5-13)

**Interfaces:**
- Consumes: `HOMELAB_DB` from Task 1.
- Produces: a local image tagged `homelab-homepage:test`, and a compose service named `homelab-homepage` with volume `homelab-data` mounted at `/data`. Task 3 builds the same `Dockerfile` from the repository root as its build context.

- [ ] **Step 1: Write `.dockerignore`**

Written first so the very first build has a small context and can never pick up a local database.

```
.git
.gitignore
.github
.claude
docs
__pycache__
*.pyc
homelab.db
homelab.db-journal
homelab.db-wal
homelab.db-shm
*.md
Dockerfile
.dockerignore
compose.yaml
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
# Homelab start page — runs the optional sync server (server.py) so every
# device on the LAN shares one configuration. Python standard library only:
# there is nothing to build and nothing to pip install.
FROM python:3.13-slim

LABEL org.opencontainers.image.title="Homelab Start Page" \
      org.opencontainers.image.description="Self-hosted homelab start page with central settings storage" \
      org.opencontainers.image.source="https://github.com/locutus010/homelab-homepage" \
      org.opencontainers.image.licenses="MIT"

# Unprivileged user. /data is created here and owned by it so a named volume
# mounted there inherits usable ownership.
RUN groupadd --gid 1000 homelab \
    && useradd --uid 1000 --gid 1000 --no-create-home --shell /usr/sbin/nologin homelab \
    && mkdir -p /data \
    && chown homelab:homelab /data

WORKDIR /app

# Only the runtime files. Everything else is excluded via .dockerignore.
COPY index.html styles.css app.js settings.js config.js server.py ./

ENV HOMELAB_DB=/data/homelab.db \
    HOMELAB_HOST=0.0.0.0 \
    HOMELAB_PORT=8080

USER homelab
EXPOSE 8080
VOLUME ["/data"]

# The slim image has no curl, and installing one just for this would pull in a
# package manager step. urllib from the standard library does the same job.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/', timeout=4).read(1)"]

# -u keeps the server's prints unbuffered so they appear in `docker logs`.
CMD ["python3", "-u", "server.py"]
```

- [ ] **Step 3: Write `compose.yaml`**

```yaml
services:
  homelab-homepage:
    build: .
    image: ghcr.io/locutus010/homelab-homepage:latest
    container_name: homelab-homepage
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - homelab-data:/data
    # Optional hardening — uncomment the block to use it.
    #
    # environment:
    #   # Require a token for changing the settings (PUT/DELETE /api/config).
    #   # Leave it out on a trusted LAN — that is the default behaviour.
    #   HOMELAB_TOKEN: "change-me"
    #   # Restrict the server-side favicon fetch to these hosts (comma
    #   # separated, parent domains match). Left out, every host is allowed
    #   # except link-local and cloud-metadata addresses, which are always
    #   # blocked.
    #   HOMELAB_FAVICON_ALLOW: "nas.lan,router.lan"

volumes:
  homelab-data:
```

- [ ] **Step 4: Build the image**

```bash
docker build -t homelab-homepage:test .
```

Expected: build succeeds.

- [ ] **Step 5: Verify the image contains no stray database and no `.git`**

```bash
docker run --rm --entrypoint python3 homelab-homepage:test -c "import os; print(sorted(os.listdir('/app')))"
```

Expected: exactly `['app.js', 'config.js', 'index.html', 'server.py', 'settings.js', 'styles.css']`.

- [ ] **Step 6: Start via compose**

```bash
docker compose up -d --build
```

- [ ] **Step 7: Wait for the healthcheck**

```bash
for i in $(seq 1 20); do
  s=$(docker inspect -f '{{.State.Health.Status}}' homelab-homepage)
  echo "$i: $s"
  [ "$s" = "healthy" ] && break
  sleep 3
done
```

Expected: reaches `healthy`.

- [ ] **Step 8: Verify the page is served**

```bash
curl -sS -o /dev/null -w 'index %{http_code}\n' http://127.0.0.1:8080/
curl -sS -o /dev/null -w 'app.js %{http_code}\n' http://127.0.0.1:8080/app.js
curl -sS -o /dev/null -w 'styles %{http_code}\n' http://127.0.0.1:8080/styles.css
```

Expected: `200` three times.

- [ ] **Step 9: Verify the config API round-trips**

```bash
curl -sS -X PUT http://127.0.0.1:8080/api/config \
  -H 'Content-Type: application/json' \
  -d '{"settings":{"title":"DOCKER-PROBE"},"groups":[]}'
curl -sS http://127.0.0.1:8080/api/config
```

Expected: the `GET` returns the document containing `DOCKER-PROBE`.

- [ ] **Step 10: Verify persistence across a recreate**

```bash
docker compose down
docker compose up -d
sleep 3
curl -sS http://127.0.0.1:8080/api/config
```

Expected: still contains `DOCKER-PROBE`. This is the whole point of Task 1 — if it is missing, `HOMELAB_DB` or the volume is wrong.

- [ ] **Step 11: Verify the container runs unprivileged**

```bash
docker compose exec -T homelab-homepage id
```

Expected: `uid=1000(homelab) gid=1000(homelab)`.

- [ ] **Step 12: Verify the database is not reachable over HTTP**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/homelab.db
```

Expected: `404` (not `200`).

- [ ] **Step 13: Verify the write token works**

```bash
docker compose down
HOMELAB_TOKEN=probe-token docker compose run --rm -d -p 8081:8080 \
  -e HOMELAB_TOKEN=probe-token --name homelab-token-probe homelab-homepage
sleep 3
curl -sS -o /dev/null -w 'no token: %{http_code}\n' -X PUT http://127.0.0.1:8081/api/config \
  -H 'Content-Type: application/json' -d '{"settings":{},"groups":[]}'
curl -sS -o /dev/null -w 'with token: %{http_code}\n' -X PUT http://127.0.0.1:8081/api/config \
  -H 'Content-Type: application/json' -H 'X-Homelab-Token: probe-token' \
  -d '{"settings":{},"groups":[]}'
docker rm -f homelab-token-probe
```

Expected: `no token: 401`, `with token: 200` (or the server's documented success code — anything 2xx).

- [ ] **Step 14: Verify the arm64 build works**

```bash
docker buildx build --platform linux/arm64 -t homelab-homepage:arm64-probe .
```

Expected: succeeds. If buildx reports a missing emulator, run `docker run --privileged --rm tonistiigi/binfmt --install arm64` first and retry. This de-risks the multi-arch line in Task 3.

- [ ] **Step 15: Clean up the probes**

```bash
docker compose down -v
docker rmi homelab-homepage:test homelab-homepage:arm64-probe
```

`down -v` removes the volume holding `DOCKER-PROBE`.

- [ ] **Step 16: Commit**

```bash
git add Dockerfile .dockerignore compose.yaml
git commit -m "Docker: Image, compose-Setup und Build-Kontext"
```

---

### Task 3: GHCR publish workflow

**Files:**
- Create: `.github/workflows/docker.yml`
- Test: none runnable locally; the workflow's build step is the same `docker build` verified in Task 2, and arm64 was verified in Task 2 Step 14

**Interfaces:**
- Consumes: the `Dockerfile` from Task 2, built from the repository root as context.
- Produces: images at `ghcr.io/locutus010/homelab-homepage` tagged `latest` (default branch), the branch name, semver from `v*` tags, and `sha-<short>`.

- [ ] **Step 1: Write the workflow**

```yaml
name: Docker

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    branches: [main]

env:
  IMAGE_NAME: ghcr.io/${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # Homelab hosts are often a Raspberry Pi, so arm64 is not optional.
      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3

      # Pull requests build only — nothing is published until it lands on main.
      - name: Log in to GHCR
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Derive tags and labels
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,format=short

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Verify the YAML parses**

```bash
python3 -c "import sys; d=open('.github/workflows/docker.yml').read(); print('lines:', len(d.splitlines()))"
grep -n "platforms: linux/amd64,linux/arm64" .github/workflows/docker.yml
grep -n "packages: write" .github/workflows/docker.yml
```

Expected: the two `grep`s each print a line. (There is no YAML parser guaranteed present; these greps confirm the two settings that would silently break publishing.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/docker.yml
git commit -m "CI: Multi-Arch-Image nach GHCR veröffentlichen"
```

---

### Task 4: Documentation and pull request

**Files:**
- Modify: `README.md` — add a "Run with Docker" section after the existing "Run it" section
- Modify: `CLAUDE.md` — add `Dockerfile` / `compose.yaml` rows to the Files table and note `HOMELAB_DB`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the README section**

Insert after the "Run it" section, before "Edit everything from the page":

````markdown
**With Docker.** The image runs the sync server, so central settings and the
favicon lookup work out of the box:

```bash
docker compose up -d          # then open http://<this-host>:8080/
```

Or without compose:

```bash
docker run -d --name homelab-homepage -p 8080:8080 \
  -v homelab-data:/data --restart unless-stopped \
  ghcr.io/locutus010/homelab-homepage:latest
```

Your settings live in the `/data` volume as `homelab.db` and survive image
updates. Published for `linux/amd64` and `linux/arm64` (Raspberry Pi included).

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `HOMELAB_DB` | `/data/homelab.db` | Where the settings database is stored |
| `HOMELAB_PORT` | `8080` | Port inside the container |
| `HOMELAB_HOST` | `0.0.0.0` | Bind address |
| `HOMELAB_TOKEN` | unset | When set, changing settings requires this token |
| `HOMELAB_FAVICON_ALLOW` | unset | Comma-separated hosts the favicon fetch may reach |

To ship your own default `config.js`, mount it over the one in the image:
`-v ./config.js:/app/config.js:ro`.
````

- [ ] **Step 2: Update the CLAUDE.md Files table**

Add these rows to the table:

```markdown
| `Dockerfile`   | Container image: `python:3.13-slim`, runs `server.py` as uid 1000, DB on the `/data` volume. No pip, no build stage. |
| `compose.yaml` | One service on port 8080 with the `homelab-data` volume; env vars commented out as examples. |
```

- [ ] **Step 3: Note the DB path in CLAUDE.md**

In the "Where saved edits live" bullet of "Architecture notes", append:

```markdown
  The server's SQLite file defaults to `homelab.db` next to the web files;
  `HOMELAB_DB` overrides it, which is how the container keeps it on a volume.
```

- [ ] **Step 4: Verify the README renders sensibly**

```bash
grep -n "Run with Docker\|docker compose up -d\|HOMELAB_DB" README.md
```

Expected: matches in the new section.

- [ ] **Step 5: Commit and open the pull request**

```bash
git add README.md CLAUDE.md docs/superpowers/plans/2026-07-26-docker-image.md
git commit -m "Doku: Docker-Betrieb in README und CLAUDE.md"
git push -u origin docker-image
gh pr create --title "Docker-Image für die Startseite" --body "$(cat <<'EOF'
Macht das Projekt als Container lauffähig — inklusive `server.py`, also mit
zentraler Settings-Ablage und Favicon-Auflösung.

- `server.py`: DB-Pfad über `HOMELAB_DB` konfigurierbar. Ohne die Variable
  unverändert; der Container zeigt damit auf ein Volume.
- `Dockerfile`: `python:3.13-slim`, kein pip, non-root uid 1000, Healthcheck
  über die stdlib, DB unter `/data`.
- `compose.yaml`: Port 8080, benanntes Volume `homelab-data`.
- CI: Multi-Arch-Build (amd64 + arm64) nach `ghcr.io`, PRs bauen nur.
- README und CLAUDE.md ergänzt.

Lokal auf Docker getestet: Build, healthy, Seite lädt, Config-Roundtrip,
Persistenz über Recreate, `HOMELAB_TOKEN` gibt 401 ohne Token, non-root,
`/homelab.db` nicht abrufbar, arm64-Cross-Build. Der Workflow selbst lässt
sich erst nach dem Merge auf `main` verifizieren.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Verification Summary

Before claiming the feature is done, all of these must have been observed, not assumed:

- `docker build` succeeds (Task 2 Step 4)
- `docker buildx build --platform linux/arm64` succeeds (Task 2 Step 14)
- Container reaches `healthy` (Task 2 Step 7)
- `/`, `/app.js`, `/styles.css` return 200 (Task 2 Step 8)
- Config `PUT` then `GET` round-trips (Task 2 Step 9)
- Config survives `down` + `up` (Task 2 Step 10)
- Container runs as uid 1000 (Task 2 Step 11)
- `/homelab.db` returns 404 (Task 2 Step 12)
- Unauthenticated `PUT` returns 401 when `HOMELAB_TOKEN` is set (Task 2 Step 13)
- `python3 server.py` without Docker still serves the page (Task 1 Step 7)

The GitHub Actions workflow cannot be verified before merge. Say so plainly rather than implying it was tested.
