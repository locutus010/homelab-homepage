# Homelab start page — runs the optional sync server (server.py) so every
# device on the LAN shares one configuration. Python standard library only:
# there is nothing to build and nothing to pip install. Alpine is safe here
# precisely because of that — no wheels are compiled, so musl never bites.
FROM python:3.13-alpine

LABEL org.opencontainers.image.title="Homelab Start Page" \
      org.opencontainers.image.description="Self-hosted homelab start page with central settings storage" \
      org.opencontainers.image.source="https://github.com/locutus010/homelab-homepage"

# Unprivileged user. /data is created here and owned by it so a named volume
# mounted there inherits usable ownership.
RUN addgroup -g 1000 homelab \
    && adduser -u 1000 -G homelab -D -H -s /sbin/nologin homelab \
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

# No curl in the base image, and installing one just for this would pull in a
# package manager step. urllib from the standard library does the same job.
# The port is read from the environment so that changing HOMELAB_PORT does not
# leave a working container reporting itself unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["python3", "-c", "import os, urllib.request; p = os.environ.get('HOMELAB_PORT', '8080'); urllib.request.urlopen('http://127.0.0.1:' + p + '/', timeout=4).read(1)"]

# -u keeps the server's prints unbuffered so they appear in `docker logs`.
CMD ["python3", "-u", "server.py"]
