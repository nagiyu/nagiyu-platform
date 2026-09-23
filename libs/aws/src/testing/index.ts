/**
 * DynamoDB Local 契約テスト用ヘルパーのエントリポイント
 *
 * 各サービスの契約テスト（`tests/contract/`）からは `@nagiyu/aws/testing` という
 * specifier で import するが、これは package.json の `exports` には**意図的に載せていない**。
 * 解決するのは各サービスの `jest.contract.config.ts` の `moduleNameMapper` だけであり、
 * 素の Node からは解決できない（本番コードが誤って到達する経路を作らないため）。
 * メインエントリー（`@nagiyu/aws`）からも export しない。
 */

export * from './dynamodb-local.js';
