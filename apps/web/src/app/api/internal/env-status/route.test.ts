import { afterEach, describe, expect, it, vi } from 'vitest';

describe('GET /api/internal/env-status', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns only boolean presence fields', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com');
    vi.stubEnv('NEXT_PUBLIC_ORGANIZATION_SLUG', 'carepoint-clinic');
    vi.stubEnv('NEXT_PUBLIC_VAPI_PUBLIC_KEY', 'pk_test_secret_value');
    vi.stubEnv('NEXT_PUBLIC_VAPI_ASSISTANT_ID', 'asst_test_value');
    vi.stubEnv('APPOINTMENT_TRACKING_API_KEY', 'tracking-secret');
    vi.stubEnv('INTERNAL_API_URL', 'https://api.example.com');

    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.runtime.vapiPublicKeyConfigured).toBe(true);
    expect(body.runtime.vapiAssistantIdConfigured).toBe(true);
    expect(body.buildTarget).toBe('carepoint-web');
    expect(serialized).not.toContain('pk_test_secret_value');
    expect(serialized).not.toContain('tracking-secret');
    expect(serialized).not.toContain('DATABASE_URL');
    expect(serialized).not.toContain('VAPI_PRIVATE_KEY');
  });
});
