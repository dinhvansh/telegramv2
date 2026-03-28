#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/telegramv2}"
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
SHARED_DIR="${SHARED_DIR:-$APP_ROOT/shared}"
RELEASE_ARCHIVE="${1:-}"
ENV_FILE="$SHARED_DIR/.env.production"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$SHARED_DIR"

if [[ -n "$RELEASE_ARCHIVE" ]]; then
  if [[ ! -f "$RELEASE_ARCHIVE" ]]; then
    echo "Release archive not found: $RELEASE_ARCHIVE" >&2
    exit 1
  fi

  find "$APP_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  tar -xzf "$RELEASE_ARCHIVE" -C "$APP_DIR"
fi

cp "$ENV_FILE" "$APP_DIR/.env.production"

cd "$APP_DIR"
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS http://127.0.0.1:4000/api/health
