import type { Config } from 'jest';
import baseConfig from '../../configs/jest.config.base';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const config: Config = {
  ...baseConfig,
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Exclude E2E tests from Jest (they use Playwright)
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  // Build artifacts exclusion (extends base config's monorepo root exclusion)
  modulePathIgnorePatterns: [...(baseConfig.modulePathIgnorePatterns || []), '<rootDir>/.next/'],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
