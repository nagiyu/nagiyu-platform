import { config } from 'dotenv';
import { resolve } from 'path';
import { createPlaywrightConfig } from '../../../configs/playwright.config.base';

config({ path: resolve(__dirname, '.env.test') });

export default createPlaywrightConfig({
  webServerEnv: {
    // 認証ミドルウェアが有効になったことで E2E テスト中に auth へリダイレクトされるのを防ぐため、
    // webServer プロセスへ明示的に渡す。
    SKIP_AUTH_CHECK: 'true',
  },
});
