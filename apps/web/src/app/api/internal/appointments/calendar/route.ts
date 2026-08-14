import { NextRequest, NextResponse } from 'next/server';
import { safeBackendHost, serverEnv } from '@/lib/env/server-env';

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

function jsonError(
  status: number,
  error: string,
  message?: string,
): NextResponse {
  const body = message ? { error, message } : { error };
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function logProxyDebug(fields: {
  trackingKeyConfigured: boolean;
  trackingKeyLength: number;
  backendUrlConfigured: boolean;
  backendHost: string | null;
  upstreamStatus: number | null;
  failure?: string;
}) {
  // Never log the tracking key or Authorization header.
  console.log('[Appointment Proxy Debug]', fields);
}

export async function GET(request: NextRequest) {
  // Read server-only env at request time (hosting provider process.env).
  const apiKey = process.env.APPOINTMENT_TRACKING_API_KEY?.trim() ?? '';
  const internalApiUrl = process.env.INTERNAL_API_URL?.trim() ?? '';
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  const apiBase =
    (internalApiUrl || publicApiUrl).replace(/\/+$/, '') ||
    serverEnv.backendBaseUrl;

  const trackingKeyConfigured = apiKey.length > 0;
  const backendUrlConfigured = apiBase.length > 0;
  const backendHost = safeBackendHost(apiBase);

  if (!trackingKeyConfigured) {
    logProxyDebug({
      trackingKeyConfigured: false,
      trackingKeyLength: 0,
      backendUrlConfigured,
      backendHost,
      upstreamStatus: null,
      failure: 'missing_web_tracking_key',
    });
    return jsonError(
      500,
      'configuration_error',
      process.env.NODE_ENV === 'production'
        ? 'Appointment tracking is not configured on the web server.'
        : 'Missing web APPOINTMENT_TRACKING_API_KEY. Set it in apps/web/.env (server-only) to the same value as the API hosting environment.',
    );
  }

  if (!backendUrlConfigured) {
    logProxyDebug({
      trackingKeyConfigured: true,
      trackingKeyLength: apiKey.length,
      backendUrlConfigured: false,
      backendHost: null,
      upstreamStatus: null,
      failure: 'missing_backend_url',
    });
    return jsonError(
      500,
      'configuration_error',
      process.env.NODE_ENV === 'production'
        ? 'Appointment tracking backend URL is not configured.'
        : 'Missing INTERNAL_API_URL and NEXT_PUBLIC_API_URL. Set INTERNAL_API_URL for server-to-server calls.',
    );
  }

  if (!internalApiUrl && process.env.NODE_ENV === 'production') {
    // Still proceed using NEXT_PUBLIC_API_URL fallback, but make the gap visible.
    console.log('[Appointment Proxy Debug] INTERNAL_API_URL missing; falling back to NEXT_PUBLIC_API_URL', {
      backendHost,
    });
  }

  const organizationSlug =
    request.nextUrl.searchParams.get('organizationSlug')?.trim() ||
    serverEnv.organizationSlug;

  const start = request.nextUrl.searchParams.get('start');
  const end = request.nextUrl.searchParams.get('end');
  if (!start || !end) {
    return jsonError(
      400,
      'validation_error',
      'Query parameters start and end are required ISO timestamps.',
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

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorMessage = error instanceof Error ? error.message : String(error);
    logProxyDebug({
      trackingKeyConfigured: true,
      trackingKeyLength: apiKey.length,
      backendUrlConfigured: true,
      backendHost,
      upstreamStatus: null,
      failure: `network_fetch_failure:${errorName}`,
    });
    console.error('[Appointment Proxy Debug] Upstream fetch failed', {
      errorName,
      errorMessage,
      backendHost,
    });
    return jsonError(
      503,
      'backend_unavailable',
      'The appointment API is unavailable.',
    );
  }

  logProxyDebug({
    trackingKeyConfigured: true,
    trackingKeyLength: apiKey.length,
    backendUrlConfigured: true,
    backendHost,
    upstreamStatus: upstream.status,
  });

  const body = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

  if (!upstream.ok) {
    if (upstream.status === 401 || upstream.status === 403) {
      return NextResponse.json(
        {
          error: 'Appointment tracking authorization failed',
        },
        {
          status: 502,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    if (upstream.status === 404) {
      return jsonError(
        502,
        'upstream_not_found',
        'Appointment calendar endpoint was not found on the API.',
      );
    }

    if (upstream.status >= 500) {
      return jsonError(
        502,
        'upstream_server_error',
        'The appointment API failed while loading the calendar.',
      );
    }

    const message =
      (typeof body.message === 'string' && body.message) ||
      (Array.isArray(body.message) && body.message.join(', ')) ||
      (typeof body.error === 'string' && body.error) ||
      `Calendar request failed (${upstream.status})`;

    // Never forward upstream bodies that might echo auth details.
    const safeMessage = message.toLowerCase().includes('key')
      ? `Calendar request failed (${upstream.status})`
      : message;

    return jsonError(
      upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
      'upstream_error',
      safeMessage,
    );
  }

  // Never forward authorization metadata to the browser.
  return NextResponse.json(body, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
