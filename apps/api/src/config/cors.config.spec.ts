import { buildCorsSettings, isOriginAllowed, resolveCorsOrigins } from './cors.config';

describe('CORS configuration', () => {
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
        'https://evil.example.com',
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

  it('includes explicit methods and headers', () => {
    const settings = buildCorsSettings('production', 'https://voice.example.com/');
    expect(settings.origin).toBe('https://voice.example.com');
    expect(settings.methods).toContain('OPTIONS');
    expect(settings.allowedHeaders).toEqual(
      expect.arrayContaining(['Content-Type', 'Authorization']),
    );
    expect(settings.credentials).toBe(true);
  });
});
