import type { Config } from 'jest';

/**
 * 契約テスト（tests/contract/）専用の Jest 設定
 *
 * DynamoDB Local（サービスコンテナ等）への接続を前提とするため、
 * デフォルトの `npm test`（jest.config.ts）とは分離し、`npm run test:contract` からのみ実行する。
 * カバレッジ閾値は契約テストの対象外のため設定しない。
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/contract'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    // `@nagiyu/aws/testing` は package.json の exports に意図的に載せていないため、
    // このマッピングが唯一の解決経路になる（詳細は libs/aws/src/testing/index.ts）。
    '^@nagiyu/aws/testing$': '<rootDir>/../../../libs/aws/src/testing/index.ts',
    '^@nagiyu/aws$': '<rootDir>/../../../libs/aws/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
    // livetalk の CDK スタック（infra/livetalk/lib/dynamodb-stack.ts）が
    // `@nagiyu/infra-common` に依存しているため、ドリフトガードの synth に必要
    // （stock-tracker のスタックは infra-common に依存していないため対応するマッピングが無い）。
    '^@nagiyu/infra-common$': '<rootDir>/../../../infra/common/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1', // Remove .js extension for ts-jest
  },
  // ts-jest の型診断: 未解決モジュール(2307)等のみ抑止し、他の型エラーは検出を維持する
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: { ignoreCodes: [2307, 151002] } }],
  },
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json'],
};

export default config;
