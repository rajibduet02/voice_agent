import { ConfigService } from '@nestjs/config';
import { stripTrailingSlash } from './env.validation';

/**
 * Typed accessors for Nest runtime configuration.
 * All values come from process.env via ConfigModule — never from filesystem reads.
 */

export type AppEnv = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  frontendUrl: string;
  publicApiUrl: string | undefined;
  vapiPrivateKey: string | undefined;
  vapiCredentialId: string | undefined;
  vapiWebhookSecret: string;
  appointmentTrackingApiKey: string | undefined;
  minimumBookingLeadMinutes: number;
};

export function readAppEnv(config: ConfigService): AppEnv {
  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  const portRaw = config.get<string | number>('PORT');
  const port = typeof portRaw === 'number' ? portRaw : Number(portRaw ?? 4000);
  const publicApiUrl = config.get<string>('PUBLIC_API_URL');
  const leadRaw = config.get<string | number>('MINIMUM_BOOKING_LEAD_MINUTES');
  const leadParsed = typeof leadRaw === 'number' ? leadRaw : Number(leadRaw);

  return {
    nodeEnv,
    port: Number.isFinite(port) ? port : 4000,
    databaseUrl: config.get<string>('DATABASE_URL') ?? '',
    frontendUrl: stripTrailingSlash(
      config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000',
    ),
    publicApiUrl: publicApiUrl ? stripTrailingSlash(publicApiUrl) : undefined,
    vapiPrivateKey: config.get<string>('VAPI_PRIVATE_KEY') || undefined,
    vapiCredentialId: config.get<string>('VAPI_CREDENTIAL_ID') || undefined,
    vapiWebhookSecret: config.get<string>('VAPI_WEBHOOK_SECRET') ?? '',
    appointmentTrackingApiKey:
      config.get<string>('APPOINTMENT_TRACKING_API_KEY') || undefined,
    minimumBookingLeadMinutes:
      Number.isFinite(leadParsed) && leadParsed >= 0 ? Math.floor(leadParsed) : 30,
  };
}

/** Presence-only diagnostics — never include secret values. */
export function getApiEnvPresence(env: NodeJS.ProcessEnv = process.env) {
  const configured = (key: string) =>
    typeof env[key] === 'string' && env[key]!.trim().length > 0
      ? 'configured'
      : 'missing';

  return {
    DATABASE_URL: configured('DATABASE_URL'),
    PUBLIC_API_URL: configured('PUBLIC_API_URL'),
    FRONTEND_URL: configured('FRONTEND_URL'),
    VAPI_PRIVATE_KEY: configured('VAPI_PRIVATE_KEY'),
    VAPI_CREDENTIAL_ID: configured('VAPI_CREDENTIAL_ID'),
    VAPI_WEBHOOK_SECRET: configured('VAPI_WEBHOOK_SECRET'),
    APPOINTMENT_TRACKING_API_KEY: configured('APPOINTMENT_TRACKING_API_KEY'),
    NODE_ENV: env.NODE_ENV?.trim() || 'missing',
    PORT: configured('PORT'),
  };
}
