import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Monorepo: include files outside apps/web in the standalone trace.
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default nextConfig;
