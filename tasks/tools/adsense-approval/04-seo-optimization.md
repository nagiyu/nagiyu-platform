# タスク: SEO 対策

## 概要

検索エンジン最適化（SEO）のために、robots.txt と sitemap.xml を追加する。

## 関連ドキュメント

- **親タスク**: [README.md](./README.md)
- **サービスドキュメント**:
  - [docs/services/tools/README.md](../../../docs/services/tools/README.md)
  - [docs/services/tools/requirements.md](../../../docs/services/tools/requirements.md)

## 背景

現在、Tools サービスには robots.txt と sitemap.xml が存在しない。これらは SEO の基本要件であり、Google AdSense の審査でも重要視される。

## 実装内容

### 1. robots.txt の追加

**ファイルパス**: `services/tools/public/robots.txt`

**コンテンツ**:
```txt
User-agent: *
Allow: /

Sitemap: https://nagiyu.com/sitemap.xml
```

**要件**:
- すべてのクローラーを許可
- sitemap.xml の場所を明記
- 本番環境のドメイン（`https://nagiyu.com`）を使用

### 2. sitemap.xml の生成

**方法**: Next.js の Metadata API を使用

**ファイルパス**: `services/tools/src/app/sitemap.ts`

**実装内容**:
```typescript
import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://nagiyu.com';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/transit-converter`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
```

**要件**:
- すべてのページを含める
- 適切な `priority` と `changeFrequency` を設定
- 本番環境のドメインを使用

### 3. ページのメタデータ更新

各ページに `<link rel="canonical">` を追加（Next.js の Metadata API で自動生成）

**実装方法**:
各ページの `metadata` オブジェクトに `alternates` を追加:

```typescript
export const metadata: Metadata = {
  title: 'ページタイトル',
  description: 'ページの説明',
  alternates: {
    canonical: 'https://nagiyu.com/page-path',
  },
};
```

## ファイル構成

```
services/tools/
├── public/
│   └── robots.txt (新規)
└── src/
    └── app/
        ├── sitemap.ts (新規)
        ├── page.tsx (canonical 追加)
        ├── transit-converter/
        │   └── page.tsx (canonical 追加)
        ├── about/
        │   └── page.tsx (canonical 追加)
        ├── privacy/
        │   └── page.tsx (canonical 追加)
        ├── terms/
        │   └── page.tsx (canonical 追加)
        ├── contact/
        │   └── page.tsx (canonical 追加)
        └── faq/
            └── page.tsx (canonical 追加)
```

## 実装方針

### robots.txt

- シンプルな構成
- すべてのクローラーを許可
- sitemap.xml への参照を含める

### sitemap.xml

- Next.js の動的生成機能を使用
- ビルド時に自動生成される
- XML 形式で出力

### canonical URL

- 各ページに正規URLを設定
- 重複コンテンツの問題を防ぐ

## 受入基準

- [ ] `robots.txt` が `/robots.txt` でアクセスできる
- [ ] `sitemap.xml` が `/sitemap.xml` でアクセスできる
- [ ] sitemap.xml にすべてのページが含まれている
- [ ] sitemap.xml が正しいXML形式である
- [ ] 各ページに canonical URL が設定されている
- [ ] Google Search Console でサイトマップを送信できる

## テスト方法

### ローカル環境

```bash
# ビルド
npm run build

# 確認
curl http://localhost:3000/robots.txt
curl http://localhost:3000/sitemap.xml
```

### 本番環境

```bash
curl https://nagiyu.com/robots.txt
curl https://nagiyu.com/sitemap.xml
```

### バリデーション

- [XML Sitemap Validator](https://www.xml-sitemaps.com/validate-xml-sitemap.html) でサイトマップを検証

## 注意事項

- 本番環境のドメイン（`https://nagiyu.com`）を使用
- sitemap.xml は動的に生成されるため、ページ追加時は `sitemap.ts` を更新
- Google Search Console にサイトマップを送信

## 完了後のアクション

- Google Search Console にサイトマップを送信
- インデックス状況を確認
