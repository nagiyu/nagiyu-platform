import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES modules で __dirname を取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local ファイルを読み込む
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

/**
 * Playwright 統合テスト設定
 *
 * 本設定は、ニコニコ動画への実環境アクセスによる統合テストを実行するためのものです。
 * テスト専用アカウントを使用し、セレクタの動作確認とUI変更の早期検知を目的としています。
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // テストディレクトリ
  testDir: './tests/integration',

  // タイムアウト設定
  timeout: 120000, // 2分（ニコニコ動画の応答が遅い場合を考慮）

  // リトライ設定（統合テストではリトライしない）
  retries: 0,

  // 並列実行なし（ニコニコ動画サーバーへの配慮）
  workers: 1,

  // レポーター設定
  reporter: [['list'], ['html', { open: 'never' }]],

  // 共通設定
  use: {
    // ヘッドレスモード（環境変数で制御）
    headless: process.env.HEADLESS !== 'false',

    // スクリーンショット（失敗時のみ）
    screenshot: 'only-on-failure',

    // ビデオ録画（失敗時のみ）
    video: 'retain-on-failure',

    // トレース（失敗時のみ）
    trace: 'retain-on-failure',

    // タイムアウト設定
    actionTimeout: 30000, // 30秒
    navigationTimeout: 30000, // 30秒
  },

  // プロジェクト設定（Chromium のみ）
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // ブラウザコンテキスト設定
        viewport: { width: 1920, height: 1080 },
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
      },
    },
  ],

  // テスト結果の出力先
  outputDir: 'test-results',
});
