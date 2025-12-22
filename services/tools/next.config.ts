import type { NextConfig } from 'next';
import withPWA from 'next-pwa';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone', // Lambda デプロイ用
  outputFileTracingRoot: path.join(__dirname, '../../'), // モノレポルート
  // Silence Turbopack warning when using webpack config
  turbopack: {},
};

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
})(nextConfig);
