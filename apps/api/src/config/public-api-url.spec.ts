import {
  checkPublicApiReachability,
  validatePublicApiUrl,
} from './public-api-url';
import { validateProvisioningEnv } from './env.validation';

describe('validatePublicApiUrl', () => {
  it('accepts HTTPS URLs in development', () => {
    const result = validatePublicApiUrl(
      'https://tunnel.example.com/',
      'development',
      { allowInsecurePublicApiUrl: false },
    );
    expect(result.url).toBe('https://tunnel.example.com');
    expect(result.protocol).toBe('https:');
    expect(result.insecureDevelopmentMode).toBe(false);
  });

  it('accepts HTTPS URLs in production', () => {
    const result = validatePublicApiUrl('https://api.example.com', 'production', {
      allowInsecurePublicApiUrl: true,
    });
    expect(result.protocol).toBe('https:');
  });

  it('rejects HTTP URLs by default', () => {
    expect(() =>
      validatePublicApiUrl('http://103.208.181.253:4000', 'development', {
        allowInsecurePublicApiUrl: false,
      }),
    ).toThrow('PUBLIC_API_URL must be an HTTPS URL outside test mode');
  });

  it('accepts a public HTTP URL in development with explicit override', () => {
    const result = validatePublicApiUrl(
      'http://103.208.181.253:4000/',
      'development',
      { allowInsecurePublicApiUrl: true },
    );
    expect(result.url).toBe('http://103.208.181.253:4000');
    expect(result.protocol).toBe('http:');
    expect(result.insecureDevelopmentMode).toBe(true);
  });

  it('rejects HTTP URLs in production even with override', () => {
    expect(() =>
      validatePublicApiUrl('http://103.208.181.253:4000', 'production', {
        allowInsecurePublicApiUrl: true,
      }),
    ).toThrow('HTTPS URL in production');
  });

  it('rejects HTTP localhost for provisioning overrides', () => {
    expect(() =>
      validatePublicApiUrl('http://localhost:4000', 'development', {
        allowInsecurePublicApiUrl: true,
      }),
    ).toThrow('publicly routable');
  });

  it('rejects private IPv4 addresses', () => {
    for (const url of [
      'http://10.0.0.5:4000',
      'http://172.16.1.2:4000',
      'http://192.168.1.10:4000',
      'http://127.0.0.1:4000',
      'http://169.254.10.1:4000',
    ]) {
      expect(() =>
        validatePublicApiUrl(url, 'development', { allowInsecurePublicApiUrl: true }),
      ).toThrow('publicly routable');
    }
  });

  it('accepts the public IPv4 address 103.208.181.253', () => {
    const result = validatePublicApiUrl('http://103.208.181.253:4000', 'development', {
      allowInsecurePublicApiUrl: true,
    });
    expect(result.url).toBe('http://103.208.181.253:4000');
  });

  it('rejects URL credentials', () => {
    expect(() =>
      validatePublicApiUrl('https://user:pass@example.com', 'development', {
        allowInsecurePublicApiUrl: false,
      }),
    ).toThrow('username or password');
  });

  it('rejects query strings', () => {
    expect(() =>
      validatePublicApiUrl('https://example.com?x=1', 'development', {
        allowInsecurePublicApiUrl: false,
      }),
    ).toThrow('query string');
  });

  it('rejects fragments', () => {
    expect(() =>
      validatePublicApiUrl('https://example.com#section', 'development', {
        allowInsecurePublicApiUrl: false,
      }),
    ).toThrow('fragment');
  });

  it('removes trailing slashes and preserves port 4000', () => {
    const result = validatePublicApiUrl(
      'http://103.208.181.253:4000/',
      'development',
      { allowInsecurePublicApiUrl: true },
    );
    expect(result.url).toBe('http://103.208.181.253:4000');
  });

  it('allows localhost HTTP only in test mode', () => {
    const result = validatePublicApiUrl('http://localhost:4000', 'test', {
      allowInsecurePublicApiUrl: false,
    });
    expect(result.url).toBe('http://localhost:4000');
  });
});

describe('credential transport and preflight flags', () => {
  const base = {
    VAPI_PRIVATE_KEY: 'test-private-key-abc123',
    VAPI_WEBHOOK_SECRET: 'webhook-secret',
    VAPI_ASSISTANT_NAME: 'CarePoint Appointment Assistant',
  };

  it('rejects HTTP plus credential ID without the second override', () => {
    expect(() =>
      validateProvisioningEnv({
        ...base,
        NODE_ENV: 'development',
        PUBLIC_API_URL: 'http://103.208.181.253:4000',
        ALLOW_INSECURE_PUBLIC_API_URL: 'true',
        VAPI_CREDENTIAL_ID: 'cred-1',
      }),
    ).toThrow('ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT=true');
  });

  it('accepts HTTP plus credential ID in development with both overrides', () => {
    const env = validateProvisioningEnv({
      ...base,
      NODE_ENV: 'development',
      PUBLIC_API_URL: 'http://103.208.181.253:4000',
      ALLOW_INSECURE_PUBLIC_API_URL: 'true',
      ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT: 'true',
      VAPI_CREDENTIAL_ID: 'cred-1',
    });
    expect(env.PUBLIC_API_URL).toBe('http://103.208.181.253:4000');
    expect(env.insecureDevelopmentMode).toBe(true);
    expect(env.warnings.join('\n')).toContain('unencrypted HTTP');
    expect(env.warnings.join('\n')).not.toContain(base.VAPI_PRIVATE_KEY);
    expect(env.warnings.join('\n')).not.toContain(base.VAPI_WEBHOOK_SECRET);
  });

  it('rejects insecure credential transport in production', () => {
    expect(() =>
      validateProvisioningEnv({
        ...base,
        NODE_ENV: 'production',
        PUBLIC_API_URL: 'http://103.208.181.253:4000',
        ALLOW_INSECURE_PUBLIC_API_URL: 'true',
        ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT: 'true',
        VAPI_CREDENTIAL_ID: 'cred-1',
      }),
    ).toThrow('HTTPS URL in production');
  });

  it('rejects preflight bypass outside development', () => {
    expect(() =>
      validateProvisioningEnv({
        ...base,
        NODE_ENV: 'production',
        PUBLIC_API_URL: 'https://api.example.com',
        VAPI_CREDENTIAL_ID: 'cred-1',
        SKIP_PUBLIC_API_PREFLIGHT: 'true',
      }),
    ).toThrow('SKIP_PUBLIC_API_PREFLIGHT is only permitted');
  });
});

describe('checkPublicApiReachability', () => {
  it('passes for a reachable health endpoint', async () => {
    const fetchImpl = jest.fn(async () => ({
      status: 200,
      text: async () => JSON.stringify({ status: 'ok', database: 'up' }),
    })) as unknown as typeof fetch;

    const result = await checkPublicApiReachability('http://103.208.181.253:4000', {
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(true);
    expect(String((fetchImpl as jest.Mock).mock.calls[0][0])).toBe(
      'http://103.208.181.253:4000/health',
    );
    expect(result.message).not.toContain('test-private-key');
  });

  it('fails for an unreachable endpoint', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await checkPublicApiReachability('http://103.208.181.253:4000', {
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('http://103.208.181.253:4000/health');
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('supports development-only preflight bypass', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const result = await checkPublicApiReachability('http://103.208.181.253:4000', {
      fetchImpl,
      skip: true,
    });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(fetchImpl as jest.Mock).not.toHaveBeenCalled();
  });
});
