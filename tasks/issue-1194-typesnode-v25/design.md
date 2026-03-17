<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-1194-typesnode-v25/ ディレクトリごと削除します。

    入力: tasks/issue-1194-typesnode-v25/requirements.md
    次に作成するドキュメント: tasks/issue-1194-typesnode-v25/tasks.md
-->

# Node.js v24 / `@types/node` v24 対応 - 技術設計

---

## 変更概要

Node.js ランタイムを v22 から **v24（Active LTS）** へアップグレードし、合わせて `@types/node` を `^22` から **`^24`** に更新する。
モノレポ全体にわたり、Docker・CI・DevContainer・`package.json` の全箇所を一括変更する。

---

## バージョン選定

### Node.js ランタイム

| バージョン | LTS | サポート終了 | 推奨 |
| --------- | --- | ---------- | ---- |
| v22 | Active LTS | 2027年4月 | 現状 |
| v24 | Active LTS（2025年10月〜）| 2028年4月 | **採用** |
| v25 | なし（奇数バージョン）| - | 非推奨 |

- **採用バージョン: v24**
- Node.js v24 は 2025年10月28日に Active LTS に昇格。2028年4月まで長期サポートが保証されている
- Node.js v25 は奇数バージョンのため LTS がなく、プロダクション環境での使用は非推奨

### `@types/node`

- **採用バージョン: `^24`**
- `@types/node` のメジャーバージョンは Node.js ランタイムのメジャーバージョンと一致させるべきである（DefinitelyTyped メンテナーの推奨）
- ランタイム（v24）より新しい `@types/node@25` を使用すると、v25 にしか存在しない API の型定義が参照可能になり、TypeScript コンパイルは通っても v24 ランタイムで実行エラーになるリスクがある
- そのため `@types/node@^24` を採用し、ランタイムバージョンと型定義バージョンを一致させる

---

## 変更対象一覧

### 1. Dockerfile

| ファイル | 変更内容 |
| -------- | -------- |
| `services/auth/web/Dockerfile` | `FROM node:22-alpine` → `node:24-alpine` |
| `services/codec-converter/batch/Dockerfile` | `FROM node:22-slim` → `node:24-slim` |
| `services/codec-converter/web/Dockerfile` | `FROM node:22-alpine` → `node:24-alpine` |
| `services/stock-tracker/batch/Dockerfile` | `FROM public.ecr.aws/lambda/nodejs:22` → `nodejs:24` |
| `services/stock-tracker/web/Dockerfile` | `FROM node:22-alpine` → `node:24-alpine` |
| `services/share-together/web/Dockerfile` | `FROM node:22-alpine` → `node:24-alpine` |
| `services/admin/web/Dockerfile` | `FROM node:22-alpine` → `node:24-alpine` |
| `services/niconico-mylist-assistant/web/Dockerfile` | `FROM node:22-alpine` → `node:24-alpine` |
| `services/tools/Dockerfile` | `FROM node:22-alpine` → `node:24-alpine` |

> **注意**: `services/niconico-mylist-assistant/batch/Dockerfile` は `mcr.microsoft.com/playwright:v1.58.0-jammy` ベースであり、Node.js バージョンは Playwright イメージ側で管理されるため変更しない

### 2. DevContainer Dockerfile

| ファイル | 変更内容 |
| -------- | -------- |
| `.devcontainer/root/Dockerfile` | `mcr.microsoft.com/devcontainers/typescript-node:1-22-bullseye` → `4-24-bullseye` |
| `.devcontainer/auth/Dockerfile` | 同上 |
| `.devcontainer/codec-converter/Dockerfile` | 同上 |
| `.devcontainer/stock-tracker/Dockerfile` | 同上 |
| `.devcontainer/admin/Dockerfile` | 同上 |
| `.devcontainer/infra/Dockerfile` | 同上 |
| `.devcontainer/niconico-mylist-assistant/Dockerfile` | 同上 |
| `.devcontainer/tools/Dockerfile` | 同上 |

> **注意**: DevContainer イメージのメジャーバージョンが `1` → `4` に変わるため、イメージのタグ形式が変更される（`4-24-bullseye` を使用）

### 3. GitHub Actions

| ファイル | 変更内容 |
| -------- | -------- |
| `.github/actions/setup-node/action.yml` | `default: '22'` → `'24'` |
| `.github/actions/build-web-app/action.yml` | `node-version: '22'` → `'24'` |
| `.github/workflows/*.yml`（27ファイル） | `node-version: '22'` → `'24'`（ハードコーディング箇所を一括変更） |

### 4. `package.json` engines

| ファイル | 変更内容 |
| -------- | -------- |
| `package.json`（ルート） | `"node": ">=22.0.0"` → `">=24.0.0"` |
| `infra/package.json` | 同上 |
| `infra/stock-tracker/package.json` | 同上 |

### 5. `@types/node` バージョン

| ファイル | 変更内容 |
| -------- | -------- |
| `package.json`（ルート） | `"@types/node": "^22"` → `"^24"` |
| `package-lock.json` | `npm install` により自動更新 |

---

## 実装上の注意点

### AWS Lambda Node.js 24 への移行

- `public.ecr.aws/lambda/nodejs:24` イメージは利用可能（一般公開済み）
- **重要**: Lambda Node.js 24 ではコールバックベースのハンドラーシグネチャがサポートされなくなった
- 現在のすべての Lambda ハンドラー（`services/stock-tracker/batch/src/*.ts`）は `async function handler(...)` 形式で実装されているため、変更は不要

### DevContainer イメージタグ形式の変更

- `mcr.microsoft.com/devcontainers/typescript-node` のタグ形式が変更された
    - 旧: `1-22-bullseye`（イメージ v1 + Node.js 22）
    - 新: `4-24-bullseye`（イメージ v4 + Node.js 24）
- DevContainer 再ビルドが必要

### `@types/node` v24 と Node.js v24 ランタイムの整合性

- `@types/node@^24` は Node.js v24 の全 API を正確に型定義するため、ランタイムとの整合性が保証される
- DefinitelyTyped のメンテナーは「`@types/node` のメジャーバージョンは使用する Node.js ランタイムのメジャーバージョンと一致させること」を推奨している
- v25 の型定義を v24 ランタイムで使用すると、v25 固有の API を誤って使用した際に TypeScript では検知できないランタイムエラーが発生するリスクがある

### セキュリティ考慮事項

- `npm audit` を実行し、新たな脆弱性が混入していないことを確認する
