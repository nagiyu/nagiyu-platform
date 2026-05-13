import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '.env.test') });

const isCI = !!process.env.CI;

// CI では本番ビルド済みの output に対して `next start` を使い、HMR / JIT compile /
// React StrictMode の二重発火による flaky を抑止する。
// ローカルでは開発体験のため `next dev` を維持する。
const webServerCommand = isCI ? 'npm run start' : 'npm run dev';

export default defineConfig({
  testDir: './tests/e2e',
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
  },

  projects: [
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
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
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
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 2 * 60 * 1000,
  },
});
