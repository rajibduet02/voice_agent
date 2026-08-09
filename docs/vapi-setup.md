# Vapi setup

This project uses **browser-based** Vapi calls only in phase 1 (no inbound/outbound phone numbers yet).

Assistants and custom tools are provisioned **programmatically** from the NestJS backend. You should not manually recreate the CarePoint assistant/tools in the dashboard unless you are debugging.

## One-time Vapi account actions

These still require the Vapi Dashboard (not covered by the current public provisioning API used here):

1. Create a **public** API key for the browser SDK.
2. Create a **private** API key for backend provisioning.
3. Create a **Custom Credential** of type Bearer Token whose token value equals `VAPI_WEBHOOK_SECRET`, then copy its credential ID into `VAPI_CREDENTIAL_ID`.

Never paste the private key into chat, commits, frontend env files, or logs.

## Programmatic provisioning flow

1. Place `VAPI_PRIVATE_KEY` manually in `apps/api/.env`.
2. Do **not** paste the private key into Cursor or commit it.
3. Start PostgreSQL and the backend (`npm run db:up`, then `npm run dev:api`).
4. Expose the API publicly (preferred: HTTPS tunnel; temporary: public HTTP IP with overrides below).
5. Set `PUBLIC_API_URL` to that public base URL (trailing slash is normalized away).
6. Set `VAPI_CREDENTIAL_ID` if available (recommended; required in production).
7. Run:

```bash
npm run vapi:setup:web-env
```

8. Add `NEXT_PUBLIC_VAPI_PUBLIC_KEY` manually to `apps/web/.env.local`.
9. Restart the frontend.
10. Test a voice appointment at http://localhost:3000.

When a temporary public URL changes, update `PUBLIC_API_URL` and rerun:

```bash
npm run vapi:setup
```

Before modifying Vapi resources, setup/verify call `GET ${PUBLIC_API_URL}/health` (7s timeout) unless `SKIP_PUBLIC_API_PREFLIGHT=true` in development.

## Using a Public HTTP IP During Development

HTTPS is still the default and is mandatory in production.

Important limitation: **Vapi’s API rejects HTTP tool/webhook `server.url` values**. Even if your Nest API is reachable at `http://103.208.181.253:4000`, provisioning must use an **HTTPS** `PUBLIC_API_URL` (for example an ngrok/Cloudflare tunnel that forwards to port 4000).

Recommended temporary setup:

```bash
npm run dev:api
ngrok http 4000
```

Then set:

```env
NODE_ENV=development
PUBLIC_API_URL=https://YOUR_SUBDOMAIN.ngrok-free.app
```

The local HTTP IP overrides remain available for our own validation/preflight experiments:

```env
ALLOW_INSECURE_PUBLIC_API_URL=true
ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT=true
PUBLIC_API_URL=http://103.208.181.253:4000
```

Those flags will pass local validation, but `npm run vapi:setup` will stop with a clear error because Vapi requires `https://` or `wss://` for server URLs.

Commands once you have an HTTPS tunnel URL:

```bash
npm run dev:api
npm run vapi:setup:web-env
npm run vapi:verify
```

## Environment variables

### Backend (`apps/api/.env`)

```env
VAPI_PRIVATE_KEY=
VAPI_CREDENTIAL_ID=
VAPI_WEBHOOK_SECRET=replace-with-a-long-random-secret
VAPI_API_BASE_URL=https://api.vapi.ai
PUBLIC_API_URL=https://your-tunnel.example
VAPI_ASSISTANT_NAME=CarePoint Appointment Assistant
VAPI_ASSISTANT_ID=
ALLOW_INSECURE_PUBLIC_API_URL=false
ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT=false
SKIP_PUBLIC_API_PREFLIGHT=false
```

Notes:

- `VAPI_PRIVATE_KEY` is backend-only.
- `VAPI_CREDENTIAL_ID` is the Vapi custom Bearer credential ID. Its secret must match `VAPI_WEBHOOK_SECRET`.
- Local development can omit `VAPI_CREDENTIAL_ID`, but the setup command prints a security warning.
- Production provisioning requires `VAPI_CREDENTIAL_ID` and HTTPS.
- HTTP `PUBLIC_API_URL` requires `ALLOW_INSECURE_PUBLIC_API_URL=true` in development, and also `ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT=true` when a credential ID is configured.

### Frontend (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_ORGANIZATION_SLUG=carepoint-clinic
NEXT_PUBLIC_VAPI_PUBLIC_KEY=
NEXT_PUBLIC_VAPI_ASSISTANT_ID=
```

Never place `VAPI_PRIVATE_KEY` in Next.js env files.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run vapi:setup` | Create/update assistant + tools idempotently |
| `npm run vapi:setup:web-env` | Same, and write `NEXT_PUBLIC_VAPI_ASSISTANT_ID` to `apps/web/.env.local` |
| `npm run vapi:verify` | Verify assistant/tools/URLs without modifying resources |

After setup, the CLI prints:

```text
VAPI ASSISTANT ID: <generated-id>
NEXT_PUBLIC_VAPI_ASSISTANT_ID=<generated-id>
```

Resource IDs (never secrets) are stored in gitignored `.vapi/resources.local.json`.

## Development tunneling

Example with ngrok after the API is running on port 4000:

```bash
ngrok http 4000
```

Then set:

```env
PUBLIC_API_URL=https://<your-ngrok-subdomain>.ngrok-free.app
```

Provisioned URLs:

- Tools: `${PUBLIC_API_URL}/api/v1/vapi/tools`
- Webhook: `${PUBLIC_API_URL}/api/v1/vapi/webhook`

## Stable resource names

- Assistant: `CarePoint Appointment Assistant`
- Tools (all five must be attached; `npm run vapi:verify` checks this):
  - `carepoint_get_current_datetime` → `get_current_datetime`
  - `carepoint_resolve_appointment_date` → `resolve_appointment_date`
  - `carepoint_check_appointment_availability` → `check_appointment_availability`
  - `carepoint_find_next_available_appointment` → `find_next_available_appointment`
  - `carepoint_book_appointment` → `book_appointment`

State file `.vapi/resources.local.json` stores non-secret IDs including `currentDateTimeToolId`, `resolveDateToolId`, `availabilityToolId`, `nextAvailabilityToolId`, and `bookingToolId`.

## Date/time tool flow

Organization timezone (`Asia/Dhaka`) and the backend UTC clock are authoritative. The browser may send `browserTimezone` / locale / local clock as Vapi `variableValues` caller context only — never as the clinic timezone.

Example conversations:

**Caller:** Tomorrow morning.

1. Assistant calls `resolve_appointment_date` with `dateExpression=tomorrow`.
2. Tool returns a concrete `resolvedDate` such as `2026-08-09`.
3. Assistant calls `check_appointment_availability` with `date=2026-08-09` (never `tomorrow`).

**Caller:** Find me the next available appointment.

1. Assistant calls `find_next_available_appointment`.
2. Backend walks organization-local days via `AvailabilityService` and returns up to five earliest slots.

Do not manually edit the assistant system prompt in the Vapi dashboard when `npm run vapi:setup` already manages it. Rerun provisioning after prompt or tool changes.

## Custom tool parameter schemas

### `check_appointment_availability`

`date` must be exact `YYYY-MM-DD`. Never pass relative phrases. Call `resolve_appointment_date` first for natural-language dates.

```json
{
  "type": "function",
  "function": {
    "name": "check_appointment_availability",
    "description": "Check available appointment slots for a concrete YYYY-MM-DD date. Never pass relative phrases such as tomorrow.",
    "parameters": {
      "type": "object",
      "properties": {
        "organizationSlug": {
          "type": "string",
          "description": "Organization slug. Use carepoint-clinic unless the caller specifies another clinic."
        },
        "serviceName": {
          "type": "string",
          "description": "Service name such as General Consultation, Follow-up Consultation, or Cardiology Consultation."
        },
        "preferredProviderName": {
          "type": "string",
          "description": "Optional preferred doctor name, for example Dr. Sarah Khan."
        },
        "locationName": {
          "type": "string",
          "description": "Optional location name. Defaults to the main branch when omitted."
        },
        "date": {
          "type": "string",
          "description": "Exact desired date in YYYY-MM-DD. Resolve relative phrases with resolve_appointment_date first."
        },
        "timePreference": {
          "type": "string",
          "enum": ["morning", "afternoon", "evening", "any"],
          "description": "Preferred time of day."
        },
        "timezone": {
          "type": "string",
          "description": "IANA timezone. Scheduling uses the organization timezone (Asia/Dhaka for CarePoint)."
        }
      },
      "required": ["organizationSlug", "serviceName", "date"]
    }
  }
}
```

### `book_appointment`

```json
{
  "type": "function",
  "function": {
    "name": "book_appointment",
    "description": "Book an appointment only after the caller explicitly confirms the doctor, service, date/time, name, and phone number.",
    "parameters": {
      "type": "object",
      "properties": {
        "organizationSlug": {
          "type": "string",
          "description": "Organization slug, usually carepoint-clinic."
        },
        "locationId": {
          "type": "string",
          "description": "Location UUID from check_appointment_availability."
        },
        "providerId": {
          "type": "string",
          "description": "Provider UUID from check_appointment_availability."
        },
        "serviceId": {
          "type": "string",
          "description": "Service UUID from check_appointment_availability."
        },
        "scheduledStart": {
          "type": "string",
          "description": "UTC ISO timestamp for the selected slot start."
        },
        "timezone": {
          "type": "string",
          "description": "IANA timezone used when offering the slot."
        },
        "customerName": {
          "type": "string",
          "description": "Caller full name."
        },
        "customerPhone": {
          "type": "string",
          "description": "Caller phone number in E.164 format when possible."
        },
        "customerEmail": {
          "type": "string",
          "description": "Optional email address."
        },
        "reason": {
          "type": "string",
          "description": "Optional short reason for the visit. Do not collect diagnoses."
        },
        "externalRequestId": {
          "type": "string",
          "description": "Optional idempotency key for this booking attempt."
        }
      },
      "required": [
        "organizationSlug",
        "locationId",
        "providerId",
        "serviceId",
        "scheduledStart",
        "timezone",
        "customerName",
        "customerPhone"
      ]
    }
  }
}
```

## Frontend usage

The web app uses the public key and assistant ID. When the installed `@vapi-ai/web` SDK accepts assistant overrides, the voice UI passes safe caller context:

```ts
import Vapi from '@vapi-ai/web';

const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);
vapi.start(process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID!, {
  variableValues: {
    browserTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    browserLocale: navigator.language,
    browserCurrentDate: /* local YYYY-MM-DD */,
    browserCurrentTime: /* local HH:mm:ss */,
  },
});
```

Caller browser time is never used as the clinic clock. Call startup still works if timezone detection fails.

If either public env value is missing, the page still loads and shows a configuration message. Start Conversation stays disabled until both are present.

## Recommended assistant behavior

The provisioning script installs a system prompt that:

- Treats the backend as the sole authority for current date/time and relative dates
- Calls `get_current_datetime` / `resolve_appointment_date` instead of guessing
- Calls `check_appointment_availability` only with concrete `YYYY-MM-DD`
- Uses `find_next_available_appointment` for “next available” / earliest requests
- Identifies itself as CarePoint’s appointment-booking assistant
- Refuses diagnoses/emergency advice
- Asks one question at a time
- Offers at most three spoken choices
- Reads back details and waits for confirmation before `book_appointment`
- Never claims success before the booking tool returns success

## Production VPS configuration

On a production Ubuntu VPS with Docker Compose + Caddy (see [production-deployment.md](./production-deployment.md)):

1. Set `PUBLIC_API_URL` to the production API domain, for example `https://api.example.com`.
2. Vapi custom tools must point to:
   - `https://api.example.com/api/v1/vapi/tools`
3. The assistant webhook must point to:
   - `https://api.example.com/api/v1/vapi/webhook`
4. Allow the Vapi public key for the frontend origin:
   - `https://voice.example.com`
5. Keep `VAPI_PRIVATE_KEY` only in `apps/api/.env.production` (API container). Never put it in Next.js env files or build args.
6. After the production stack is healthy, run:

```bash
npm run vapi:setup
npm run vapi:verify
```

Production does **not** require Cloudflare Quick Tunnel or ngrok. Those are development-only ways to expose a local API.
