<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/persist-error-notifications/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/persist-error-notifications/requirements.md — 受け入れ条件・ユースケース
    - tasks/persist-error-notifications/design.md — API 仕様・データモデル・コンポーネント設計
-->

# エラー通知の永続化と集約閲覧基盤 - 実装タスク

関連 Issue: [#2940](https://github.com/nagiyu/nagiyu-platform/issues/2940)

---

## Phase 1: 共通基盤（型・SDK）

`libs/` 配下を整える。サービス側に依存がないため最初に着手する。

- [ ] `libs/common/src/error-event/types.ts` に `ErrorEvent` / `ErrorSeverity` / `ErrorSource` を定義（依存: なし）
- [ ] `libs/common/src/error-event/event-id.ts` に ULID 生成ヘルパー（依存: なし）
- [ ] `libs/common/src/error-event/index.ts` で re-export（依存: 上記）
- [ ] `libs/common/src/index.ts` に `error-event` を export 追加
- [ ] `libs/aws/src/error-events/writer.ts` に `ErrorEventWriter` インタフェース定義（依存: libs/common）
- [ ] `libs/aws/src/error-events/dynamodb-writer.ts` で `AbstractDynamoDBRepository` を継承した DynamoDB 実装（依存: 上記）
- [ ] `libs/aws/src/error-events/in-memory-writer.ts` で in-memory 実装（依存: 上記）
- [ ] `libs/aws/src/error-events/factory.ts` で Repository Factory パターンの利用（依存: 上記）
- [ ] `libs/aws/src/index.ts` に export 追加
- [ ] 単体テスト: `libs/common/tests/unit/error-event/*.test.ts`（依存: 共通基盤完了）
- [ ] 単体テスト: `libs/aws/tests/unit/error-events/*.test.ts`（依存: 共通基盤完了）

## Phase 2: インフラ（DynamoDB テーブル）

CDK で error-events テーブルを定義する。Lambda がこれに依存するため早めに整える。

- [ ] `infra/shared/lib/error-events-table-stack.ts` を新規作成（依存: なし）
  - PK / SK 定義
  - GSI `AllByOccurredAt` 定義
  - Streams `NEW_IMAGE` 有効化
  - TTL 属性 `ttl` 設定
  - PITR 有効
  - prod は `RemovalPolicy.RETAIN`
- [ ] `infra/shared/bin/` のエントリポイントに新 Stack を追加（依存: 上記）
- [ ] CDK synth が通ることを確認

## Phase 3: Admin Core（読み取り Repository）

Admin Web から読み取るための Repository を実装する。

- [ ] `services/admin/core/src/errors/reader.ts` に `ErrorEventReader` インタフェース定義（依存: libs/common）
- [ ] `services/admin/core/src/errors/dynamodb-reader.ts` で DynamoDB 実装（依存: 上記）
  - `list(query)` でメインテーブル / GSI1 を切り替え
  - `findById(eventId, occurredAt?)` で `at` クエリ必須化
  - cursor は `LastEvaluatedKey` を base64 エンコード
- [ ] `services/admin/core/src/errors/in-memory-reader.ts` で in-memory 実装（依存: 上記）
- [ ] `services/admin/core/src/errors/factory.ts` で Factory（依存: 上記）
- [ ] `services/admin/core/src/index.ts` に export 追加
- [ ] 単体テスト: `services/admin/core/tests/unit/errors/*.test.ts`（依存: 上記）

## Phase 4: Admin Batch（Lambda 実装）

新規 `services/admin/batch/` パッケージを作成し、2 つの Lambda を実装する。

- [ ] `services/admin/batch/` を新規作成（`services/stock-tracker/batch/` を参考に）
  - `package.json` / `tsconfig.json` / `Dockerfile` / `jest.config.ts` / `eslint.config.mjs`
  - 依存: なし
- [ ] `services/admin/batch/src/alarm-ingest/handler.ts` を実装（依存: Phase 1 完了）
  - SNS Event 受信
  - SNS 署名検証（既存 `validateSnsMessage` 流用）
  - SubscriptionConfirmation 処理
  - Notification の場合: パース → ErrorEvent 生成 → `ErrorEventWriter.put`
- [ ] `services/admin/batch/src/stream-handler/handler.ts` を実装（依存: Phase 1 + admin/core）
  - DynamoDB Stream Event 受信
  - INSERT イベントのみ処理（MODIFY / REMOVE は無視）
  - NewImage を `ErrorEvent` にデコード
  - 既存 `WebPushSender.sendAll(payload)` を呼ぶ
  - `data.url = '/errors/{eventId}?at={occurredAt}'`
  - `tag = eventId`
- [ ] 単体テスト: `services/admin/batch/tests/unit/**`（依存: 上記）

## Phase 5: Admin Web（API Routes + UI）

ユーザー向け面を実装する。

- [ ] `services/admin/web/src/app/api/errors/route.ts` の GET ハンドラ実装（依存: Phase 3）
  - クエリバリデーション
  - セッション + `errors:read` 認可
  - `ErrorEventReader.list(query)` 呼び出し
  - エラーレスポンスは既存 `createErrorResponse` 流用
- [ ] `services/admin/web/src/app/api/errors/[eventId]/route.ts` の GET ハンドラ実装（依存: 上記）
- [ ] `services/admin/web/src/app/(protected)/errors/page.tsx` 一覧 UI 実装（MUI Table）
- [ ] `services/admin/web/src/app/(protected)/errors/[eventId]/page.tsx` 詳細 UI 実装
- [ ] `services/admin/web/src/app/(protected)/layout.tsx` のナビに「エラー履歴」追加
- [ ] `libs/common` または admin の `permissions` 定義に `errors:read` を追加
- [ ] 既存 `services/admin/web/src/app/api/notify/sns/route.ts` のファイル冒頭に「自己監視専用」コメントを追加
- [ ] 単体テスト: `services/admin/web/tests/unit/**`（依存: 上記）
- [ ] E2E テスト: 一覧表示の最小ケース（依存: 全実装完了）

## Phase 6: インフラ統合（Lambda 配備 + 自己監視）

Lambda の CDK 配備と自己監視 Topic / Alarm を整える。

- [ ] `infra/admin/lib/lambda-stack.ts` に `alarm-ingest` Lambda を追加（依存: Phase 4）
  - error-events テーブルへの `dynamodb:PutItem` IAM 付与
  - SNS Topic との Lambda Subscription
- [ ] `infra/admin/lib/lambda-stack.ts` に `stream-handler` Lambda を追加（依存: Phase 4）
  - error-events Streams との Event Source Mapping
  - SQS DLQ 構成
  - admin の購読テーブルへの読み取り権限
- [ ] `infra/admin/lib/sns-stack.ts` を改修（依存: なし）
  - 自己監視用 SNS Topic `nagiyu-admin-self-monitoring-{env}` を新規作成
  - 既存 `/api/notify/sns` の HTTPS subscription を新 Topic に付け替え
- [ ] Stock Tracker 側 CDK で `adminAlarmTopicArn` を本流 Topic（変更なし）に維持しつつ、HTTPS subscription を本流から外す
- [ ] `infra/admin/lib/self-monitoring-alarms-stack.ts` を新規作成（依存: 上記）
  - `alarm-ingest` λ Errors アラーム
  - `stream-handler` λ Errors アラーム
  - DLQ ApproximateNumberOfMessagesVisible アラーム
  - error-events テーブル SystemErrors / ThrottledRequests アラーム
  - 通知先は自己監視 Topic
- [ ] CDK synth / deploy を dev で確認

## Phase 7: 動作確認 + ドキュメント反映

- [ ] dev 環境で実機確認
  - 手動で SNS Publish → DynamoDB に書き込まれる
  - Push が届く / タップで `/errors/{id}` に遷移
  - 一覧フィルタが期待通り動作
  - 自己監視（Lambda エラー注入で発火するか）
- [ ] `docs/services/admin/requirements.md` 更新（design.md の docs 移行メモ参照）
- [ ] `docs/services/admin/external-design.md` 更新
- [ ] `docs/services/admin/architecture.md` に ADR 追記
- [ ] `docs/libs/aws/` に SDK 利用ガイド追加
- [ ] `tasks/persist-error-notifications/` ディレクトリを削除

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`libs/common`, `libs/aws`, `services/admin/core`, `services/admin/batch`）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/admin/` の該当ファイルを更新した
- [ ] `tasks/persist-error-notifications/` ディレクトリを削除した
