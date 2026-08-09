import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { VapiResourceState } from './vapi-management.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resolveResourcesPath(repoRoot: string): string {
  return path.join(repoRoot, '.vapi', 'resources.local.json');
}

export function parseResourceState(value: unknown): VapiResourceState | null {
  if (!isRecord(value)) {
    return null;
  }

  const assistantId = value.assistantId;
  const availabilityToolId = value.availabilityToolId;
  const bookingToolId = value.bookingToolId;
  const publicApiUrl = value.publicApiUrl;
  const updatedAt = value.updatedAt;

  if (
    typeof assistantId !== 'string' ||
    typeof availabilityToolId !== 'string' ||
    typeof bookingToolId !== 'string' ||
    typeof publicApiUrl !== 'string' ||
    typeof updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    assistantId,
    availabilityToolId,
    bookingToolId,
    currentDateTimeToolId:
      typeof value.currentDateTimeToolId === 'string' ? value.currentDateTimeToolId : '',
    resolveDateToolId: typeof value.resolveDateToolId === 'string' ? value.resolveDateToolId : '',
    nextAvailabilityToolId:
      typeof value.nextAvailabilityToolId === 'string' ? value.nextAvailabilityToolId : '',
    publicApiUrl,
    updatedAt,
  };
}

export async function loadResourceState(
  repoRoot: string,
): Promise<VapiResourceState | null> {
  try {
    const raw = await readFile(resolveResourcesPath(repoRoot), 'utf8');
    return parseResourceState(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export async function saveResourceState(
  repoRoot: string,
  state: Omit<VapiResourceState, 'updatedAt'> & { updatedAt?: string },
): Promise<VapiResourceState> {
  const payload: VapiResourceState = {
    assistantId: state.assistantId,
    availabilityToolId: state.availabilityToolId,
    bookingToolId: state.bookingToolId,
    currentDateTimeToolId: state.currentDateTimeToolId,
    resolveDateToolId: state.resolveDateToolId,
    nextAvailabilityToolId: state.nextAvailabilityToolId,
    publicApiUrl: state.publicApiUrl,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };

  const filePath = resolveResourcesPath(repoRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}
