import type { Config } from 'jest';
import nagiyuLib from '../../../configs/jest/nagiyu-lib.cjs';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/contract/'],
  moduleFileExtensions: ['ts', 'js'],
  resolver: nagiyuLib.resolver,
  transform: nagiyuLib.transform,
  transformIgnorePatterns: nagiyuLib.transformIgnorePatterns,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
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
