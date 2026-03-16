# NPM パッケージ更新 (2026年第11週) - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2258-npm-update/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2258-npm-update/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2258-npm-update/design.md — 更新対象パッケージ一覧・設計方針
-->

## Phase 1: 事前確認

<!-- npm audit・outdated の現状を確認し、更新方針を確定する -->

- [ ] T001: `npm audit` を実行し、Critical / High 脆弱性がゼロであることを確認する（依存: なし）
- [ ] T002: `npm outdated --workspaces --include-workspace-root` を実行し、レポートと差異がないことを確認する（依存: なし）
- [ ] T003: `next-auth` / `@auth/core` が beta 系で意図的に固定されていることをコメント等で記録する（依存: T002）

## Phase 2: グループ A 更新（マイナー・パッチ）

<!-- breaking changes リスクが低いパッケージを一括更新する -->

- [ ] T004: ルート `package.json` の `@aws-sdk/client-batch` / `client-dynamodb` / `client-lambda` / `client-s3` / `client-secrets-manager` / `lib-dynamodb` / `s3-request-presigner` を `3.1010.0` へ更新する（依存: T001）
- [ ] T005: ルート `package.json` の `aws-cdk` を `2.1111.0`、`aws-cdk-lib` を `2.243.0` へ更新し、`infra/` 配下の各ワークスペースも同バージョンへ更新する（依存: T001）
- [ ] T006: ルート `package.json` の `next` / `eslint-config-next` を `16.1.7` へ更新し、`libs/ui` / `services/*/web` の各ワークスペースも同バージョンへ更新する（依存: T001）
- [ ] T007: ルート `package.json` の `jest` / `@jest/types` / `jest-environment-jsdom` を `30.3.0` へ更新する（依存: T001）
- [ ] T008: ルート `package.json` の `typescript-eslint` を `8.57.1` へ更新する（依存: T001）
- [ ] T009: `services/stock-tracker/batch/package.json` の `openai` を `6.31.0` へ更新する（依存: T001）
- [ ] T010: `services/niconico-mylist-assistant/batch/package.json` の `playwright` を `1.58.2` へ更新する（依存: T001）
- [ ] T011: `npm install` を実行し、`package-lock.json` を再生成する（依存: T004〜T010）

## Phase 3: 動作確認

<!-- lint / build / test が通過することを確認する -->

- [ ] T012: `npm run format:check --workspaces --if-present` を実行し、フォーマット違反がないことを確認する（依存: T011）
- [ ] T013: `npm run lint --workspaces --if-present` を実行し、Lint エラーがないことを確認する（依存: T011）
- [ ] T014: 各ワークスペースのビルドを実行し（`npm run build --workspaces --if-present`）、コンパイルエラーがないことを確認する（依存: T011）
- [ ] T015: 各ワークスペースのテストを実行し（`npm run test --workspaces --if-present`）、テストが通過することを確認する（依存: T014）
- [ ] T016: `npm audit` を再実行し、Critical / High 脆弱性がゼロであることを確認する（依存: T011）

## Phase 4: メジャーバージョン変更の調査（別 Issue 起票）

<!-- 本タスクではコード変更しない。調査結果を Issue として記録する -->

- [ ] T017: `eslint` v10 / `@eslint/js` v10 の changelog を確認し、breaking changes と対応コストを見積もり、別 Issue を起票する（依存: なし、並列実行可能）
- [ ] T018: `@types/node` v25 の changelog を確認し、breaking changes と対応コストを見積もり、別 Issue を起票する（依存: なし、並列実行可能）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] `npm audit` で Critical / High 脆弱性がゼロ
- [ ] Lint・型チェック・テストがすべて通過している
- [ ] `package-lock.json` がコミットされている
- [ ] メジャーバージョン変更（eslint v10 / @types/node v25）の別 Issue が起票されている
- [ ] `tasks/issue-2258-npm-update/` ディレクトリを削除した
