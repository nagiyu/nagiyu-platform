---
name: build-shared-libs
description: 共通ライブラリ @nagiyu/* を依存順にビルドする。next dev / Playwright(E2E) の起動前、dist/ が無くモジュール解決に失敗するとき（/ が 500 を返す等）、libs のソースを変更した後に使う。
---

# 共通ライブラリのビルド

`libs/*`（`@nagiyu/*`）は `package.json` の `main` が `dist/` を指すため、**`npm ci` だけでは `dist/` が作られない**。`dist/` が無いまま Next.js を起動すると `@nagiyu/ui` 等のモジュール解決に失敗し `/` が 500 を返す。`next dev`・`next build`・E2E はいずれもこれに依存する。

## 使い方

リポジトリルートで同梱スクリプトを実行する（依存順にビルドする）:

```bash
.claude/skills/build-shared-libs/scripts/build.sh
```

`npm ci` 未実行なら先に済ませること。

## 依存グラフ（ビルド順の根拠）

各 `libs/*/package.json` の内部依存（確認済み）:

```
common   ← 依存なし（基盤）
aws      ← common
browser  ← common
nextjs   ← common
react    ← browser, common
ui       ← browser, common （+ build に scripts/copy-assets.mjs の追加ステップあり）
```

トポロジカル順（スクリプトもこの順で実行する）:

1. `@nagiyu/common`
2. `@nagiyu/aws` / `@nagiyu/browser` / `@nagiyu/nextjs`（common のみに依存）
3. `@nagiyu/react` / `@nagiyu/ui`（browser, common に依存）

> 注: 以前のドキュメントは `common → browser → ui → nextjs` の 4 つだけを記載し、`aws` / `react` が欠落していた。また `nextjs` は `browser` ではなく `common` のみに依存する。本スキプトが正となる。

## 手動で実行する場合

```bash
npm run build --workspace @nagiyu/common
npm run build --workspace @nagiyu/aws
npm run build --workspace @nagiyu/browser
npm run build --workspace @nagiyu/nextjs
npm run build --workspace @nagiyu/react
npm run build --workspace @nagiyu/ui
```

## 関連

- [`docs/development/claude-environment.md`](../../../docs/development/claude-environment.md) — env 固有事情
