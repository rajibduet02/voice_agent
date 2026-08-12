# Voice Agent Appointment Platform

Reusable TypeScript monorepo for browser-based Vapi voice appointment booking, with a NestJS API, Next.js frontend, and PostgreSQL.

First seed data models **CarePoint Clinic** (doctor appointments). The schema is generic enough for dentists, therapists, salons, and other service businesses.

## Prerequisites

- **Node.js 20+** (Node 22 recommended)
- **npm 10+**
- **Docker Desktop** (for local PostgreSQL)
- A Vapi account (optional until you connect the voice assistant)

## Project structure

```text
voice-agent/
├── apps/
│   ├── api/          NestJS REST API + Prisma
│   └── web/          Next.js App Router frontend
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── vapi-setup.md
├── docker-compose.yml
└── package.json
```

## Installation

From the repository root:

```bash
npm install
```

## Environment configuration

Copy the example files (do not commit real secrets):

```bash
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env
```

On macOS/Linux use `cp` instead of `copy`.

### Backend (`apps/api/.env`)

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/voice_agent?schema=public
FRONTEND_URL=http://localhost:3000
VAPI_PRIVATE_KEY=
VAPI_CREDENTIAL_ID=
VAPI_WEBHOOK_SECRET=replace-with-a-long-random-secret
VAPI_API_BASE_URL=https://api.vapi.ai
PUBLIC_API_URL=
VAPI_ASSISTANT_NAME=CarePoint Appointment Assistant
VAPI_ASSISTANT_ID=
ALLOW_INSECURE_PUBLIC_API_URL=false
ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT=false
SKIP_PUBLIC_API_PREFLIGHT=false
APPOINTMENT_TRACKING_API_KEY=replace-with-a-long-random-secret
MINIMUM_BOOKING_LEAD_MINUTES=30
```

`VAPI_PRIVATE_KEY` is backend-only. Never commit it or put it in frontend env files. HTTPS remains the default for `PUBLIC_API_URL`.

### Date and time rules

- Organization timezone (`Asia/Dhaka` for CarePoint) is authoritative for scheduling.
- Backend UTC instant is authoritative for “now”; server OS timezone and browser timezone are not.
- Relative dates go through `resolve_appointment_date` / `POST .../resolve-date`.
- Next openings go through `find_next_available_appointment`.
- Availability accepts concrete `YYYY-MM-DD` only.
- Appointments are stored in UTC and displayed in the organization timezone.
- After changing Vapi tools or the system prompt, rerun `npm run vapi:setup`.

### Frontend (`apps/web/.env`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_ORGANIZATION_SLUG=carepoint-clinic
NEXT_PUBLIC_VAPI_PUBLIC_KEY=
NEXT_PUBLIC_VAPI_ASSISTANT_ID=
APPOINTMENT_TRACKING_API_KEY=replace-with-a-long-random-secret
INTERNAL_API_URL=http://localhost:4000
```

Use the **same** `APPOINTMENT_TRACKING_API_KEY` in `apps/api/.env` and `apps/web/.env`. Never prefix it with `NEXT_PUBLIC_`. The browser never receives this value.

Local development uses `apps/web/.env` (not a required `.env.local`). Deployed environments use the hosting provider’s environment variables — see [docs/vercel-environment.md](docs/vercel-environment.md).

Verify configuration presence without printing secrets:

```bash
npm run env:check
```

The web app loads even when Vapi public values are empty; the voice card shows a configuration message and disables Start Conversation until both are set.

## Database setup

Start PostgreSQL:

```bash
npm run db:up
```

Generate the Prisma client, apply migrations, and seed CarePoint Clinic:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Open Prisma Studio (optional):

```bash
npm run db:studio
```

## Run locally

Start API + frontend together:

```bash
npm run dev
```

Or separately:

```bash
npm run dev:api
npm run dev:web
```

### URLs

| Service   | URL |
|-----------|-----|
| Frontend  | http://localhost:3000 |
| Appointment calendar (read-only) | http://localhost:3000/appointments |
| Backend   | http://localhost:4000 |
| Health    | http://localhost:4000/health |
| Swagger   | http://localhost:4000/docs |
| PostgreSQL| localhost:5433 (container 5432; host mapped to 5433 to avoid Windows local Postgres conflicts) |

### Appointment calendar (read-only)

The `/appointments` page is an internal tracking calendar. It does **not** create, edit, cancel, or delete appointments.

Security flow:

1. The browser calls the same-origin Next.js route `GET /api/internal/appointments/calendar`.
2. That server route reads `APPOINTMENT_TRACKING_API_KEY` from the web server environment.
3. It calls NestJS `GET /api/v1/admin/:organizationSlug/appointments/calendar` with `Authorization: Bearer <key>`.
4. The API key is never exposed to the browser and is never logged.
5. The calendar response omits customer phone, email, internal notes, and medical details.

Local setup:

1. Put the same long random secret in `apps/api/.env` and `apps/web/.env` as `APPOINTMENT_TRACKING_API_KEY`.
2. Start Postgres, migrate/seed if needed, then run `npm run dev`.
3. Open http://localhost:3000/appointments.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | API + web concurrently |
| `npm run build` | Build API and web |
| `npm run lint` | Lint both apps |
| `npm run test` | API unit + e2e tests |
| `npm run db:up` / `db:down` | Start/stop Postgres |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:seed` | Idempotent seed |
| `npm run db:studio` | Prisma Studio |
| `npm run vapi:setup` | Create/update Vapi assistant + tools |
| `npm run vapi:setup:web-env` | Provision and write assistant ID to `apps/web/.env` |
| `npm run env:check` | Report env variable presence (never prints secrets) |
| `npm run vapi:verify` | Verify assistant/tools/URLs without changes |
| `npm run time:context -- --organization=carepoint-clinic` | Print authoritative org local date/time |
| `npm run date:resolve -- --organization=carepoint-clinic --expression="tomorrow"` | Resolve a relative date via backend services |
| `npm run availability:next -- --organization=carepoint-clinic --service="General Consultation" --time=any` | Search next available seeded slots |
| `npm run availability:audit -- --date=2026-08-09 --service="General Consultation" --time=morning` | Diagnose seeded availability (safe output) |
| `npm run vapi:test-tools -- --date=2026-08-09` | Local Vapi tool smoke tests (no Vapi cloud calls) |

## Testing

Ensure PostgreSQL is running and migrations/seed have been applied, then:

```bash
npm run test
```

E2E tests use the configured `DATABASE_URL` and clean up their own test customers/calls.

## Vapi connection (programmatic)

See [docs/vapi-setup.md](docs/vapi-setup.md) for the full flow.

High level:

1. Put `VAPI_PRIVATE_KEY` in `apps/api/.env` manually (do not paste it into Cursor or commit it).
2. Start PostgreSQL and the API.
3. Start a public HTTPS tunnel to port 4000 (for example `ngrok http 4000`).
4. Set `PUBLIC_API_URL` to that HTTPS tunnel URL.
5. Create a Vapi Bearer custom credential whose secret matches `VAPI_WEBHOOK_SECRET`, then set `VAPI_CREDENTIAL_ID`.
6. Run `npm run vapi:setup:web-env`.
7. Add `NEXT_PUBLIC_VAPI_PUBLIC_KEY` manually to `apps/web/.env`.
8. Restart the frontend and test voice booking.

If the tunnel URL changes, update `PUBLIC_API_URL` and rerun `npm run vapi:setup`.

Never put the Vapi private key in the frontend.

## Using a Public HTTP IP During Development

HTTPS remains mandatory in production.

**Vapi itself rejects HTTP tool/webhook server URLs.** Your API can listen on `http://103.208.181.253:4000`, but provisioning must use an HTTPS public URL (ngrok, Cloudflare Tunnel, or similar) that forwards to port 4000:

```bash
npm run dev:api
ngrok http 4000
```

```env
NODE_ENV=development
PUBLIC_API_URL=https://YOUR_SUBDOMAIN.ngrok-free.app
```

Then:

```bash
npm run vapi:setup:web-env
npm run vapi:verify
```

Local HTTP override flags (`ALLOW_INSECURE_PUBLIC_API_URL`, `ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT`) only relax this repo’s own URL validation. They cannot override Vapi’s HTTPS requirement for `server.url`.

### Windows firewall for port 4000

Port 4000 must be allowed through Windows Defender Firewall, plus any router/provider firewall or security group.

Create an inbound development rule (PowerShell as Administrator):

```powershell
New-NetFirewallRule `
  -DisplayName "Voice Agent API Development" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 4000 `
  -Action Allow
```

Remove it later:

```powershell
Remove-NetFirewallRule `
  -DisplayName "Voice Agent API Development"
```

Test from another network (not only the same PC):

```powershell
Invoke-WebRequest http://103.208.181.253:4000/health
```

Testing from the same PC does not prove the public IP is externally reachable. npm scripts never change Windows firewall settings automatically.

## Reset the development database safely

```bash
npm run db:down
docker volume rm voice_agent_voice_agent_pgdata
npm run db:up
npm run db:migrate
npm run db:seed
```

If the volume name differs on your machine, list volumes with `docker volume ls` and remove the `voice_agent` Postgres volume.

## Troubleshooting (Windows)

- **Port 5432 already in use**: this repo maps Docker Postgres to host port **5433** by default so a local Windows Postgres install does not collide. If 5433 is free and you prefer 5432, change `docker-compose.yml` to `"5432:5432"` and update `DATABASE_URL` accordingly.
- **Docker not running**: start Docker Desktop before `npm run db:up`.
- **Prisma engine / EPERM errors**: close processes locking `node_modules`, then re-run `npm run db:generate`.
- **`npm run dev` script issues**: this repo avoids Unix-only shell operators in npm scripts; use PowerShell or cmd as usual.
- **Frontend cannot reach API**: confirm `NEXT_PUBLIC_API_URL=http://localhost:4000` and that CORS `FRONTEND_URL` matches the browser origin.
- **Vapi webhook 401**: ensure the Bearer token in Vapi matches `VAPI_WEBHOOK_SECRET` exactly.

## Production deployment

For a single Ubuntu VPS with Docker Compose + Caddy (HTTPS), see [docs/production-deployment.md](docs/production-deployment.md).

Quick production flow (on the VPS after env files are filled):

```bash
cp .env.production.example .env.production
cp apps/api/.env.production.example apps/api/.env.production
cp apps/web/.env.production.example apps/web/.env.production
# edit the three files, then:
chmod +x scripts/deploy-production.sh
npm run production:deploy
npm run vapi:setup
npm run vapi:verify
```

Only Caddy publishes ports 80/443. PostgreSQL and app ports stay private.

## Documentation

- [Architecture](docs/architecture.md)
- [API overview](docs/api.md)
- [Vapi setup](docs/vapi-setup.md)
- [Production deployment](docs/production-deployment.md)
- [Vercel environment variables](docs/vercel-environment.md)
