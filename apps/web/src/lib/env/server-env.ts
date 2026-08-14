import 'server-only';

/**
 * Server-only web environment. Never import from Client Components.
 * Values are read at call time so hosting-provider process.env always wins.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function readOptional(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readTrackingKey(): string {
  // Must remain server-only. Never expose via NEXT_PUBLIC_*.
  return readOptional(process.env.APPOINTMENT_TRACKING_API_KEY);
}

function readBackendBaseUrl(): string {
  const internalApiUrl = readOptional(process.env.INTERNAL_API_URL);
  const publicApiUrl = readOptional(process.env.NEXT_PUBLIC_API_URL);
  return stripTrailingSlash(
    internalApiUrl ||
      publicApiUrl ||
      (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000'),
  );
}

export const serverEnv = {
  get appointmentTrackingApiKey() {
    return readTrackingKey();
  },
  /**
   * Prefer INTERNAL_API_URL for server-to-server calls.
   * Fall back to NEXT_PUBLIC_API_URL. Never default to localhost in production.
   */
  get backendBaseUrl() {
    return readBackendBaseUrl();
  },
  get organizationSlug() {
    return (
      readOptional(process.env.NEXT_PUBLIC_ORGANIZATION_SLUG) || 'carepoint-clinic'
    );
  },
} as const;

export function getServerEnvStatus() {
  const trackingKey = readTrackingKey();
  const internalApiUrl = readOptional(process.env.INTERNAL_API_URL);
  const publicApiUrl = readOptional(process.env.NEXT_PUBLIC_API_URL);

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
    trackingKeyLength: trackingKey.length,
    internalApiUrlConfigured: Boolean(internalApiUrl),
    backendUrlConfigured: Boolean(readBackendBaseUrl()),
  };
}

export function safeBackendHost(backendBaseUrl: string): string | null {
  if (!backendBaseUrl) {
    return null;
  }
  try {
    return new URL(backendBaseUrl).hostname;
  } catch {
    return null;
  }
}
