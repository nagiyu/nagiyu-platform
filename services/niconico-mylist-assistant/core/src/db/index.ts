/**
 * DynamoDB アクセス層
 *
 * Repository パターンへの移行のため、このモジュールの関数は
 * 内部的にRepositoryを使用するように変更されています。
 *
 * 新しいコードでは、Repository を直接使用することを推奨します。
 */

export * from './client';

// 後方互換性のため、従来の関数をエクスポート
// 内部実装はリポジトリパターンに移行
export * from './videos';
