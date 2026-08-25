/**
 * @nagiyu/aws/testing
 *
 * DynamoDB Local を使った契約テスト（tests/contract/）専用の補助エクスポート。
 * 本番バンドルに混ぜないよう、メインエントリー（`@nagiyu/aws`）からは export しない
 * サブパスエクスポートとして提供する。
 */

export * from './dynamodb-local.js';
