# タスク: メタデータの改善

## 概要

各ページのメタデータを改善し、より詳細で SEO に適した内容に更新する。

## 関連ドキュメント

- **親タスク**: [README.md](./README.md)
- **サービスドキュメント**:
  - [docs/services/tools/README.md](../../../docs/services/tools/README.md)
  - [docs/services/tools/requirements.md](../../../docs/services/tools/requirements.md)

## 背景

現在の `layout.tsx` のメタデータは簡素すぎる：
```typescript
title: 'Tools',
description: '便利な開発ツール集',
```

Google AdSense の審査では、メタデータの質も重要視される。

## 実装内容

### 1. ルートレイアウトのメタデータ改善

**ファイルパス**: `services/tools/src/app/layout.tsx`

**現在**:
```typescript
export const metadata: Metadata = {
  title: 'Tools',
  description: '便利な開発ツール集',
  // ...
};
```

**改善後**:
```typescript
export const metadata: Metadata = {
  title: {
    default: 'Tools - 便利なオンラインツール集',
    template: '%s | Tools',
  },
  description: 'Toolsは、日常的に便利なオンラインツール群を提供する無料のWebアプリケーションです。乗り換え案内の整形ツールなど、すべてのツールはブラウザ内で動作し、データは外部に送信されません。PWA対応でオフラインでも利用可能です。',
  keywords: ['オンラインツール', '便利ツール', '無料ツール', '乗り換え案内', 'PWA', 'オフライン'],
  authors: [{ name: 'nagiyu' }],
  creator: 'nagiyu',
  publisher: 'nagiyu',
  metadataBase: new URL('https://nagiyu.com'),
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: 'https://nagiyu.com',
    title: 'Tools - 便利なオンラインツール集',
    description: 'Toolsは、日常的に便利なオンラインツール群を提供する無料のWebアプリケーションです。',
    siteName: 'Tools',
    images: [
      {
        url: '/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'Tools アイコン',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Tools - 便利なオンラインツール集',
    description: 'Toolsは、日常的に便利なオンラインツール群を提供する無料のWebアプリケーションです。',
    images: ['/icon-512x512.png'],
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192x192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tools',
  },
};
```

### 2. 各ページのメタデータ設定

#### トップページ (`/`)

**ファイルパス**: `services/tools/src/app/page.tsx`

```typescript
export const metadata: Metadata = {
  title: 'ホーム',
  description: 'Toolsは、日常的に便利なオンラインツール群を提供する無料のWebアプリケーションです。乗り換え案内の整形ツールなど、すべてのツールがブラウザ内で動作します。',
  openGraph: {
    title: 'Tools - 便利なオンラインツール集',
    description: 'Toolsは、日常的に便利なオンラインツール群を提供する無料のWebアプリケーションです。',
  },
};
```

#### 乗り換え変換ツール (`/transit-converter`)

**ファイルパス**: `services/tools/src/app/transit-converter/page.tsx`

```typescript
export const metadata: Metadata = {
  title: '乗り換え変換ツール',
  description: '乗り換え案内のテキストを整形してコピーするツールです。出発地、到着地、時刻、経路などの情報を簡単に整形できます。ブラウザ内で処理され、データは外部に送信されません。',
  keywords: ['乗り換え案内', '経路検索', 'テキスト整形', 'コピー'],
  openGraph: {
    title: '乗り換え変換ツール | Tools',
    description: '乗り換え案内のテキストを整形してコピーするツールです。',
  },
};
```

#### About ページ (`/about`)

```typescript
export const metadata: Metadata = {
  title: 'Toolsについて',
  description: 'Toolsは、日常的に便利なツール群を提供する無料のWebアプリケーションです。このページでは、サイトの目的や技術スタックについて説明します。',
};
```

#### プライバシーポリシー (`/privacy`)

```typescript
export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description: 'Toolsのプライバシーポリシーです。Google AdSenseの使用、Cookieの取り扱い、データの処理方法について説明します。',
};
```

#### 利用規約 (`/terms`)

```typescript
export const metadata: Metadata = {
  title: '利用規約',
  description: 'Toolsの利用規約です。サービスの利用条件、免責事項、禁止事項について説明します。',
};
```

#### お問い合わせ (`/contact`)

```typescript
export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: 'Toolsへのお問い合わせ方法をご案内します。バグ報告や機能要望はGitHub Issuesで受け付けています。',
};
```

#### FAQ (`/faq`)

```typescript
export const metadata: Metadata = {
  title: 'よくある質問（FAQ）',
  description: 'Toolsに関するよくある質問と回答です。料金、データの保存、オフライン利用などについて説明します。',
};
```

### 3. OGP 画像の準備（オプション）

**ファイルパス**: `services/tools/public/og-image.png`

既存の `icon-512x512.png` を OGP 画像として使用するか、専用の画像を作成。

## ファイル構成

```
services/tools/src/app/
├── layout.tsx (メタデータ改善)
├── page.tsx (メタデータ追加)
├── transit-converter/
│   └── page.tsx (メタデータ追加)
├── about/
│   └── page.tsx (メタデータ追加)
├── privacy/
│   └── page.tsx (メタデータ追加)
├── terms/
│   └── page.tsx (メタデータ追加)
├── contact/
│   └── page.tsx (メタデータ追加)
└── faq/
    └── page.tsx (メタデータ追加)
```

## 実装方針

### メタデータの質

- 具体的で詳細な description（120-160文字）
- ページ内容を正確に表現
- SEO を意識したキーワードの使用

### Open Graph（OG）タグ

- SNS でシェアされた時の表示を最適化
- 適切な画像、タイトル、説明を設定

### Twitter Card

- Twitter でのシェア時の表示を最適化
- summary カードを使用

## 受入基準

- [ ] すべてのページに適切な title が設定されている
- [ ] すべてのページに詳細な description が設定されている（120-160文字）
- [ ] ルートレイアウトに Open Graph タグが設定されている
- [ ] ルートレイアウトに Twitter Card が設定されている
- [ ] 各ページのメタデータがページ内容を正確に反映している
- [ ] メタデータに適切なキーワードが含まれている

## テスト方法

### メタデータ確認

ブラウザの開発者ツールで `<head>` タグを確認：
```html
<title>ページタイトル | Tools</title>
<meta name="description" content="..." />
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta name="twitter:card" content="summary" />
```

### OGP 確認ツール

- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- [Twitter Card Validator](https://cards-dev.twitter.com/validator)

## 注意事項

- description は120-160文字を目安に
- キーワードは自然に文章に含める（キーワードスタッフィングは避ける）
- 各ページで重複しない固有の description を設定

## 完了後のアクション

- Google Search Console でインデックス状況を確認
- SNS でシェアしてOGPの表示を確認
