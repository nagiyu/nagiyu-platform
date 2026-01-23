import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1', // Remove .js extension for ts-jest
  },
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json'],
  // ESM support for ts-jest with nodenext module resolution
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          moduleResolution: 'nodenext',
          module: 'esnext',
        },
      },
    ],
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
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
