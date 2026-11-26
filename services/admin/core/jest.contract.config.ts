import type { Config } from 'jest';
import nagiyuLib from '../../../configs/jest/nagiyu-lib.cjs';

/**
 * 契約テスト (tests/contract/) 専用の Jest 設定。
 *
 * DynamoDB Local への接続を前提とするため、通常の `npm test` とは分離し、
 * `npm run test:contract` からのみ実行する。カバレッジ閾値は契約テストの対象外。
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/contract'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  resolver: nagiyuLib.resolver,
  transformIgnorePatterns: nagiyuLib.transformIgnorePatterns,
  moduleNameMapper: {
    // `@nagiyu/aws/testing` は公開版の exports に載っていないため、パッケージ内のファイルを直接指す
    '^@nagiyu/aws/testing$':
      '<rootDir>/../../../node_modules/@nagiyu/aws/dist/src/testing/index.js',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // 未解決モジュール (2307) 等だけ型診断を抑止し、他の型エラーは検出を維持する
  transform: {
    ...nagiyuLib.transform,
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: { ignoreCodes: [2307, 151002] } }],
  },
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json'],
};

export default config;
