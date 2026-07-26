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
