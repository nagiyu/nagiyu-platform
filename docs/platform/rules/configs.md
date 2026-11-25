---
sources:
  - configs/tsconfig.base.json
  - configs/tsconfig.web.json
  - configs/eslint.config.base.mjs
  - configs/eslint.config.web.mjs
  - configs/eslint.config.core.mjs
  - configs/eslint.config.no-restricted-mui.mjs
  - configs/next.config.base.ts
  - configs/playwright.config.base.ts
  - .prettierrc
sources_hash: 5cfc98fba4b97e7004861bd0a42fe3123975360432adabd3e2216cce76572e82
---

# 設定ファイルの規約

`configs/` の共通設定と `.prettierrc` を、各パッケージがどう使うかの規則。設定の中身は、そのファイルを読む。

## 共通設定の継承

### 設定は共通のものを継承し、パッケージごとに書き直さない

モノレポ全体で設定を統一し、変更を 1 か所で済ませるためである。

| 共通設定 | 継承するもの |
|---|---|
| `configs/tsconfig.base.json` | libs、core、batch、`lambda/*`、`docs-site`、`infra/common` の `tsconfig.json` |
| `configs/tsconfig.web.json` | web の `tsconfig.json` (`services/tools` を含む。`tsconfig.base.json` を継承している) |
| `configs/eslint.config.base.mjs` | libs、infra、`docs-site` の `eslint.config.mjs` (core と web の設定も土台にしている) |
| `configs/eslint.config.core.mjs` | core、batch、`lambda/*` の `eslint.config.mjs` ([アーキテクチャの規約](./architecture.md)) |
| `configs/eslint.config.web.mjs` | web の `eslint.config.mjs` (MUI の直接 import の禁止を含む。[UI コンポーネントの規約](./ui-components.md)) |
| `configs/next.config.base.ts` | web の `next.config.ts` |
| `configs/playwright.config.base.ts` | web の `playwright.config.ts` ([E2E の規約](./e2e.md)) |
| `.prettierrc` (ルート) | パッケージの `.prettierrc` がなければ、全パッケージ |

例外は次のとおり。

- infra は、`infra/common` を除き `tsconfig.base.json` ではなく `infra/tsconfig.json` を土台にする。CDK の実行に合わせた設定が要るためである。`infra/auth`・`infra/codec-converter`・`infra/shared` は何も継承せず、同じ設定を自分で書いている。
- codec-converter と quick-clip の web は、`eslint.config.web.mjs` を使わず、同じ構成 (`eslint.config.base.mjs` と `eslint.config.no-restricted-mui.mjs` の組み合わせ) を自分で組んでいる。
- `docs-site`・`libs/common`・`services/tools` は、ルートと同じ内容の `.prettierrc` を自分でも持つ。

### 共通設定で対応できないときだけ上書きし、理由をコメントに書く

継承したうえで、必要な設定だけを上書き・追加する。理由のない上書きは、あとから不要かどうかを判断できない。

```typescript
const config = {
    ...baseConfig,
    // 特殊なモジュールのトランスフォームが必要なため
    transformIgnorePatterns: ['node_modules/(?!(some-esm-module)/)'],
};
```

### libs・core・batch・`lambda/*` は `tsconfig.base.json` の基本設定の値を変えない

`target` や `moduleResolution` などの基本設定を変えたいときは、`configs/tsconfig.base.json` を変える。パッケージごとに変えると、モノレポ全体の型チェックの前提がそろわない。同じ値を書き直しても効果はなく、基本設定の変更に追従しなくなる。上書きしてよいのは、`lib`・`declaration`・`outDir` などパッケージの形に固有のものである。

## web の TypeScript

### web の `paths` は、共通の `tsconfig.web.json` ではなく各パッケージに書く

`@/*` の `paths` は、web の `tsconfig.json` ごとに書く。共通側に置かない理由は 2 つある。

- Turbopack が `${configDir}` を解決できず、`@/*` が引けなくなる。
- 相対パスで共通側に置くと、継承した設定の置き場所 (`configs/`) を基準に解決される。

`paths`・`include`・`exclude` は継承でマージされず、子で書くと丸ごと上書きになる。`references` は継承されず、パッケージごとに書く。`paths` に別名を足すときも、`@/*` を書き直す。共通側の `include` と `exclude` は `${configDir}` でパッケージのディレクトリを指す。

## ESLint

### lint の glob は、クォートして ESLint に解釈させる

`eslint` に glob を渡す libs・core・batch・`lambda/*` は、`eslint 'src/**/*.ts' 'tests/**/*.ts'` のようにクォートする。`npm run` は `sh` でスクリプトを実行し、`sh` は `**` を 1 階層分にしか展開しない。クォートしないと、直下や深い階層のファイルが検査から漏れる。

## Next.js

### `transpilePackages` は手で書かず、`createNextConfig` に導かせる

web の `next.config.ts` は `configs/next.config.base.ts` の `createNextConfig` を使う。`transpilePackages` は、サービスの `package.json` の `@nagiyu/` の依存から導かれる。手書きの一覧は、依存の増減に追従せず食い違う。サービス固有の設定 (リダイレクトやヘッダーなど) だけを、第 2 引数に渡す。

## Jest

### Jest の設定は共通の土台を持たず、パッケージごとに `jest.config.ts` を持つ

テスト環境がパッケージごとに違い (`jsdom` と `node`)、web は Next.js 固有の設定も要るためである。カバレッジの基準は [テストの規約](./testing.md) にある。

## 標準スクリプト

### パッケージは標準のスクリプト名を定義する

CI は、パッケージが持つスクリプトの名前で、かける検査を決める ([サービスの PR 検証](../specs/ci/service-verify.md))。スクリプトを定義しないと、その検査はかからず、CI も赤くならない。

| スクリプト | 内容 | 持つパッケージ |
|---|---|---|
| `build` | ビルド | libs、core、batch、`lambda/*`、web (`services/tools` を含む) |
| `lint` | ESLint | libs、core、batch、`lambda/*`、web |
| `format` | `prettier --write .` | 同上 |
| `format:check` | `prettier --check .` | 同上 |
| `test` | Jest | libs、core、batch、`lambda/*`、web |
| `test:coverage` | カバレッジつきの Jest | 同上 (例外として、niconico-mylist-assistant の batch は持たない) |
| `test:contract` | 契約テスト | 契約テストを持つ core |
| `dev`・`start` | Next.js の起動 | web |
| `test:e2e` | Playwright | web |

`test:watch` や `test:e2e:ui` など、開発の補助のスクリプトは、必要なパッケージが持つ。
