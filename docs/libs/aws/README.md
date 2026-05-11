# @nagiyu/aws

## 概要

`@nagiyu/aws` は、AWS SDK を使用する際の共通機能を提供するライブラリです。
AWS SDK依存の処理を抽象化し、サービス間で再利用可能なパターンを提供します。

---

## 設計原則

- **AWS SDK抽象化**: AWS SDKの低レベルAPIを共通パターンで抽象化
- **エラーハンドリング統一**: 日本語エラーメッセージの定数化と階層的エラー設計
- **型安全**: TypeScriptの厳格な型チェック
- **高いテストカバレッジ**: 80%以上を維持

---

## 提供機能

### AWS クライアントファクトリー

リージョン別にキャッシュされた AWS クライアント取得関数を提供します。

- `getDynamoDBDocumentClient()`
- `getS3Client()`
- `getBatchClient()`
- `getAwsClients()`（上記主要クライアントをまとめて取得）
- `clearDynamoDBClientCache()`, `clearS3ClientCache()`, `clearBatchClientCache()`, `clearAwsClientsCache()`

---

### DynamoDB Repository 共通エラークラス

DynamoDBリポジトリで使用する階層的なエラークラスを提供します。

```
Error
  └── RepositoryError (基底クラス)
        ├── EntityNotFoundError
        ├── EntityAlreadyExistsError
        ├── InvalidEntityDataError
        └── DatabaseError
```

---

### ErrorEvent 永続化 SDK（`error-events` モジュール）

プラットフォーム共通のエラーイベントテーブルへ各サービスから直接書き込むための SDK を提供します。設計判断・データフローは `docs/services/admin/architecture.md` の ADR-003〜005 を参照してください。

#### IAM 要件

書き込み元の Lambda 等には共通エラーイベントテーブル ARN への `dynamodb:PutItem` 権限のみを最小限で付与してください（読み取りは Admin のみ）。

#### 設計上の注意

- **TTL は `occurredAt` を起点に SDK 側で自動算出される**ため、呼び出し側で `ttl` 属性を手で詰める必要はありません。保持期間は `ERROR_EVENT_TTL_DAYS` 定数で参照できます。
- **アプリケーション例外を直接記録する経路を実装する場合、PII 等の機密情報を sanitize するのは呼び出し側の責任**です。Phase 1 では呼び出し元が CloudWatch Alarm 由来のみで PII リスクが無いため SDK 側は sanitize を行いません。

---

## 利用方法

### インストール

monorepo内のワークスペースとして利用します。

```json
{
  "dependencies": {
    "@nagiyu/aws": "workspace:*"
  }
}
```

### 使用例

```typescript
import {
  EntityNotFoundError,
  DatabaseError,
} from '@nagiyu/aws';

// エンティティが見つからない場合
throw new EntityNotFoundError('Alert', 'alert-123');
// => Error: エンティティが見つかりません: Alert=alert-123

// データベースエラーが発生した場合
try {
  // DynamoDB操作
} catch (error) {
  throw new DatabaseError('アイテムの取得に失敗しました', error);
}
```

---

## 開発

### ビルド

```bash
npm run build --workspace @nagiyu/aws
```

### テスト

```bash
npm test --workspace @nagiyu/aws
```

### リント・フォーマット

```bash
npm run lint --workspace @nagiyu/aws
npm run format --workspace @nagiyu/aws
```

---

## 依存関係ルール

このライブラリは依存関係階層で `@nagiyu/common` に依存します：

```
libs/ui → libs/browser → libs/common
libs/aws → libs/common
```

- `@nagiyu/aws` は `@nagiyu/common` に依存する
- 他のライブラリは必要に応じて `@nagiyu/aws` に依存可能
- 循環依存は厳格に禁止

---

## 今後の拡張

現在はDynamoDB用のエラークラスのみを提供していますが、今後以下の機能を追加予定：

- S3操作の共通パターン
- Lambda呼び出しヘルパー
- その他AWS SDK抽象化ユーティリティ

新しい機能は、サービスから共通パターンとして抽出された際に追加されます。

---

## 関連ドキュメント

- [共通ライブラリ設計](../../development/shared-libraries.md) - ライブラリ全体の設計方針
- [プラットフォームドキュメント](../../README.md) - プラットフォーム全体のドキュメント
