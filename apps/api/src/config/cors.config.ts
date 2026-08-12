export type CorsSettings = {
  origin: string | string[];
  credentials: true;
  methods: string[];
  allowedHeaders: string[];
};

const DEFAULT_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;

const DEFAULT_HEADERS = ['Content-Type', 'Authorization'] as const;

/**
 * Production: exact FRONTEND_URL only (no wildcard).
 * Development/test: FRONTEND_URL plus local Next.js origins.
 */
export function resolveCorsOrigins(
  nodeEnv: string,
  frontendUrl: string,
): string | string[] {
  const normalized = frontendUrl.replace(/\/+$/, '');
  if (nodeEnv === 'production') {
    return normalized;
  }
  return [
    ...new Set([
      normalized,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]),
  ];
}

export function buildCorsSettings(
  nodeEnv: string,
  frontendUrl: string,
): CorsSettings {
  return {
    origin: resolveCorsOrigins(nodeEnv, frontendUrl),
    credentials: true,
    methods: [...DEFAULT_METHODS],
    allowedHeaders: [...DEFAULT_HEADERS],
  };
}

export function isOriginAllowed(
  nodeEnv: string,
  frontendUrl: string,
  requestOrigin: string | undefined,
): boolean {
  if (!requestOrigin) {
    return true;
  }
  const allowed = resolveCorsOrigins(nodeEnv, frontendUrl);
  if (typeof allowed === 'string') {
    return allowed === requestOrigin;
  }
  return allowed.includes(requestOrigin);
}
