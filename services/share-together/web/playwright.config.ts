import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '.env.test') });

process.env.USE_IN_MEMORY_DB ??= 'true';
process.env.SKIP_AUTH_CHECK ??= 'true';
process.env.TEST_USER_ID ??= 'test-user-id';
process.env.TEST_USER_EMAIL ??= 'test@example.com';
process.env.TEST_USER_NAME ??= 'Test User';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
process.env.NEXT_PUBLIC_AUTH_URL ??= 'http://localhost:3001';
process.env.NEXTAUTH_SECRET ??= 'test-secret-key-for-e2e-testing-only';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 2 * 60 * 1000,
  },
});
