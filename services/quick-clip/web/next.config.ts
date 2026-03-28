import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  turbopack: {},
  transpilePackages: ['@nagiyu/ui', '@nagiyu/nextjs', '@nagiyu/quick-clip-core'],
};

export default nextConfig;
