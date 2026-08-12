import type { NextConfig } from 'next';
import path from 'path';

// Safe build-time presence check for Vercel BUILD LOGS only (never values).
console.log('[CarePoint Web Build Env]', {
  NEXT_PUBLIC_API_URL: Boolean(process.env.NEXT_PUBLIC_API_URL),
  NEXT_PUBLIC_ORGANIZATION_SLUG: Boolean(process.env.NEXT_PUBLIC_ORGANIZATION_SLUG),
  NEXT_PUBLIC_VAPI_PUBLIC_KEY: Boolean(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY),
  NEXT_PUBLIC_VAPI_ASSISTANT_ID: Boolean(process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID),
  NODE_ENV: process.env.NODE_ENV ?? null,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Monorepo: include files outside apps/web in the standalone trace.
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default nextConfig;
