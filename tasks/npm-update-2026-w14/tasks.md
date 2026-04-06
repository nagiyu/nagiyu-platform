# NPM パッケージ管理 2026年第14週 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/npm-update-2026-w14/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/npm-update-2026-w14/requirements.md — 受け入れ条件・調査結果
    - tasks/npm-update-2026-w14/design.md — 対応方針・更新対象パッケージ
-->

## Phase 1: セキュリティ脆弱性対応

<!-- Critical/High は overrides で対処済みのため確認のみ。Moderate 2 件を修正する。 -->

- [ ] T001: `npm audit` を実行し、Critical/High が 0 件であることを確認する（overrides 有効確認）
- [ ] T002: `npm audit fix` を実行して `brace-expansion` / `yaml` の Moderate 脆弱性を修正する（依存: T001）
- [ ] T003: 再度 `npm audit` を実行し、Moderate 以上が 0 件になることを確認する（依存: T002）

## Phase 2: AWS SDK 更新

<!-- @aws-sdk/* を 3.1010.0 → 3.1024.0 へ更新する -->

- [ ] T004: `libs/aws` の `@aws-sdk/client-batch`, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/lib-dynamodb` を 3.1024.0 へ更新する（依存: Phase 1 完了）
- [ ] T005: 各サービスの `services/*/core`, `services/*/web`, `services/*/batch` の `@aws-sdk/*` パッケージを更新する（並列実行可能）
    - `services/admin/core`, `services/admin/web`
    - `services/auth/core`, `services/auth/web`
    - `services/codec-converter/batch`, `services/codec-converter/web`
    - `services/niconico-mylist-assistant/batch`, `services/niconico-mylist-assistant/core`, `services/niconico-mylist-assistant/web`
    - `services/share-together/core`, `services/share-together/web`
    - `services/stock-tracker/batch`, `services/stock-tracker/core`, `services/stock-tracker/web`
- [ ] T006: `npm install` を実行し、lock ファイルを更新する（依存: T004, T005）
- [ ] T007: AWS SDK を使用する各ワークスペースでビルドが通ることを確認する（依存: T006）

## Phase 3: CDK 更新

<!-- aws-cdk-lib / constructs / aws-cdk を最新版へ更新する -->

- [ ] T008: ルートおよび `infra/*` の `aws-cdk-lib` を 2.248.0 へ、`constructs` を 10.6.0 へ、`aws-cdk` を 2.1117.0 へ更新する（依存: Phase 2 完了）
- [ ] T009: `infra/*` で `cdk synth` を実行し、CloudFormation テンプレートが正常に生成されることを確認する（依存: T008）

## Phase 4: Next.js 更新

<!-- next / eslint-config-next を 16.2.2 へ更新する -->

- [ ] T010: ルートおよび `libs/ui` の `next`, `eslint-config-next` を 16.2.2 へ更新する（依存: Phase 3 完了）
- [ ] T011: 各サービスの `web` ワークスペースで `next` / `eslint-config-next` を更新する（並列実行可能）
    - `services/admin/web`, `services/auth/web`, `services/codec-converter/web`
    - `services/niconico-mylist-assistant/web`, `services/share-together/web`, `services/stock-tracker/web`
    - `services/tools`
- [ ] T012: 各 web ワークスペースでビルドが通ることを確認する（依存: T010, T011）

## Phase 5: その他パッケージ更新

<!-- @playwright/test, tailwindcss, dotenv, openai, eslint, ts-jest 等 -->

- [ ] T013: ルートの `eslint`, `@eslint/compat`, `typescript-eslint`, `ts-jest`, `aws-cdk`, `@middleware-endpoint-discovery` を最新安定版へ更新する（依存: Phase 4 完了）
- [ ] T014: `services/stock-tracker/web` の `tailwindcss`, `@tailwindcss/postcss`, `dotenv` を更新する（並列実行可能）
- [ ] T015: `services/stock-tracker/batch` の `openai` を 6.33.0 へ更新する（並列実行可能）
- [ ] T016: `services/niconico-mylist-assistant/batch` の `@playwright/test`, `playwright`, `dotenv` を更新する（並列実行可能）
- [ ] T017: `services/stock-tracker/web` の `@playwright/test` を更新する（並列実行可能）
- [ ] T018: 更新したワークスペースでビルド・テストが通ることを確認する（依存: T013–T017）

## Phase 6: devDependencies 重複解消

<!-- aws-sdk-client-mock をルートへ統合する -->

- [ ] T019: ルートの `devDependencies` に `aws-sdk-client-mock@^4.1.0` を追加する（依存: Phase 5 完了）
- [ ] T020: 以下のワークスペースから `aws-sdk-client-mock` を削除する（依存: T019）
    - `services/admin/core`
    - `services/niconico-mylist-assistant/core`
    - `services/codec-converter/batch`
- [ ] T021: `npm install` を実行し、削除後も各ワークスペースのテストが通ることを確認する（依存: T020）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] `npm audit` で Moderate 以上の脆弱性が 0 件であること
- [ ] 全ワークスペースのビルドが成功していること
- [ ] 全ワークスペースの既存テストが成功していること
- [ ] Lint・型チェックがすべて通過していること
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/npm-update-2026-w14/` ディレクトリを削除した
