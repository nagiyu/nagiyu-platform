---
title: 'Next.js 16 Metadata API で SEO・OGP・JSON-LD を整える'
description: 'Next.js 16 App Router の Metadata API を使って、title・description・OGP・Twitter Card・canonical・JSON-LD を体系的に管理する方法を解説。SSG ページと動的ページそれぞれの設定パターンを実装例で紹介します。'
slug: 'nextjs16-metadata-api'
publishedAt: '2026-04-30'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['Next.js', 'SEO', 'メタデータ']
---

## はじめに

Next.js 13 で導入された App Router の Metadata API は、SEO や OGP を**ファイル単位の export として宣言的に書ける**のが特徴です。Next.js 16 では完成度が上がり、動的メタデータ・OpenGraph 画像・JSON-LD まで一貫した方法で扱えるようになりました。本記事では nagiyu ポータルでの実装をベースに、実用的な設定パターンを整理します。

## 静的メタデータ：`metadata` を export

最も基本のパターン。ページ単位またはレイアウト単位で `metadata` を export します。

```typescript
// app/about/page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'nagiyu について',
  description: 'nagiyu は個人開発者が提供する Web サービスのポータルサイトです。',
  alternates: {
    canonical: 'https://nagiyu.com/about',
  },
};
```

ページの `metadata` はレイアウトの `metadata` をマージで上書きします。共通の OGP・Twitter 設定はルートレイアウトに置き、ページ固有の差分だけ書く運用が綺麗です。

## ルートレイアウトの基本セット

```typescript
// app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL('https://nagiyu.com'),
  title: {
    default: 'nagiyu',
    template: '%s - nagiyu',
  },
  description: '個人開発の Web サービスポータル',
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName: 'nagiyu',
    images: [{ url: '/og-default.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-default.png'],
  },
};
```

- **`metadataBase`**: 相対 URL を絶対 URL に変換する基点。これがないと `og:image` が相対パスのまま出力される
- **`title.template`**: `%s` がページ側 `title` で置換される。「記事タイトル - nagiyu」を自動で組み立てられる
- **`title.default`**: ページが `title` を指定しなかったときのフォールバック

## 動的メタデータ：`generateMetadata`

`/tech/[slug]` のような動的ルートでは、URL パラメータから記事を取得してメタデータを組み立てます。

```typescript
// app/tech/[slug]/page.tsx
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug).catch(() => null);
  if (!article) return { title: '記事が見つかりません' };

  const url = `/tech/${slug}`;
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      publishedTime: new Date(article.publishedAt).toISOString(),
      modifiedTime: article.updatedAt
        ? new Date(article.updatedAt).toISOString()
        : new Date(article.publishedAt).toISOString(),
      tags: article.tags,
    },
  };
}
```

`generateMetadata` の戻り値は通常の `Metadata` 型と同じ。**SSG 時は `generateStaticParams` で展開されたパスごとに 1 回だけ呼ばれる**ので、コストの高い処理を入れても全体ビルドにのみ影響します。

## OG 画像の動的生成

`opengraph-image.tsx` を置くと、各ページ専用の OG 画像をビルド時に生成できます。

```typescript
// app/tech/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage({ params }: { params: { slug: string } }) {
  const article = await getArticle(params.slug);
  return new ImageResponse(
    (
      <div style={{ display: 'flex', fontSize: 64, padding: 80 }}>
        {article.title}
      </div>
    ),
    { ...size }
  );
}
```

CSS の対応範囲は限定的（Flex 中心）ですが、フォントを `await fetch` で読み込んで日本語にも対応できます。記事タイトルが入った OG 画像は X / Slack でのクリック率向上に効きます。

## JSON-LD の埋め込み

Metadata API は `meta` タグを管理しますが、JSON-LD は `<script type="application/ld+json">` を直接埋めるのが定石です。

```typescript
// app/tech/[slug]/page.tsx
function articleJsonLd(article: ArticleMeta) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    datePublished: new Date(article.publishedAt).toISOString(),
    dateModified: article.updatedAt
      ? new Date(article.updatedAt).toISOString()
      : new Date(article.publishedAt).toISOString(),
    author: { '@type': 'Person', name: 'なぎゆー' },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await getArticle(slug);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleJsonLd(article)).replace(/</g, '\\u003c'),
        }}
      />
      <article>{article.title}</article>
    </>
  );
}
```

`</script>` インジェクションを防ぐため `<` を `<` にエスケープしています。Google Rich Results Test で検証して `Article` が認識されれば OK です。

## viewport / themeColor の分離

Next.js 14 から `viewport` と `themeColor` は `metadata` から独立した別 export になりました。

```typescript
import type { Viewport } from 'next';

export const viewport: Viewport = {
  themeColor: '#1976d2',
  width: 'device-width',
  initialScale: 1,
};
```

古い記事を見て `metadata.viewport` に書くと型エラーになるので注意します。

## sitemap.ts と robots.ts

Metadata API のファミリーとして `app/sitemap.ts` と `app/robots.ts` があります。

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://nagiyu.com/', changeFrequency: 'weekly', priority: 1.0 },
    { url: 'https://nagiyu.com/about', changeFrequency: 'monthly', priority: 0.7 },
  ];
}
```

```typescript
// app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: 'https://nagiyu.com/sitemap.xml',
  };
}
```

`public/robots.txt` を直接配置するより、コードで管理して動的 URL も生成できる方がメンテナンス性が高いです。

## ハマりどころ

- **`metadataBase` 未設定で OG 画像が壊れる**: 開発環境では相対パスでも動くが、本番で OGP プレビューが画像なしになる。
- **`generateMetadata` 内で `await params` を忘れる**: `params.slug` が `Promise` のままになり TypeScript エラー。
- **`title.template` がトップページに勝手に効く**: ルートページで明示的に `title` を指定しないと、`default` がそのまま出る。
- **JSON-LD のエスケープ漏れ**: `</script>` を含む文字列が JSON 内にあると HTML が壊れる。`<` を `<` 化する。
- **静的アセットのキャッシュ無効化**: `opengraph-image.tsx` の出力ファイル名がコンテンツハッシュ付きで生成されるため、デプロイ後に古い画像が残ることはほぼないが、CDN 設定で誤って固定パスにしないよう注意。

## まとめ

Next.js 16 の Metadata API は、SEO・OGP・JSON-LD・Sitemap・Robots を **コード化された宣言**として一元管理できる仕組みです。レイアウトとページの階層的なマージ、`generateMetadata` による動的化、`opengraph-image.tsx` による OG 画像生成を組み合わせれば、技術ブログから本格的な Web サービスまで安定して SEO 対応できます。
