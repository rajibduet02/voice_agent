/**
 * Safe browser diagnostics for NEXT_PUBLIC_* configuration.
 * Never returns secret or full key values.
 */

function safeApiHost(apiUrl: string | undefined): string | null {
  const raw = apiUrl?.trim();
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

export function getPublicEnvDebugInfo() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const organizationSlug = process.env.NEXT_PUBLIC_ORGANIZATION_SLUG;
  const vapiPublicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  const vapiAssistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

  const publicKeyTrimmed = vapiPublicKey?.trim() ?? '';
  const assistantIdTrimmed = vapiAssistantId?.trim() ?? '';

  return {
    buildTarget: 'carepoint-web' as const,
    apiUrlConfigured: Boolean(apiUrl?.trim()),
    organizationSlugConfigured: Boolean(organizationSlug?.trim()),
    vapiPublicKeyConfigured: Boolean(publicKeyTrimmed),
    vapiPublicKeyLength: publicKeyTrimmed.length,
    vapiAssistantIdConfigured: Boolean(assistantIdTrimmed),
    vapiAssistantIdLength: assistantIdTrimmed.length,
    assistantIdSuffix:
      assistantIdTrimmed.length >= 6 ? assistantIdTrimmed.slice(-6) : null,
    apiHost: safeApiHost(apiUrl),
    buildEnvironment: process.env.NODE_ENV ?? null,
  };
}
