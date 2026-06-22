---
title: 'Next.jsでMarkdownを静的ページに変換する実装方法'
description: 'Next.jsのSSGとMarkdownファイルを組み合わせた静的サイト生成の実装方法を解説。gray-matterによるフロントマター解析・remark/rehypeによるレンダリング・generateStaticParamsの活用まで詳しく説明します。'
slug: 'nextjs-ssg-markdown'
publishedAt: '2026-04-10'
updatedAt: '2026-06-06'
author: 'なぎゆー'
tags: ['Next.js', 'Markdown', 'SSG']
categories: ['nextjs']
---

## はじめに

Next.js の SSG（Static Site Generation）機能と Markdown ファイルを組み合わせることで、コンテンツをファイルとして管理しながら高速な静的サイトを構築できます。本記事では、個人開発で運用しているサイトの実装を参考に、Markdown ベースのコンテンツ管理システムの作り方を解説します。

## 必要なパッケージのインストール

まず、必要なパッケージをインストールします。

```bash
npm install gray-matter remark remark-html rehype-highlight unified remark-parse remark-rehype rehype-stringify
npm install --save-dev @types/mdast
```

- **gray-matter**: Markdown ファイルのフロントマター（YAML）を解析する
- **remark**: Markdown を処理するライブラリ
- **rehype**: HTML を処理するライブラリ
- **unified**: remark と rehype をパイプライン処理で繋ぐフレームワーク

## フォルダ構成

```
src/
├── content/
│   ├── services/
│   │   └── tools/
│   │       ├── index.md
│   │       ├── guide.md
│   │       └── faq.md
│   └── tech/
│       └── aws-batch-architecture.md
├── lib/
│   └── markdown.ts   # Markdownファイルの読み込み・変換処理
└── app/
    └── services/
        └── [service]/
            └── [type]/
                └── page.tsx
```

## gray-matter によるフロントマター解析

### TypeScript の型定義

```typescript
// src/types/content.ts
export type ServiceDocType = 'overview' | 'guide' | 'faq';

export interface ServiceDocFrontmatter {
  title: string;
  description: string;
  service: string;
  type: ServiceDocType;
  updatedAt: string;
}

export interface ServiceDoc {
  frontmatter: ServiceDocFrontmatter;
  content: string;
  htmlContent: string;
}

export interface TechArticleFrontmatter {
  title: string;
  description: string;
  slug: string;
  publishedAt: string;
  updatedAt?: string;
  tags: string[];
  categories?: string[];
  author?: string;
}

export interface TechArticle {
  frontmatter: TechArticleFrontmatter;
  content: string;
  htmlContent: string;
}
```

### Markdown ファイルの読み込み処理

```typescript
// src/lib/markdown.ts
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import DOMPurify from 'isomorphic-dompurify';
import type { ServiceDoc, TechArticle } from '@/types/content';

const contentDirectory = path.join(process.cwd(), 'src/content');

export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(markdown);

  // XSS 対策として DOMPurify でサニタイズ
  return DOMPurify.sanitize(result.toString());
}

export async function getServiceDoc(service: string, type: string): Promise<ServiceDoc | null> {
  const filePath = path.join(contentDirectory, 'services', service, `${type}.md`);

  if (!fs.existsSync(filePath)) return null;

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContents);
  const htmlContent = await markdownToHtml(content);

  return {
    frontmatter: data as ServiceDoc['frontmatter'],
    content,
    htmlContent,
  };
}

export function getAllServiceSlugs(): { service: string; type: string }[] {
  const servicesDir = path.join(contentDirectory, 'services');
  const services = fs.readdirSync(servicesDir);
  const slugs: { service: string; type: string }[] = [];

  for (const service of services) {
    const serviceDir = path.join(servicesDir, service);
    if (!fs.statSync(serviceDir).isDirectory()) continue;

    const files = fs.readdirSync(serviceDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        slugs.push({ service, type: file.replace('.md', '') });
      }
    }
  }

  return slugs;
}
```

## generateStaticParams の実装

Next.js 13 以降の App Router では `generateStaticParams` を使ってビルド時に静的パスを生成します。Next.js 15 以降では `params` が非同期になり、`Promise<{ ... }>` 型として受け取る必要があります。

```typescript
// src/app/services/[service]/[type]/page.tsx
import { getAllServiceSlugs, getServiceDoc } from '@/lib/markdown';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ service: string; type: string }>;
}

export async function generateStaticParams() {
  return getAllServiceSlugs();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service, type } = await params;
  const doc = await getServiceDoc(service, type);
  if (!doc) return {};

  return {
    title: doc.frontmatter.title,
    description: doc.frontmatter.description,
    openGraph: {
      title: doc.frontmatter.title,
      description: doc.frontmatter.description,
    },
  };
}

export default async function ServiceDocPage({ params }: Props) {
  const { service, type } = await params;
  const doc = await getServiceDoc(service, type);
  if (!doc) notFound();

  // htmlContent は markdownToHtml() 内で DOMPurify.sanitize() 済み
  return (
    <article>
      <h1>{doc.frontmatter.title}</h1>
      <p>最終更新: {doc.frontmatter.updatedAt}</p>
      <MarkdownContent html={doc.htmlContent} />
    </article>
  );
}
```

## Tech 記事の一覧ページ

```typescript
// src/lib/tech.ts
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { TechArticle } from '@/types/content';
import { markdownToHtml } from './markdown';

const techDirectory = path.join(process.cwd(), 'src/content/tech');

export function getAllTechSlugs(): string[] {
  const files = fs.readdirSync(techDirectory);
  return files.filter((f) => f.endsWith('.md')).map((f) => f.replace('.md', ''));
}

export async function getTechArticle(slug: string): Promise<TechArticle | null> {
  const filePath = path.join(techDirectory, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContents);
  const htmlContent = await markdownToHtml(content);

  return {
    frontmatter: data as TechArticle['frontmatter'],
    content,
    htmlContent,
  };
}

export async function getAllTechArticles(): Promise<TechArticle[]> {
  const slugs = getAllTechSlugs();
  const articles = await Promise.all(slugs.map((slug) => getTechArticle(slug)));
  return articles
    .filter((a): a is TechArticle => a !== null)
    .sort(
      (a, b) =>
        new Date(b.frontmatter.publishedAt).getTime() -
        new Date(a.frontmatter.publishedAt).getTime()
    );
}
```

## ビルド時のパフォーマンス

`generateStaticParams` を使うことで、すべてのページがビルド時に HTML として生成されます。リクエスト時のサーバーサイドレンダリングが不要になるため、CDN からの静的配信で最高のパフォーマンスを発揮します。

## 実装ノート

この仕組みは個人開発で運用しているサイトでまさに使っているものなので、実際の実装を正直に書いておきます。本文では `lib/markdown.ts` と `lib/tech.ts` に分けた例を出しましたが、私の手元の実コードでは読み込み・変換ロジックを `src/lib/content.ts` 1 ファイルに集約しています。サービスドキュメント・技術記事・カテゴリ別ハブを、ほぼ同じ `gray-matter` + `remark` のパイプラインで扱うため、ファイルを分けるより 1 箇所にまとめた方が見通しがよかったからです。

変換パイプラインも記事のサンプルとは少し違います。私が実際に使っているのは次の構成です。

```typescript
const result = await remark()
  .use(remarkGfm) // GFM（表・チェックボックス等）
  .use(remarkRehype)
  .use(rehypeStringify)
  .process(markdown);
return DOMPurify.sanitize(result.toString());
```

ここで自分が意識的に選んだのが 2 点。1 つは `remark-gfm` を入れて表組みを使えるようにしたこと（技術記事で素材マッピングの表をよく書くので必須でした）。もう 1 つは、本記事冒頭で挙げた `rehype-highlight` を**あえて採用していない**ことです。シンタックスハイライト用の CSS とクラスを抱え込むより、`MarkdownContent` コンポーネント側で MUI の `sx` を使って `code` / `pre` に `grey.100` の背景と角丸を当てるだけにしました。軽量さを優先した判断です。

## ハマったポイント

- **SSR で動く DOMPurify**: 出力 HTML は最終的に `dangerouslySetInnerHTML` で描画するので、私は `markdownToHtml()` の最後で必ず `DOMPurify.sanitize()` を通しています。ただし通常の `dompurify` はブラウザの `window` 前提で、ビルド時（Node）では動きません。`isomorphic-dompurify` に差し替えてようやく SSG ビルドが通りました。
- **フロントマターは型キャストで素通し**: `matter()` の戻り値を `data as ArticleMeta` とキャストしているだけで、ランタイムの形式検証はしていません。タグ名のスペルミスなどはビルドが教えてくれないので、自分でレビュー時に気をつける運用になっています。

## 現在の運用

今の自分の実運用では、この仕組みの上で 20 本以上の技術記事に加えて、各種ドキュメント（overview / guide / faq）とカテゴリ別ハブページを、すべて Markdown ファイルとして管理しています。記事を 1 本足したいときは `src/content/tech/` に `.md` を置くだけで、`getAllArticles()` が拾って一覧・`sitemap.xml`・関連記事（タグ一致数でスコアリング）まで自動で繋がるようにしてあります。コンテンツをコードと同じリポジトリで Git 管理できるのが、自分にとってこの構成の一番のメリットです。

## まとめ

Next.js の SSG と Markdown を組み合わせることで、コンテンツをファイルで管理しながらも高速な静的サイトを構築できます。gray-matter でフロントマターを解析し、unified/remark/rehype でコンテンツを HTML に変換、`generateStaticParams` でビルド時に全ページを生成するパターンは、ドキュメントサイト・ブログ・ポータルサイトなど幅広い用途に活用できます。
