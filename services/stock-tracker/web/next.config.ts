import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Transpile shared libraries
  transpilePackages: ['@nagiyu/ui', '@nagiyu/browser', '@nagiyu/common', 'stock-tracker-core'],
  // Environment variables
  env: {
    NEXT_PUBLIC_SERVICE_NAME: 'stock-tracker',
  },
};

export default nextConfig;
