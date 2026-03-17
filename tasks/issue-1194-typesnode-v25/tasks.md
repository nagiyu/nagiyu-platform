<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-1194-typesnode-v25/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-1194-typesnode-v25/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-1194-typesnode-v25/design.md — 変更対象・実装方針
-->

# `@types/node` v25 対応 - 実装タスク

---

## Phase 1: バージョンアップ

- [ ] T001: ルート `package.json` の `@types/node` バージョン指定を `^22` → `^25` に変更する（依存: なし）
- [ ] T002: `npm install` を実行し、`package-lock.json` を更新する（依存: T001）

## Phase 2: 型エラー修正

- [ ] T003: `tsc --noEmit` を実行し、型エラーがないことを確認する（依存: T002）
- [ ] T004: 型エラーが発生した場合、設計方針に従って修正する（依存: T003）

## Phase 3: 検証

- [ ] T005: `npm run lint` を実行し、Lint エラーがないことを確認する（依存: T004 または T003）
- [ ] T006: `npm test` を実行し、既存テストがすべてパスすることを確認する（依存: T004 または T003）
- [ ] T007: `npm audit` を実行し、新たな脆弱性がないことを確認する（依存: T002）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] Lint・型チェックがすべて通過している
- [ ] 既存テストがすべてパスしている
- [ ] `npm audit` で新たな脆弱性が検出されていない
- [ ] `tasks/issue-1194-typesnode-v25/` ディレクトリを削除した
