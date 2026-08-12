import { NextResponse } from 'next/server';

/**
 * Temporary diagnostic endpoint.
 * Returns only boolean presence — never variable values or secrets.
 */
export async function GET() {
  return NextResponse.json(
    {
      runtime: {
        apiUrlConfigured: Boolean(process.env.NEXT_PUBLIC_API_URL?.trim()),
        organizationSlugConfigured: Boolean(
          process.env.NEXT_PUBLIC_ORGANIZATION_SLUG?.trim(),
        ),
        vapiPublicKeyConfigured: Boolean(
          process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY?.trim(),
        ),
        vapiAssistantIdConfigured: Boolean(
          process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID?.trim(),
        ),
        trackingKeyConfigured: Boolean(
          process.env.APPOINTMENT_TRACKING_API_KEY?.trim(),
        ),
        internalApiUrlConfigured: Boolean(process.env.INTERNAL_API_URL?.trim()),
      },
      buildTarget: 'carepoint-web',
      nodeEnv: process.env.NODE_ENV ?? null,
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
