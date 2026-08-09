# Architecture

## Overview

The platform is an npm-workspaces monorepo:

- `apps/web` — Next.js App Router UI for browser Vapi calls and manual booking
- `apps/api` — NestJS REST API, availability engine, booking transactions, Vapi tools/webhooks
- PostgreSQL — source of truth for organizations, providers, services, availability, and appointments

```text
Browser (Next.js)
  ├─ Voice UI (@vapi-ai/web) ──► Vapi cloud ──► API /api/v1/vapi/*
  └─ Manual booking form ──────► API /api/v1/public/*
                                      │
                                      ▼
                         OrganizationTimeService (Luxon)
                         RelativeDateService
                         NextAvailabilityService
                         AvailabilityService
                         AppointmentsService
                                      │
                                      ▼
                                   Prisma
                                      │
                                      ▼
                                 PostgreSQL
```

## Date and time authority

- Current instant: backend system clock as a UTC instant (`OrganizationTimeService` / injectable `CLOCK`).
- Scheduling timezone: organization IANA timezone (`Asia/Dhaka` for CarePoint). Never the server OS local zone, never the browser zone.
- Browser timezone may be passed to Vapi as optional `variableValues` caller context only.
- Appointment rows store UTC timestamps; display uses the organization (or appointment) timezone.
- Relative phrases (`tomorrow`, `next Monday`, `August 10`) are resolved by `RelativeDateService`, not by the LLM.
- `find_next_available_appointment` walks organization-local calendar days and reuses `AvailabilityService` (max 60 days).
- Luxon is the only timezone library used for scheduling math.

## Domain model

Entities are industry-agnostic:

- **Organization** — clinic, salon, consultancy, etc.
- **Location** — physical branch
- **Provider** — doctor, stylist, therapist, consultant
- **Service** — bookable offering with duration and buffers
- **ProviderService** — which providers offer which services
- **Customer** — generic customer/patient contact record
- **AvailabilityRule / AvailabilityException** — weekly hours and one-off overrides
- **Appointment** — booked slot with confirmation code
- **VoiceCall** — Vapi call audit/transcript store

Phase-1 seed data focuses on healthcare (CarePoint Clinic).

## Availability engine

`AvailabilityService`:

1. Resolves organization by id or slug
2. Finds active providers offering the requested service
3. Loads weekly rules and date exceptions
4. Builds local windows in the provider/organization timezone
5. Generates candidate starts using `Organization.slotIntervalMinutes`
6. Applies service duration (+ optional provider custom duration) and buffers
7. Removes overlaps with `PENDING` / `CONFIRMED` appointments
8. Excludes slots at or before `now + MINIMUM_BOOKING_LEAD_MINUTES`
9. Returns UTC ISO times plus display timestamps in the organization IANA timezone

The host OS timezone is never used as a business default. Date resolution and next-available search stay outside this service.

## Safe booking

`AppointmentsService`:

- Validates organization/location/provider/service consistency
- Rejects past starts
- Rechecks availability before insert
- Upserts customers by organization + normalized phone (+ email when present)
- Uses a Prisma interactive transaction with `Serializable` isolation
- Retries bounded serialization failures (`P2034`)
- Supports `externalRequestId` idempotency
- Returns HTTP 409 when the slot is gone
- Generates human-readable codes like `APT-7K4M2Q`

## Vapi integration

- `POST /api/v1/vapi/tools` — five tools: `get_current_datetime`, `resolve_appointment_date`, `check_appointment_availability`, `find_next_available_appointment`, `book_appointment`
- `POST /api/v1/vapi/webhook` — status/transcript/end-of-call updates
- Bearer token auth with timing-safe compare against `VAPI_WEBHOOK_SECRET`
- Date/availability/booking tools reuse shared Nest services (no duplicated logic)
- Programmatic provisioning via `npm run vapi:setup` using backend-only `VAPI_PRIVATE_KEY`
- Provisioning code lives in `apps/api/src/modules/vapi/` and writes non-secret IDs to `.vapi/resources.local.json`
- After adding tools or changing the system prompt, rerun `npm run vapi:setup` (do not hand-edit the dashboard when provisioning already manages the assistant)

## Privacy boundary

Only scheduling data is stored: identity/contact fields needed for booking, service, provider, time, and operational notes. No diagnoses, prescriptions, or clinical records.
