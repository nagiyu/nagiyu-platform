import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lib', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@nagiyu/stock-tracker-core$': '<rootDir>/../core/src/index.ts',
    '^@nagiyu/aws$': '<rootDir>/../../../libs/aws/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
    '^@nagiyu/browser$': '<rootDir>/../../../libs/browser/src/index.ts',
    '^@nagiyu/ui$': '<rootDir>/../../../libs/ui/src/index.ts',
    '^@nagiyu/react$': '<rootDir>/../../../libs/react/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1', // Remove .js extension for ts-jest
  },
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['lib/repository-factory.ts'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};

export default config;
