<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/admin/architecture.md に ADR として抽出し、
    tasks/persist-error-notifications/ ディレクトリごと削除します。

    入力: tasks/persist-error-notifications/requirements.md
    次に作成するドキュメント: tasks/persist-error-notifications/tasks.md
-->

# エラー通知の永続化と集約閲覧基盤 - 技術設計

関連 Issue: [#2940](https://github.com/nagiyu/nagiyu-platform/issues/2940)

---

## 0. 全体アーキテクチャ

### 本流（通常のエラー通知）

```
CloudWatch Alarm（Stock Tracker 14個など）
        │ OK→ALARM transition
        ▼
SNS Topic: nagiyu-admin-alarm-{env}（既存、Subscription を付け替え）
        │ Lambda subscription（新規、HTTPS subscription は除去）
        ▼
┌──────────────────────────┐
│ alarm-ingest λ           │
│ - SNS 検証               │
│ - CloudWatch ペイロード   │
│   → ErrorEvent 変換      │
│ - libs/aws/error-events  │
│   経由で PutItem          │
└──────────┬───────────────┘
           │ PutItem
           ▼
┌──────────────────────────┐
│ DynamoDB                 │
│ nagiyu-error-events-{env}│
│ - Streams 有効            │
│ - TTL 180 日              │
│ - PITR 有効               │
└──────────┬───────────────┘
           │ Streams (NEW_IMAGE)
           ▼
┌──────────────────────────┐
│ stream-handler λ         │
│ - INSERT イベントのみ処理 │
│ - 既存 WebPushSender 流用 │
│ - data.url=/errors/{id}  │
│ - 失敗時 → DLQ           │
└──────────┬───────────────┘
           │ Web Push
           ▼
     運用者の端末
```

### 自己監視（新システム自身の障害通知）

```
新システムの CloudWatch Alarm
（alarm-ingest λ / stream-handler λ / DLQ / DynamoDB）
        │
        ▼
SNS Topic: nagiyu-admin-self-monitoring-{env}（新規）
        │ HTTPS subscription（既存 /api/notify/sns を移植）
        ▼
POST /api/notify/sns（Admin Web、永続化なし、Push のみ）
        ▼
     運用者の端末
```

### 読み取り経路

```
Admin Web /errors UI ──► /api/errors（一覧）
                     ──► /api/errors/{eventId}（詳細）
                     ──► services/admin/core ErrorEventReader
                     ──► DynamoDB（読み取りのみ）
```

### 設計のポイント

- **本流と自己監視を別 SNS Topic に分離**。新システムが障害中でも自己監視通知は届く（経路の障害ドメイン分離）
- **書き込みと通知発火を DynamoDB Streams で疎結合化**。書き込みが軽くなり、通知失敗が書き込みに影響しない
- **既存 `/api/notify/sns` は廃止せず、自己監視専用エンドポイントとして再利用**

---

## 1. API 仕様

### 1.1 ベース URL・認証

- ベース URL: Admin Web のドメイン（例: `https://admin.{env}.nagiyu.com`）
- 認証: 既存 NextAuth セッション（Cookie ベース）
- 認可: `errors:read` パーミッション必須

### 1.2 エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
| --- | --- | --- | --- |
| GET | `/api/errors` | エラー一覧取得（フィルタ対応） | 要（`errors:read`） |
| GET | `/api/errors/{eventId}` | エラー詳細取得 | 要（`errors:read`） |

### 1.3 エンドポイント詳細

#### GET /api/errors

**リクエスト**

```typescript
type Query = {
  serviceId?: string;       // 'stock-tracker' などで絞り込み
  from?: string;            // ISO-8601 開始時刻（含む）
  to?: string;              // ISO-8601 終了時刻（含む）
  limit?: number;           // 1〜100、既定 50
  cursor?: string;          // ページング用 LastEvaluatedKey の base64
};
```

**レスポンス（成功 200）**

```typescript
type Response = {
  items: Array<{
    eventId: string;
    serviceId: string;
    source: 'cloudwatch-alarm';
    severity: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    message: string;
    occurredAt: string;     // ISO-8601 UTC
  }>;
  nextCursor: string | null;
};
```

**エラーレスポンス**

| ステータス | エラーコード | 説明 |
| --- | --- | --- |
| 400 | INVALID_REQUEST | クエリパラメータが不正 |
| 401 | UNAUTHORIZED | 未認証 |
| 403 | FORBIDDEN | `errors:read` 権限なし |
| 500 | INTERNAL_ERROR | 内部エラー |

#### GET /api/errors/{eventId}

**レスポンス（成功 200）**

```typescript
type Response = {
  eventId: string;
  serviceId: string;
  source: 'cloudwatch-alarm';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  context: string;          // JSON 文字列（生ペイロード）
  occurredAt: string;
};
```

**エラーレスポンス**

| ステータス | エラーコード | 説明 |
| --- | --- | --- |
| 401 | UNAUTHORIZED | 未認証 |
| 403 | FORBIDDEN | `errors:read` 権限なし |
| 404 | NOT_FOUND | 指定 eventId が存在しない（または TTL 削除済み） |
| 500 | INTERNAL_ERROR | 内部エラー |

---

## 2. データモデル

### 2.1 論理モデル

```typescript
// libs/common/src/error-event/types.ts
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ErrorSource = 'cloudwatch-alarm' | 'application' | 'manual';

export type ErrorEvent = {
  eventId: string;          // ULID
  serviceId: string;        // 'stock-tracker', 'admin', etc.
  source: ErrorSource;
  severity: ErrorSeverity;
  title: string;
  message: string;
  context: string;          // JSON 文字列
  occurredAt: string;       // ISO-8601 UTC
};
```

### 2.2 物理モデル（DynamoDB）

#### テーブル: `nagiyu-error-events-{env}`

| 属性 | 型 | 説明 |
| --- | --- | --- |
| PK | string | `ERROR_EVENT#{serviceId}` |
| SK | string | `OCCURRED#{occurredAt}#{eventId}` |
| Type | string | 固定値 `ErrorEvent` |
| GSI1PK | string | 固定値 `ERROR_EVENT_ALL`（全件時系列クエリ用） |
| GSI1SK | string | `OCCURRED#{occurredAt}#{eventId}` |
| eventId | string | ULID |
| serviceId | string | 例: `stock-tracker` |
| source | string | `cloudwatch-alarm` |
| severity | string | `info` / `warning` / `error` / `critical` |
| title | string | 一覧表示用の見出し |
| message | string | 詳細本文 |
| context | string | JSON 文字列（生ペイロード） |
| occurredAt | string | ISO-8601 UTC |
| ttl | number | unix epoch 秒（occurredAt + 180 日） |

**設定**

- BillingMode: `PAY_PER_REQUEST`
- TTL: `ttl` 属性で有効化（180 日）
- PITR: 有効
- Streams: `NEW_IMAGE`
- RemovalPolicy: prod=`RETAIN`、それ以外=`DESTROY`

#### GSI

| GSI 名 | PK | SK | 用途 |
| --- | --- | --- | --- |
| `AllByOccurredAt` | `GSI1PK` | `GSI1SK` | 全サービス横断の時系列一覧 |

#### アクセスパターン

| 操作 | 設計 |
| --- | --- |
| サービス指定で時系列取得 | メイン: `PK = ERROR_EVENT#{serviceId}`, SK begins_with `OCCURRED#` |
| 全サービス時系列取得 | GSI1: `GSI1PK = ERROR_EVENT_ALL`, GSI1SK begins_with `OCCURRED#` |
| eventId 指定で詳細取得 | GetItem ではなく Query: ただし PK/SK 構造上 eventId だけでは引けないため、`GSI1PK = ERROR_EVENT_ALL` + `GSI1SK contains {eventId}` で 1 件取得（または書き込み時にもう 1 つの GSI を検討） |
| 期間絞り込み | SK の `between` で対応 |

> **eventId 単独検索について**: 詳細ページは Push の URL から `eventId` のみを受け取る。GSI1 の SK 末尾に eventId が入るため、`GSI1SK begins_with` では引けない。実装方針として、**UI で詳細ページに遷移する際は `eventId` と `occurredAt` の両方を URL クエリに渡す**（例: `/errors/{eventId}?at={occurredAt}`）か、**追加 GSI を作成**するかの 2 択。
> Phase 1 では URL に `at` クエリを付加する案で進める（GSI 追加コストを避ける）。Push 通知の `data.url` 生成時に `?at={occurredAt}` を付ければよい。

---

## 3. コンポーネント設計

### 3.1 パッケージ責務分担

| パッケージ | 責務 |
| --- | --- |
| `libs/common/error-event/` | 純粋な型・列挙・ULID ヘルパー（外部依存なし） |
| `libs/aws/error-events/` | DynamoDB 書き込み SDK + in-memory 実装 |
| `services/admin/core/src/errors/` | DynamoDB 読み取り Repository + ビジネスロジック |
| `services/admin/web/` | UI（一覧 / 詳細）+ API Routes |
| `services/admin/batch/`（新規） | `alarm-ingest` λ + `stream-handler` λ |
| `infra/shared/lib/` | `error-events` テーブルの CDK Stack |
| `infra/admin/lib/` | 上記 Lambda の CDK 配備 + IAM 付与 |

### 3.2 実装モジュール一覧

#### libs/common/error-event/

| モジュール | パス | 役割 |
| --- | --- | --- |
| 型定義 | `libs/common/src/error-event/types.ts` | `ErrorEvent` / `ErrorSeverity` / `ErrorSource` |
| ULID 生成 | `libs/common/src/error-event/event-id.ts` | `generateEventId(): string` |
| インデックス | `libs/common/src/error-event/index.ts` | re-export |

#### libs/aws/error-events/

| モジュール | パス | 役割 |
| --- | --- | --- |
| Writer インタフェース | `libs/aws/src/error-events/writer.ts` | `interface ErrorEventWriter` |
| DynamoDB 実装 | `libs/aws/src/error-events/dynamodb-writer.ts` | `class DynamoDBErrorEventWriter extends AbstractDynamoDBRepository` |
| in-memory 実装 | `libs/aws/src/error-events/in-memory-writer.ts` | テスト用 |
| Factory | `libs/aws/src/error-events/factory.ts` | `createErrorEventWriter(...)` |

#### services/admin/core/src/errors/

| モジュール | パス | 役割 |
| --- | --- | --- |
| Reader インタフェース | `services/admin/core/src/errors/reader.ts` | `interface ErrorEventReader` |
| DynamoDB 実装 | `services/admin/core/src/errors/dynamodb-reader.ts` | `list(query)` / `findById(eventId, occurredAt?)` |
| in-memory 実装 | `services/admin/core/src/errors/in-memory-reader.ts` | テスト用 |
| Factory | `services/admin/core/src/errors/factory.ts` | `createErrorEventReader(...)` |

#### services/admin/web/

| モジュール | パス | 役割 |
| --- | --- | --- |
| 一覧ページ | `web/src/app/(protected)/errors/page.tsx` | サーバコンポーネント（初期 50 件 SSR） |
| 詳細ページ | `web/src/app/(protected)/errors/[eventId]/page.tsx` | サーバコンポーネント |
| 一覧 API | `web/src/app/api/errors/route.ts` | GET /api/errors |
| 詳細 API | `web/src/app/api/errors/[eventId]/route.ts` | GET /api/errors/:id |
| 既存 SNS Route | `web/src/app/api/notify/sns/route.ts` | **残置・自己監視専用化**（コメント追記） |
| 既存 Push 送信 | `core/src/notify/web-push-sender.ts` | stream-handler から再利用するため export 維持 |

#### services/admin/batch/（新規）

ディレクトリ構造は `services/stock-tracker/batch/` を踏襲（Dockerfile + src + tests + package.json）。

| モジュール | パス | 役割 |
| --- | --- | --- |
| alarm-ingest ハンドラ | `batch/src/alarm-ingest/handler.ts` | SNS Event → ErrorEventWriter |
| stream-handler ハンドラ | `batch/src/stream-handler/handler.ts` | DynamoDB Stream Event → WebPushSender |
| エントリポイント | `batch/src/index.ts` | Lambda エクスポート |

#### infra/shared/lib/

| モジュール | パス | 役割 |
| --- | --- | --- |
| ErrorEvents テーブル | `infra/shared/lib/error-events-table-stack.ts` | DynamoDB + GSI + Streams + TTL の CDK |

#### infra/admin/lib/

| モジュール | パス | 役割 |
| --- | --- | --- |
| Lambda Stack 拡張 | `infra/admin/lib/lambda-stack.ts` | `alarm-ingest` / `stream-handler` Lambda の追加 + IAM 設定 |
| 自己監視 Alarm | `infra/admin/lib/self-monitoring-alarms-stack.ts`（新規） | 新システムの λ / DLQ / DynamoDB を監視。既存 SNS Topic に通知 |

### 3.3 モジュール間インターフェース

```typescript
// libs/aws/src/error-events/writer.ts
export interface ErrorEventWriter {
  put(event: ErrorEvent): Promise<void>;
}

// services/admin/core/src/errors/reader.ts
export type ListErrorEventsQuery = {
  serviceId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};
export type ListErrorEventsResult = {
  items: ErrorEvent[];
  nextCursor: string | null;
};
export interface ErrorEventReader {
  list(query: ListErrorEventsQuery): Promise<ListErrorEventsResult>;
  findById(eventId: string, occurredAt?: string): Promise<ErrorEvent | null>;
}
```

---

## 4. 自己監視の設計

### 4.1 監視対象（最小セット）

| 対象 | メトリクス | 閾値 |
| --- | --- | --- |
| `alarm-ingest` λ | Errors | 5 分間で 1 件以上 |
| `stream-handler` λ | Errors | 5 分間で 1 件以上 |
| `stream-handler` DLQ | ApproximateNumberOfMessagesVisible | 1 件以上 |
| `error-events` テーブル | SystemErrors / ThrottledRequests | 1 件以上（5 分） |

### 4.2 通知経路

これらのアラームの通知先は **既存の SNS Topic `nagiyu-admin-alarm-{env}`** に接続する。すなわち：

1. CloudWatch Alarm 発火
2. 既存 SNS Topic に発行
3. **既存 HTTPS Subscription（`/api/notify/sns`）が処理**
4. Web Push が運用者へ届く

新システム（`alarm-ingest` / DynamoDB / `stream-handler`）は介さない。これにより、新システムが障害中でも自己監視通知は届く。

### 4.3 SNS Topic の構成

| Topic 名 | 用途 | Subscription |
| --- | --- | --- |
| `nagiyu-admin-alarm-{env}`（既存） | 本流: 各サービスの CloudWatch Alarm を集約 | Lambda（`alarm-ingest`）のみ |
| `nagiyu-admin-self-monitoring-{env}`（新規） | 自己監視: 新システム自身の障害アラーム | HTTPS（`/api/notify/sns`）のみ |

両 Topic は完全に独立。同一 Topic に subscription を混在させると本流通知も自己監視経路に流れて二重通知になるため、**Topic 自体を分離する**。

### 4.4 既存 `/api/notify/sns` の扱い

- **廃止せず残置**し、自己監視 Topic の HTTPS Subscription として再利用
- ファイル冒頭にコメントを追記：「自己監視専用エンドポイント。CloudWatch Alarm 由来の通常エラー通知は alarm-ingest λ 経路に切り替わっている」
- 既存の `nagiyu-admin-alarm-{env}` Topic にあった HTTPS Subscription（このエンドポイント）は CDK で削除し、Lambda Subscription（`alarm-ingest`）に置き換える
- 自己監視 Topic 側に同じエンドポイントを HTTPS Subscription として新規登録する

---

## 5. 実装上の注意点

### 5.1 依存関係・前提条件

- 共通 SDK は既存の `AbstractDynamoDBRepository` パターン（`libs/aws/src/dynamodb/abstract-repository.ts`）を踏襲する
- Repository Factory パターン（`libs/aws/src/dynamodb/repository-factory.ts`）を活用し、in-memory / DynamoDB を環境変数で切り替え可能にする
- `services/admin/batch/` は `services/stock-tracker/batch/` の構造を踏襲（Container Image Lambda）
- TypeScript strict mode、エラーメッセージ日本語 + 定数化、`@/` パスエイリアスをライブラリで使わない、の既存ルールを遵守

### 5.2 パフォーマンス考慮事項

- 一覧クエリは GSI1（`AllByOccurredAt`）を使用し、最大 100 件 / リクエストに制限
- ページングは LastEvaluatedKey を base64 エンコードした cursor で表現
- 詳細取得は URL に `?at={occurredAt}` を必ず付与し、PK/SK 直接アクセスとする（GSI 不要）
- Stream Handler は BatchSize 100、ParallelizationFactor 1 から開始

### 5.3 セキュリティ考慮事項

- `error-events` テーブルへの書き込み IAM 権限は `alarm-ingest` λ のみに付与（`dynamodb:PutItem` のみ）
- 読み取り権限は Admin Web Lambda + `stream-handler` λ に付与
- 一覧 / 詳細 API は NextAuth セッション必須 + `errors:read` パーミッションチェック
- CloudWatch ペイロードに PII がないことを前提とする（Phase 1）。アプリ層レポート時は別途 sanitizer を必須化する旨をコメントで明記

### 5.4 エラーハンドリング

- `alarm-ingest` λ で書き込み失敗 → Lambda 例外で再試行 → 最終的に λ Errors メトリクス → 自己監視発火
- `stream-handler` λ で Push 失敗 → 既存ロジック通り購読破棄 + ログ。λ 自体は成功扱い（部分失敗を許容）
- `stream-handler` λ 全体例外 → DLQ に積まれ、自己監視発火

### 5.5 マイグレーション

- 新システム稼働前のエラー通知履歴は復元しない（割り切り）
- 既存 `adminAlarmTopic`（Stock Tracker から既存接続あり）の HTTPS subscription を解除し、新 Lambda subscription に置き換える CDK 変更が必要
- 自己監視用 Topic は新規作成

---

## 6. docs/ への移行メモ

完了時に以下を `docs/` に反映する：

- [ ] `docs/services/admin/requirements.md` に統合：
  - エラー履歴閲覧 UC（UC-002〜004）
  - 機能 F-001〜F-008
- [ ] `docs/services/admin/external-design.md` に統合：
  - `/errors` 一覧・詳細画面の仕様
  - Push 通知ペイロード仕様
- [ ] `docs/services/admin/architecture.md` に ADR として追記：
  - 専用 `error-events` テーブルを Admin 既存テーブルと分離した理由
  - 各サービスからの直接 PutItem 採用理由（HTTP API 経由を不採用とした根拠）
  - DynamoDB Streams ベースで通知発火を疎結合化した理由
  - 自己監視を既存 Push 経路で行う設計（経路の障害ドメイン分離）
- [ ] `docs/development/database-patterns.md` に追記（必要があれば）：
  - 時系列ログ的な性質のデータでの Single Table Design 適用例
- [ ] `docs/libs/aws/` に新規追加：
  - `error-events` SDK の利用ガイド（将来のアプリ層レポート対応の足場として）
