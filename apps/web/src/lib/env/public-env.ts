/**
 * Browser-safe environment values.
 * NEXT_PUBLIC_* references MUST stay statically analyzable for Next.js inlining.
 * Do not use process.env[name] or other dynamic lookup.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Build identifier embedded in source to confirm the deployed bundle. */
export const APP_BUILD_TARGET = 'carepoint-web';

export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
  organizationSlug:
    process.env.NEXT_PUBLIC_ORGANIZATION_SLUG ?? 'carepoint-clinic',
  vapiPublicKey: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? '',
  vapiAssistantId: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID ?? '',
};

export function getNormalizedPublicEnv() {
  const apiUrlRaw = publicEnv.apiUrl.trim();
  return {
    apiUrl: apiUrlRaw ? stripTrailingSlash(apiUrlRaw) : '',
    organizationSlug: publicEnv.organizationSlug.trim() || 'carepoint-clinic',
    vapiPublicKey: publicEnv.vapiPublicKey.trim(),
    vapiAssistantId: publicEnv.vapiAssistantId.trim(),
  };
}

export function isVapiConfigured(): boolean {
  const { vapiPublicKey, vapiAssistantId } = getNormalizedPublicEnv();
  return vapiPublicKey.length > 0 && vapiAssistantId.length > 0;
}

export function isPublicApiUrlConfigured(): boolean {
  return getNormalizedPublicEnv().apiUrl.length > 0;
}
