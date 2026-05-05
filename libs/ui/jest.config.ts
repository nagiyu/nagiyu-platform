import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // Exclude monorepo root package.json from module resolution
  modulePathIgnorePatterns: ['<rootDir>/../../package.json'],
  // Transform JSX with ts-jest
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
        },
      },
    ],
  },
  // Setup testing library
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Common coverage settings
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // 共通 UI ライブラリは品質要求が高いためデフォルト 80% より厳しめに設定する。
  // 最終目標は branches 85%・functions 90%・lines/statements 90%（spec）。
  // 現状は branches 84.5%・functions 85.1% のため、安全な閾値で段階的に
  // 引き上げる方針。詳細: docs/development/shared-ui-components.md
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 90,
      statements: 90,
    },
  },
};

export default config;
