#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE=(docker compose --env-file .env.production -f compose.production.yml)

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    fail "Missing required file: $path"
  fi
}

is_hostname() {
  local value="$1"
  [[ "$value" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]
}

is_https_url() {
  local value="$1"
  [[ "$value" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?(/.*)?$ ]]
}

wait_for_service_healthy() {
  local service="$1"
  local attempts="${2:-60}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    local status
    status="$("${COMPOSE[@]}" ps --status running --format '{{.Service}} {{.Health}}' | awk -v svc="$service" '$1 == svc { print $2; found=1 } END { if (!found) print "missing" }')"
    if [[ "$status" == "healthy" ]]; then
      log "$service is healthy"
      return 0
    fi
    sleep 2
  done
  fail "$service did not become healthy in time"
}

log "Validating production environment files..."
require_file ".env.production"
require_file "apps/api/.env.production"
require_file "apps/web/.env.production"
require_file "Caddyfile"
require_file "compose.production.yml"

# shellcheck disable=SC1091
set -a
source ".env.production"
set +a

[[ -n "${WEB_DOMAIN:-}" ]] || fail "WEB_DOMAIN is required"
[[ -n "${API_DOMAIN:-}" ]] || fail "API_DOMAIN is required"
is_hostname "$WEB_DOMAIN" || fail "WEB_DOMAIN must be a valid hostname"
is_hostname "$API_DOMAIN" || fail "API_DOMAIN must be a valid hostname"

[[ -n "${NEXT_PUBLIC_API_URL:-}" ]] || fail "NEXT_PUBLIC_API_URL is required"
is_https_url "$NEXT_PUBLIC_API_URL" || fail "NEXT_PUBLIC_API_URL must use HTTPS"

if grep -Eq '^[[:space:]]*PUBLIC_API_URL=' apps/api/.env.production; then
  PUBLIC_API_URL_VALUE="$(grep -E '^[[:space:]]*PUBLIC_API_URL=' apps/api/.env.production | tail -n1 | cut -d= -f2-)"
  is_https_url "$PUBLIC_API_URL_VALUE" || fail "PUBLIC_API_URL in apps/api/.env.production must use HTTPS"
else
  fail "PUBLIC_API_URL is required in apps/api/.env.production"
fi

log "Building production images..."
"${COMPOSE[@]}" build

log "Starting PostgreSQL..."
"${COMPOSE[@]}" up -d postgres
wait_for_service_healthy postgres 60

log "Running Prisma migrate deploy..."
"${COMPOSE[@]}" run --rm --no-deps api npx prisma migrate deploy

log "Starting API, web, and Caddy..."
"${COMPOSE[@]}" up -d --force-recreate api web caddy

wait_for_service_healthy api 90
wait_for_service_healthy web 90

log ""
log "Deployment status (safe fields only):"
"${COMPOSE[@]}" ps
log ""
log "Web domain: https://${WEB_DOMAIN}"
log "API health: https://${API_DOMAIN}/health"
log "API docs:   https://${API_DOMAIN}/docs"
log ""
log "Next: configure DNS A/AAAA records, then run Vapi provisioning against production:"
log "  npm run vapi:setup"
log "  npm run vapi:verify"
log "Use production apps/api/.env values (or exec into the api container) for PUBLIC_API_URL."
