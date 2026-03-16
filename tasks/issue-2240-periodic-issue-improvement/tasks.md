# 定期 Issue の改善 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2240-periodic-issue-improvement/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2240-periodic-issue-improvement/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2240-periodic-issue-improvement/design.md — 変更設計
-->

## Phase 1: Issue テンプレートの事実化

- [x] `.github/workflows/templates/weekly-npm-body.md` から「📝 対応方法」セクション以降（Agent 実行指示・受け入れ基準・ワークスペース操作原則を含む）を削除する
- [x] `.github/workflows/templates/weekly-review-body.md` から「✅ レビュー手順」セクション（担当者アサイン指示を含む）を削除する

---

## 完了チェック

- [x] `requirements.md` の受け入れ条件（UC-001〜002、F-001〜002）をすべて満たしている
- [x] Lint・YAML 文法チェックが通過している
- [ ] `tasks/issue-2240-periodic-issue-improvement/` ディレクトリを削除した
