import type { Config } from 'jest';
import nagiyuLib from '../../../configs/jest/nagiyu-lib.cjs';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  resolver: nagiyuLib.resolver,
  transformIgnorePatterns: nagiyuLib.transformIgnorePatterns,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@nagiyu/admin-core$': '<rootDir>/../core/src/index.ts',
  },
  transform: {
    [nagiyuLib.libsDistPattern]: nagiyuLib.transform[nagiyuLib.libsDistPattern],
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          moduleResolution: 'node',
          esModuleInterop: true,
        },
      },
    ],
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  modulePathIgnorePatterns: ['<rootDir>/../../package.json'],
};

export default config;
