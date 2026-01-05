import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../../'), // モノレポルート
  transpilePackages: ['@nagiyu/ui', '@nagiyu/browser', '@nagiyu/common'],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'dev-auth.nagiyu.com',
        'auth.nagiyu.com',
        '*.lambda-url.us-east-1.on.aws',
      ],
    },
  },
};

export default nextConfig;
