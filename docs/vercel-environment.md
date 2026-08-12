# Vercel environment variables

This project standardizes configuration on `process.env`.

- **Local development:** `apps/api/.env` and `apps/web/.env`
- **Vercel / production:** hosting-provider environment variables (no physical `.env` files on the deployed filesystem)

Next.js inlines `NEXT_PUBLIC_*` values at **build time**. After changing any `NEXT_PUBLIC_*` value in Vercel, trigger a new deployment/rebuild.

Do **not** put server secrets in `NEXT_PUBLIC_*` variables.

## A. Vercel WEB project

Set these on the Next.js Vercel project:

```env
NEXT_PUBLIC_API_URL=https://YOUR-API-DOMAIN
NEXT_PUBLIC_ORGANIZATION_SLUG=carepoint-clinic
NEXT_PUBLIC_VAPI_PUBLIC_KEY=your-vapi-public-key
NEXT_PUBLIC_VAPI_ASSISTANT_ID=your-vapi-assistant-id

APPOINTMENT_TRACKING_API_KEY=replace-with-the-same-long-random-secret

# Recommended when the API is a separate Vercel project:
INTERNAL_API_URL=https://YOUR-API-DOMAIN
```

Notes:

- `NEXT_PUBLIC_API_URL` is the browser-facing API base URL (no trailing slash required).
- `INTERNAL_API_URL` is used only by Next.js server routes (for example the appointment calendar proxy).
- `APPOINTMENT_TRACKING_API_KEY` must match the API project exactly.
- Never set `VAPI_PRIVATE_KEY`, `VAPI_WEBHOOK_SECRET`, `VAPI_CREDENTIAL_ID`, or `DATABASE_URL` on the web project.

## B. Vercel API project

Set these on the NestJS Vercel project:

```env
NODE_ENV=production
PORT=4000

DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public

PUBLIC_API_URL=https://YOUR-API-DOMAIN
FRONTEND_URL=https://YOUR-WEB-DOMAIN

VAPI_PRIVATE_KEY=your-vapi-private-key
VAPI_CREDENTIAL_ID=your-vapi-credential-id
VAPI_WEBHOOK_SECRET=replace-with-a-long-random-secret
VAPI_API_BASE_URL=https://api.vapi.ai
VAPI_ASSISTANT_NAME=CarePoint Appointment Assistant
VAPI_ASSISTANT_ID=your-vapi-assistant-id

APPOINTMENT_TRACKING_API_KEY=replace-with-the-same-long-random-secret

MINIMUM_BOOKING_LEAD_MINUTES=30
```

Notes:

- `FRONTEND_URL` must be the exact deployed web origin used for CORS (HTTPS in production).
- `PUBLIC_API_URL` must be HTTPS in production and is used for Vapi tool/webhook provisioning.
- `APPOINTMENT_TRACKING_API_KEY` must match the web project exactly.
- After changing API URLs or tools, run `npm run vapi:setup` and `npm run vapi:verify` from a trusted machine with the production API env loaded.

## Local development

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

This repo standardizes on `.env` for local work. Next.js also supports `.env.local`, but developers should not maintain a second duplicate file for this project.

Verify presence (never prints secrets):

```bash
npm run env:check
```
