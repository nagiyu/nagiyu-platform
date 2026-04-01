<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2474-weekly-docs-review/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2474-weekly-docs-review/requirements.md — 対応内容・調査結果
    - tasks/issue-2474-weekly-docs-review/design.md — 修正方針・修正対象ファイル
-->

# 2026年第13週 週次ドキュメントレビュー 対応 - 実装タスク

## Phase 1: copilot-instructions.md のサービス一覧更新

- [ ] T001: `.github/copilot-instructions.md` のモノレポ構成図を更新する
    - 現在: stock-tracker, niconico-mylist-assistant, share-together の 3 サービスのみ
    - 修正後: admin, auth, codec-converter, tools を追加し、アルファベット順に並べる
    - 参照: `design.md` の「修正後」の記述内容

## Phase 2: stock-tracker/web の coverageThreshold コメント追加

- [ ] T002: `services/stock-tracker/web/jest.config.ts` に意図を示すコメントを追加する
    - `collectCoverageFrom` が特定の 2 ファイルのみを対象としていること
    - `coverageThreshold: 100%` は意図的な設定であることを記述する
    - 参照: `design.md` の「stock-tracker/web の jest.config.ts コメント追加」

---

## 完了チェック

- [ ] `requirements.md` の対応方針をすべて実施した
- [ ] copilot-instructions.md のサービス一覧が実際の `services/` と一致している
- [ ] stock-tracker/web の jest.config.ts にコメントが追加されている
- [ ] Lint・フォーマットが通過している（Prettier 等）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2474-weekly-docs-review/` ディレクトリを削除した
