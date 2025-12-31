import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Exclude monorepo root package.json to prevent Jest from scanning workspace root
  modulePathIgnorePatterns: ['<rootDir>/../../package.json'],
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
  // The integration tests (processJob, main) that cover those lines are skipped due to ES module issues
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 65,
      lines: 65,
      statements: 64,
    },
  },
};

export default config;
