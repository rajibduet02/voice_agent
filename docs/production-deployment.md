# Production deployment (Ubuntu VPS + Docker Compose + Caddy)

This guide deploys the existing CarePoint voice-agent monorepo on a single Ubuntu VPS.

Public surface:

- Frontend: `https://voice.example.com`
- API health: `https://api.example.com/health`
- API docs: `https://api.example.com/docs`

Only Caddy publishes host ports `80` and `443`. PostgreSQL, Next.js (`3000`), and NestJS (`4000`) stay on a private Docker network.

## Architecture

```text
Internet
   │
   ▼
Caddy (:80/:443)
   ├─ {$WEB_DOMAIN}  → web:3000
   └─ {$API_DOMAIN}  → api:4000
                          │
                          ▼
                       postgres:5432  (private volume)
```

## 1. DNS setup

Create DNS records for your VPS public IP:

| Type | Name | Value |
|------|------|-------|
| A | `voice` | VPS IPv4 |
| A | `api` | VPS IPv4 |
| AAAA | `voice` / `api` | VPS IPv6 (optional) |

Wait until both hostnames resolve before expecting Caddy certificates to succeed.

## 2. Server prerequisites

- Ubuntu 22.04+ (or similar)
- Root or sudo access
- Open inbound TCP `80` and `443`
- Do **not** expose PostgreSQL or app ports publicly

## 3. Install Docker Engine and Docker Compose

Follow Docker’s official Ubuntu guide, then verify:

```bash
docker --version
docker compose version
```

## 4. Clone the private GitHub repository

```bash
sudo mkdir -p /opt/voice-agent
sudo chown "$USER":"$USER" /opt/voice-agent
cd /opt/voice-agent
git clone git@github.com:YOUR_ORG/voice-agent.git .
```

## 5. Create production environment files

```bash
cp .env.production.example .env.production
cp apps/api/.env.production.example apps/api/.env.production
cp apps/web/.env.production.example apps/web/.env.production
```

Edit all three files:

- Set real domains (`WEB_DOMAIN`, `API_DOMAIN`)
- Set a strong `POSTGRES_PASSWORD` and matching `DATABASE_URL`
- Set HTTPS URLs for `FRONTEND_URL`, `PUBLIC_API_URL`, `NEXT_PUBLIC_API_URL`
- Set Vapi secrets only in `apps/api/.env.production`
- Set the same `APPOINTMENT_TRACKING_API_KEY` in API and web production env files
- Keep `INTERNAL_API_URL=http://api:4000` for the calendar proxy

Never commit:

- `.env.production`
- `apps/api/.env.production`
- `apps/web/.env.production`

Never put these in the browser / `NEXT_PUBLIC_*`:

- `VAPI_PRIVATE_KEY`
- `VAPI_WEBHOOK_SECRET`
- `VAPI_CREDENTIAL_ID`
- `APPOINTMENT_TRACKING_API_KEY`
- `DATABASE_URL`
- `POSTGRES_PASSWORD`

## 6. Building containers

```bash
npm run production:build
```

Equivalent:

```bash
docker compose --env-file .env.production -f compose.production.yml build
```

`NEXT_PUBLIC_*` values are passed as Docker build args for the web image.

## 7. Running migrations

Start Postgres, then migrate with **deploy** only:

```bash
docker compose --env-file .env.production -f compose.production.yml up -d postgres
npm run production:migrate
```

Do **not** use in production:

- `prisma migrate dev`
- `prisma db push`
- `prisma migrate reset`

Demo seed is **not** automatic. If you intentionally want CarePoint demo data:

```bash
CONFIRM_PRODUCTION_SEED=yes npm run production:seed:demo
```

## 8. Starting the application

Automated (Linux/macOS or Git Bash):

```bash
chmod +x scripts/deploy-production.sh scripts/seed-production-demo.sh
npm run production:deploy
```

Manual sequence:

```bash
docker compose --env-file .env.production -f compose.production.yml up -d postgres
docker compose --env-file .env.production -f compose.production.yml run --rm --no-deps api npx prisma migrate deploy
docker compose --env-file .env.production -f compose.production.yml up -d api web caddy
```

## 9. Verifying health endpoints

```bash
curl -fsS https://api.example.com/health
curl -fsS https://voice.example.com/api/health
```

Also open:

- `https://voice.example.com`
- `https://api.example.com/docs`

## 10. Running Vapi provisioning

Production does **not** use Cloudflare Quick Tunnel or ngrok.

1. Set `PUBLIC_API_URL=https://api.example.com` in `apps/api/.env.production`.
2. Ensure Vapi custom tools point to:
   - `https://api.example.com/api/v1/vapi/tools`
3. Ensure the assistant webhook points to:
   - `https://api.example.com/api/v1/vapi/webhook`
4. Allow the Vapi public key / allowed origins for:
   - `https://voice.example.com`
5. Keep `VAPI_PRIVATE_KEY` only in the API container env file.
6. From a machine that can load the production API env (or by copying those values into a local provisioning env carefully), run:

```bash
npm run vapi:setup
npm run vapi:verify
```

Provisioning requires `VAPI_PRIVATE_KEY`, `VAPI_WEBHOOK_SECRET`, `VAPI_CREDENTIAL_ID`, and a reachable HTTPS `PUBLIC_API_URL`.

After provisioning, put `NEXT_PUBLIC_VAPI_ASSISTANT_ID` into `.env.production` and rebuild/restart web:

```bash
npm run production:build
npm run production:restart
```

## 11. Viewing logs

```bash
npm run production:logs
# or
docker compose --env-file .env.production -f compose.production.yml logs -f api web caddy postgres
```

Status:

```bash
npm run production:status
```

## 12. Updating the application

```bash
cd /opt/voice-agent
git pull
npm run production:build
npm run production:migrate
npm run production:restart
```

If `NEXT_PUBLIC_*` values changed, the web image must be rebuilt (already covered by `production:build`).

## 13. Backing up PostgreSQL

Create a host backup directory:

```bash
mkdir -p /opt/voice-agent/backups
```

Dump:

```bash
docker compose --env-file .env.production -f compose.production.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "backups/voice_agent_$(date +%Y%m%d_%H%M%S).sql"
```

Compress:

```bash
gzip -k backups/voice_agent_YYYYMMDD_HHMMSS.sql
```

List volumes:

```bash
docker volume ls | grep voice-agent
```

Copy a backup file off the server with `scp` / `rsync` as needed.

### Restore (manual, destructive)

Restore overwrites database contents. Take a fresh backup first.

```bash
# Example only — confirm the target database before running
cat backups/voice_agent_YYYYMMDD_HHMMSS.sql | \
  docker compose --env-file .env.production -f compose.production.yml exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Do not automate restore over production without explicit operator confirmation.

## 14. Rolling back application code

```bash
git log --oneline -n 20
git checkout <previous-good-commit>
npm run production:build
npm run production:restart
```

Database rollbacks are separate: restore from a SQL backup if a migration must be undone. Prefer forward-fix migrations when possible.

## 15. Troubleshooting Caddy certificates

- Confirm DNS A/AAAA records point to this VPS.
- Confirm ports 80/443 are reachable from the public internet.
- Check Caddy logs: `docker compose --env-file .env.production -f compose.production.yml logs caddy`
- Ensure `WEB_DOMAIN` / `API_DOMAIN` match the certificates you expect (no `https://` prefix in those variables).

## 16. Troubleshooting Prisma migrations

- Confirm `DATABASE_URL` uses host `postgres` and the Compose credentials.
- Confirm Postgres is healthy: `npm run production:status`
- Re-run only: `npm run production:migrate`
- Inspect migration history inside the DB if deploy fails; do not run `migrate reset` in production.

## 17. Troubleshooting Vapi tool endpoints

- `PUBLIC_API_URL` must be `https://api.example.com` (production domain, not a tunnel).
- Tools URL: `https://api.example.com/api/v1/vapi/tools`
- Webhook URL: `https://api.example.com/api/v1/vapi/webhook`
- Bearer credential secret must match `VAPI_WEBHOOK_SECRET`.
- Frontend origin `https://voice.example.com` must be allowed for the Vapi public key.
- After URL or tool changes: `npm run vapi:setup` then `npm run vapi:verify`.

## npm production scripts

| Script | Purpose |
|--------|---------|
| `production:build` | Build images |
| `production:up` | Start all services |
| `production:down` | Stop stack |
| `production:logs` | Tail logs |
| `production:status` | Show container status |
| `production:migrate` | `prisma migrate deploy` in API container |
| `production:restart` | Recreate api/web/caddy |
| `production:deploy` | Full validated deploy script |
| `production:seed:demo` | Dangerous demo seed (requires confirmation) |

## Security notes

- Private Docker network only; Postgres has no published ports.
- Production CORS allows only `FRONTEND_URL`.
- Nest trusts a single proxy hop for Caddy (`trust proxy`).
- Caddy sets common security headers without a restrictive CSP that would break Vapi/WebRTC.
