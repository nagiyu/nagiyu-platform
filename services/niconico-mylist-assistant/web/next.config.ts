import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../../'), // モノレポルート
  transpilePackages: ['@nagiyu/ui', '@nagiyu/browser', '@nagiyu/common', '@nagiyu/niconico-mylist-assistant-core'],
  experimental: {
    serverActions: {
      allowedOrigins: ['dev-niconico-mylist-assistant.nagiyu.com', 'niconico-mylist-assistant.nagiyu.com', '*.lambda-url.us-east-1.on.aws'],
    },
  },
};

export default nextConfig;
