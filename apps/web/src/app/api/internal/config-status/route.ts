import { NextResponse } from 'next/server';
import { getServerEnvStatus } from '@/lib/env/server-env';

/**
 * Development-only boolean config probe. Never returns secret values.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(getServerEnvStatus(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
