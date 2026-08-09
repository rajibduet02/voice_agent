import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('GET /api/internal/appointments/calendar', () => {
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000';
    process.env.NEXT_PUBLIC_ORGANIZATION_SLUG = 'carepoint-clinic';
    process.env.APPOINTMENT_TRACKING_API_KEY = 'server-only-tracking-key';
    fetchMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

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
    expect(JSON.stringify(body)).not.toContain('server-only-tracking-key');
    expect(JSON.stringify(body)).not.toContain('Authorization');
    expect(body.appointments).toEqual([]);
  });

  it('returns a safe configuration error when the API key is missing', async () => {
    delete process.env.APPOINTMENT_TRACKING_API_KEY;

    const request = new NextRequest(
      'http://localhost:3000/api/internal/appointments/calendar?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z',
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe('configuration_error');
    expect(body.message).toMatch(/APPOINTMENT_TRACKING_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards validated query parameters safely', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ appointments: [], range: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

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
