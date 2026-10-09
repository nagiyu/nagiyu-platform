import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone', // Lambda デプロイ用
  outputFileTracingRoot: path.join(__dirname, '../../../'), // モノレポルート
  // Silence Turbopack warning when using webpack config
  turbopack: {},
  // Transpile workspace packages
  transpilePackages: ['@nagiyu/ui', '@nagiyu/browser', '@nagiyu/common', '@nagiyu/nextjs'],
  // AI エージェントから起動したときに、このディレクトリへ AGENTS.md と CLAUDE.md を作らせない。エージェント向けの指示はリポジトリ直下に一本化している
  agentRules: false,
  async headers() {
    return [
      {
        source: '/sw-push.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
