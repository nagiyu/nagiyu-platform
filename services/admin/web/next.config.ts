import { createNextConfig } from '../../../configs/next.config.base';

export default createNextConfig(__dirname, {
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
});
