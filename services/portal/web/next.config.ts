import type { NextConfig } from 'next';
import path from 'path';
import { buildRedirects } from './src/lib/redirects';

const nextConfig: NextConfig = {
  output: 'standalone', // Lambda デプロイ用
  outputFileTracingRoot: path.join(__dirname, '../../../'), // モノレポルート
  // Silence Turbopack warning when using webpack config
  turbopack: {},
  // Transpile workspace packages
  transpilePackages: ['@nagiyu/ui', '@nagiyu/browser', '@nagiyu/common', '@nagiyu/nextjs'],
  // Keep isomorphic-dompurify (and its jsdom dependency) as native Node.js modules
  // to avoid webpack bundling issues with jsdom's __dirname-based CSS file loading
  serverExternalPackages: ['isomorphic-dompurify'],
  // 撤廃記事の 301 リダイレクト（SEO 整備）
  async redirects() {
    return buildRedirects();
  },
};

export default nextConfig;
