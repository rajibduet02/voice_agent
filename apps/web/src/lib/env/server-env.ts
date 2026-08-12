import 'server-only';

/**
 * Server-only web environment. Never import from Client Components.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function readOptional(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

const trackingKey = readOptional(process.env.APPOINTMENT_TRACKING_API_KEY);
const internalApiUrl = readOptional(process.env.INTERNAL_API_URL);
const publicApiUrl = readOptional(process.env.NEXT_PUBLIC_API_URL);

export const serverEnv = {
  appointmentTrackingApiKey: trackingKey,
  /**
   * Prefer INTERNAL_API_URL for server-to-server calls (Docker / same-region).
   * Fall back to the public API URL. Never default to localhost in production.
   */
  backendBaseUrl: stripTrailingSlash(
    internalApiUrl ||
      publicApiUrl ||
      (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000'),
  ),
  organizationSlug:
    readOptional(process.env.NEXT_PUBLIC_ORGANIZATION_SLUG) || 'carepoint-clinic',
} as const;

export function getServerEnvStatus() {
  return {
    apiUrlConfigured: Boolean(publicApiUrl),
    organizationConfigured: Boolean(
      readOptional(process.env.NEXT_PUBLIC_ORGANIZATION_SLUG) || true,
    ),
    vapiPublicKeyConfigured: Boolean(
      readOptional(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY),
    ),
    vapiAssistantConfigured: Boolean(
      readOptional(process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID),
    ),
    trackingKeyConfigured: Boolean(trackingKey),
    internalApiUrlConfigured: Boolean(internalApiUrl),
  };
}
