import { readFileSync } from 'fs';
import path from 'path';

/**
 * Loads KEY=VALUE pairs from apps/api/.env into process.env without printing values.
 * Does not override variables already present in the environment.
 */
export function loadApiEnvFile(repoRoot: string): void {
  const envPath = path.join(repoRoot, 'apps', 'api', '.env');
  let content = '';
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
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

export function resolveRepoRoot(fromDir = process.cwd()): string {
  // Works when invoked from repo root or apps/api.
  if (path.basename(fromDir) === 'api' && path.basename(path.dirname(fromDir)) === 'apps') {
    return path.resolve(fromDir, '..', '..');
  }
  return path.resolve(fromDir);
}
