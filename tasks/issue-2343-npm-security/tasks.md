# npm セキュリティ脆弱性対応 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2343-npm-security/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2343-npm-security/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2343-npm-security/design.md — 修正方針・変更ファイル一覧
-->

## Phase 1: 脆弱性修正（npm overrides 更新）

- [x] T001: `package.json` の `overrides.fast-xml-parser` を `5.5.5` → `5.5.8` に更新する（依存: なし）
- [x] T002: `package.json` の `overrides` に `flatted: "3.4.2"` を追加する（依存: なし）
- [x] T003: `npm install` を実行して `package-lock.json` を再生成する（依存: T001, T002）
- [x] T004: `npm audit --audit-level=high` を実行し、HIGH 以上の脆弱性がゼロであることを確認する（依存: T003）

## Phase 2: バージョン不整合修正

- [x] T005: `infra/codec-converter/package.json` の `devDependencies` から `jest` と `ts-jest` を削除する（ルート workspace から取得するため個別管理不要）（依存: なし）
- [x] T006: `npm install` を実行して `package-lock.json` を再生成する（依存: T005）

## Phase 3: 検証

- [x] T007: `npm run lint` を実行し、ESLint が正常動作することを確認する（flatted 更新の影響確認）（依存: T003）
- [ ] T008: 各 workspace のビルドが正常に完了することを確認する（依存: T003, T006）
- [x] T009: `npm audit` の実行結果をこのファイルに記録する（依存: T004）

### T008 未完了理由

- `npm run build --workspaces --if-present` は本修正と無関係の既存要因（`@nagiyu/common` / `@nagiyu/aws` 参照解決）で失敗。
- 変更影響範囲の確認として `npm run build --workspace=@nagiyu/infra-common` と `npm run test --workspace=@nagiyu/infra-codec-converter` は成功。

### T009 実行結果（2026-03-23）

- 実行コマンド: `npm audit --audit-level=high`
- 実行結果: `found 0 vulnerabilities`

---

## 完了チェック

- [x] `requirements.md` の受け入れ条件をすべて満たしている
- [x] `npm audit --audit-level=high` で HIGH 以上の脆弱性がゼロ
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2343-npm-security/` ディレクトリを削除した

### 完了チェック補足

- Lint は通過（既存 warning 1 件）したため T007 は完了。
- 型チェックを含む全 workspace build は既存要因で未通過のため、完了チェック「Lint・型チェックがすべて通過している」は未完了のままとする。
