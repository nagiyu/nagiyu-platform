import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // Exclude monorepo root package.json from module resolution
  modulePathIgnorePatterns: ['<rootDir>/../../package.json'],
  // Map @nagiyu/common to its source for testing
  moduleNameMapper: {
    '^@nagiyu/common$': '<rootDir>/../common/src/index.ts',
    // Support .js extensions in imports (ES modules)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Transform JSX with ts-jest
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
        },
      },
    ],
  },
  // Setup testing library
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Common coverage settings
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/index.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
