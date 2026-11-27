import type { Config } from 'jest';

/**
 * 契約テスト (tests/contract/) 専用の Jest 設定
 *
 * DynamoDB Local (サービスコンテナ等) への接続を前提とするため、
 * デフォルトの `npm test` (jest.config.ts) とは分離し、`npm run test:contract` からのみ実行する。
 * カバレッジ閾値は契約テストの対象外のため設定しない。
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/contract'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    // `@nagiyu/aws/testing` は exports に載せていないため、パッケージ内の CJS 版を直接指す。
    '^@nagiyu/aws/testing$':
      '<rootDir>/../../../node_modules/@nagiyu/aws/dist/cjs/testing/index.js',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // 未解決モジュール (2307) 等のみ診断を抑止し、他の型エラーは検出を維持する
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: { ignoreCodes: [2307, 151002] } }],
  },
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json'],
};

export default config;
