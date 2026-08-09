# API overview

Base URL (local): `http://localhost:4000`

Global prefix for versioned routes: `/api/v1`  
Swagger UI: `http://localhost:4000/docs`  
Health (unversioned): `GET /health`

## Public booking

### `GET /api/v1/public/:organizationSlug/services`

Returns organization summary, default location, and active services.

### `GET /api/v1/public/:organizationSlug/providers?serviceId={uuid}`

Returns active providers that offer the service.

### `GET /api/v1/public/:organizationSlug/time-context`

Authoritative organization clock. Uses the backend UTC instant and the organization IANA timezone (CarePoint: `Asia/Dhaka`).

Optional query:

- `timezone` — caller/display context only; never overrides the organization scheduling timezone

Response headers include `Cache-Control: no-store` so clients do not cache stale “today”.

### `POST /api/v1/public/:organizationSlug/resolve-date`

Deterministic relative/natural-language date resolution against the organization-local calendar date.

```json
{
  "expression": "tomorrow",
  "timezone": "Asia/Dhaka"
}
```

`referenceUtc` is accepted only outside production (tests/dev). Ambiguous expressions return `clarificationRequired` instead of guessing.

### `GET /api/v1/public/:organizationSlug/availability`

Query params:

- `serviceId` (required)
- `locationId` (required)
- `providerId` (optional)
- `date` (`YYYY-MM-DD`, required — concrete calendar date only)
- `timezone` (optional; organization timezone is used for scheduling)

Same-day slots already started, or within `MINIMUM_BOOKING_LEAD_MINUTES` (default 30), are excluded using organization-local current time.

### `POST /api/v1/public/:organizationSlug/appointments`

```json
{
  "locationId": "uuid",
  "providerId": "uuid",
  "serviceId": "uuid",
  "scheduledStart": "2026-08-12T04:00:00.000Z",
  "timezone": "Asia/Dhaka",
  "customer": {
    "name": "John Doe",
    "phone": "+8801700000000",
    "email": "john@example.com"
  },
  "reason": "General consultation",
  "source": "WEB",
  "externalRequestId": "optional-idempotency-key"
}
```

### `GET /api/v1/public/:organizationSlug/appointments/:confirmationCode`

Safe confirmation payload (no internal notes).

### `POST /api/v1/public/:organizationSlug/appointments/:confirmationCode/cancel`

```json
{
  "phone": "+8801700000000",
  "reason": "Schedule conflict"
}
```

Phone must match the appointment customer.

## Admin calendar (read-only)

### `GET /api/v1/admin/:organizationSlug/appointments/calendar`

Requires:

```http
Authorization: Bearer <APPOINTMENT_TRACKING_API_KEY>
```

Query params: `start` and `end` (required ISO timestamps), optional `providerId`, `serviceId`, `locationId`, `status`, `timezone`.

Returns appointments overlapping the range with customer **name only** (no phone/email/notes). Maximum range is 93 days.

The Next.js app proxies this via same-origin `GET /api/internal/appointments/calendar` so the browser never sees the API key.

## Vapi

Both endpoints require:

```http
Authorization: Bearer <VAPI_WEBHOOK_SECRET>
```

### `POST /api/v1/vapi/tools`

Handles `toolCallList` entries for:

- `get_current_datetime`
- `resolve_appointment_date`
- `check_appointment_availability` (concrete `YYYY-MM-DD` only)
- `find_next_available_appointment`
- `book_appointment`

Relative phrases such as `tomorrow` must be resolved with `resolve_appointment_date` before availability checks. The availability tool returns `dateResolutionRequired` when it receives a non-concrete date.

Response shape:

```json
{
  "results": [
    {
      "toolCallId": "…",
      "result": { "success": true }
    }
  ]
}
```

`toolCallId` is preserved exactly. Business-level tool outcomes use HTTP 200; invalid Bearer auth returns 401.

### `POST /api/v1/vapi/webhook`

Acknowledges `status-update`, `transcript`, `end-of-call-report`, and unknown events with HTTP 200 after idempotent `VoiceCall` upsert.

## Error shape

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Selected slot is no longer available",
  "timestamp": "2026-08-08T00:00:00.000Z"
}
```

Stack traces and secrets are not returned to clients.
