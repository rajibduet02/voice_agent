import {
  buildCorsSettings,
  isOriginAllowed,
  normalizeFrontendUrl,
  resolveCorsOrigins,
} from './cors.config';

describe('CORS configuration', () => {
  it('normalizes FRONTEND_URL trailing slashes and whitespace', () => {
    expect(normalizeFrontendUrl('  https://voice-agent-web-lac.vercel.app/  ')).toBe(
      'https://voice-agent-web-lac.vercel.app',
    );
  });

  it('uses exact FRONTEND_URL in production', () => {
    expect(
      resolveCorsOrigins('production', 'https://voice-agent-web-lac.vercel.app'),
    ).toBe('https://voice-agent-web-lac.vercel.app');
  });

  it('rejects unrelated production origins', () => {
    expect(
      isOriginAllowed(
        'production',
        'https://voice-agent-web-lac.vercel.app',
        'https://malicious-example.com',
      ),
    ).toBe(false);
    expect(
      isOriginAllowed(
        'production',
        'https://voice-agent-web-lac.vercel.app',
        'https://voice-agent-web-lac.vercel.app',
      ),
    ).toBe(true);
  });

  it('allows localhost origins in development', () => {
    const origins = resolveCorsOrigins('development', 'http://localhost:3000');
    expect(origins).toEqual(
      expect.arrayContaining(['http://localhost:3000', 'http://127.0.0.1:3000']),
    );
  });

  it('reflects only allowed origins via callback and disables credentials', () => {
    const settings = buildCorsSettings(
      'production',
      'https://voice-agent-web-lac.vercel.app/',
    );
    expect(settings.credentials).toBe(false);
    expect(settings.methods).toContain('OPTIONS');
    expect(settings.allowedHeaders).toEqual(
      expect.arrayContaining(['Content-Type', 'Authorization']),
    );

    const allowedOrigin = 'https://voice-agent-web-lac.vercel.app';
    settings.origin(allowedOrigin, (err, value) => {
      expect(err).toBeNull();
      expect(value).toBe(allowedOrigin);
    });
    settings.origin('https://malicious-example.com', (err, value) => {
      expect(err).toBeNull();
      expect(value).toBe(false);
    });
  });
});
