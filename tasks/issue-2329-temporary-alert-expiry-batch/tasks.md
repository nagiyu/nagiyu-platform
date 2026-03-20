# 一時アラート失効バッチ バグ修正 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2329-temporary-alert-expiry-batch/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2329-temporary-alert-expiry-batch/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2329-temporary-alert-expiry-batch/design.md — 根本原因・修正方針・コンポーネント設計
-->

## Phase 1: core リポジトリの修正

<!-- DynamoDBAlertRepository.getByFrequency のアイテム単位エラー耐性化 -->

- [ ] T001: `core/src/repositories/dynamodb-alert.repository.ts` の `getByFrequency` を修正する
    - `result.Items` のマッピングループ内で `mapper.toEntity` を try-catch で囲む
    - `InvalidEntityDataError` を捕捉した場合、`PK`・`SK` をワーニングログに出力してスキップする
    - 他のエラーは従来通り `DatabaseError` で再スローする
    - `@nagiyu/aws` から `InvalidEntityDataError` を import する（依存: なし）

- [ ] T002: `core/src/repositories/dynamodb-alert.repository.ts` の `getByUserId` にも同様のエラー耐性化を適用する
    - T001 と同様のパターンで修正する（依存: T001 の設計確定後）

## Phase 2: バッチハンドラーのページネーション対応

<!-- temporary-alert-expiry.ts の全件取得ロジック追加 -->

- [ ] T003: `batch/src/temporary-alert-expiry.ts` の `handler` を修正する
    - `getByFrequency` を `nextCursor` がなくなるまでループして全件取得するよう変更する
    - `MINUTE_LEVEL` と `HOURLY_LEVEL` の両方にページネーションループを適用する
    - `stats.totalAlerts` をループ完了後に正しく集計する（依存: T001）

## Phase 3: テスト追加

- [ ] T004: `core/tests/` に `dynamodb-alert.repository` のテストを追加・更新する
    - `getByFrequency` が `InvalidEntityDataError` を発生させるアイテムをスキップすることを検証する
    - 不正アイテムをスキップした場合でも有効アイテムが返却されることを確認する
    - 既存テストが破壊されていないことを確認する（依存: T001）

- [ ] T005: `batch/tests/` に `temporary-alert-expiry` のテストを追加・更新する
    - `getByFrequency` がページネーションを返す場合に全件取得されることを検証する
    - `getByFrequency` が `DatabaseError` を throw した場合に 500 レスポンスを返すことを確認する
    - 統計カウント（`totalAlerts`）が正しく集計されることを確認する（依存: T003）

## Phase 4: 動作確認・ビルド

- [ ] T006: `npm run lint --workspace=@nagiyu/stock-tracker-core` が通過することを確認する（依存: T001, T002）
- [ ] T007: `npm run test --workspace=@nagiyu/stock-tracker-core` が通過することを確認する（依存: T004）
- [ ] T008: `npm run build --workspace=@nagiyu/stock-tracker-core` が通過することを確認する（依存: T006, T007）
- [ ] T009: `npm run lint --workspace=@nagiyu/stock-tracker-batch` が通過することを確認する（依存: T003）
- [ ] T010: `npm run test --workspace=@nagiyu/stock-tracker-batch` が通過することを確認する（依存: T005）
- [ ] T011: `npm run build --workspace=@nagiyu/stock-tracker-batch` が通過することを確認する（依存: T009, T010）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
    - UC-001: 有効なアラートが正しく失効処理されること
    - UC-002: 不正データアイテムがスキップされバッチが継続実行されること
    - F-002: 50 件超のアラートが全件処理されること
- [ ] テストカバレッジ 80% 以上（`stock-tracker/core`、`stock-tracker/batch`）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/stock-tracker/` の該当ファイルを更新した
- [ ] `tasks/issue-2329-temporary-alert-expiry-batch/` ディレクトリを削除した
