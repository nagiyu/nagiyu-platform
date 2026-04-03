# 2026年第13週 ドキュメントレビュー - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2474-docs-review/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2474-docs-review/requirements.md — 受け入れ条件
    - tasks/issue-2474-docs-review/design.md — 変更内容・設計判断
-->

## Phase 1: カバレッジ閾値の修正

<!-- services/stock-tracker/web の jest.config.ts を標準基準（80%）に修正する -->

- [ ] T001: `services/stock-tracker/web/jest.config.ts` の `coverageThreshold` を確認し、全メトリクスを `80` に変更する（依存: なし）
- [ ] T002: `npm run test:coverage` を `services/stock-tracker/web` で実行し、カバレッジが 80% 以上かつテストがすべて通過することを確認する（依存: T001）

## Phase 2: Issue クローズ

<!-- GitHub Issue #2474 のチェックリスト確認と完了処理 -->

- [ ] T003: Issue #2474 のチェックリスト項目に対して、調査結果と対応内容をコメントで報告する（依存: T002）
- [ ] T004: Issue #2474 をクローズする（依存: T003）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] `services/stock-tracker/web` のテストカバレッジが 80% 以上
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2474-docs-review/` ディレクトリを削除した
