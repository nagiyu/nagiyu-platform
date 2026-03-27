# 一時アラート削除バッチ エラー修正 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2422-temp-alert-batch-error/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2422-temp-alert-batch-error/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2422-temp-alert-batch-error/design.md — 原因分析・修正方針
-->

## Phase 1: 原因確認

- [x] T001: `services/stock-tracker/batch/Dockerfile` のランタイムステージを確認し、
  `libs/*/dist` および `services/stock-tracker/core/dist` の明示的 COPY 行が
  存在することを確認する（依存: なし）
- [x] T002: 他サービスの Dockerfile（`niconico-mylist-assistant/batch` 等）にも
  同様の `libs/*/dist` 明示的 COPY が存在するか確認する（依存: なし）

## Phase 2: 修正実装

- [x] T003: `services/stock-tracker/core/src/repositories/dynamodb-alert.repository.ts` で
  `InvalidEntityDataError` 判定を `instanceof` だけでなく `error.name` ベースでも判定できるようにする
  （依存: T001）
- [x] T004: `services/stock-tracker/core/tests/unit/repositories/dynamodb-alert.repository.test.ts` に
  `error.name` ベース判定の回帰テストを追加する（依存: T003）

## Phase 3: 動作確認

- [x] T005: 依存 workspace ビルド・lint・対象ユニットテストを実行し、
  判定強化後も既存挙動が維持されることを確認する（依存: T004）
  - 実行: `npm run build -w libs/common -w libs/aws -w services/stock-tracker/core -w services/stock-tracker/batch`
  - 実行: `npm run lint -w services/stock-tracker/core -w services/stock-tracker/batch`
  - 実行: `npm run test -w services/stock-tracker/core -- tests/unit/repositories/dynamodb-alert.repository.test.ts`
  - 実行: `npm run test -w services/stock-tracker/batch -- tests/unit/temporary-alert-expiry.test.ts`
- [x] T006: Docker イメージビルドで既存 Dockerfile 運用を維持したまま、
  本修正が core/batch コードのみで完結していることを確認する（依存: T005）
  - 実行: `docker build -f services/stock-tracker/batch/Dockerfile -t stock-tracker-batch-test .`

## Phase 4: 完了処理

- [ ] T007: `design.md` の「docs/ への移行メモ」を確認し、
  `docs/services/stock-tracker/architecture.md` に Lambda モジュール二重ロード問題の
  ADR を追記する（依存: T006）
- [ ] T008: `tasks/issue-2422-temp-alert-batch-error/` ディレクトリを削除する
  （依存: T007）

---

## 完了チェック

- [x] `requirements.md` の受け入れ条件（UC-001, F-001, F-002）を満たす判定強化を実装した
- [x] `DynamoDBAlertRepository` の無効データ判定強化と回帰テスト追加を実施した
- [x] 依存 build/lint/対象テストおよび Docker イメージビルドが成功した
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/stock-tracker/architecture.md` の該当セクションを更新した
- [ ] `tasks/issue-2422-temp-alert-batch-error/` ディレクトリを削除した
