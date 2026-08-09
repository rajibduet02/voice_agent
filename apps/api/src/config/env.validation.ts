import { plainToInstance, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import { validatePublicApiUrl } from './public-api-url';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string = 'development';

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number = 4000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsUrl({ require_tld: false })
  FRONTEND_URL!: string;

  @IsString()
  @IsNotEmpty()
  VAPI_WEBHOOK_SECRET!: string;

  /** Backend-only. Required for provisioning scripts, optional at API runtime. */
  @IsOptional()
  @IsString()
  VAPI_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  VAPI_CREDENTIAL_ID?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  VAPI_API_BASE_URL?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsUrl({ require_tld: false })
  PUBLIC_API_URL?: string;

  @IsOptional()
  @IsString()
  VAPI_ASSISTANT_NAME?: string;

  @IsOptional()
  @IsString()
  VAPI_ASSISTANT_ID?: string;

  /** Temporary development-only flags. Defaults false. */
  @IsOptional()
  @IsString()
  ALLOW_INSECURE_PUBLIC_API_URL?: string;

  @IsOptional()
  @IsString()
  ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT?: string;

  @IsOptional()
  @IsString()
  SKIP_PUBLIC_API_PREFLIGHT?: string;

  /** Server-only shared secret for the read-only appointment calendar admin API. */
  @IsOptional()
  @IsString()
  APPOINTMENT_TRACKING_API_KEY?: string;

  /** Minimum minutes from now before a same-day slot may be offered. Default 30. */
  @IsOptional()
  @IsString()
  MINIMUM_BOOKING_LEAD_MINUTES?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  return validated;
}

export type ProvisioningEnv = {
  NODE_ENV: string;
  VAPI_PRIVATE_KEY: string;
  VAPI_API_BASE_URL: string;
  PUBLIC_API_URL: string;
  VAPI_WEBHOOK_SECRET: string;
  VAPI_CREDENTIAL_ID?: string;
  VAPI_ASSISTANT_NAME: string;
  VAPI_ASSISTANT_ID?: string;
  allowInsecurePublicApiUrl: boolean;
  allowInsecureVapiCredentialTransport: boolean;
  skipPublicApiPreflight: boolean;
  insecureDevelopmentMode: boolean;
  publicApiProtocol: 'HTTP' | 'HTTPS';
  warnings: string[];
};

export function validateProvisioningEnv(
  config: Record<string, unknown>,
): ProvisioningEnv {
  const nodeEnv = String(config.NODE_ENV ?? 'development');
  const privateKey = asOptionalString(config.VAPI_PRIVATE_KEY);
  const publicApiUrlRaw = asOptionalString(config.PUBLIC_API_URL);
  const apiBaseUrl =
    asOptionalString(config.VAPI_API_BASE_URL) ?? 'https://api.vapi.ai';
  const assistantName =
    asOptionalString(config.VAPI_ASSISTANT_NAME) ?? 'CarePoint Appointment Assistant';
  const credentialId = asOptionalString(config.VAPI_CREDENTIAL_ID);
  const assistantId = asOptionalString(config.VAPI_ASSISTANT_ID);
  const webhookSecret = asOptionalString(config.VAPI_WEBHOOK_SECRET);
  const allowInsecurePublicApiUrl = asExactTrue(config.ALLOW_INSECURE_PUBLIC_API_URL);
  const allowInsecureVapiCredentialTransport = asExactTrue(
    config.ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT,
  );
  const skipPublicApiPreflight = asExactTrue(config.SKIP_PUBLIC_API_PREFLIGHT);
  const warnings: string[] = [];

  if (!privateKey) {
    throw new Error('VAPI_PRIVATE_KEY is required for Vapi provisioning');
  }
  if (!publicApiUrlRaw) {
    throw new Error('PUBLIC_API_URL is required for Vapi provisioning');
  }
  if (!webhookSecret) {
    throw new Error('VAPI_WEBHOOK_SECRET is required for Vapi provisioning');
  }

  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development';

  if (skipPublicApiPreflight && !isDevelopment) {
    throw new Error('SKIP_PUBLIC_API_PREFLIGHT is only permitted when NODE_ENV=development');
  }

  const validatedUrl = validatePublicApiUrl(publicApiUrlRaw, nodeEnv, {
    allowInsecurePublicApiUrl,
  });

  if (validatedUrl.protocol === 'http:' && credentialId) {
    if (isProduction) {
      throw new Error(
        'Insecure credential transport over HTTP is never allowed in production. Use HTTPS for PUBLIC_API_URL.',
      );
    }
    if (!isDevelopment || !allowInsecureVapiCredentialTransport) {
      throw new Error(
        'PUBLIC_API_URL uses HTTP and VAPI_CREDENTIAL_ID is set. The Vapi Bearer credential would be transmitted without HTTPS. Set ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT=true only for temporary local development, or use an HTTPS PUBLIC_API_URL.',
      );
    }
  }

  if (allowInsecureVapiCredentialTransport && !isDevelopment) {
    throw new Error(
      'ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT is only permitted when NODE_ENV=development',
    );
  }

  if (isProduction && !credentialId) {
    throw new Error('VAPI_CREDENTIAL_ID is required for production Vapi provisioning');
  }

  if (validatedUrl.insecureDevelopmentMode) {
    warnings.push(
      'WARNING: Vapi requests and Bearer authentication will use unencrypted HTTP. Use this configuration only for temporary local development. Configure HTTPS before production deployment.',
    );
  }

  if (skipPublicApiPreflight) {
    warnings.push(
      'WARNING: SKIP_PUBLIC_API_PREFLIGHT=true. Public reachability will not be verified before modifying Vapi resources.',
    );
  }

  return {
    NODE_ENV: nodeEnv,
    VAPI_PRIVATE_KEY: privateKey,
    VAPI_API_BASE_URL: stripTrailingSlash(apiBaseUrl),
    PUBLIC_API_URL: validatedUrl.url,
    VAPI_WEBHOOK_SECRET: webhookSecret,
    VAPI_CREDENTIAL_ID: credentialId,
    VAPI_ASSISTANT_NAME: assistantName,
    VAPI_ASSISTANT_ID: assistantId,
    allowInsecurePublicApiUrl,
    allowInsecureVapiCredentialTransport,
    skipPublicApiPreflight,
    insecureDevelopmentMode: validatedUrl.insecureDevelopmentMode,
    publicApiProtocol: validatedUrl.protocol === 'https:' ? 'HTTPS' : 'HTTP',
    warnings,
  };
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asExactTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
