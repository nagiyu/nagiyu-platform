<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-1194-typesnode-v25/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-1194-typesnode-v25/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-1194-typesnode-v25/design.md — 変更対象・実装方針
-->

# Node.js v24 / `@types/node` v24 対応 - 実装タスク（T001〜T021）

---

## Phase 1: `@types/node` バージョンアップ

- [x] T001: ルート `package.json` の `@types/node` を `^22` → `^24` に変更する（依存: なし）
- [x] T002: `npm install` を実行し、`package-lock.json` を更新する（依存: T001）
- [x] T003: `tsc --noEmit` を実行し、型エラーがないことを確認する（依存: T002）
- [x] T004: 型エラーが発生した場合、設計方針に従って修正する（依存: T003）

## Phase 2: `package.json` engines の更新

- [x] T005: ルート `package.json` の `engines.node` を `>=22.0.0` → `>=24.0.0` に変更する（依存: なし）
- [x] T006: `infra/package.json` の `engines.node` を同様に変更する（依存: なし）
- [x] T007: `infra/stock-tracker/package.json` の `engines.node` を同様に変更する（依存: なし）

## Phase 3: Dockerfile の更新

- [x] T008: `services/auth/web/Dockerfile` の `FROM node:22-alpine` → `node:24-alpine` に変更する（依存: なし）
- [x] T009: `services/codec-converter/batch/Dockerfile` の `FROM node:22-slim` → `node:24-slim` に変更する（依存: なし）
- [x] T010: `services/codec-converter/web/Dockerfile` の `FROM node:22-alpine` → `node:24-alpine` に変更する（依存: なし）
- [x] T011: `services/stock-tracker/batch/Dockerfile` の `FROM public.ecr.aws/lambda/nodejs:22` → `nodejs:24` に変更する（依存: なし）
- [x] T012: `services/stock-tracker/web/Dockerfile` の `FROM node:22-alpine` → `node:24-alpine` に変更する（依存: なし）
- [x] T013: `services/share-together/web/Dockerfile` の `FROM node:22-alpine` → `node:24-alpine` に変更する（依存: なし）
- [x] T014: `services/admin/web/Dockerfile` の `FROM node:22-alpine` → `node:24-alpine` に変更する（依存: なし）
- [x] T015: `services/niconico-mylist-assistant/web/Dockerfile` の `FROM node:22-alpine` → `node:24-alpine` に変更する（依存: なし）
- [x] T016: `services/tools/Dockerfile` の `FROM node:22-alpine` → `node:24-alpine` に変更する（依存: なし）

## Phase 4: DevContainer Dockerfile の更新

- [ ] T017: 各 `.devcontainer/*/Dockerfile` の `mcr.microsoft.com/devcontainers/typescript-node:1-22-bullseye` → `4-24-bullseye` に変更する（対象: root / auth / codec-converter / stock-tracker / admin / infra / niconico-mylist-assistant / tools の 8 ファイル）（依存: なし）

## Phase 5: GitHub Actions の更新

- [ ] T018: `.github/actions/setup-node/action.yml` の `default: '22'` → `'24'` に変更する（依存: なし）
- [ ] T019: `.github/actions/build-web-app/action.yml` の `node-version: '22'` → `'24'` に変更する（依存: なし）
- [ ] T020: 全ワークフロー（27 ファイル）の `node-version: '22'` → `'24'` に一括変更する（依存: なし）

## Phase 6: 検証

- [ ] T021: `npm audit` を実行し、新たな脆弱性がないことを確認する（依存: T002）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] `@types/node` が `^24` に更新されている
- [x] 全 Dockerfile の Node.js バージョンが `24` に更新されている
- [ ] 全 DevContainer Dockerfile のイメージタグが `4-24-bullseye` に更新されている
- [ ] 全 GitHub Actions ワークフローの `node-version` が `'24'` に更新されている
- [ ] `package.json` の `engines.node` が `>=24.0.0` に更新されている（3 ファイル）
- [ ] Lint・型チェックがすべて通過している
- [ ] 既存テストがすべてパスしている
- [ ] `npm audit` で新たな脆弱性が検出されていない
- [ ] `tasks/issue-1194-typesnode-v25/` ディレクトリを削除した
