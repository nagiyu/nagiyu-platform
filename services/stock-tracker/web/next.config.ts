import { createNextConfig } from '../../../configs/next.config.base';

export default createNextConfig(__dirname, {
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
});
