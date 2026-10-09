import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../../'), // モノレポルート
  transpilePackages: [
    '@nagiyu/ui',
    '@nagiyu/browser',
    '@nagiyu/common',
    '@nagiyu/nextjs',
    '@nagiyu/niconico-mylist-assistant-core',
  ],
  // AI エージェントから起動したときに、このディレクトリへ AGENTS.md と CLAUDE.md を作らせない。エージェント向けの指示はリポジトリ直下に一本化している
  agentRules: false,
  experimental: {
    serverActions: {
      allowedOrigins: [
        'niconico-mylist-assistant.dev.nagiyu.com',
        'niconico-mylist-assistant.nagiyu.com',
        '*.lambda-url.us-east-1.on.aws',
      ],
    },
  },
};

export default nextConfig;
