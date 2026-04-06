#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/telegramv2}"
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
SHARED_DIR="${SHARED_DIR:-$APP_ROOT/shared}"
RELEASE_ARCHIVE="${1:-}"
ENV_FILE="$SHARED_DIR/.env.production"
LAST_DEPLOYED_SHA_FILE="$SHARED_DIR/.last_deployed_sha"
PRISMA_SCHEMA_PATH="apps/api/prisma/schema.prisma"
should_push_prisma_schema=false
current_deploy_sha=""

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

if [[ -d "$APP_DIR/.git" ]]; then
  current_deploy_sha="$(git rev-parse HEAD)"

  if [[ -f "$LAST_DEPLOYED_SHA_FILE" ]]; then
    previous_deploy_sha="$(cat "$LAST_DEPLOYED_SHA_FILE")"
    if [[ -n "$previous_deploy_sha" ]] && git cat-file -e "${previous_deploy_sha}^{commit}" 2>/dev/null; then
      if ! git diff --quiet "$previous_deploy_sha" "$current_deploy_sha" -- "$PRISMA_SCHEMA_PATH"; then
        should_push_prisma_schema=true
      fi
    else
      should_push_prisma_schema=true
    fi
  else
    should_push_prisma_schema=true
  fi
fi

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

if [[ "$should_push_prisma_schema" == true ]]; then
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T api npx prisma db push
fi

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS http://127.0.0.1:4000/api/health

if [[ -n "$current_deploy_sha" ]]; then
  printf '%s' "$current_deploy_sha" > "$LAST_DEPLOYED_SHA_FILE"
fi
