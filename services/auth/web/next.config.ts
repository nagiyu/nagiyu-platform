import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@nagiyu/ui', '@nagiyu/browser', '@nagiyu/common'],
};

export default nextConfig;
