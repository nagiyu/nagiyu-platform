import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@nagiyu/share-together-core$': '<rootDir>/../core/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
    '^@nagiyu/aws$': '<rootDir>/../../../libs/aws/src/index.ts',
    '^@nagiyu/browser$': '<rootDir>/../../../libs/browser/src/index.ts',
    '^@nagiyu/nextjs$': '<rootDir>/../../../libs/nextjs/src/index.ts',
    '^@nagiyu/nextjs/(.*)$': '<rootDir>/../../../libs/nextjs/src/$1.ts',
    '^@nagiyu/ui$': '<rootDir>/../../../libs/ui/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json'],
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

export default config;
