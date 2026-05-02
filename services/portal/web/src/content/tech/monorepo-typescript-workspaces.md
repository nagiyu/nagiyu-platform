---
title: 'monorepo + npm workspaces で TypeScript パッケージを共有する'
description: 'モノレポ構成で TypeScript の型・関数・コンポーネントを複数アプリ間で共有する実装方法を解説。npm workspaces の設定・パッケージ間参照・ビルド順序・デプロイ時の依存解決まで実運用ベースで整理します。'
slug: 'monorepo-typescript-workspaces'
publishedAt: '2026-03-20'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['TypeScript', 'monorepo', 'npm workspaces']
---

## はじめに

複数の Web サービスを並行で開発・運用していると、認証ロジック・UI コンポーネント・型定義などを複数リポジトリに重複コピーする状態になりがちです。npm workspaces を使ったモノレポなら、**1 つのリポジトリ・1 つの依存ツリーで複数パッケージを共有**できます。本記事では nagiyu-platform で採用している構成をベースに整理します。

## ディレクトリ構成

```
nagiyu-platform/
├── package.json              # ルート（workspaces 宣言）
├── package-lock.json
├── libs/                     # 共通ライブラリ
│   ├── common/               # 型・ユーティリティ
│   ├── ui/                   # MUI ベースの React 共通コンポーネント
│   ├── browser/              # ブラウザ専用ヘルパ
│   └── nextjs/               # Next.js 拡張
└── services/                 # 各サービスアプリ
    ├── portal/web/
    ├── tools/web/
    └── stock-tracker/web/
```

ライブラリは `libs/`、アプリは `services/` 配下に集約。アプリ側からは `@nagiyu/common` のようなスコープ付きパッケージ名で参照します。

## ルート package.json

```json
{
  "name": "nagiyu-platform",
  "private": true,
  "workspaces": ["libs/*", "services/*/web", "services/*/api"],
  "scripts": {
    "build:libs": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  }
}
```

`workspaces` には glob を書けます。`services/*/web` のように深いパスも展開されます。`private: true` で誤って公開発行されるのを防ぎます。

## ライブラリ側の設定

```json
// libs/common/package.json
{
  "name": "@nagiyu/common",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "import": "./dist/src/index.js"
    },
    "./push": {
      "types": "./dist/src/push/index.d.ts",
      "import": "./dist/src/push/index.js"
    }
  },
  "scripts": {
    "build": "tsc"
  }
}
```

`exports` を細かく切ると、利用側で `import { foo } from '@nagiyu/common/push'` のようにサブパス指定ができます。Tree-shaking もしやすくなります。

## アプリ側の参照

```json
// services/portal/web/package.json
{
  "name": "@nagiyu/portal-web",
  "dependencies": {
    "@nagiyu/common": "*",
    "@nagiyu/ui": "*",
    "next": "^16.0.0"
  }
}
```

ワークスペース内のパッケージはバージョンを `*` にしておけば、`npm install` 時に **シンボリックリンク**として `node_modules/@nagiyu/common` が作られます。ライブラリのソースを変更すると即座にアプリに反映されます。

## TypeScript の型解決

`tsconfig.json` の `paths` で個別マッピングしなくても、`@nagiyu/common` は `node_modules` 経由で解決されます。ただし **型定義ファイル（`.d.ts`）が `dist/` に出力されている必要がある**ので、ライブラリは先にビルドしておきます。

```bash
# 初回はライブラリをビルドしてから
npm install
npm run build --workspace=@nagiyu/common
npm run build --workspace=@nagiyu/ui
npm run dev --workspace=@nagiyu/portal-web
```

## ソース直参照と dist 参照の使い分け

開発時に「ライブラリのソースを変更したら即時反映」したい場合は、`paths` で `src/` を指す手もあります。

```json
// services/portal/web/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@nagiyu/common": ["../../../libs/common/src/index.ts"],
      "@nagiyu/common/*": ["../../../libs/common/src/*"]
    }
  }
}
```

ただしこれは **TypeScript 型解決の話**で、Next.js のランタイムでは `node_modules` 経由で `dist/` を見ています。本番ビルド時は dist が必要なので、ライブラリのビルドを CI で先に実行する手順は省けません。

## CI でのビルド順序

GitHub Actions で安全に動かすには、ライブラリ → アプリの順で動かします。

```yaml
- name: Install
  run: npm ci

- name: Build libraries
  run: npm run build --workspace=@nagiyu/common --workspace=@nagiyu/ui

- name: Build app
  run: npm run build --workspace=@nagiyu/portal-web
```

`npm run build --workspaces` で全ワークスペースを順に動かす方法もありますが、依存順を明示したほうが失敗時の切り分けが楽です。

## Docker イメージにも持ち込む

サービス単体を Docker イメージ化する場合、**モノレポ全体をコピーしてからインストールするか、ビルド済み成果物だけ COPY するか**を選びます。Next.js standalone と組み合わせると後者が綺麗です。

```dockerfile
# stage 1: monorepo 全体をビルド
FROM node:20-alpine AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY libs/ ./libs/
COPY services/portal/ ./services/portal/
RUN npm ci
RUN npm run build --workspace=@nagiyu/common --workspace=@nagiyu/ui
RUN npm run build --workspace=@nagiyu/portal-web

# stage 2: standalone のみ取り出し
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /repo/services/portal/web/.next/standalone ./
COPY --from=builder /repo/services/portal/web/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

Next.js standalone は依存ライブラリを `node_modules` ごとパッケージしてくれるので、最終イメージは数十 MB に収まります。

## ハマりどころ

- **package-lock.json は必ずルート 1 個**: 各サブディレクトリに lock ファイルを作らない。重複が出たら片方を削除。
- **`workspace:*` プロトコルは npm 未対応**: pnpm / yarn では使えるが npm ではエラー。`*` か実バージョンを書く。
- **TypeScript の Project References**: `tsc --build` で順序を指定する別仕組み。workspaces と併用できるが学習コストが上がる。最初は不要。
- **package-lock.json の noisy diff**: `optionalDependencies` の `dev` フィールドが OS 依存で揺れる。CI で `npm ci` を使い、ローカル `npm install` の差分は警戒する。
- **共通パッケージのバージョン整合**: 例えば `react` を libs と app で別バージョン入れると Hooks エラー。ルートで一括管理するか、`peerDependencies` を活用する。

## まとめ

npm workspaces でのモノレポ構成は、複数サービスを開発・運用する個人開発・小規模チームに向いた選択肢です。共通ライブラリの分離・パッケージ間参照・ビルド順序・Docker での取り回しを整えれば、コード重複を減らしつつ各サービスを独立してデプロイできます。
