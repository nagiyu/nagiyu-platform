---
title: 'Next.js generateStaticParams 完全ガイド：SSG の動的ルートを使いこなす'
description: 'Next.js App Router の generateStaticParams を使って動的ルートを SSG ビルド時に展開する方法を解説。複数階層の動的ルート・dynamicParams・部分的 SSG（ISR）・型安全な実装まで網羅します。'
slug: 'nextjs-generate-static-params'
publishedAt: '2026-04-28'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['Next.js', 'SSG', 'App Router']
categories: ['nextjs']
---

## はじめに

Next.js の App Router で動的ルート（`[slug]` のようなパス）を **ビルド時に静的 HTML として書き出す**には `generateStaticParams` を使います。`getStaticPaths` の置き換えに見えますが、実際には型推論や階層構造の扱いが洗練されています。本記事では nagiyu ポータルでの実装をベースに整理します。

## 最小例

```typescript
// app/tech/[slug]/page.tsx
type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const articles = getAllArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await getArticle(slug);
  return <article>{article.title}</article>;
}
```

`generateStaticParams` が返す配列の各要素が、ビルド時に展開されるパス（`/tech/foo`, `/tech/bar` …）になります。**File システムから記事を読む場合でも、ビルド時に同期的に解決できる**のが SSG の前提です。

## params が Promise なのが Next.js 16 流

Next.js 15 以降、`params` は **Promise でラップされた**型に変わりました。Server Component なら `await params` でほどけます。

```typescript
// Next.js 14 まで
function Page({ params }: { params: { slug: string } }) {
  return <div>{params.slug}</div>;
}

// Next.js 15+ / 16
async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <div>{slug}</div>;
}
```

これは将来的に並列レンダリングを前提にした変更で、`params` を読まないコードは早期に return できる、という最適化のためです。

## 多階層の動的ルート

`/services/[slug]/[type]` のようにディレクトリが入れ子になっている場合、各階層の `page.tsx` が **それぞれ** `generateStaticParams` を持てます。

```typescript
// app/services/[slug]/page.tsx
export async function generateStaticParams() {
  return getAllServiceSlugs().map((slug) => ({ slug }));
}
```

```typescript
// app/services/[slug]/guide/page.tsx
export async function generateStaticParams() {
  return getAllServiceSlugs().map((slug) => ({ slug }));
}
```

guide 配下にさらに `[step]` がある場合は、親の slug を引数として受け取って組み合わせ列を返します。

```typescript
// app/services/[slug]/guide/[step]/page.tsx
type Parent = { slug: string };

export async function generateStaticParams({ params }: { params: Parent }) {
  const steps = await getGuideSteps(params.slug);
  return steps.map((step) => ({ step: step.id }));
}
```

親階層から渡される `params` は **同期的なオブジェクト**で、`Promise` ではない点に注意します（page.tsx の引数とは別物）。

## dynamicParams で「未生成のパス」をどう扱うか

`generateStaticParams` で返さなかった slug にアクセスされたときの挙動は、`dynamicParams` で決めます。

```typescript
// 未生成パスは 404
export const dynamicParams = false;

// 未生成パスはオンデマンドで生成（既定値）
export const dynamicParams = true;
```

ブログ記事のように **コンテンツが固定なら false**、ユーザー生成コンテンツのように **後から追加されるなら true**、という選び分けです。

## 部分的 SSG（ISR）との組み合わせ

`generateStaticParams` でビルド時に主要記事だけ生成し、それ以外はリクエスト時にレンダリングして 1 時間キャッシュ、という戦略が `revalidate` で書けます。

```typescript
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  // 人気記事 100 本だけビルド時に生成
  const popular = await getPopularArticles(100);
  return popular.map((a) => ({ slug: a.slug }));
}
```

ビルド時間を短く保ちつつ、長尾の記事は遅延生成で対応できます。

## 型を効かせる

`Awaited` と `ReturnType` を組み合わせて、`generateStaticParams` の戻り値から `params` の型を導けます。

```typescript
type ParamShape = Awaited<ReturnType<typeof generateStaticParams>>[number];

export default async function Page({ params }: { params: Promise<ParamShape> }) {
  const { slug } = await params;
  // ...
}
```

slug の型を片側でだけ書けば良くなり、リファクタ時のミスが減ります。

## ビルド出力の確認

`next build` の最後にルートごとの出力が表示されます。

```
Route (app)
├ ● /tech/[slug]                   1.2 kB         85 kB
│   ├ /tech/aws-batch-architecture
│   ├ /tech/cloudfront-ecs-deployment
│   └ [+3 more paths]
```

`●` が SSG（generateStaticParams で展開された）、`○` が 完全静的、`ƒ` が動的です。意図したパスが SSG 化されているかをここで必ず確認します。

## generateStaticParams 内で fetch する

DB や外部 API からスラッグ一覧を取る場合、`generateStaticParams` 内で `fetch` を呼んで構いません。Next.js は同一 build 内で同じ URL の `fetch` 結果をデフォルトでキャッシュするので、複数の `generateStaticParams` から同じ API を叩いても効率的です。

```typescript
export async function generateStaticParams() {
  const res = await fetch('https://api.example.com/articles', {
    next: { revalidate: false }, // ビルド時固定
  });
  const articles = await res.json();
  return articles.map((a: { slug: string }) => ({ slug: a.slug }));
}
```

## ハマりどころ

- **build 時にだけ存在する環境変数を読み忘れる**: `process.env.DATABASE_URL` などをビルドコンテナに渡し忘れて `generateStaticParams` が空配列を返す。next build のログで「Generating static pages (0/0)」になっていたら要注意。
- **`null` / `undefined` を返す**: 戻り値はオブジェクト配列でないとビルドエラーになる。`articles?.map(...)` のような optional chaining で空配列を保証する。
- **slug に「/」を含めてしまう**: 多階層ルート（`[...slug]`）でない限り、slug 文字列にスラッシュは入れない。
- **Production build と dev で出力が異なる**: dev は常に動的レンダリング。SSG 確認は `next build && next start` で行う。

## まとめ

`generateStaticParams` は、App Router で動的ルートを SSG 化するための中心 API です。`params` の Promise 化、多階層構造、`dynamicParams` と `revalidate` の組み合わせを押さえると、「主要ページは事前生成、長尾はオンデマンド」のような柔軟な戦略が型安全に書けます。
