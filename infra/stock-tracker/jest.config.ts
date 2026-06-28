import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@nagiyu/infra-common$': '<rootDir>/../common/src/index.ts',
  },
  // ts-jest の型診断: 未解決モジュール(2307)等のみ抑止し、他の型エラーは検出を維持する
  // （@nagiyu/infra-common は moduleNameMapper でランタイム解決。未ビルド時の型解決失敗のみ無視）
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: { ignoreCodes: [2307, 151002] } }],
  },
  collectCoverageFrom: ['lib/**/*.ts', '!lib/**/*.d.ts'],
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
