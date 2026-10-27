---
name: build-shared-libs
description: 共通ライブラリ @nagiyu/* を依存順にビルドする。next dev / Playwright(E2E) の起動前、dist/ が無くモジュール解決に失敗するとき（/ が 500 を返す等）、libs のソースを変更した後に使う。
---

# 共通ライブラリのビルド

`libs/*`（`@nagiyu/*`）は `package.json` の `main` が `dist/` を指すため、**`npm ci` だけでは `dist/` が作られない**。`dist/` が無いまま Next.js を起動すると `@nagiyu/ui` 等のモジュール解決に失敗し `/` が 500 を返す。`next dev`・`next build`・E2E はいずれもこれに依存する。

## 使い方

リポジトリルートで実行する（全 libs を依存順にビルドする）:

```bash
npm run build:libs
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

`build:libs`（ルート `package.json`）は、この依存を満たす順に `--workspace` を並べている。npm は複数の `--workspace` を指定順に 1 つずつ実行するため、並べた順がそのままビルド順になる。lib を追加・依存を変えたときは、ルートの `build:libs` の並びを直す。

## 手動で 1 つだけビルドする場合

```bash
npm run build --workspace @nagiyu/common
```

依存先が先にビルドされている必要がある（上のグラフを参照）。

## 関連

- [`docs/development/claude-environment.md`](../../../docs/development/claude-environment.md) — env 固有事情
