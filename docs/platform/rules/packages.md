---
sources:
  - package.json
  - .node-version
sources_hash: fc82f06016adcf6c4e9a53ee7ec47f23d10ac616b3bc7440aeb5c74f4af59546
---

# npm パッケージの管理の規約

npm パッケージの更新・置き場所・上書き (`overrides`) と、Node の版の規則。ルートの `package.json` と `.node-version` が実物である。

## 更新

### 定期の更新は、マイナーとパッチだけを対象にする

メジャー更新は破壊的変更を伴うため、独立した対応として行う。カテゴリ (フレームワーク、ライブラリ、型定義など) ごとに更新し、各段階でビルドとテストを確かめてから次へ進む。ベータ版などの理由で意図して固定したパッケージは、更新の対象にしない。

### `package-lock.json` は npm で作り直し、手で編集しない

整合性のハッシュなど、npm が計算する値が入っているためである。

## devDependencies の置き場所

### 全体で使う開発ツールは、ルートの `devDependencies` に置く

lint・テスト・型・ビルドなど、複数のワークスペースが使うツール (TypeScript、ESLint、Prettier、Jest、Playwright など) は、ルートの `devDependencies` に置く。版の食い違いを防ぎ、更新を 1 か所に集められる。

特定のワークスペースだけが使うパッケージは、そのワークスペースの `package.json` に置く。

ルートにあるものを、ワークスペースが同じ版で重ねて宣言している場合がある。infra の各ワークスペースが `aws-cdk-lib` を (`infra/shared` 以外は `constructs` も) 宣言しているのがその例である。

## overrides

### `overrides` はルートの `package.json` にだけ書く

npm が読むのはルートの `package.json` の `overrides` だけで、ワークスペースの `package.json` に書いたものは無視される ([npm の仕様](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#overrides))。

### 間接依存の脆弱性は、範囲内の更新を先に試し、足りないときだけ `overrides` で固定する

直接依存ではないパッケージに High 以上の脆弱性が見つかったときは、次の順で対処する。

1. `npm update <パッケージ名>` で、依存元が許す範囲の修正版へ更新する。
2. 範囲内に修正版がないときだけ、`overrides` で安全な版に固定する。

`npm audit --audit-level=high` を定期的に実行し、High 以上がゼロであることを確かめる。定期の実行は [定期の Issue の起票](../specs/ci/scheduled-issues.md) が受け持つ。

- パッケージ名を指定しない `npm update` は実行しない。脆弱性と無関係なパッケージまで範囲内の最新に上がり、推移依存の挙動の変化でテストやビルドが壊れる。対象を絞ると、差分が脆弱性の解消に必要な分だけになる。
- 間接依存の多くは、依存元の範囲指定に修正版が含まれていて、lock 内の更新だけで解消できる。`overrides` は依存元の範囲を無視して版を固定するため、残すほど依存元の更新と食い違う余地が増える。
- 依存元が同梱 (`bundledDependencies`) しているパッケージには `overrides` が効かない。依存元自体を更新する。
- `overrides` は暫定の対処である。依存元が修正版を出したら外す。
- `package.json` にコメントは書けないため、脆弱性への `overrides` の根拠 (CVE、GitHub Advisory) は PR に残す。脆弱性以外の `overrides` の理由は、次に書く。

### `playwright-core` は `$@playwright/test` で `@playwright/test` と同じ版に揃える

`@axe-core/playwright` が `playwright-core` を広い範囲の peerDependency で要求するため、`@playwright/test` とは別系統の新しい `playwright-core` が入ることがある。両者の `Page` 型が食い違うと、E2E テストの型チェックが落ちる。

版を直接書かず `$` で参照するのは、Playwright が `@playwright/test` と `playwright-core` を同じ版番号で出しているためである。版を直接書くと、`@playwright/test` を更新するたびに `overrides` も手で直す必要があり、忘れると食い違いが再発する。`$` で参照できるのはルートの直接依存だけなので、`@playwright/test` をルートの依存から外すときは、この `overrides` も見直す。

### `vitepress-plugin-mermaid` の `mermaid` は、`docs-site` と同じ主版にする

`vitepress-plugin-mermaid` は peerDependency を `mermaid` の 10 と 11 だけで宣言している。`docs-site` の `mermaid` だけを 12 に上げると、プラグイン用に 11 がルートへ残り、プラグインが 11 で図を描画する。

版を直接書くのは、`mermaid` が `docs-site` の依存で、`$` で参照できるルートの直接依存ではないためである。`docs-site` の `mermaid` を上げるときは、この `overrides` も直す。`vitepress-plugin-mermaid` が peerDependency に `mermaid` 12 を含めたら、外す。

### `vitepress` の `vite` と `@vitejs/plugin-vue` の `vite` を固定する

`vitepress` の配下の `vite` を、ルートの `overrides` の版に固定している。ルートの `devDependencies` の `vite` は別の版で、`vitepress` が要求する `vite` と `@vitejs/plugin-vue` の peerDependency が許す主版より新しい。

## Node

### Node は Active LTS を使い、版は `.node-version` を正にする

Dockerfile・CI・DevContainer・`package.json` の `engines.node` を含む全環境で、Node.js の Active LTS を使う。奇数の主版は LTS の対象外で、偶数でも Current の段階 (Active LTS になる前) の版は避ける。Active LTS 以外はセキュリティ更新が保証されないためである。

使う版は `.node-version` に書く。Dockerfile の Node の主版との一致は CI が検査する ([Node のメジャー版の一致の検査](../specs/ci/node-version-verify.md))。

### `@types/node` の主版は、Node のランタイムの主版に合わせる

ランタイムより新しい `@types/node` を使うと、そのランタイムにない API の型が参照できてしまう。型チェックは通っても実行時に落ちる。
