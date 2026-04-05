# NPM パッケージ管理 (2026年第13週) - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/npm-audit-w13-2026/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/npm-audit-w13-2026/requirements.md — 受け入れ条件・ユースケース
    - tasks/npm-audit-w13-2026/design.md — 調査結果・修正方針・パッケージ一覧
-->

## Phase 1: セキュリティ脆弱性修正（Critical / High）

<!-- npm audit で検出された Critical / High 脆弱性の解消 -->

- [x] T001: `npm audit fix` を実行し、自動修正可能な脆弱性を解消する（依存: なし）
- [x] T002: `npm audit` を再実行し、残存する Critical / High 脆弱性を確認する（依存: T001）
- [x] T003: 残存する脆弱性がある場合、ルート `package.json` に `overrides` を追加して対応する（依存: T002）
    - `handlebars`: `ts-jest` 経由の critical 脆弱性
    - `path-to-regexp`: `aws-sdk-client-mock` → `sinon` → `nise` 経由の high 脆弱性
    - `picomatch`: Jest 内部依存の high 脆弱性
- [x] T004: `npm install` を実行して `package-lock.json` を更新する（依存: T003）
- [x] T005: `npm audit` で Critical / High がゼロになったことを確認する（依存: T004）

## Phase 2: ビルド・テスト確認

<!-- セキュリティ修正適用後の動作確認 -->

- [x] T006: 各ライブラリ（`libs/*`）のビルドが通ることを確認する（依存: T005）
- [x] T007: 各サービスの core ビルドが通ることを確認する（依存: T006、並列実行可能）
- [x] T008: 各サービスの web ビルドが通ることを確認する（依存: T007、並列実行可能）
- [x] T009: infra ワークスペースの `cdk synth` が通ることを確認する（依存: T005、並列実行可能）
- [x] T010: ルートでユニットテストを実行し、テストが通ることを確認する（依存: T005）

## Phase 3: パッケージ更新（定期メンテナンス）

<!-- `npm outdated` で検出された更新可能なパッケージの適用 -->

- [x] T011: AWS SDK 系パッケージ（`@aws-sdk/*`, `@aws-sdk/lib-*`）を最新パッチバージョンに更新する（依存: Phase 2 完了）
- [x] T012: `next` / `eslint-config-next` を最新パッチバージョンに更新する（依存: Phase 2 完了、並列実行可能）
- [x] T013: `aws-cdk` / `aws-cdk-lib` / `constructs` を最新バージョンに更新する（依存: Phase 2 完了、並列実行可能）
- [x] T014: `tailwindcss` / `@tailwindcss/postcss` を最新パッチバージョンに更新する（依存: Phase 2 完了、並列実行可能）
- [x] T015: `playwright` / `openai` / `eslint` / `typescript-eslint` を最新バージョンに更新する（依存: Phase 2 完了、並列実行可能）
- [x] T016: `npm install` を実行して `package-lock.json` を更新する（依存: T011–T015）
- [x] T017: ビルド・Lint・テストが通ることを確認する（依存: T016）

## Phase 4: devDependencies 重複解消（改善）

<!-- `aws-sdk-client-mock` のルート統合 -->

- [x] T018: ルート `package.json` の `devDependencies` に `aws-sdk-client-mock@^4.1.0` を追加する（依存: Phase 3 完了）
- [x] T019: `services/admin/core`, `services/niconico-mylist-assistant/core`, `services/codec-converter/batch` の `package.json` から `aws-sdk-client-mock` を削除する（依存: T018）
- [x] T020: `npm install` を実行して `package-lock.json` を更新する（依存: T019）
- [x] T021: 影響を受けるワークスペースのテストが通ることを確認する（依存: T020）

---

## 完了チェック

- [x] `npm audit` で Critical / High 件数がゼロになっている
- [x] 全ワークスペースのビルドが通過している
- [x] 全ワークスペースのユニットテストが通過している
- [x] Lint・型チェックがすべて通過している
- [x] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/npm-audit-w13-2026/` ディレクトリを削除した
