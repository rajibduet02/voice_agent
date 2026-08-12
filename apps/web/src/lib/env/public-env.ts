/**
 * Browser-safe environment values.
 * NEXT_PUBLIC_* references must remain static for Next.js inlining.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

export const publicEnv = {
  apiUrl: rawApiUrl ? stripTrailingSlash(rawApiUrl.trim()) : '',
  organizationSlug:
    (process.env.NEXT_PUBLIC_ORGANIZATION_SLUG ?? 'carepoint-clinic').trim() ||
    'carepoint-clinic',
  vapiPublicKey: (process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? '').trim(),
  vapiAssistantId: (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID ?? '').trim(),
} as const;

export function isVapiConfigured(): boolean {
  return Boolean(publicEnv.vapiPublicKey) && Boolean(publicEnv.vapiAssistantId);
}

export function isPublicApiUrlConfigured(): boolean {
  return Boolean(publicEnv.apiUrl);
}
