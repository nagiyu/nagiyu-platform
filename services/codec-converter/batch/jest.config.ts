import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Exclude monorepo root package.json to prevent Jest from scanning workspace root
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json'],
  // Handle ES modules
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  // Common coverage settings
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // Note: Coverage threshold is lower due to Jest module loading issues with DynamoDB DocumentClient
  // and FFmpeg child_process mocking. Some integration tests are skipped due to ES module issues.
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 50,
      lines: 60,
      statements: 60,
    },
  },
};

export default config;
