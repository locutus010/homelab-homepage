# Docker image for the homelab start page

Date: 2026-07-26

## Goal

Ship a container image that runs the start page out of the box, including the
optional sync server, so a homelab user can start it with one `docker compose
up -d` and reach a working dashboard with central settings storage. Publish the
image to GHCR from CI.

## Constraints

The project is deliberately dependency-free: plain HTML/CSS/JS with no build
step, plus `server.py` on the Python standard library. The image must not
introduce a bundler, a package manager, or any `pip` dependency. Running the
project *without* Docker — `open index.html`, `python3 -m http.server`,
`python3 server.py` — must keep working exactly as before.

## Design

### Runtime

The image runs `server.py`, not a static web server. That is what makes the
container worth having: `GET/PUT/DELETE /api/config` (settings shared across
every device on the LAN) and `GET /api/favicon?url=` (server-side icon
resolution, which reaches LAN-only services the browser cannot introspect). A
static-only image would ship a page whose settings live per-browser in
`localStorage` — the page already does that from `file://` with no container
needed.

### Database location

`server.py` currently hardcodes:

```python
DB_PATH = os.path.join(HERE, "homelab.db")
```

`HERE` is the application directory, which inside a container is an image
layer — the settings would be lost on every `docker compose pull` / recreate.
Mounting a volume over the application directory instead would hide the web
files, so the fix belongs in the code:

```python
DB_PATH = os.environ.get("HOMELAB_DB") or os.path.join(HERE, "homelab.db")
```

`init_db()` creates the parent directory when it is missing, so pointing
`HOMELAB_DB` at a fresh path just works. With the variable unset the behaviour
is byte-for-byte what it is today; only the container sets it, to
`/data/homelab.db`, with `/data` as a named volume.

This is the only source change the feature requires.

### Dockerfile

Base `python:3.13-slim`. No build stage — there is nothing to compile — and no
`pip install`.

- Copies the six runtime files only: `index.html`, `styles.css`, `app.js`,
  `settings.js`, `config.js`, `server.py`, into `/app`.
- Creates an unprivileged user (uid/gid 1000) and `/data` owned by it, so a
  named volume inherits usable ownership. Runs as that user.
- `ENV HOMELAB_DB=/data/homelab.db`, `HOMELAB_HOST=0.0.0.0`,
  `HOMELAB_PORT=8080`.
- `EXPOSE 8080`.
- `HEALTHCHECK` performs an HTTP `GET /` through `python -c` with `urllib`;
  the `slim` image has no `curl` and adding one would mean a package install.
- `CMD ["python3", "-u", "server.py"]`. `-u` keeps the server's prints
  unbuffered so they show up in `docker logs` immediately.
- OCI labels, including `org.opencontainers.image.source`, which is what links
  the GHCR package to the repository.

`config.js` is baked in as the default seed. That is correct: it is the
*defaults* layer, and the active configuration comes from SQLite (or
`localStorage`) at runtime. A user who wants different defaults bind-mounts the
file over `/app/config.js`.

### compose.yaml

One service: build from the local context, tagged with the GHCR name so
`docker compose pull` works once the image is published. Port `8080:8080`,
named volume `homelab-data:/data`, `restart: unless-stopped`. `HOMELAB_TOKEN`
and `HOMELAB_FAVICON_ALLOW` appear as commented-out examples, since both are
opt-in hardening for an otherwise trusted LAN.

### .dockerignore

Excludes `.git`, `__pycache__`, `homelab.db*`, `docs`, and the
Markdown files. It keeps the build context small and, more importantly, stops a
developer's local `homelab.db` from being copied into a published image.

### CI

`.github/workflows/docker.yml`:

- Triggers on push to `main`, on tags `v*`, and on pull requests.
- Pull requests build only; pushes build and push.
- Platforms `linux/amd64` and `linux/arm64` via QEMU + Buildx, because homelab
  hosts are frequently a Raspberry Pi or another ARM SBC.
- Tags come from `docker/metadata-action`: `latest` on the default branch, the
  branch name, semver tags, and `sha-<short>`.
- Authenticates with the built-in `GITHUB_TOKEN` under
  `permissions: packages: write`. No repository secret has to be configured.
- GitHub Actions cache (`cache-from`/`cache-to: type=gha`) so repeat builds are
  fast.

## Testing

No test framework exists in this repository, and `node` is unavailable; the
verification is done against the local Docker daemon.

1. `docker build` succeeds.
2. `docker compose up -d` reaches state `healthy`.
3. `GET /` returns 200 and the page markup; `app.js` and `styles.css` load.
4. `PUT /api/config` then `GET /api/config` returns the same document.
5. `docker compose down && up -d` — the configuration written in step 4 is
   still there (volume persistence, the point of the `HOMELAB_DB` change).
6. With `HOMELAB_TOKEN` set, an unauthenticated `PUT` gets 401 and a correctly
   authenticated one gets through.
7. `docker exec … id` shows the non-root uid.
8. `GET /homelab.db` does not serve the database.
9. `docker buildx build --platform linux/arm64` succeeds, confirming the
   multi-arch line in CI is sound.

CI itself cannot be verified before merge; whether GHCR accepts the push is
only observable after the workflow runs on `main`.

## Documentation

A "Run with Docker" section in `README.md` covering `docker compose up -d`, the
volume, and the environment variables. Two lines in `docs/architecture.md` recording that
the Docker files exist and that `HOMELAB_DB` is the reason `DB_PATH` is no
longer a constant.

## Out of scope

TLS termination, reverse-proxy configuration, and multi-user authentication.
The server is designed for a trusted LAN; anyone exposing it publicly should
put a proxy in front of it, which is their existing homelab setup's job.
