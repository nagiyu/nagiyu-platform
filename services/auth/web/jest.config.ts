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
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@nagiyu/auth-core$': '<rootDir>/../core/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
    '^@nagiyu/browser$': '<rootDir>/../../../libs/browser/src/index.ts',
    '^@nagiyu/ui$': '<rootDir>/../../../libs/ui/src/index.ts',
  },
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/unit/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/unit/app/api/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/**/layout.tsx',
    '!src/app/**/page.tsx',
    '!src/app/api/**', // Exclude API routes from coverage for now
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
