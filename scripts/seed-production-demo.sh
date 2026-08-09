#!/usr/bin/env bash
# DANGEROUS / DEMO ONLY — loads CarePoint demo seed data into the production database.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${CONFIRM_PRODUCTION_SEED:-}" != "yes" ]]; then
  cat <<'EOF' >&2
Refusing to seed the production database.

This command loads demo CarePoint Clinic data and is not part of normal deployments.

To proceed intentionally:
  CONFIRM_PRODUCTION_SEED=yes npm run production:seed:demo
EOF
  exit 1
fi

echo "WARNING: Seeding the production database with demo data..."
# Production image omits tsx; install it ephemerally for this one-off demo seed.
docker compose --env-file .env.production -f compose.production.yml \
  run --rm --no-deps --user root api \
  sh -c "npm install tsx@4.19.3 --no-save && npx prisma db seed"

echo "Demo seed completed."
