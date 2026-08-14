import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

describe('GET /api/internal/appointments/calendar', () => {
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn();
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', fetchMock);
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000';
    process.env.NEXT_PUBLIC_ORGANIZATION_SLUG = 'carepoint-clinic';
    process.env.APPOINTMENT_TRACKING_API_KEY = 'server-only-tracking-key';
    delete process.env.INTERNAL_API_URL;
    fetchMock.mockReset();
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  async function loadRoute() {
    return import('./route');
  }

  function assertNoSecretLeak(payload: unknown) {
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('server-only-tracking-key');
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain('Bearer ');
  }

  it('attaches the server-side API key and never returns it to the browser', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          appointments: [],
          range: {
            start: '2026-08-01T00:00:00.000Z',
            end: '2026-09-01T00:00:00.000Z',
            timezone: 'Asia/Dhaka',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { GET } = await loadRoute();
    const request = new NextRequest(
      'http://localhost:3000/api/internal/appointments/calendar?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z&timezone=Asia/Dhaka',
    );
    const response = await GET(request);
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/admin/carepoint-clinic/appointments/calendar');
    expect(url).toContain('start=2026-08-01T00%3A00%3A00.000Z');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer server-only-tracking-key',
    );

    expect(response.status).toBe(200);
    assertNoSecretLeak(body);
    expect(body.appointments).toEqual([]);

    const debugLogs = logSpy.mock.calls
      .filter((call) => call[0] === '[Appointment Proxy Debug]')
      .map((call) => call[1] as Record<string, unknown>);
    expect(debugLogs.length).toBeGreaterThan(0);
    expect(debugLogs.some((entry) => entry.upstreamStatus === 200)).toBe(true);
    assertNoSecretLeak(debugLogs);
  });

  it('prefers INTERNAL_API_URL for server-side upstream calls', async () => {
    process.env.INTERNAL_API_URL =
      'https://voice-agent-mu9zvc6rl-rajibduet02-gmailcoms-projects.vercel.app';
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ appointments: [], range: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { GET } = await loadRoute();
    const request = new NextRequest(
      'http://localhost:3000/api/internal/appointments/calendar?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z',
    );
    await GET(request);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.startsWith(
      'https://voice-agent-mu9zvc6rl-rajibduet02-gmailcoms-projects.vercel.app/',
    )).toBe(true);
    expect(url).not.toContain('https://api.example.com');
  });

  it('returns a configuration error when the web tracking key is missing', async () => {
    delete process.env.APPOINTMENT_TRACKING_API_KEY;

    const { GET } = await loadRoute();
    const request = new NextRequest(
      'http://localhost:3000/api/internal/appointments/calendar?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z',
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('configuration_error');
    expect(body.message).toMatch(/APPOINTMENT_TRACKING_API_KEY|not configured/i);
    assertNoSecretLeak(body);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a configuration error when backend URL is missing in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.INTERNAL_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;

    const { GET } = await loadRoute();
    const request = new NextRequest(
      'http://localhost:3000/api/internal/appointments/calendar?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z',
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('configuration_error');
    expect(body.message).toMatch(/backend URL|INTERNAL_API_URL|not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps upstream 401 to a safe 502 authorization failure without leaking the key', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { GET } = await loadRoute();
    const request = new NextRequest(
      'http://localhost:3000/api/internal/appointments/calendar?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z',
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe('Appointment tracking authorization failed');
    assertNoSecretLeak(body);
  });

  it('maps upstream 404 and 500 to safe proxy failures', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { GET } = await loadRoute();
    const notFound = await GET(
      new NextRequest(
        'http://localhost:3000/api/internal/appointments/calendar?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z',
      ),
    );
    expect(notFound.status).toBe(502);
    expect((await notFound.json()).error).toBe('upstream_not_found');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'boom' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const serverError = await GET(
      new NextRequest(
        'http://localhost:3000/api/internal/appointments/calendar?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z',
      ),
    );
    expect(serverError.status).toBe(502);
    expect((await serverError.json()).error).toBe('upstream_server_error');
  });

  it('maps network failures without leaking secrets', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const { GET } = await loadRoute();
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/internal/appointments/calendar?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z',
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe('backend_unavailable');
    assertNoSecretLeak(body);
  });

  it('forwards validated query parameters safely', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ appointments: [], range: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { GET } = await loadRoute();
    const request = new NextRequest(
      'http://localhost:3000/api/internal/appointments/calendar?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z&providerId=p1&serviceId=s1&locationId=l1&status=CONFIRMED&timezone=Asia/Dhaka&evil=1',
    );
    await GET(request);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('providerId=p1');
    expect(url).toContain('serviceId=s1');
    expect(url).toContain('locationId=l1');
    expect(url).toContain('status=CONFIRMED');
    expect(url).not.toContain('evil=');
  });
});
