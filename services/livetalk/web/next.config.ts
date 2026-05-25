import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../../'),
  turbopack: {},
  transpilePackages: [
    '@nagiyu/ui',
    '@nagiyu/browser',
    '@nagiyu/common',
    '@nagiyu/nextjs',
    '@nagiyu/livetalk-core',
    '@nagiyu/voicevox-client',
  ],
};

export default nextConfig;
