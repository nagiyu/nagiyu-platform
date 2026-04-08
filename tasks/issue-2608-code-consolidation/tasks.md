<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2608-code-consolidation/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2608-code-consolidation/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2608-code-consolidation/design.md — 設計方針・コンポーネント設計
-->

# コード共通化（Issue #2608） - 実装タスク

## Phase 1: 即時対応（高優先度・低リスク）

<!-- バグ修正レベルの単純な統一作業 -->

- [ ] T001: `codec-converter/web/src/app/api/jobs/route.ts` の AWS クライアント初期化を `@nagiyu/aws` の `getAwsClients()` に置き換える（依存: なし）
    - 独自のキャッシュ変数（`cachedDocClient`, `cachedS3Client`）とローカルの `getAwsClients()` 関数を削除
    - `@aws-sdk/client-dynamodb`、`@aws-sdk/lib-dynamodb`、`@aws-sdk/client-s3` の直接 import を削除
    - `@nagiyu/aws` の `getAwsClients()` を import して使用
    - `codec-converter/web/package.json` に `@nagiyu/aws` が追加済みか確認し、未追加であれば追加

- [ ] T002: `stock-tracker/web/app/api/health/route.ts` のバージョンを `process.env.APP_VERSION || '1.0.0'` に変更（依存: なし）

- [ ] T003: `auth/web/src/app/api/health/route.ts` のバージョンを `process.env.APP_VERSION || '1.0.0'` に変更（依存: なし）

## Phase 2: エラーメッセージ定数化（中優先度）

<!-- コーディング規約への準拠 -->

- [ ] T004: `services/codec-converter/web/src/lib/constants/errors.ts` を新規作成し、`ERROR_MESSAGES` オブジェクトを定義する（依存: なし）
    - 対象メッセージ: `'必須フィールドが不足しています'`, `'無効なコーデックが指定されました'`, `'ジョブの作成に失敗しました'`

- [ ] T005: `codec-converter/web/src/app/api/jobs/route.ts` 内の文字列リテラルのエラーメッセージを `ERROR_MESSAGES` の参照に置き換える（依存: T004）

- [ ] T006: `codec-converter/web/src/app/api/jobs/[jobId]/route.ts` および `[jobId]/submit/route.ts` にエラーメッセージの文字列リテラルがないか確認し、あれば T004 で定義した定数に置き換える（依存: T004）

## Phase 3: WebPushSender の統合（中優先度）

<!-- libs/common の共通実装を活用 -->

- [ ] T007: `services/admin/core/src/notify/web-push-sender.ts` の `WebPushSender.sendAll()` 内部実装を `libs/common/src/push/client.ts` の `sendWebPushNotification` を活用する形にリファクタリングする（依存: なし）
    - **前提条件の確認が必要**: `sendWebPushNotification` の戻り値セマンティクスを確認すること（`false` が 404/410 エラーを意味するか、その場合の購読解除の責務が呼び出し元にあるか）
    - 購読解除処理（`deleteByEndpoint`）は引き続き `admin/core` 側で行う
    - 既存のテスト（`web-push-sender.test.ts`）が引き続き通ることを確認

## Phase 4: DynamoDB リポジトリの段階的移行（低優先度）

<!-- 新規追加分から AbstractDynamoDBRepository を適用 -->

- [ ] T008: 移行の費用対効果の評価
    - 各リポジトリの CRUD メソッドの実装を `AbstractDynamoDBRepository` が提供するものと比較し、移行によって削減できるコード量を見積もる
    - 特に `update()` メソッドのシグネチャ（`Partial<TEntity>` vs `UpdateXxxInput`）の整合性を確認
    - 費用対効果が高いリポジトリから優先的に移行対象とする

- [ ] T009: `services/stock-tracker/core` の DynamoDB リポジトリへの `AbstractDynamoDBRepository` 適用（依存: T008、優先度評価後に実施）
    - 対象: `dynamodb-ticker.repository.ts`, `dynamodb-alert.repository.ts`, `dynamodb-holding.repository.ts`, `dynamodb-exchange.repository.ts`, `dynamodb-daily-summary.repository.ts`

- [ ] T010: `services/niconico-mylist-assistant/core` の DynamoDB リポジトリへの `AbstractDynamoDBRepository` 適用（依存: T008、優先度評価後に実施）
    - 対象: `dynamodb-batch-job.repository.ts`, `dynamodb-user-setting.repository.ts`, `dynamodb-video.repository.ts`

- [ ] T011: `services/quick-clip/core` の DynamoDB リポジトリへの `AbstractDynamoDBRepository` 適用（依存: T008、優先度評価後に実施）
    - 対象: `dynamodb-job.repository.ts`, `dynamodb-highlight.repository.ts`

- [ ] T012: `services/share-together/core` の DynamoDB リポジトリへの `AbstractDynamoDBRepository` 適用（依存: T008、優先度評価後に実施）
    - 対象: `dynamodb-group-repository.ts`, `dynamodb-list-repository.ts`, `dynamodb-membership-repository.ts`, `dynamodb-todo-repository.ts`, `dynamodb-user-repository.ts`

## Phase 5: ドキュメント更新

- [ ] T013: `docs/development/shared-libraries.md` に ADR を追記する（依存: Phase 1〜3 完了後）
    - `getAwsClients()` の全サービスでの統一使用を決定
    - 新規 DynamoDB リポジトリは `AbstractDynamoDBRepository` を使用すること

- [ ] T014: `tasks/issue-2608-code-consolidation/` ディレクトリを削除する（依存: T013）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] 各サービスのテストカバレッジ 80% 以上を維持している
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/development/shared-libraries.md` を更新した
- [ ] `tasks/issue-2608-code-consolidation/` ディレクトリを削除した
