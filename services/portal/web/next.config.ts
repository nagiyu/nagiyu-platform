import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone', // Lambda デプロイ用
  outputFileTracingRoot: path.join(__dirname, '../../'), // モノレポルート
  // Silence Turbopack warning when using webpack config
  turbopack: {},
  // Transpile workspace packages
  transpilePackages: ['@nagiyu/ui', '@nagiyu/browser', '@nagiyu/common', '@nagiyu/nextjs'],
  // Keep isomorphic-dompurify (and its jsdom dependency) as native Node.js modules
  // to avoid webpack bundling issues with jsdom's __dirname-based CSS file loading
  serverExternalPackages: ['isomorphic-dompurify'],
};

export default nextConfig;
