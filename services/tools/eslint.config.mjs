import { defineConfig, globalIgnores } from 'eslint/config';
import webConfig from '../../configs/eslint.config.web.mjs';

export default defineConfig([
  ...webConfig,
  // next-pwa が生成するファイルは lint 対象外
  globalIgnores(['public/sw.js', 'public/workbox-*.js']),
]);
