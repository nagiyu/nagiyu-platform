import { createNextConfig } from '../../../configs/next.config.base';
import { buildRedirects } from './src/lib/redirects';

export default createNextConfig(__dirname, {
  // Keep isomorphic-dompurify (and its jsdom dependency) as native Node.js modules
  // to avoid webpack bundling issues with jsdom's __dirname-based CSS file loading
  serverExternalPackages: ['isomorphic-dompurify'],
  // 撤廃記事の 301 リダイレクト（SEO 整備）
  async redirects() {
    return buildRedirects();
  },
});
