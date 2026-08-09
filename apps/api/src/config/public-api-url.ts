export type PublicApiUrlValidationOptions = {
  allowInsecurePublicApiUrl: boolean;
};

export type ValidatedPublicApiUrl = {
  url: string;
  protocol: 'http:' | 'https:';
  insecureDevelopmentMode: boolean;
};

const BLOCKED_LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

/**
 * Validates and normalizes PUBLIC_API_URL for Vapi provisioning.
 * HTTPS remains the default. HTTP is allowed only with an explicit development override
 * for a publicly routable hostname/IP.
 */
export function validatePublicApiUrl(
  url: string,
  environment: string,
  options: PublicApiUrlValidationOptions,
): ValidatedPublicApiUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('PUBLIC_API_URL must be a valid absolute URL');
  }

  if (parsed.username || parsed.password) {
    throw new Error('PUBLIC_API_URL must not include username or password credentials');
  }
  if (parsed.search) {
    throw new Error('PUBLIC_API_URL must not include a query string');
  }
  if (parsed.hash) {
    throw new Error('PUBLIC_API_URL must not include a fragment');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('PUBLIC_API_URL must use http: or https:');
  }

  const hostname = parsed.hostname.toLowerCase();
  const isTest = environment === 'test';
  const isDevelopment = environment === 'development';
  const isProduction = environment === 'production';

  if (parsed.protocol === 'https:') {
    return {
      url: normalizePublicApiUrl(parsed),
      protocol: 'https:',
      insecureDevelopmentMode: false,
    };
  }

  // HTTP below this point.
  if (isProduction) {
    throw new Error(
      'PUBLIC_API_URL must be an HTTPS URL in production (HTTP overrides are not allowed)',
    );
  }

  if (isTest) {
    if (isLoopbackHostname(hostname)) {
      return {
        url: normalizePublicApiUrl(parsed),
        protocol: 'http:',
        insecureDevelopmentMode: false,
      };
    }
    throw new Error(
      'PUBLIC_API_URL HTTP URLs in test mode are limited to localhost/loopback addresses',
    );
  }

  // development HTTP path
  if (!options.allowInsecurePublicApiUrl) {
    throw new Error(
      'PUBLIC_API_URL must be an HTTPS URL outside test mode (use a public tunnel in development). To use a temporary public HTTP IP, set ALLOW_INSECURE_PUBLIC_API_URL=true only in development.',
    );
  }

  if (!isDevelopment) {
    throw new Error(
      'ALLOW_INSECURE_PUBLIC_API_URL is only permitted when NODE_ENV=development',
    );
  }

  if (isLoopbackHostname(hostname) || isPrivateIPv4Hostname(hostname)) {
    throw new Error(
      'HTTP PUBLIC_API_URL override requires a publicly routable hostname or IP (localhost and private network addresses are not allowed)',
    );
  }

  return {
    url: normalizePublicApiUrl(parsed),
    protocol: 'http:',
    insecureDevelopmentMode: true,
  };
}

export function normalizePublicApiUrl(parsed: URL): string {
  // Preserve non-default ports (e.g. :4000). URL#origin already does this.
  // Remove trailing slash from pathname-only roots.
  const origin = parsed.origin;
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${origin}${path === '/' ? '' : path}`;
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_LOCAL_HOSTS.has(host)) {
    return true;
  }
  return isIpv4InCidr(host, 127, 0, 0, 0, 8);
}

export function isPrivateIPv4Hostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (isIpv4InCidr(host, 10, 0, 0, 0, 8)) {
    return true;
  }
  if (isIpv4InCidr(host, 172, 16, 0, 0, 12)) {
    return true;
  }
  if (isIpv4InCidr(host, 192, 168, 0, 0, 16)) {
    return true;
  }
  if (isIpv4InCidr(host, 127, 0, 0, 0, 8)) {
    return true;
  }
  if (isIpv4InCidr(host, 169, 254, 0, 0, 16)) {
    return true;
  }
  return false;
}

function isIpv4InCidr(
  hostname: string,
  a: number,
  b: number,
  c: number,
  d: number,
  prefix: number,
): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const ip =
    ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
  const base = ((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0) + (d >>> 0);
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  return (ip & mask) === (base & mask);
}

export type PublicHealthCheckResult = {
  ok: boolean;
  checked: boolean;
  skipped: boolean;
  status?: number;
  message: string;
};

/**
 * GET ${publicApiUrl}/health before mutating Vapi resources.
 */
export async function checkPublicApiReachability(
  publicApiUrl: string,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    skip?: boolean;
  } = {},
): Promise<PublicHealthCheckResult> {
  if (options.skip) {
    return {
      ok: true,
      checked: false,
      skipped: true,
      message: 'Preflight skipped (SKIP_PUBLIC_API_PREFLIGHT=true)',
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 7_000;
  const healthUrl = `${publicApiUrl.replace(/\/+$/, '')}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(healthUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        checked: true,
        skipped: false,
        status: response.status,
        message: `Public health check failed for ${healthUrl} (status ${response.status})`,
      };
    }

    const text = await response.text();
    if (text) {
      try {
        const body = JSON.parse(text) as Record<string, unknown>;
        if (body.database === 'down') {
          return {
            ok: false,
            checked: true,
            skipped: false,
            status: response.status,
            message: `Public health check reported database=down for ${healthUrl}`,
          };
        }
        if (body.status === 'degraded') {
          return {
            ok: false,
            checked: true,
            skipped: false,
            status: response.status,
            message: `Public health check reported degraded status for ${healthUrl}`,
          };
        }
      } catch {
        // Non-JSON 2xx responses are accepted to avoid fragile provisioning.
      }
    }

    return {
      ok: true,
      checked: true,
      skipped: false,
      status: response.status,
      message: `Public health check succeeded for ${healthUrl} (status ${response.status})`,
    };
  } catch (error) {
    const safeMessage =
      error instanceof Error && error.name === 'AbortError'
        ? `timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : 'unknown network error';

    return {
      ok: false,
      checked: true,
      skipped: false,
      message: `Public health check could not reach ${healthUrl}: ${safeMessage}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
