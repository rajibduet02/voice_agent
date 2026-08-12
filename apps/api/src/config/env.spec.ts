import 'reflect-metadata';
import { getApiEnvPresence } from './env';
import { validateEnv } from './env.validation';

describe('API env helpers', () => {
  it('reports presence without returning secret values', () => {
    const presence = getApiEnvPresence({
      DATABASE_URL: 'postgresql://secret-user:secret-pass@localhost:5432/db',
      PUBLIC_API_URL: 'https://api.example.com',
      FRONTEND_URL: 'https://voice.example.com',
      VAPI_PRIVATE_KEY: 'private-secret-value',
      VAPI_CREDENTIAL_ID: 'cred-1',
      VAPI_WEBHOOK_SECRET: 'webhook-secret-value',
      APPOINTMENT_TRACKING_API_KEY: 'tracking-secret-value',
      NODE_ENV: 'production',
      PORT: '4000',
    });

    const serialized = JSON.stringify(presence);
    expect(presence.DATABASE_URL).toBe('configured');
    expect(presence.VAPI_PRIVATE_KEY).toBe('configured');
    expect(serialized).not.toContain('secret-pass');
    expect(serialized).not.toContain('private-secret-value');
    expect(serialized).not.toContain('webhook-secret-value');
    expect(serialized).not.toContain('tracking-secret-value');
  });

  it('requires HTTPS FRONTEND_URL in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        PORT: 4000,
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/voice_agent',
        FRONTEND_URL: 'http://voice.example.com',
        VAPI_WEBHOOK_SECRET: 'secret',
      }),
    ).toThrow(/FRONTEND_URL must use HTTPS/);
  });
});
