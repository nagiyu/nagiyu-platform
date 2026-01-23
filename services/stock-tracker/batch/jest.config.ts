import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    // Strip .js extension and let ts-jest find the .ts file
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@nagiyu/stock-tracker-core$': '<rootDir>/../core/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          moduleResolution: 'nodenext',
          esModuleInterop: true,
        },
      },
    ],
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  // カバレッジ閾値はPhase 3で有効化
  // coverageThreshold: {
  //     global: {
  //         branches: 80,
  //         functions: 80,
  //         lines: 80,
  //         statements: 80,
  //     },
  // },
  modulePathIgnorePatterns: ['<rootDir>/../../package.json'],
};

export default config;
