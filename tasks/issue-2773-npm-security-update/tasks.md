# npm セキュリティ対応・パッケージ統一 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2773-npm-security-update/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2773-npm-security-update/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2773-npm-security-update/design.md — 変更対象ファイル・設計詳細
-->

## Phase 1: セキュリティ脆弱性の修正（緊急対応）

<!-- Priority 1: Critical/High 脆弱性の解消 -->

- [ ] T001: ルート `package.json` の `overrides` に `"axios": ">=1.15.0"` を追加する（依存: なし）
    - 参照 Advisory: GHSA-3p68-rc4w-qgx5、GHSA-fvcv-3m26-pcqx
    - 既存の `overrides` フィールドに追記する形で変更する
- [ ] T002: ルート `package.json` の `dependencies.next` を `^16.2.3` に更新する（依存: なし）
    - 参照 Advisory: GHSA-q4gf-8mx6-v5v3
- [ ] T003: ルート `package.json` の `devDependencies.eslint-config-next` を `^16.2.3` に更新する（依存: T002）
- [ ] T004: `npm install` を実行して `package-lock.json` を更新する（依存: T001〜T003）
- [ ] T005: `npm audit` を実行し、Critical・High 脆弱性がゼロになったことを確認する（依存: T004）
- [ ] T006: ビルドとユニットテストが全ワークスペースで通過することを確認する（依存: T004）

## Phase 2: バージョン不整合の解消

<!-- Priority 2: quick-clip の @aws-sdk および CDK バージョンを他サービスに統一 -->

- [ ] T007: `services/quick-clip/core/package.json` の `@aws-sdk` 系パッケージを `^3.1024.0` に更新する（依存: Phase 1 完了）
    - 対象: `@aws-sdk/client-dynamodb`、`@aws-sdk/client-s3`、`@aws-sdk/lib-dynamodb`
- [ ] T008: `services/quick-clip/web/package.json` の `@aws-sdk` 系パッケージを `^3.1024.0` に更新する（並列実行可能）
    - 対象: `@aws-sdk/client-batch`、`@aws-sdk/client-dynamodb`、`@aws-sdk/client-lambda`、`@aws-sdk/client-s3`、`@aws-sdk/lib-dynamodb`、`@aws-sdk/s3-request-presigner`
- [ ] T009: `services/quick-clip/lambda/clip/package.json` の `@aws-sdk` 系パッケージを `^3.1024.0` に更新する（並列実行可能）
    - 対象: `@aws-sdk/client-dynamodb`、`@aws-sdk/client-s3`、`@aws-sdk/lib-dynamodb`、`@aws-sdk/s3-request-presigner`
- [ ] T010: `services/quick-clip/lambda/zip/package.json` の `@aws-sdk` 系パッケージを `^3.1024.0` に更新する（並列実行可能）
    - 対象: `@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`
- [ ] T011: `infra/quick-clip/package.json` の `aws-cdk-lib` を `^2.248.0`、`constructs` を `^10.6.0` に更新する（並列実行可能）
- [ ] T012: `npm install` を実行して `package-lock.json` を更新する（依存: T007〜T011）
- [ ] T013: ビルドとユニットテストが quick-clip 関連ワークスペースで通過することを確認する（依存: T012）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
    - `npm audit` で Critical・High 脆弱性がゼロ
    - quick-clip の `@aws-sdk` バージョンが他サービスと統一されている
    - `infra/quick-clip` の CDK パッケージが他インフラと統一されている
- [ ] Lint・型チェックが全ワークスペースで通過している
- [ ] ビルドが全ワークスペースで成功している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2773-npm-security-update/` ディレクトリを削除した
