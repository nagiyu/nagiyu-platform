import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@nagiyu/nextjs$': '<rootDir>/../../../libs/nextjs/src/index.ts',
    '^@nagiyu/nextjs/(.*)$': '<rootDir>/../../../libs/nextjs/src/$1.ts',
    '^@nagiyu/ui$': '<rootDir>/../../../libs/ui/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
    '^@nagiyu/quick-clip-core$': '<rootDir>/../core/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json', '<rootDir>/.next/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  passWithNoTests: true,
};

export default createJestConfig(config);
