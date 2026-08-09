import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_PARAMS = [
  'start',
  'end',
  'providerId',
  'serviceId',
  'locationId',
  'status',
  'timezone',
] as const;

type AllowedParam = (typeof ALLOWED_PARAMS)[number];

function configurationError(message: string, status = 503) {
  return NextResponse.json(
    {
      error: 'configuration_error',
      message,
    },
    { status },
  );
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.APPOINTMENT_TRACKING_API_KEY?.trim();
  if (!apiKey) {
    return configurationError(
      'Appointment tracking is not configured. Set APPOINTMENT_TRACKING_API_KEY in apps/web/.env.local (server-only) to the same value as apps/api/.env.',
    );
  }

  // Prefer INTERNAL_API_URL in Docker (http://api:4000) to avoid public hairpin NAT.
  const apiBase = (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000'
  ).replace(/\/+$/, '');
  const organizationSlug =
    request.nextUrl.searchParams.get('organizationSlug')?.trim() ||
    process.env.NEXT_PUBLIC_ORGANIZATION_SLUG ||
    'carepoint-clinic';

  const start = request.nextUrl.searchParams.get('start');
  const end = request.nextUrl.searchParams.get('end');
  if (!start || !end) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: 'Query parameters start and end are required ISO timestamps.',
      },
      { status: 400 },
    );
  }

  const forwarded = new URLSearchParams();
  for (const key of ALLOWED_PARAMS) {
    const value = request.nextUrl.searchParams.get(key as AllowedParam);
    if (value) {
      forwarded.set(key, value);
    }
  }

  const upstreamUrl = `${apiBase}/api/v1/admin/${encodeURIComponent(organizationSlug)}/appointments/calendar?${forwarded.toString()}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    });

    const body = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

    if (!upstream.ok) {
      const message =
        (typeof body.message === 'string' && body.message) ||
        (Array.isArray(body.message) && body.message.join(', ')) ||
        (typeof body.error === 'string' && body.error) ||
        `Calendar request failed (${upstream.status})`;

      if (upstream.status === 401 || upstream.status === 403) {
        return configurationError(
          'Appointment tracking authorization failed. Confirm APPOINTMENT_TRACKING_API_KEY matches in apps/api/.env and apps/web/.env.local.',
          401,
        );
      }

      return NextResponse.json(
        {
          error: 'upstream_error',
          message,
        },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
      );
    }

    // Never forward authorization metadata to the browser.
    return NextResponse.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: 'backend_unavailable',
        message: 'The appointment API is unavailable. Confirm the NestJS API is running.',
      },
      { status: 503 },
    );
  }
}
