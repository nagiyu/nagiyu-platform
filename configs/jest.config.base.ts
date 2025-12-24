import type { Config } from '@jest/types';

const baseConfig: Config.InitialOptions = {
  // Exclude monorepo root from module scanning
  modulePathIgnorePatterns: ['<rootDir>/../../package.json'],
  // Common coverage settings
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};

export default baseConfig;
