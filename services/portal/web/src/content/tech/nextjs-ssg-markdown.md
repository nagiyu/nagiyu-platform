---
title: "Next.jsでMarkdownを静的ページに変換する実装方法"
description: "Next.jsのSSGとMarkdownファイルを組み合わせた静的サイト生成の実装方法を解説。gray-matterによるフロントマター解析・remark/rehypeによるレンダリング・generateStaticParamsの活用まで詳しく説明します。"
slug: "nextjs-ssg-markdown"
publishedAt: "2026-04-10"
tags: ["Next.js", "Markdown", "SSG"]
---

## はじめに

Next.js の SSG（Static Site Generation）機能と Markdown ファイルを組み合わせることで、コンテンツをファイルとして管理しながら高速な静的サイトを構築できます。本記事では、nagiyu ポータルサイトの実装を参考に、Markdown ベースのコンテンツ管理システムの作り方を解説します。

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
  tags: string[];
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
import type { ServiceDoc, TechArticle } from '@/types/content';

const contentDirectory = path.join(process.cwd(), 'src/content');

export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(markdown);

  return result.toString();
}

export async function getServiceDoc(
  service: string,
  type: string
): Promise<ServiceDoc | null> {
  const filePath = path.join(
    contentDirectory,
    'services',
    service,
    `${type}.md`
  );

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

Next.js 13 以降の App Router では `generateStaticParams` を使ってビルド時に静的パスを生成します。

```typescript
// src/app/services/[service]/[type]/page.tsx
import { getAllServiceSlugs, getServiceDoc } from '@/lib/markdown';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

interface Props {
  params: { service: string; type: string };
}

export async function generateStaticParams() {
  return getAllServiceSlugs();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = await getServiceDoc(params.service, params.type);
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
  const doc = await getServiceDoc(params.service, params.type);
  if (!doc) notFound();

  return (
    <article>
      <h1>{doc.frontmatter.title}</h1>
      <p>最終更新: {doc.frontmatter.updatedAt}</p>
      <div
        dangerouslySetInnerHTML={{ __html: doc.htmlContent }}
      />
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
  return files
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace('.md', ''));
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
  const articles = await Promise.all(
    slugs.map((slug) => getTechArticle(slug))
  );
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

## まとめ

Next.js の SSG と Markdown を組み合わせることで、コンテンツをファイルで管理しながらも高速な静的サイトを構築できます。gray-matter でフロントマターを解析し、unified/remark/rehype でコンテンツを HTML に変換、`generateStaticParams` でビルド時に全ページを生成するパターンは、ドキュメントサイト・ブログ・ポータルサイトなど幅広い用途に活用できます。
