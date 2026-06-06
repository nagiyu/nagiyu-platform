---
title: 'Playwright E2E テストを GitHub Actions で並列実行する'
description: 'Playwright の E2E テストを GitHub Actions のマトリクスとシャーディング機能で並列実行し、CI 時間を短縮する手法を解説。flake 対策・アーティファクト収集・モバイル/デスクトップ複数 viewport 対応まで実運用ベースで紹介します。'
slug: 'playwright-parallel-ci'
publishedAt: '2026-04-08'
updatedAt: '2026-06-06'
author: 'なぎゆー'
tags: ['Playwright', 'GitHub Actions', 'テスト']
categories: ['dev-stack']
---

## はじめに

Playwright で E2E テストを書くと、テスト数が増えるにつれ CI 時間が伸びます。1 マシンで全件直列実行すると 10 分以上かかることも。GitHub Actions の **matrix** と Playwright の **shard** 機能を組み合わせると、CI 時間を半減〜 1/4 に圧縮できます。

## 基本: workers で 1 マシン内並列

最も簡単なのは 1 ジョブ内での並列実行。`playwright.config.ts` の `workers` を増やします。

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined, // CI では 2 workers
  retries: process.env.CI ? 2 : 0,
});
```

GitHub Actions の標準 runner は CPU 2 コアなので、`workers: 2` が無難です。`fullyParallel: true` をつけるとファイル内のテストも並列化されます。

## マトリクスでブラウザ別並列

Chromium / WebKit / Firefox を同時に走らせるには matrix を使います。

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        project:
          - chromium-desktop
          - chromium-mobile
          - webkit-mobile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npx playwright install --with-deps chromium webkit
      - run: npx playwright test --project=${{ matrix.project }}

      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.project }}
          path: playwright-report/
          retention-days: 7
```

3 ジョブが並列に動くので、所要時間は最も遅い 1 ジョブの時間になります。`fail-fast: false` で 1 つコケても他は走り続けるようにします。

## shard で更に分割

テスト数が多いプロジェクトでは、同じブラウザ内でも shard 分割すると並列度が上がります。

```yaml
strategy:
  matrix:
    shardIndex: [1, 2, 3, 4]
    shardTotal: [4]

steps:
  - run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
```

4 つの runner が test ファイルを 4 等分して実行します。マトリクスでブラウザ × shard のかけ算にすれば `3 × 4 = 12` ジョブの並列も可能です（ただし無料枠の同時実行数に注意）。

## ブラウザインストールのキャッシュ

`playwright install --with-deps chromium` は毎回数十秒かかります。GitHub Actions のキャッシュで保存すると 5 秒以下に短縮できます。

```yaml
- uses: actions/cache@v4
  id: playwright-cache
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

- if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps chromium webkit

- if: steps.playwright-cache.outputs.cache-hit == 'true'
  run: npx playwright install-deps chromium webkit
```

ブラウザバイナリ自体はキャッシュ、システム依存パッケージは毎回 `install-deps` で入れる、という分岐パターンです。

## flake 対策

E2E はネットワークやタイミングに左右されてフレーキーになりがちです。Playwright で取れる対策を順に見ます。

### 1. `auto-waiting` を信じる

Playwright は `await page.click('button')` のようなアクションで自動的に要素の visible/clickable を待ちます。`waitForTimeout(500)` のような固定スリープは禁じ手。

### 2. ロケータの安定化

```typescript
// NG: テキストや構造に依存しすぎ
await page.click('div.menu > button:nth-child(3)');

// OK: data-testid やロールベース
await page.getByTestId('menu-logout').click();
await page.getByRole('button', { name: 'ログアウト' }).click();
```

`getByRole` / `getByTestId` はリファクタ耐性が高くフレーキーが減ります。

### 3. retries は 2 まで

`retries: 2` で 3 回試行。これ以上は「テスト自体が壊れている可能性」が高いので、増やすより原因を直すべきです。CI 上のみ retry を効かせ、ローカルでは 0 にして気付きやすくするのが定番です。

### 4. trace を残して原因分析

```typescript
use: {
  trace: 'on-first-retry', // リトライ時にトレース取得
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
}
```

失敗時のスクリーンショット・動画・タイムライン付きトレースを upload-artifact で持ち帰れば、ローカルで `playwright show-trace trace.zip` で再現できます。

## webServer での Next.js 起動

Playwright 設定の `webServer` で開発サーバを自動起動します。

```typescript
webServer: {
  command: 'npm run dev',
  url: 'http://localhost:3000',
  reuseExistingServer: !process.env.CI,
  timeout: 2 * 60 * 1000,
},
```

CI では `reuseExistingServer: false` で毎回新規起動、ローカルでは既存を再利用、と挙動を分けます。`timeout` は dev サーバ起動が遅いプロジェクトでは長めに取ります。

## アーティファクトの収集

失敗時のレポートは PR コメントで参照できると便利。

```yaml
- if: always()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report-${{ matrix.project }}
    path: |
      playwright-report/
      test-results/
    retention-days: 14
```

レポートが残っていれば、GitHub Actions の Summary から URL を踏んで HTML レポートを開いて細かく追える状態になります。

## 実装ノート

本記事では `--shard` でテストを N 分割する方法を紹介したが、nagiyu-platform の現状はシャーディングを使っていない。私が採っているのは **プロジェクト（ブラウザ × viewport）単位でジョブを分ける** やり方で、`services/portal/web/playwright.config.ts` に `chromium-desktop` / `chromium-mobile` / `webkit-mobile` の 3 プロジェクトを定義し、CI 側（`.github/workflows/portal-verify.yml`）でプロジェクトごとに別ジョブを立てている。各ジョブは `--project=chromium-mobile` のように 1 プロジェクトだけを走らせる。

ジョブ内の `workers` はむしろ絞っていて、自分の設定では `workers: isCI ? 1 : undefined` にしている。本記事で「2 コアだから workers:2」と書いた一般論とは逆だが、並列度はジョブ分割側で稼ぐ前提なので、1 ジョブ内は安定重視で 1 worker、というのが nagiyu-platform での落としどころだ。`webServer` も CI では `npm run dev` ではなく `npm run start`（本番ビルドを `next start`）に切り替えていて、HMR や JIT compile、React StrictMode の二重発火に由来する flaky をここで抑えている。

## 現在の運用

nagiyu-platform では、3 プロジェクトを「常時」と「develop PR 限定」に分けて運用している。`chromium-mobile` のジョブだけは全 PR で必ず走り、`chromium-desktop` と `webkit-mobile` のジョブには `if: github.base_ref == 'develop'` を付けて、develop 向け PR のときだけ動くようにしている。私たちはこれを Fast / Full と呼んでいて、integration など develop 以外を狙う PR は chromium-mobile のみの Fast、develop を狙う PR は 3 プロジェクト全部の Full、という二段構えだ。

結果は 1 つの PR コメントに集約している。`report` ジョブが各ジョブの結果を Markdown のテーブルにまとめ、`isFull = github.base_ref === 'develop'` の判定で「Full Verification」「Fast Verification」の見出しを出し分ける。各 E2E の HTML レポートは S3（`s3://nagiyu-e2e-reports/...`）へ sync して `reports.nagiyu.com/portal/pr-<番号>/<run_id>/<project>/` で開けるようにし、コメントの表から「📊 View」で直接飛べる。自分が PR を見るときは、まずこのコメントで全体の合否を把握してから、気になるプロジェクトのレポートを掘る運用に落ち着いた。

## ハマったポイント

E2E を CI に載せて運用するなかで、自分が実際に手を焼いたところを残しておく。

- **同時起動するサーバのポート競合**: matrix で複数ジョブが同じ runner（ローカル並列実行時）に当たるとポート 3000 が衝突。一意な PORT を割り当てる。私もローカルで複数プロジェクトを並べたときに 3000 を取り合って詰まった。
- **CI だけ flaky になる**: nagiyu-platform では `workers: 1` + `retries: isCI ? 2 : 0` + `next start`（本番ビルド）の組み合わせに落ち着くまで、CI でだけ落ちる E2E に何度も悩まされた。dev サーバ起動のままだと特に不安定だった。
- **`fullyParallel: true` でテストの独立性が崩れる**: グローバルな状態（DB・ファイル）に依存するテストはこれだと壊れる。`describe.serial` で個別に直列化。
- **`networkidle` 待機が効かない**: 長いポーリングがあるアプリだと `waitUntil: 'networkidle'` が永遠に終わらない。明示的なロケータ待機に切り替える。
- **モバイル viewport で D&D が動かない**: `tap` イベントベースに切り替える、もしくはデスクトップのみ対象にする、と割り切る。
- **headless と headed の差**: ローカルは headed、CI は headless で動かして「ローカルで通って CI で落ちる」ケースが起きる。両方で必ず試す。

## まとめ

GitHub Actions の matrix と Playwright の shard を組み合わせると、E2E の CI 時間を大きく圧縮できます。flake 対策（getByRole / trace / retries）を併用して安定性を保てれば、E2E は十分実用的な開発フィードバックループになります。
