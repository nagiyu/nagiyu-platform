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

各サービスから直接 `nagiyu-error-events-{env}` テーブルに書き込むための薄い SDK を提供します。Admin はこのテーブルを Streams 経由で監視し、Web Push 通知と一覧表示を行います（詳細は `docs/services/admin/architecture.md` の ADR-003〜006 を参照）。

#### 公開 API

- `ErrorEventWriter` インタフェース（`put(event: ErrorEvent): Promise<void>`）
- `DynamoDBErrorEventWriter` / `InMemoryErrorEventWriter` の 2 実装
- `createErrorEventWriter(docClient?, tableName?)` ファクトリ — 環境変数 `USE_IN_MEMORY_DB=true` で in-memory 実装に切替
- キー構築ヘルパー `buildErrorEventPK` / `buildErrorEventSK` / `computeErrorEventTtl`
- 定数 `ERROR_EVENT_ENTITY_TYPE` / `ERROR_EVENT_GSI1_PK` / `ERROR_EVENT_TTL_DAYS`（180）

#### 使用例

```typescript
import { generateEventId } from '@nagiyu/common';
import { getDynamoDBDocumentClient, createErrorEventWriter } from '@nagiyu/aws';

const writer = createErrorEventWriter(
  getDynamoDBDocumentClient(),
  process.env.ERROR_EVENTS_TABLE_NAME
);

await writer.put({
  eventId: generateEventId(),
  serviceId: 'stock-tracker',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: 'stock-tracker-web-error-rate-prod (ALARM)',
  message: 'Threshold Crossed: 0.6 > 0.05',
  context: rawSnsMessage,
  occurredAt: new Date().toISOString(),
});
```

#### IAM 要件

書き込み元 Lambda には対象テーブルに対する `dynamodb:PutItem` を付与してください。テーブル ARN は `arn:aws:dynamodb:{region}:{account}:table/nagiyu-error-events-{env}` で構成できます。

#### 注意事項

- 同一 `(serviceId, occurredAt, eventId)` の重複書き込みは PK/SK が一致するため上書きされます。`eventId` は `generateEventId()` で都度生成してください。
- TTL は `occurredAt` から 180 日後を Unix epoch 秒で自動計算します（テーブル側の `ttl` 属性で参照）。
- アプリケーションエラーから直接呼ぶ場合、PII の混入を sanitize するのは呼び出し側の責任です。

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
