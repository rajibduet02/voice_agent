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

    const { getNormalizedPublicEnv, isVapiConfigured, isPublicApiUrlConfigured } =
      await import('./public-env');
    const normalized = getNormalizedPublicEnv();

    expect(normalized.apiUrl).toBe('https://api.example.com');
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

  it('exposes only safe debug fields without key values', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com/v1/');
    vi.stubEnv('NEXT_PUBLIC_ORGANIZATION_SLUG', 'carepoint-clinic');
    vi.stubEnv('NEXT_PUBLIC_VAPI_PUBLIC_KEY', 'pk_live_abcdefghijklmnopqrstuvwxyz');
    vi.stubEnv('NEXT_PUBLIC_VAPI_ASSISTANT_ID', 'asst_1234567890abcdef');

    const { getPublicEnvDebugInfo } = await import('./public-env-debug');
    const debug = getPublicEnvDebugInfo();
    const serialized = JSON.stringify(debug);

    expect(debug.vapiPublicKeyConfigured).toBe(true);
    expect(debug.vapiAssistantIdConfigured).toBe(true);
    expect(debug.apiHost).toBe('api.example.com');
    expect(debug.assistantIdSuffix).toBe('abcdef');
    expect(serialized).not.toContain('pk_live_');
    expect(serialized).not.toContain('asst_1234567890');
  });
});
