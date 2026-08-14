export type CorsSettings = {
  origin: (
    requestOrigin: string | undefined,
    callback: (err: Error | null, allow?: boolean | string) => void,
  ) => void;
  credentials: boolean;
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
 * Normalize FRONTEND_URL for exact origin matching.
 * Never hard-code deployment hostnames here.
 */
export function normalizeFrontendUrl(frontendUrl: string | undefined): string {
  return (frontendUrl ?? '').trim().replace(/\/+$/, '');
}

/**
 * Production: exact FRONTEND_URL only (no wildcard, no *.vercel.app).
 * Development/test: FRONTEND_URL plus local Next.js origins.
 */
export function resolveCorsOrigins(
  nodeEnv: string,
  frontendUrl: string,
): string | string[] {
  const normalized = normalizeFrontendUrl(frontendUrl);
  if (nodeEnv === 'production') {
    return normalized;
  }
  return [
    ...new Set(
      [normalized, 'http://localhost:3000', 'http://127.0.0.1:3000'].filter(
        Boolean,
      ),
    ),
  ];
}

/**
 * Public browser fetch does not use cookies, so credentials stay false.
 * Origin is validated with a callback so disallowed Origins do not receive
 * Access-Control-Allow-Origin (a static string would always emit FRONTEND_URL).
 */
export function buildCorsSettings(
  nodeEnv: string,
  frontendUrl: string,
): CorsSettings {
  const allowed = resolveCorsOrigins(nodeEnv, frontendUrl);

  return {
    origin: (requestOrigin, callback) => {
      // Non-browser clients (curl, server-to-server) may omit Origin.
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      if (typeof allowed === 'string') {
        callback(null, requestOrigin === allowed ? requestOrigin : false);
        return;
      }
      callback(null, allowed.includes(requestOrigin) ? requestOrigin : false);
    },
    credentials: false,
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
