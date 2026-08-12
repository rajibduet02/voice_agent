import { afterEach, describe, expect, it, vi } from 'vitest';

describe('publicEnv', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('normalizes NEXT_PUBLIC_API_URL trailing slashes', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com///');
    vi.stubEnv('NEXT_PUBLIC_ORGANIZATION_SLUG', 'carepoint-clinic');
    vi.stubEnv('NEXT_PUBLIC_VAPI_PUBLIC_KEY', 'pk');
    vi.stubEnv('NEXT_PUBLIC_VAPI_ASSISTANT_ID', 'asst');

    const { publicEnv, isVapiConfigured, isPublicApiUrlConfigured } = await import(
      './public-env'
    );

    expect(publicEnv.apiUrl).toBe('https://api.example.com');
    expect(isPublicApiUrlConfigured()).toBe(true);
    expect(isVapiConfigured()).toBe(true);
  });

  it('reports Vapi as unconfigured when keys are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com');
    vi.stubEnv('NEXT_PUBLIC_VAPI_PUBLIC_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_VAPI_ASSISTANT_ID', '');

    const { isVapiConfigured } = await import('./public-env');
    expect(isVapiConfigured()).toBe(false);
  });
});
