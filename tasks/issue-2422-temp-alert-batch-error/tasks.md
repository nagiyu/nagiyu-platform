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

- [x] T003: `services/stock-tracker/batch/Dockerfile` のランタイムステージから
  `libs/*/dist` および `services/stock-tracker/core/dist` の COPY 行を削除する
  （依存: T001）
- [x] T004: T002 で確認した他サービスの Dockerfile にも同様の修正を適用する
  （依存: T002、並列実行可能）

## Phase 3: 動作確認

- [x] T005: Docker イメージをビルドし、`node_modules/@nagiyu/aws` 経由のみで
  モジュールが解決されることを確認する（依存: T003）
  ```
  docker build -t stock-tracker-batch-test .
  docker run --rm stock-tracker-batch-test node -e "import('@nagiyu/aws').then(m => console.log(m))"
  ```
- [x] T006: Lambda ローカル実行（または E2E）で `temporary-alert-expiry` ハンドラーが
  不正データ混在時でも正常終了することを確認する（依存: T005）

## Phase 4: 完了処理

- [x] T007: `design.md` の「docs/ への移行メモ」を確認し、
  `docs/services/stock-tracker/architecture.md` に Lambda モジュール二重ロード問題の
  ADR を追記する（依存: T006）
- [ ] T008: `tasks/issue-2422-temp-alert-batch-error/` ディレクトリを削除する
  （依存: T007）

---

## 完了チェック

- [x] `requirements.md` の受け入れ条件（UC-001, F-001, F-002）をすべて満たしている
- [x] Dockerfile から不要な `libs/*/dist` COPY 行が削除されている
- [x] Docker イメージのビルドが成功している
- [x] `design.md` の「docs/ への移行メモ」を処理した
- [x] `docs/services/stock-tracker/architecture.md` の該当セクションを更新した
- [ ] `tasks/issue-2422-temp-alert-batch-error/` ディレクトリを削除した
