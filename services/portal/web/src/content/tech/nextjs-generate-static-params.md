---
title: 'Next.js generateStaticParams 完全ガイド：SSG の動的ルートを使いこなす'
description: 'Next.js App Router の generateStaticParams を使って動的ルートを SSG ビルド時に展開する方法を解説。複数階層の動的ルート・dynamicParams・部分的 SSG（ISR）・型安全な実装まで網羅します。'
slug: 'nextjs-generate-static-params'
publishedAt: '2026-04-28'
updatedAt: '2026-06-06'
author: 'なぎゆー'
tags: ['Next.js', 'SSG', 'App Router']
categories: ['nextjs']
---

## はじめに

Next.js の App Router で動的ルート（`[slug]` のようなパス）を **ビルド時に静的 HTML として書き出す**には `generateStaticParams` を使います。`getStaticPaths` の置き換えに見えますが、実際には型推論や階層構造の扱いが洗練されています。本記事では個人開発で運用しているサイトでの実装をベースに整理します。

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

## 実装ノート

個人開発で運用しているサービスでは、`generateStaticParams` を理屈どおりにそのまま使っています。記事ページ（`app/tech/[slug]/page.tsx`）の実装は、私が書いている本体もこれだけです。

```typescript
export async function generateStaticParams() {
  const articles = getAllArticles();
  return articles.map((article) => ({ slug: article.slug }));
}
```

ポイントは `getAllArticles()` を **非同期にしていない**ことです。一覧生成では本文 HTML への変換まではせず、各 Markdown のフロントマターだけを `gray-matter` で読み取って返すので同期関数で十分でした。本文の重い変換（remark → rehype）は、実際に記事を開いたときの `getArticle()` 側に分けています。「パス列挙は軽く、本文変換は記事単位で」という役割分担を自分の中の原則にしています。

同じパターンを別ルートでも使い回していて、カテゴリ別ハブ（`/tech/category/[category]`）は `TECH_CATEGORY_SLUGS`（`['aws', 'nextjs', 'dev-stack']`）をそのまま `map` し、タグページ（`/tech/tags/[tag]`）は「2 本以上の記事が付いたタグ」だけに絞って静的化しています。

## ハマったポイント

- **slug の文字種で routing が壊れた**: これは私が実際に一番ハマった点です。タグページの slug を素のタグ名から作っていた頃、「Next.js」のように `.` を含むものや、スペース入りのタグ（URL 上で `%20` になる）が prerender-manifest と照合されず 404 になりました。対策として `tagToSlug()` でスペース・スラッシュをハイフンに潰し、さらに `isLinkableTag()` で非 ASCII を含む slug はそもそもページ化対象から外しています。`generateStaticParams` が返す slug は「URL にそのまま乗せて安全な文字」に正規化しておけ、というのが教訓です。
- **`dynamicParams` の既定値**: カテゴリ・タグページでは `export const dynamicParams = false;` を明示し、列挙しなかった slug は 404 にしています。コンテンツが固定なら未生成パスをオンデマンド生成させる理由がないからです。
- **build 時にだけ存在する環境変数を読み忘れる**: `generateStaticParams` が空配列を返す典型例。next build のログで「Generating static pages (0/0)」になっていたら要注意。
- **Production build と dev で出力が異なる**: dev は常に動的レンダリング。SSG 確認は `next build && next start` で行う。

## 現在の運用

正直に書くと、本記事で紹介した ISR（`revalidate`）や「人気記事だけ事前生成」のような部分 SSG を、私は自分の実運用では使っていません。記事もカテゴリもタグも件数が知れているので、**全ページをビルド時に完全 SSG** してしまう方が、運用も配信もシンプルだと判断しました。CDN から静的配信するだけで済み、リクエスト時のレンダリングを考えなくてよいのが今のところ一番のメリットです。記事が桁違いに増えてビルド時間が問題になったら、そのとき初めて `revalidate` を検討すればいい、というスタンスです。

## まとめ

`generateStaticParams` は、App Router で動的ルートを SSG 化するための中心 API です。`params` の Promise 化、多階層構造、`dynamicParams` と `revalidate` の組み合わせを押さえると、「主要ページは事前生成、長尾はオンデマンド」のような柔軟な戦略が型安全に書けます。
