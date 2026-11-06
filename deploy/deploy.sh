#!/bin/sh
# Deploys Fermia (API + web) on the greenleaves server from GitHub.
# Usage (root): /opt/fermia/deploy.sh [branch]   (default: main)
# Jenkins cannot do it: its container has no Docker and no write access to /var/www/fermia.
set -eu
BRANCH=${1:-main}
SRC=/opt/fermia/repo
[ -d "$SRC/.git" ] || git clone -q https://github.com/MOCTAR10/koukou.git "$SRC"
cd "$SRC" && git fetch -q origin && git checkout -q -B deploy "origin/$BRANCH"
echo "Commit $(git rev-parse --short HEAD) ($BRANCH)"
# API: image built, migrations run at boot.
docker build -q -t fermia-api:latest backend
cd /opt/fermia && docker compose up -d api
# Web: built in a throwaway Node container, then swapped in.
docker run --rm -v "$SRC/web:/w" -w /w -e VITE_API_URL=/api node:22-bookworm-slim \
  sh -c 'npm ci --no-audit --no-fund >/dev/null && npx vite build >/dev/null'
rsync -a --delete "$SRC/web/dist/" /var/www/fermia/
for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3400/ || true); [ "$c" != 000 ] && break; sleep 2; done
echo "API: HTTP $c ; web: $(ls /var/www/fermia | wc -l) fichiers"
