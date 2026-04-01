# npm セキュリティ対応 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2477-npm-security/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2477-npm-security/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2477-npm-security/design.md — 脆弱性調査結果・対応方針
-->

## Phase 1: 現状確認

<!-- 作業前に最新の状態を確認し、Issue レポートとの差分を把握する -->

- [ ] T001: `npm audit` を実行して現在の脆弱性一覧を確認する（依存: なし）
- [ ] T002: `npm ls handlebars` を実行して handlebars の依存元パッケージを特定する（依存: T001）
- [ ] T003: `npm ls path-to-regexp` を実行して path-to-regexp の依存元パッケージを特定する（依存: T001）
- [ ] T004: `npm ls picomatch` を実行して picomatch の依存元パッケージを特定する（依存: T001）
- [ ] T005: 各脆弱パッケージの修正バージョン（handlebars >=4.7.9、path-to-regexp >=8.4.0、picomatch >=2.3.2）が利用可能であることを確認する（依存: T002〜T004）

## Phase 2: セキュリティ脆弱性修正（Priority 1）

<!-- `npm audit fix` を試み、解消できない場合は overrides で対応する -->

- [ ] T006: `npm audit fix` を実行する（依存: Phase 1）
- [ ] T007: `npm audit` を再実行して Critical/High の残存件数を確認する（依存: T006）
- [ ] T008: Critical/High が残存する場合、`package.json` の `overrides` セクションに安全なバージョンを追記する（依存: T007）
    - `handlebars`: >=4.7.9
    - `path-to-regexp`: >=8.4.0
    - `picomatch`: >=2.3.2
- [ ] T009: `overrides` 追加後に `npm install` を実行して `package-lock.json` を更新する（依存: T008）
- [ ] T010: `npm audit` を再実行して Critical/High が 0 件になったことを確認する（依存: T009）

## Phase 3: devDependency 重複統合（Priority 3-1）

<!-- aws-sdk-client-mock のルート統合。Priority 1 の修正完了後に実施する -->

- [ ] T011: 各ワークスペース（admin/core、niconico-mylist-assistant/core、codec-converter/batch）の `aws-sdk-client-mock` バージョンが `^4.1.0` で統一されていることを確認する（依存: Phase 2 完了）
- [ ] T012: ルートの `package.json` に `aws-sdk-client-mock@^4.1.0` を devDependency として追加する（依存: T011）
- [ ] T013: 各ワークスペースから `aws-sdk-client-mock` を削除する（依存: T012）
- [ ] T014: `npm install` を実行して依存関係を更新する（依存: T013）

## Phase 4: パッケージ更新（Priority 3-2）

<!-- セマンティックバージョンの互換範囲内の更新のみ対象。next-auth・typescript・@types/node のメジャー変更は除外 -->

- [ ] T015: `@aws-sdk/*` 系パッケージ（3.1010.0 → 3.1019.0）を更新する（依存: Phase 3 完了、並列実行可能）
- [ ] T016: `aws-cdk-lib`（2.243.0 → 2.245.0）および `constructs`（10.5.1 → 10.6.0）を更新する（依存: Phase 3 完了、並列実行可能）
- [ ] T017: `next`（16.1.7 → 16.2.1）および `eslint-config-next` を更新する（依存: Phase 3 完了）
- [ ] T018: `tailwindcss`・`@tailwindcss/postcss`（4.2.1 → 4.2.2）を更新する（依存: Phase 3 完了、並列実行可能）
- [ ] T019: `playwright`（1.58.0 → 1.58.2）を更新する（依存: Phase 3 完了、並列実行可能）
- [ ] T020: `typescript-eslint`（8.57.1 → 8.57.2）・`eslint`（10.0.3 → 10.1.0）を更新する（依存: Phase 3 完了、並列実行可能）
- [ ] T021: `openai`（6.31.0 → 6.33.0）を更新する（依存: Phase 3 完了、並列実行可能）

## Phase 5: 検証

- [ ] T022: 全ワークスペースの lint が通過することを確認する（依存: Phase 4 完了）
- [ ] T023: 全ワークスペースのビルドが成功することを確認する（依存: T022）
- [ ] T024: 全ワークスペースのユニットテストが通過することを確認する（依存: T022）
- [ ] T025: `npm audit` で Critical/High が 0 件であることを最終確認する（依存: T022）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
    - `npm audit` の Critical/High が 0 件
    - 全ワークスペースのビルド・テストが通過
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2477-npm-security/` ディレクトリを削除した
