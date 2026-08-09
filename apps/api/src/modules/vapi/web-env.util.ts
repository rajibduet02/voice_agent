import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const ASSISTANT_ID_KEY = 'NEXT_PUBLIC_VAPI_ASSISTANT_ID';

/**
 * Safely upserts only NEXT_PUBLIC_VAPI_ASSISTANT_ID in apps/web/.env.local.
 * Never writes private keys or unrelated secrets.
 */
export async function writeWebAssistantId(
  repoRoot: string,
  assistantId: string,
): Promise<string> {
  const envPath = path.join(repoRoot, 'apps', 'web', '.env.local');
  let existing = '';
  try {
    existing = await readFile(envPath, 'utf8');
  } catch {
    existing = '';
  }

  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  let found = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(`${ASSISTANT_ID_KEY}=`)) {
      found = true;
      return `${ASSISTANT_ID_KEY}=${assistantId}`;
    }
    return line;
  });

  if (!found) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('');
    }
    nextLines.push(`${ASSISTANT_ID_KEY}=${assistantId}`);
  }

  // Preserve trailing newline style without wiping blank final line intentionally.
  const content = `${nextLines.join('\n').replace(/\n+$/, '')}\n`;
  await mkdir(path.dirname(envPath), { recursive: true });
  await writeFile(envPath, content, 'utf8');
  return envPath;
}
