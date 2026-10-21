import type { Config } from 'jest';

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
  moduleNameMapper: {
    // `@nagiyu/aws/testing` は package.json の exports に載せていないため、このマッピングが唯一の解決経路になる
    '^@nagiyu/aws/testing$': '<rootDir>/../../../libs/aws/src/testing/index.ts',
    '^@nagiyu/aws$': '<rootDir>/../../../libs/aws/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
    '^@nagiyu/common/push$': '<rootDir>/../../../libs/common/src/push/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // 未解決モジュール (2307) 等だけ型診断を抑止し、他の型エラーは検出を維持する
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: { ignoreCodes: [2307, 151002] } }],
  },
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json'],
};

export default config;
