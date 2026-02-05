import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Exclude integration tests (Playwright tests use .spec.ts)
  testPathIgnorePatterns: ['/node_modules/', '/tests/integration/'],
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
  // Note: Coverage threshold is not set for batch packages in Fast CI
  // as per testing strategy (batch is validated via integration tests)
};

export default config;
