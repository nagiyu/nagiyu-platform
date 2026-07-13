import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

export interface CreatePlaywrightConfigOptions {
  /** テストディレクトリ（デフォルト './tests/e2e'） */
  testDir?: string;
  /** webServer のヘルスチェック URL（デフォルト 'http://localhost:3000'） */
  webServerUrl?: string;
  /** webServer プロセスへ渡す追加環境変数 */
  webServerEnv?: Record<string, string>;
  /** webServer の作業ディレクトリ */
  webServerCwd?: string;
  /** webServer 起動タイムアウト(ms)（デフォルト 2*60*1000） */
  webServerTimeout?: number;
  /** npm workspace 指定（設定時、起動コマンドを `npm run <start|dev> --workspace=<workspace>` にする） */
  workspace?: string;
  /** use.extraHTTPHeaders への追加ヘッダ */
  extraHTTPHeaders?: Record<string, string>;
}

export function createPlaywrightConfig(
  options: CreatePlaywrightConfigOptions = {},
): PlaywrightTestConfig {
  const isCI = !!process.env.CI;
  const {
    testDir = './tests/e2e',
    webServerUrl = 'http://localhost:3000',
    webServerEnv,
    webServerCwd,
    webServerTimeout = 2 * 60 * 1000,
    workspace,
    extraHTTPHeaders,
  } = options;

  // CI では本番ビルド済みの output に対して `next start` を使い、HMR / JIT compile /
  // React StrictMode の二重発火による flaky を抑止する。ローカルは開発体験のため `next dev`。
  const runScript = isCI ? 'start' : 'dev';
  const webServerCommand = workspace
    ? `npm run ${runScript} --workspace=${workspace}`
    : `npm run ${runScript}`;

  return defineConfig({
    testDir,
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: isCI ? 1 : undefined,
    // CI のリソース変動を吸収するため、テスト全体のタイムアウトと expect の auto-retry を延長する。
    timeout: isCI ? 60 * 1000 : 30 * 1000,
    expect: {
      timeout: isCI ? 15 * 1000 : 5 * 1000,
    },
    reporter: [
      ['html', { outputFolder: 'playwright-report' }],
      ['json', { outputFile: 'test-results/results.json' }],
      ['list'],
    ],
    use: {
      baseURL: process.env.BASE_URL || 'http://localhost:3000',
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      actionTimeout: isCI ? 15 * 1000 : 0,
      navigationTimeout: isCI ? 30 * 1000 : 30 * 1000,
      ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}),
    },
    projects: [
      {
        name: 'chromium-desktop',
        use: {
          ...devices['Desktop Chrome'],
          viewport: { width: 1920, height: 1080 },
          deviceScaleFactor: 1,
        },
      },
      {
        name: 'chromium-mobile',
        use: {
          ...devices['Pixel 5'],
          viewport: { width: 393, height: 851 },
          deviceScaleFactor: 2.75,
          serviceWorkers: 'block',
        },
      },
      {
        name: 'webkit-mobile',
        use: {
          ...devices['iPhone 12'],
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
        },
      },
    ].filter((project) => {
      const projectFilter = process.env.PROJECT;
      if (!projectFilter) return true;
      return project.name === projectFilter;
    }),
    webServer: {
      command: webServerCommand,
      url: webServerUrl,
      reuseExistingServer: !isCI,
      timeout: webServerTimeout,
      ...(webServerCwd ? { cwd: webServerCwd } : {}),
      ...(webServerEnv ? { env: webServerEnv } : {}),
    },
  });
}
