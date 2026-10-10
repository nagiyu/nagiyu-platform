import { createNextConfig } from '../../../configs/next.config.base';

export default createNextConfig(__dirname, {
  experimental: {
    serverActions: {
      allowedOrigins: ['auth.dev.nagiyu.com', 'auth.nagiyu.com', '*.lambda-url.us-east-1.on.aws'],
    },
  },
});
