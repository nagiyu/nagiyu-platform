# 2026年第11週 週次ドキュメントレビュー 対応 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2257-weekly-docs-review/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2257-weekly-docs-review/requirements.md — 発見した問題・受け入れ条件
    - tasks/issue-2257-weekly-docs-review/design.md — 修正方針・技術設計
-->

## Phase 1: Priority 1-4 手動チェック

<!-- Priority 1（必須）と Priority 2-4（推奨）の未確認項目を手動で確認する -->

- [ ] T001: Issue Template（`.github/ISSUE_TEMPLATE/`）と `rules.md` の MUST ルールを照合し、不整合があれば Issue #2257 にコメントで記録する（依存: なし）
- [ ] T002: PR Template（`.github/pull_request_template.md`）と development ドキュメントの整合性を確認し、不整合があれば Issue #2257 にコメントで記録する（依存: なし）
- [ ] T003: `docs/branching.md` と `.github/copilot-instructions.md` のブランチ戦略記述を照合する（依存: なし）
- [ ] T004: `docs/development/monorepo-structure.md` と `.github/copilot-instructions.md` のモノレポ構成・依存方向性を照合する（依存: なし）
- [ ] T005: Fast CI / Full CI のデバイス設定（chromium-mobile / 全デバイス）を workflow ファイルと `docs/development/testing.md` で照合する（依存: なし）
- [ ] T006: `docs/` 配下でテストカバレッジ80%の記載が一貫しているか確認する（依存: なし）
- [ ] T007: `docs/` 配下でライブラリ依存方向（`ui → browser → common`）の記載が一貫しているか確認する（依存: なし）
- [ ] T008: `rules.md` が Single Source of Truth になっているか、他のドキュメントと重複・矛盾がないか確認する（依存: なし）
- [ ] T009: `docs/development/*.md` の過去1週間の変更履歴を確認し、追従漏れがないかチェックする（依存: なし）

## Phase 2: リンクチェッカースクリプトの修正

<!-- 誤検知の原因となっているスクリプトを正確なパス解決ロジックに修正する -->

- [ ] T010: `.github/workflows/templates/weekly-review-body.md` のリンクチェックスクリプトを、ファイルごとの相対パスを正しく解決するロジックに修正する（依存: なし）
- [ ] T011: 修正後のスクリプトをローカルで実行し、誤検知が出ないことを確認する（依存: T010）

## Phase 3: `niconico-mylist-assistant/batch` の `coverageThreshold` 対応

<!-- 他の batch パッケージと統一する -->

- [ ] T012: `services/niconico-mylist-assistant/batch/jest.config.ts` に `coverageThreshold`（80%）を追加し、不正確なコメントを削除する（依存: なし）
- [ ] T013: `npm run test:coverage --workspace=@nagiyu/niconico-mylist-assistant-batch` を実行し、カバレッジが80%以上であることを確認する（依存: T012）

## Phase 4: 不整合の修正

<!-- Phase 1 で発見した問題を修正する -->

- [ ] T014: Phase 1 で発見した不整合・リンク切れを修正する（依存: T001-T009）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] リンクチェッカーを修正後に実行し、誤検知がゼロであることを確認した
- [ ] `niconico-mylist-assistant/batch` の `coverageThreshold` が設定済みで、テストが通過している
- [ ] Priority 1-4 のチェック結果を Issue #2257 にコメントで記録した
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2257-weekly-docs-review/` ディレクトリを削除した
