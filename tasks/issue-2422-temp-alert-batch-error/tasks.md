# 一時アラート削除バッチ エラー修正 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2422-temp-alert-batch-error/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2422-temp-alert-batch-error/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2422-temp-alert-batch-error/design.md — 原因分析・修正方針
-->

## Phase 1: 原因確認

- [ ] T001: `abstract-repository.ts` の `instanceof ConditionalCheckFailedException` が
  すでに `error.name` 比較を併用していることを確認し、修正パターンの妥当性を検証する
  （依存: なし）
- [ ] T002: `DynamoDBAlertRepository.getByFrequency` / `getByUserId` の
  per-item catch ブロックで `instanceof InvalidEntityDataError` が失敗することを
  ユニットテストで再現する（依存: なし）

## Phase 2: 修正実装

- [ ] T003: `services/stock-tracker/core/src/repositories/dynamodb-alert.repository.ts`
  の `getByUserId` 内 per-item catch の `instanceof InvalidEntityDataError` を
  `error instanceof Error && error.name === 'InvalidEntityDataError'` に変更する
  （依存: T001）
- [ ] T004: `services/stock-tracker/core/src/repositories/dynamodb-alert.repository.ts`
  の `getByFrequency` 内 per-item catch の `instanceof InvalidEntityDataError` を
  `error instanceof Error && error.name === 'InvalidEntityDataError'` に変更する
  （依存: T001）
- [ ] T005: `libs/aws/src/dynamodb/abstract-repository.ts` の
  `instanceof InvalidEntityDataError` 箇所（getById 相当と update 相当）を
  `error instanceof Error && error.name === 'InvalidEntityDataError'` に変更する
  （依存: T001、並列実行可能）

## Phase 3: テスト追加・更新

- [ ] T006: `services/stock-tracker/core` の `DynamoDBAlertRepository` テスト
  （`tests/unit/repositories/dynamodb-alert.repository.test.ts` 等）に
  `getByFrequency` / `getByUserId` が `InvalidEntityDataError` 発生時に
  スキップして正常終了するケースを追加する（依存: T003, T004）
- [ ] T007: `libs/aws` の `abstract-repository` テストに
  `InvalidEntityDataError` をそのまま伝播するケースを追加する（依存: T005）
- [ ] T008: 各 workspace でテスト・lint を実行し、カバレッジ 80% 以上を確認する
  ```
  npm run lint && npm run test && npm run test:coverage
  ```
  対象: `libs/aws`、`services/stock-tracker/core`（依存: T006, T007）

## Phase 4: 動作確認・完了処理

- [ ] T009: `services/stock-tracker/batch` のユニットテストを実行し、
  `temporary-alert-expiry` ハンドラーが不正データ混在時でも正常終了することを確認する
  （依存: T008）
- [ ] T010: `design.md` の「docs/ への移行メモ」を確認し、
  `docs/services/stock-tracker/architecture.md` に Lambda モジュール二重ロード問題の
  ADR を追記する（依存: T009）
- [ ] T011: Dockerfile のランタイムステージから `libs/*/dist` および
  `services/stock-tracker/core/dist` の明示的 COPY 行を削除する根本解決を
  別 Issue として起票する（依存: T009）
- [ ] T012: `tasks/issue-2422-temp-alert-batch-error/` ディレクトリを削除する
  （依存: T010, T011）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件（UC-001, F-001, F-002）をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`libs/aws`、`services/stock-tracker/core`）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/stock-tracker/architecture.md` の該当セクションを更新した
- [ ] `tasks/issue-2422-temp-alert-batch-error/` ディレクトリを削除した
