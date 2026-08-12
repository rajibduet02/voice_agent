import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env/server-env';

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
  const apiKey = serverEnv.appointmentTrackingApiKey;
  if (!apiKey) {
    return configurationError(
      process.env.NODE_ENV === 'production'
        ? 'Appointment tracking is not configured.'
        : 'Appointment tracking is not configured. Set APPOINTMENT_TRACKING_API_KEY in apps/web/.env (server-only) to the same value as apps/api/.env.',
      500,
    );
  }

  const apiBase = serverEnv.backendBaseUrl;
  if (!apiBase) {
    return configurationError(
      process.env.NODE_ENV === 'production'
        ? 'Appointment tracking backend is not configured.'
        : 'Backend API URL is not configured. Set INTERNAL_API_URL or NEXT_PUBLIC_API_URL.',
      500,
    );
  }

  const organizationSlug =
    request.nextUrl.searchParams.get('organizationSlug')?.trim() ||
    serverEnv.organizationSlug;

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
      if (upstream.status === 401 || upstream.status === 403) {
        return NextResponse.json(
          {
            error: 'authorization_failed',
            message:
              'Appointment tracking authorization failed. Confirm APPOINTMENT_TRACKING_API_KEY matches in the web and API hosting environments.',
          },
          { status: 502 },
        );
      }

      const message =
        (typeof body.message === 'string' && body.message) ||
        (Array.isArray(body.message) && body.message.join(', ')) ||
        (typeof body.error === 'string' && body.error) ||
        `Calendar request failed (${upstream.status})`;

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
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[calendar-proxy] Backend unavailable', error);
    }
    return NextResponse.json(
      {
        error: 'backend_unavailable',
        message: 'The appointment API is unavailable.',
      },
      { status: 503 },
    );
  }
}
