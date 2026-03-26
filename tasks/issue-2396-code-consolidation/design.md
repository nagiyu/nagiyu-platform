# コード共通化調査・対応 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/architecture.md に ADR として抽出し、
    tasks/issue-2396-code-consolidation/ ディレクトリごと削除します。

    入力: tasks/issue-2396-code-consolidation/requirements.md
    次に作成するドキュメント: tasks/issue-2396-code-consolidation/tasks.md
-->

## 調査結果サマリー

### 重複実装の全体像

| カテゴリ | 重複箇所数 | 削減可能行数（概算） | 優先度 |
| -------- | --------- | ------------------ | ------ |
| `createErrorResponse()` 関数 | 2箇所 | 約20行 | 高 |
| Web Push ラッパー（batch）| 2箇所 | 約20行 | 高 |
| ローカル `ErrorResponse` 型定義 | 3箇所以上 | 約15行 | 中 |
| Repository Factory パターン | 2サービス未適用 | 約30行 | 中 |
| `AbstractDynamoDBRepository` 未継承 | 1サービス（admin） | 約20行 | 低 |

---

## F-001: `createErrorResponse()` 関数の共通化

### 現状

以下の2ファイルに、100%同一の `createErrorResponse()` 関数がローカルに定義されている。

- `services/admin/web/src/app/api/notify/subscribe/route.ts`
- `services/admin/web/src/app/api/notify/sns/route.ts`

関数シグネチャ:

```
createErrorResponse(status: number, error: string, message: string): NextResponse
```

### 対応方針

`libs/nextjs/src/error.ts` は既に `handleApiError()` を提供しているが、`createErrorResponse()` は提供していない。
以下の方針で統合する:

- `libs/nextjs/src/error.ts` に `createErrorResponse()` を export 関数として追加する
- 各 API ルートのローカル実装を削除し、`@nagiyu/nextjs` から import する形に変更する

### コンポーネント設計

| モジュール | パス | 変更内容 |
| --------- | ---- | -------- |
| `createErrorResponse` 追加 | `libs/nextjs/src/error.ts` | 関数を export に追加 |
| ローカル実装を削除 | `services/admin/web/src/app/api/notify/subscribe/route.ts` | ローカル関数を削除し import に変更 |
| ローカル実装を削除 | `services/admin/web/src/app/api/notify/sns/route.ts` | ローカル関数を削除し import に変更 |
| `libs/nextjs/src/index.ts` | `libs/nextjs/src/index.ts` | `createErrorResponse` を再 export する（未 export の場合） |

### 依存関係

- `libs/nextjs` は Next.js に依存するため、`libs/common` への追加は不可（Next.js 非依存の `libs/common` に混入させない）
- `services/admin/web` は既に `@nagiyu/nextjs` に依存しているため、追加の依存は発生しない

---

## F-002: Web Push ラッパーの除去

### 現状

`libs/common/src/push/client.ts` に `sendWebPushNotification()` が存在するが、以下の2サービスのバッチに薄いラッパーが重複実装されている。

- `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts`
    - `sendNotification(subscription: PushSubscription, payload: NotificationPayload)`
    - VAPID subject: `mailto:noreply@nagiyu.com`（ハードコード）
    - 呼び出し元: `index.ts` の2箇所（`pushSubscription` 変数を直接渡している）
- `services/stock-tracker/batch/src/lib/web-push-client.ts`
    - `sendNotification(alert: Alert, payload: NotificationPayload)`
    - VAPID subject: `mailto:support@nagiyu.com`（ハードコード）
    - 呼び出し元: `minute.ts`, `hourly.ts` の各1箇所（`alert` 変数を渡している）

### 差異と吸収可否の判断

| 差異の種類 | 内容 | 吸収可否 |
| --------- | ---- | ------- |
| 引数型（niconico-mylist-assistant） | `PushSubscription` を直接渡す → `sendWebPushNotification()` の第1引数と同一型 | ✅ ラッパー不要（そのまま直接呼び出し可） |
| 引数型（stock-tracker） | `Alert` 型を渡す → ラッパー内で `alert.subscription` を取り出している | ✅ 呼び出し元で `alert.subscription` を渡すよう変更すれば不要 |
| VAPID subject の差異 | `noreply@nagiyu.com` vs `support@nagiyu.com` | ✅ `mailto:support@nagiyu.com` にプロジェクト共通でハードコード統一（挙動変更あり・許容済み） |

### 対応方針

- 両サービスともラッパー関数 `sendNotification()` を除去する
- 呼び出し元が `sendWebPushNotification()` を直接呼び出す形に変更する
    - niconico-mylist-assistant の `index.ts`: `sendNotification(pushSubscription, payload)` → `sendWebPushNotification(pushSubscription, payload, vapidConfig)`
    - stock-tracker の `minute.ts`, `hourly.ts`: `sendNotification(alert, payload)` → `sendWebPushNotification(alert.subscription, payload, vapidConfig)`
- VAPID subject は `mailto:support@nagiyu.com` にプロジェクト共通でハードコード統一する（環境変数化しない）
- `web-push-client.ts` にはペイロード生成関数（`createBatchCompletionPayload`, `createTwoFactorAuthRequiredPayload`, `createAlertNotificationPayload`）のみ残す

### コンポーネント設計

| モジュール | パス | 変更内容 |
| --------- | ---- | -------- |
| `sendNotification` 削除 | `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` | `sendNotification()` を削除、ペイロード生成関数のみ残す |
| 呼び出し元変更 | `services/niconico-mylist-assistant/batch/src/index.ts` | `sendWebPushNotification()` を直接呼び出す形に変更 |
| `sendNotification` 削除 | `services/stock-tracker/batch/src/lib/web-push-client.ts` | `sendNotification()` を削除、ペイロード生成関数のみ残す |
| 呼び出し元変更 | `services/stock-tracker/batch/src/minute.ts` | `sendWebPushNotification(alert.subscription, ...)` に変更 |
| 呼び出し元変更 | `services/stock-tracker/batch/src/hourly.ts` | `sendWebPushNotification(alert.subscription, ...)` に変更 |

---

## F-003: `ErrorResponse` 型の共通化

### 現状

`libs/common/src/api/types.ts` に `ErrorResponse` 型が定義されているが、以下のファイルでローカル定義が存在する。

- `services/codec-converter/web/src/app/api/jobs/route.ts`
- `services/niconico-mylist-assistant/web/src/app/api/mylist/register/route.ts`
- その他複数の API ルート

### 対応方針

- ローカル定義を削除し、`@nagiyu/common` から `ErrorResponse` を import する形に変更する
- フィールドに差異がある場合は、共通型を `extends` して拡張する

### コンポーネント設計

| モジュール | パス | 変更内容 |
| --------- | ---- | -------- |
| ローカル型削除 | `services/codec-converter/web/src/app/api/jobs/route.ts` | ローカル interface を削除し import に変更 |
| ローカル型削除 | `services/niconico-mylist-assistant/web/src/app/api/mylist/register/route.ts` | ローカル interface を削除し import に変更 |

---

## F-004: Repository Factory パターンの統一

### 現状

`libs/aws/src/dynamodb/repository-factory.ts` に `createRepositoryFactory()` が存在し、niconico-mylist-assistant と share-together で使用されている。

以下のサービスでは未適用:
- **admin**: `DynamoDBPushSubscriptionRepository` が独立した Factory 実装を持つ
- **stock-tracker**: 複数の DynamoDB リポジトリが存在するが Factory 化されていない可能性がある

### 対応方針

- admin および stock-tracker の Repository Factory 実装を `createRepositoryFactory()` を使用する形に統一する
- `AbstractDynamoDBRepository` を継承していない Repository があれば修正する

### コンポーネント設計

| モジュール | パス | 変更内容 |
| --------- | ---- | -------- |
| Factory 統一 | `services/admin/core/src/repositories/...` | `createRepositoryFactory()` を使用 |
| AbstractRepository 継承確認 | `services/admin/core/src/repositories/...` | `AbstractDynamoDBRepository` 継承 |
| Factory 統一 | `services/stock-tracker/core/src/repositories/...` | `createRepositoryFactory()` を使用 |

---

## 実装上の注意点

### 依存関係・前提条件

- `libs/nextjs` は `libs/common` に依存可能だが、逆は禁止（`ui → browser → common` の依存方向）
- `libs/` 内ではパスエイリアス（`@/`）を使用しない
- Web Push 関連の Node.js 専用 API は `@nagiyu/common/push` サブパスから参照する（ルート index.ts に混入しない）

### セキュリティ考慮事項

- VAPID subject 等の設定値はハードコードしない。環境変数から取得する
- 共通化したコードに機密情報を含めない

### テスト考慮事項

- 共通化後も既存テストがすべてパスすること
- `libs/nextjs` に追加した関数には単体テストを追加する（カバレッジ 80% 以上を維持）

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/architecture.md` に ADR として追記すること：
      共通化の判断基準（どのような場合に `libs/` への切り出しを行うか）を記録する
- [ ] `docs/development/shared-libraries.md` を更新すること：
      追加・変更したライブラリの公開 API と利用方法を追記する
