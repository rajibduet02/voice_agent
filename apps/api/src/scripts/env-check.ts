/**
 * Safe environment presence check. Never prints secret values.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { getApiEnvPresence } from '../config/env';
import { loadApiEnvFile, resolveRepoRoot } from '../modules/vapi/load-api-env';

function loadWebEnvFile(repoRoot: string): void {
  const envPath = path.join(repoRoot, 'apps', 'web', '.env');
  let content = '';
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function configured(key: string): string {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0 ? 'configured' : 'missing';
}

function assertNoSecretLeak(output: string) {
  const secrets = [
    process.env.VAPI_PRIVATE_KEY,
    process.env.VAPI_WEBHOOK_SECRET,
    process.env.DATABASE_URL,
    process.env.APPOINTMENT_TRACKING_API_KEY,
    process.env.POSTGRES_PASSWORD,
  ].filter((value): value is string => Boolean(value && value.length > 8));

  for (const secret of secrets) {
    if (output.includes(secret)) {
      throw new Error('env:check attempted to print a secret value');
    }
  }
}

function main() {
  const repoRoot = resolveRepoRoot();
  loadApiEnvFile(repoRoot);
  loadWebEnvFile(repoRoot);

  const api = getApiEnvPresence();
  const lines = [
    'API environment',
    '',
    `DATABASE_URL: ${api.DATABASE_URL}`,
    `PUBLIC_API_URL: ${api.PUBLIC_API_URL}`,
    `FRONTEND_URL: ${api.FRONTEND_URL}`,
    `VAPI_PRIVATE_KEY: ${api.VAPI_PRIVATE_KEY}`,
    `VAPI_CREDENTIAL_ID: ${api.VAPI_CREDENTIAL_ID}`,
    `VAPI_WEBHOOK_SECRET: ${api.VAPI_WEBHOOK_SECRET}`,
    `APPOINTMENT_TRACKING_API_KEY: ${api.APPOINTMENT_TRACKING_API_KEY}`,
    `NODE_ENV: ${api.NODE_ENV}`,
    `PORT: ${api.PORT}`,
    '',
    'Web environment',
    '',
    `NEXT_PUBLIC_API_URL: ${configured('NEXT_PUBLIC_API_URL')}`,
    `NEXT_PUBLIC_ORGANIZATION_SLUG: ${configured('NEXT_PUBLIC_ORGANIZATION_SLUG')}`,
    `NEXT_PUBLIC_VAPI_PUBLIC_KEY: ${configured('NEXT_PUBLIC_VAPI_PUBLIC_KEY')}`,
    `NEXT_PUBLIC_VAPI_ASSISTANT_ID: ${configured('NEXT_PUBLIC_VAPI_ASSISTANT_ID')}`,
    `APPOINTMENT_TRACKING_API_KEY: ${configured('APPOINTMENT_TRACKING_API_KEY')}`,
    `INTERNAL_API_URL: ${configured('INTERNAL_API_URL')}`,
    '',
  ];

  const output = lines.join('\n');
  assertNoSecretLeak(output);
  console.log(output);
}

main();
