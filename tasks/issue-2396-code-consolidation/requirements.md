<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/development/architecture.md に統合して削除します。
-->

# コード共通化調査・対応 要件定義書

---

## 1. ビジネス要件

### 1.1 背景・目的

モノレポ内の複数サービス・ライブラリに、同一または類似のロジックが重複実装されている状態が継続している。重複実装は以下のリスクをもたらす。

- バグ修正・仕様変更時に複数箇所を変更する必要があり、修正漏れが発生しやすい
- コードレビューの負担が増加する
- 共通ライブラリ（`libs/`）の活用が不十分になり、ライブラリ整備の効果が薄れる

本タスクは、重複実装を調査・分類し、共通ライブラリへの切り出しまたは既存共通実装への統合を行う。

### 1.2 対象ユーザー

- **プライマリー**: プラットフォーム開発者（コード品質・保守性の向上が対象）

### 1.3 ビジネスゴール

- 重複コードを削減し、変更容易性を高める
- `libs/` ライブラリの活用度を高め、モノレポのメリットを最大化する
- 依存関係ルール（`ui → browser → common`）を維持しながら共通化を実現する

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: API エラーレスポンス生成の共通化

- **概要**: 複数の API ルートで重複している `createErrorResponse()` 関数を `libs/nextjs` に統合する
- **アクター**: API ルート実装
- **前提条件**: `libs/nextjs/src/error.ts` に `handleApiError()` が存在する
- **正常フロー**:
    1. `libs/nextjs/src/error.ts` に `createErrorResponse()` 関数を追加する
    2. `services/admin/web/src/app/api/notify/subscribe/route.ts` のローカル実装を削除し、ライブラリ版を import する
    3. `services/admin/web/src/app/api/notify/sns/route.ts` のローカル実装を削除し、ライブラリ版を import する
- **代替フロー**: なし
- **例外フロー**: 既存テストが失敗した場合はロールバックして原因を調査する

#### UC-002: Web Push 通知ラッパーの共通化

- **概要**: niconico-mylist-assistant と stock-tracker の batch で重複している `sendNotification()` ラッパーを整理する
- **アクター**: バッチ処理（batch）
- **前提条件**: `libs/common/src/push/client.ts` に `sendWebPushNotification()` が存在する
- **正常フロー**:
    1. 各バッチサービスの `web-push-client.ts` が `libs/common` の `sendWebPushNotification()` を正しく呼び出しているか確認する
    2. VAPID 設定の取得・提供方法を統一する（環境変数ベース）
    3. 重複しているラッパーを削除し、`libs/common` の関数を直接呼び出す形に変更する
- **代替フロー**: サービス固有の差異（subscriber 型の違いなど）がある場合はラッパーを維持する
- **例外フロー**: なし

#### UC-003: ErrorResponse 型の共通化

- **概要**: 各サービスのローカル `interface ErrorResponse` を削除し、`libs/common` の共通型を使用する
- **アクター**: API ルート実装
- **前提条件**: `libs/common/src/api/types.ts` に `ErrorResponse` 型が存在する
- **正常フロー**:
    1. `libs/common/src/api/types.ts` の `ErrorResponse` 型が各サービスの定義と互換性があることを確認する
    2. 各サービスのローカル定義を削除し、`@nagiyu/common` から import する形に変更する
- **代替フロー**: サービス固有のフィールドがある場合は共通型を拡張する形で対応する
- **例外フロー**: なし

#### UC-004: DynamoDB リポジトリ Factory パターンの統一

- **概要**: `libs/aws` の `createRepositoryFactory()` を使用していない admin, stock-tracker を統一する
- **アクター**: サービス実装
- **前提条件**: `libs/aws/src/dynamodb/repository-factory.ts` が存在し、niconico-mylist-assistant と share-together で使用実績がある
- **正常フロー**:
    1. admin の `DynamoDBPushSubscriptionRepository` が `AbstractDynamoDBRepository` を継承していない場合は修正する
    2. admin および stock-tracker の Factory 実装を `createRepositoryFactory()` を使用する形に変更する
- **代替フロー**: サービス固有の要件がある場合はスコープ外とする
- **例外フロー**: なし

### 2.2 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-001 | `createErrorResponse()` の共通化 | `libs/nextjs/src/error.ts` に統合し、重複ローカル実装を削除 | 高 |
| F-002 | Web Push ラッパーの共通化 | batch サービスの `web-push-client.ts` 重複を解消 | 高 |
| F-003 | `ErrorResponse` 型の共通化 | ローカル型定義を `@nagiyu/common` の共通型に置き換え | 中 |
| F-004 | Repository Factory の統一 | `createRepositoryFactory()` を admin・stock-tracker にも適用 | 中 |
| F-005 | DynamoDB 抽象基底クラスの活用確認 | admin の Repository が `AbstractDynamoDBRepository` を継承しているか確認・修正 | 低 |

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| 項目 | 要件 |
| ---- | ---- |
| 応答時間 | リファクタリング前後で性能変化なし |
| スループット | リファクタリング前後で変化なし |

### 3.2 セキュリティ要件

- 共通化したコードに、セキュリティ上の問題（ハードコードされた認証情報など）を含めない
- VAPID キーなどの機密情報は環境変数経由でのみ取得する

### 3.3 可用性要件

- 共通化後も既存のテストがすべてパスすること
- テストカバレッジ 80% 以上を維持すること

### 3.4 保守性・拡張性要件

- 依存関係ルール（`ui → browser → common`）を厳守する
- パスエイリアス（`@/`）はライブラリ内で使用しない
- エラーメッセージは日本語 + `ERROR_MESSAGES` オブジェクトで定数化する

---

## 4. ドメインオブジェクト

| エンティティ | 説明 |
| ----------- | ---- |
| ErrorResponse | API エラーレスポンスの共通型（`error`, `message`, オプション `details`） |
| PushSubscription | Web Push 通知サブスクリプション情報（`endpoint`, `keys`） |
| NotificationPayload | Push 通知のペイロード（`title`, `body`, `url` など） |
| VapidConfig | VAPID 認証設定（`publicKey`, `privateKey`, `subject`） |

---

## 5. スコープ外

- ❌ 新機能の追加（既存機能の共通化のみ）
- ❌ niconico-mylist-assistant の暗号化処理（`utils/crypto.ts`）の共通化（サービス固有）
- ❌ セッション型定義の完全統一（サービスごとにユーザー属性が異なるため）
- ❌ Auth Middleware の全面書き換え（差異が存在し慎重な対応が必要）
- ❌ インフラ構成の変更

---

## 6. 用語集

| 用語 | 定義 |
| ---- | ---- |
| VAPID | Voluntary Application Server Identification。Web Push 通知の認証方式 |
| Repository Factory | `USE_IN_MEMORY_DB` フラグによって InMemory/DynamoDB 実装を切り替えるファクトリパターン |
| AbstractDynamoDBRepository | DynamoDB 操作の共通実装を提供する `libs/aws` の抽象基底クラス |
