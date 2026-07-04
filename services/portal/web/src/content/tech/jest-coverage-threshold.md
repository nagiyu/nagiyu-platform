---
title: 'Jest の coverageThreshold で 80% カバレッジを CI で強制する'
description: 'Jest の coverageThreshold を使って statements / branches / functions / lines を 80% で足切りし、カバレッジ低下を CI で自動失敗させる方法を解説。collectCoverageFrom による対象の絞り込み、ts-jest と next/jest（v8）の違い、モノレポでの運用ノウハウまで実運用ベースで紹介します。'
slug: 'jest-coverage-threshold'
publishedAt: '2026-07-01'
author: 'なぎゆー'
tags: ['Jest', 'テスト', 'CI/CD', 'TypeScript']
categories: ['dev-stack']
---

## はじめに

テストは書いた瞬間から腐り始めます。新機能を足したのにテストは足さない、リファクタで分岐が増えたのにケースは増えない——こうしてカバレッジは静かに下がっていきます。人間のレビューだけで「カバレッジが下がっていないか」を毎回見張るのは非現実的です。

Jest には **`coverageThreshold`** という設定があり、カバレッジが指定値を下回ると `jest` コマンド自体が exit code 1 で失敗します。CI に組み込めば「カバレッジ低下＝ビルド失敗」を機械的に強制でき、レビュアーは中身の議論に集中できます。本記事では、モノレポで 30 以上のパッケージすべてに 80% しきい値を敷いている構成をベースに、実践的な設定と運用を解説します。

## coverageThreshold の基本

最小構成はこれだけです。`jest.config.ts` に `coverageThreshold` を書きます。

```typescript
import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/index.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
```

この状態で `jest --coverage` を実行し、いずれかの指標が 80% を割ると次のように落ちます。

```
Jest: "global" coverage threshold for branches (80%) not met: 72.5%
```

ポイントは、**しきい値チェックは `--coverage` を付けたときだけ効く**ことです。カバレッジ計測をしないと比較対象が生成されないため、CI では必ず `--coverage` を付けて走らせます。ローカルの高速な反復では外す、という使い分けが定番です。

## 4 つの指標の意味

`coverageThreshold` には 4 つの指標を指定できます。それぞれ計測単位が違うので、意味を押さえておくと数字の読み方が変わります。

| 指標         | 数える単位   | 下がりやすい原因                           |
| ------------ | ------------ | ------------------------------------------ |
| `statements` | 実行された文 | 単純な未実行行                             |
| `lines`      | 実行された行 | statements とほぼ連動                      |
| `functions`  | 呼ばれた関数 | 使われないヘルパー・未テストの分岐関数     |
| `branches`   | 通った分岐   | `if` / 三項 / `??` / `&&` の片側だけテスト |

実務で最初に落ちるのはほぼ **`branches`** です。ハッピーパスだけ書くと文・行・関数は通っても、エラー系や `??` のフォールバック側が通らず branches だけ 80% を割る、という形になります。逆に言えば branches を 80% に保てれば、異常系のテストが自然と書かれている状態になります。

```typescript
export function getCategoryLabel(slug: string): string {
  // ?? の右側（未知 slug）をテストしないと branches が下がる
  return CATEGORY_LABEL_MAP[slug] ?? slug;
}
```

上のような関数は、既知 slug のケースだけだと branches 50%。未知 slug を渡すケースを 1 本足して初めて 100% になります。

## collectCoverageFrom で対象を絞る

`coverageThreshold` は「計測対象ファイル全体」に対する割合で判定します。つまり **どこまでを分母に含めるか**（`collectCoverageFrom`）が、しきい値の厳しさそのものを決めます。

```typescript
collectCoverageFrom: [
  'src/**/*.{ts,tsx}',
  '!src/**/*.d.ts',   // 型定義は実行コードでないので除外
  '!src/**/index.ts', // 再エクスポートだけの barrel は除外
],
```

除外していないと、`index.ts` の再エクスポートや型定義ファイルが「0% のファイル」として分母に入り、しきい値を不当に押し下げます。逆に、テストしていないファイルを安易に除外リストへ足すと、しきい値が「見かけ倒し」になります。**除外は "実行コードでないもの" に限る**のが健全な線引きです。

Next.js のアプリ側では、UI（`components/` や `app/`）を分母から外し、ロジック層（`lib/`）だけを対象にしている例もあります。

```typescript
// UI は E2E とコンポーネントテストで担保し、ユニットのしきい値はロジックに集中させる
collectCoverageFrom: ['src/lib/**/*.{ts,tsx}', '!src/**/*.d.ts'],
```

これは「UI とビジネスロジックを分離し、ロジックをユニットで厚く守る」方針と揃えると効きます。分母をどう引くかは、テスト戦略の宣言そのものです。

## CI で強制する

しきい値は「ローカルで通ればよい」ものではなく、CI で必ず走らせて初めて意味を持ちます。GitHub Actions ならジョブ 1 つで十分です。

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --coverage
```

`--coverage` さえ渡っていれば、しきい値割れは自動で exit 1 になり、ジョブが赤くなります。追加のスクリプトやパーサは不要で、Jest 自身がゲートになります。モノレポでは、変更のあったワークスペースだけ `--coverage` 付きで回す差分実行にすると、CI 時間を抑えつつしきい値を効かせられます。

## ts-jest と next/jest（v8）の違い

同じ 80% しきい値でも、パッケージの性質でカバレッジプロバイダを変えると安定します。

**ライブラリ（Node 環境）は `ts-jest`。** 素直に TypeScript をトランスパイルして計測します。

```typescript
{
  preset: 'ts-jest',
  testEnvironment: 'node',
}
```

**Next.js アプリは `next/jest` + `coverageProvider: 'v8'`。** `next/jest` が SWC 経由の変換や `.env` 読み込み、CSS Modules のスタブ化などをまとめて面倒見てくれます。v8 プロバイダは Babel 計装より高速で、Next.js の変換パイプラインとの相性も良いです。

```typescript
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.module\\.css$': 'identity-obj-proxy',
  },
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};

export default createJestConfig(config);
```

しきい値の数字は同じでも、プロバイダが違うと端数の丸めがわずかにズレることがあります。「片方の CI では 80.0% で通るのに、もう片方で 79.9%」のような差はここから来ます。

## 実装ノート

自分のモノレポでは、しきい値を **全パッケージ一律 80%（branches / functions / lines / statements）** で統一しています。パッケージごとに数字を変えると「ここは 70% でいい」という例外交渉が始まり、なし崩しに緩みます。数字を触る余地をなくすのが運用上いちばん効きました。

`collectCoverageFrom` は共通方針を決めていて、ライブラリ側は `!src/**/index.ts` で barrel を必ず除外しています。再エクスポートしかない `index.ts` はテスト不能なのに分母を押し下げるだけなので、これを外すかどうかでしきい値の体感が大きく変わります。Web サービスでは分母を `src/lib/**` に寄せ、UI は Jest のしきい値ではなく Playwright の E2E とコンポーネントテスト側で担保する、という二段構えにしています。ユニットのしきい値であらゆる UI を 80% まで詰めるのは費用対効果が悪い、というのが実感です。

## ハマったポイント

しきい値運用を回すなかで、自分が実際に手を焼いたところを残しておきます。

- **remark / rehype 系が ESM-only で transform されない**: Portal のブログは Markdown を remark/rehype で HTML 化していますが、これらは ESM 専用パッケージで、`next/jest` のデフォルトの `transformIgnorePatterns` に弾かれて `SyntaxError: Cannot use import statement outside a module` になりました。`createJestConfig()` を await した後で `transformIgnorePatterns: ['/node_modules/(?!(remark|rehype|unified|micromark.*|mdast-util.*|...)/)']` と上書きし、対象パッケージだけ変換に含める必要があります。ここは一度ハマると原因が見えづらいです。
- **`index.ts` を除外し忘れて全体が数 % 下がる**: barrel ファイルが分母に入ると、実装は 85% あるのにプロジェクト全体では 78% で落ちる、という不可解な失敗になりました。`collectCoverageFrom` の除外漏れを最初に疑います。
- **`branches` だけ落ちる**: statements / lines / functions は 80% を超えているのに branches だけ 79%、というのが一番多いです。原因はたいてい `??` や `if (!x) throw` の異常系未テストです。カバレッジレポートの HTML を開き、黄色（分岐の片側未実行）をつぶすと直ります。
- **v8 と ts-jest で端数がズレる**: CI を分けていると、片方は 80.0% で緑、もう片方が 79.95% で赤、という僅差事故が起きます。しきい値ぎりぎりを常態にせず、数 % のマージンを持って書くのが結局は楽でした。
- **`--coverage` の付け忘れ**: ローカルで `jest` だけ叩いて「通った」と思い込むと、しきい値チェックはスキップされています。CI とローカルでコマンドを揃えておかないと、CI で初めて落ちます。

## まとめ

`coverageThreshold` は、たった数行でカバレッジ低下を CI の失敗に変えられる強力なゲートです。要点は 3 つ——**4 指標のうち branches が実質的な難所**であること、**`collectCoverageFrom` の分母設計がしきい値の厳しさを決める**こと、そして **`--coverage` を付けて CI で必ず走らせる**ことです。数字は一律 80% に固定し、除外は「実行コードでないもの」に限定します。この線引きさえ守れば、しきい値はテストの質を静かに支え続けてくれます。
