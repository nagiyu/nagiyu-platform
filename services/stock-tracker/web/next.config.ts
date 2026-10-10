import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../../'), // モノレポルート
  // Transpile shared libraries
  transpilePackages: [
    '@nagiyu/ui',
    '@nagiyu/browser',
    '@nagiyu/common',
    '@nagiyu/nextjs',
    '@nagiyu/react',
    '@nagiyu/aws',
    '@nagiyu/stock-tracker-core',
  ],
  // 旧予測精度ダッシュボードのブックマークを判断軸の成績へ引き継ぐ
  async redirects() {
    return [
      {
        source: '/prediction-evaluation',
        destination: '/axis-performance',
        permanent: false,
      },
    ];
  },
  // Environment variables
  env: {
    NEXT_PUBLIC_SERVICE_NAME: 'stock-tracker',
  },
};

export default nextConfig;
