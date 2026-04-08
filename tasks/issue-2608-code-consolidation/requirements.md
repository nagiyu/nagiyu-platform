<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/development/shared-libraries.md および各サービスの requirements.md に統合して削除します。
-->

# コード共通化（Issue #2608） 要件定義

---

## 1. ビジネス要件

### 1.1 背景・目的

複数のサービス間で同一または類似のロジックが重複して実装されている。
これにより、バグ修正や仕様変更が発生した際に複数箇所の修正が必要となり、保守コストが増大するリスクがある。

本タスクでは重複実装を特定し、`libs/` 配下の共通ライブラリへの集約またはサービス間の統一を行う。

### 1.2 対象ユーザー

- プラットフォーム開発者（内部）

### 1.3 ビジネスゴール

- 重複ロジックを削減し、保守コストを低減する
- 共通ライブラリの活用率を向上させる
- コードの一貫性と品質を向上させる

---

## 2. 機能要件

### 2.1 調査対象の共通化候補

調査の結果、以下の共通化候補を特定した。

#### UC-001: codec-converter/web の AWS クライアント初期化の統一

- **概要**: `services/codec-converter/web/src/app/api/jobs/route.ts` は独自のシングルトンパターンで `DynamoDBClient` / `S3Client` を初期化している。他のサービスは `@nagiyu/aws` の `getAwsClients()` を使用している
- **アクター**: codec-converter/web の API Routes
- **前提条件**: `@nagiyu/aws` の `getAwsClients()` が利用可能
- **正常フロー**:
    1. `@nagiyu/aws` の `getAwsClients()` を使用するように `/api/jobs/route.ts` を修正
    2. 独自のキャッシュロジック（`cachedDocClient`, `cachedS3Client`）を削除
- **影響範囲**: `services/codec-converter/web/src/app/api/jobs/route.ts`

#### UC-002: health route の `version` フィールドを環境変数に統一

- **概要**: `services/stock-tracker/web/app/api/health/route.ts` と `services/auth/web/src/app/api/health/route.ts` は `version: '1.0.0'` をハードコードしている。他のサービスは `process.env.APP_VERSION || '1.0.0'` を使用している
- **アクター**: stock-tracker/web, auth/web の health API
- **正常フロー**:
    1. `version: process.env.APP_VERSION || '1.0.0'` に統一
- **影響範囲**:
    - `services/stock-tracker/web/app/api/health/route.ts`
    - `services/auth/web/src/app/api/health/route.ts`

#### UC-003: DynamoDB リポジトリへの AbstractDynamoDBRepository 適用

- **概要**: `libs/aws` に `AbstractDynamoDBRepository` が存在するが、多くのサービスのリポジトリが独自実装になっている。CRUD の定型処理（create/update/delete/getById）を基底クラスに移譲できる
- **アクター**: stock-tracker/core, niconico-mylist-assistant/core, quick-clip/core, share-together/core の各 DynamoDB リポジトリ
- **対象ファイル（AbstractDynamoDBRepository 未使用）**:
    - `services/stock-tracker/core/src/repositories/dynamodb-ticker.repository.ts`
    - `services/stock-tracker/core/src/repositories/dynamodb-alert.repository.ts`
    - `services/stock-tracker/core/src/repositories/dynamodb-daily-summary.repository.ts`
    - `services/stock-tracker/core/src/repositories/dynamodb-holding.repository.ts`
    - `services/stock-tracker/core/src/repositories/dynamodb-exchange.repository.ts`
    - `services/niconico-mylist-assistant/core/src/repositories/dynamodb-batch-job.repository.ts`
    - `services/niconico-mylist-assistant/core/src/repositories/dynamodb-user-setting.repository.ts`
    - `services/niconico-mylist-assistant/core/src/repositories/dynamodb-video.repository.ts`
    - `services/quick-clip/core/src/repositories/dynamodb-job.repository.ts`
    - `services/quick-clip/core/src/repositories/dynamodb-highlight.repository.ts`
    - `services/share-together/core/src/repositories/group/dynamodb-group-repository.ts`
    - `services/share-together/core/src/repositories/list/dynamodb-list-repository.ts`
    - `services/share-together/core/src/repositories/membership/dynamodb-membership-repository.ts`
    - `services/share-together/core/src/repositories/todo/dynamodb-todo-repository.ts`
    - `services/share-together/core/src/repositories/user/dynamodb-user-repository.ts`
- **備考**:
    - カスタムクエリメソッド（QueryCommand を用いた一覧取得等）は引き続き独自実装を維持する
    - 基底クラスで提供される CRUD 操作（getById, create, update, delete）に限定して移行を検討する
    - 移行の費用対効果を評価してから実施する（費用対効果が低い場合は見送る）

#### UC-004: admin/core の WebPushSender と libs/common/push の統合

- **概要**: `services/admin/core/src/notify/web-push-sender.ts` は独自の `WebPushSender` クラスを実装しているが、`libs/common/src/push/client.ts` にある `sendWebPushNotification` 関数と機能的に重複している
- **アクター**: admin/core の Web Push 通知
- **現状**:
    - `admin/core/web-push-sender.ts`: 複数購読者へのループ処理（`sendAll`）を持つ独自クラス
    - `libs/common/push/client.ts`: 単一購読者への送信関数 `sendWebPushNotification`
- **対応方針**: `libs/common/push/client.ts` の `sendWebPushNotification` を活用するように `admin/core` のロジックを調整するか、`libs/common` に複数購読者へのブロードキャスト関数を追加する
- **影響範囲**: `services/admin/core/src/notify/web-push-sender.ts`

#### UC-005: codec-converter のエラーメッセージを定数化

- **概要**: `services/codec-converter/web/src/app/api/jobs/route.ts` ではエラーメッセージが文字列リテラルで直接埋め込まれている。他のサービスは `ERROR_MESSAGES` オブジェクトで定数化している
- **アクター**: codec-converter/web の API Routes
- **正常フロー**:
    1. `services/codec-converter/web/src/lib/constants/errors.ts`（新規）に `ERROR_MESSAGES` を定義
    2. `/api/jobs/route.ts` 内の文字列リテラルを `ERROR_MESSAGES` の参照に置き換える
- **影響範囲**: `services/codec-converter/web/src/app/api/jobs/route.ts`（および他の API Routes）

### 2.2 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-001 | AWS クライアント統一 | codec-converter/web の AWS クライアント初期化を `@nagiyu/aws` に統一 | 高 |
| F-002 | health route バージョン統一 | stock-tracker/web と auth/web の health route バージョンを環境変数化 | 高 |
| F-003 | DynamoDB リポジトリ統一 | 各サービスの DynamoDB リポジトリへ AbstractDynamoDBRepository を適用（費用対効果を評価して実施） | 低 |
| F-004 | WebPushSender 統合 | admin/core の WebPushSender を libs/common/push を活用する形に統合 | 中 |
| F-005 | codec-converter エラーメッセージ定数化 | codec-converter のエラーメッセージをオブジェクト定数に置き換え | 中 |

### 2.3 スコープ外

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| 項目 | 要件 |
| ---- | ---- |
| 応答時間 | 既存の応答時間を維持する（リファクタリングによる劣化なし） |
| スループット | 変化なし |

### 3.2 セキュリティ要件

- 共通化後も既存の認可チェック・入力バリデーションを維持する

### 3.3 可用性要件

| 項目 | 要件 |
| ---- | ---- |
| 稼働率 | 既存水準を維持（リファクタリングによる低下なし） |

### 3.4 保守性・拡張性要件

- TypeScript strict mode を維持する
- テストカバレッジ 80% 以上を維持する
- ライブラリ依存の一方向性（`ui → browser → common`）を維持する

---

## 4. ドメインオブジェクト

| エンティティ | 説明 |
| ----------- | ---- |
| WebPushSender | Web Push 通知を購読者リストに送信するクラス（admin/core） |
| AbstractDynamoDBRepository | DynamoDB への CRUD 操作を提供する抽象基底クラス（libs/aws） |
| getAwsClients | AWS クライアント（DynamoDB, S3, Batch）を返すファクトリ関数（libs/aws） |

---

## 5. スコープ外

- ❌ 新規機能の追加
- ❌ インフラ構成の変更
- ❌ API インターフェースの変更
- ❌ テストシナリオの大幅な変更

---

## 6. 用語集

| 用語 | 定義 |
| ---- | ---- |
| AbstractDynamoDBRepository | DynamoDB の CRUD 操作の共通実装を提供する抽象基底クラス（`libs/aws/src/dynamodb/abstract-repository.ts`） |
| getAwsClients | DynamoDB / S3 / Batch クライアントをキャッシュ付きで返す関数（`libs/aws/src/clients.ts`） |
| COMMON_ERROR_MESSAGES | 共通エラーメッセージ定数（`libs/common/src/constants/error-messages.ts`） |
| sendWebPushNotification | 単一の Web Push 購読者に通知を送信する関数（`libs/common/src/push/client.ts`） |
