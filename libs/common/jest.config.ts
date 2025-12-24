import type { Config } from '@jest/types';
import baseConfig from '../../configs/jest.config.base';

const config: Config.InitialOptions = {
  ...baseConfig,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
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
