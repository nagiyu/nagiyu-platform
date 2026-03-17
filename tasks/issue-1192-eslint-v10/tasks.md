# eslint v10 / @eslint/js v10 対応 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-1192-eslint-v10/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-1192-eslint-v10/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-1192-eslint-v10/design.md — 変更対象・リスク分析
-->

## Phase 1: バージョンアップ

- [ ] `package.json` の `eslint` を `^9` → `^10` に変更する（依存: なし）
- [ ] `package.json` の `@eslint/js` を `^9.17.0` → `^10` に変更する（依存: なし）
- [ ] `npm install` を実行し、`package-lock.json` を更新する（依存: 上記 2 件）

## Phase 2: lint 確認・修正

- [ ] `npm run lint` を全ワークスペース対象で実行し、エラーを確認する（依存: Phase 1）
- [ ] lint エラーが発生した場合は内容を確認し、設定変更または対象コードを修正する（依存: 上記）

## Phase 3: ビルド・テスト確認

- [ ] 主要ワークスペースでビルドが通ることを確認する（依存: Phase 2）
- [ ] 主要ワークスペースでテストが通ることを確認する（依存: Phase 2）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] 全ワークスペースで lint エラーなし
- [ ] Lint・型チェック・ビルドがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-1192-eslint-v10/` ディレクトリを削除した
