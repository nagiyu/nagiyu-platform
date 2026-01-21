import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../../../'), // モノレポルート
  transpilePackages: ['@nagiyu/ui', '@nagiyu/browser', '@nagiyu/common', '@nagiyu/niconico-mylist-assistant-core'],
};

export default nextConfig;
