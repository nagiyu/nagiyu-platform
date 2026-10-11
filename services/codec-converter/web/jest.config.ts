import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@nagiyu/nextjs$': '<rootDir>/../../../libs/nextjs/src/index.ts',
    '^@nagiyu/nextjs/(.*)$': '<rootDir>/../../../libs/nextjs/src/$1.ts',
    '^@nagiyu/aws$': '<rootDir>/../../../libs/aws/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
    '^@nagiyu/codec-converter-core$': '<rootDir>/../core/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/tests/unit/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json', '<rootDir>/.next/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/app/api/jobs/route.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default createJestConfig(config);
