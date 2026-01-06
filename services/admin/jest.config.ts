import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@nagiyu/ui$': '<rootDir>/../../libs/ui/src/index.ts',
    '^@nagiyu/browser$': '<rootDir>/../../libs/browser/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../libs/common/src/index.ts',
  },
  // Exclude E2E tests from Jest (they use Playwright)
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  // Exclude monorepo root and build artifacts from module scanning
  modulePathIgnorePatterns: ['<rootDir>/../../package.json', '<rootDir>/.next/'],
  // Common coverage settings
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/lib/**/*.{ts,tsx}', 'src/types/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // Coverage thresholds (fail if below 80%)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
