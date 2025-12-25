# @nagiyu/ui

Next.js + Material-UI ベースの共通UIコンポーネントライブラリ

## 概要

`@nagiyu/ui` は、Nagiyu Platform 上の全サービスで共有される UI コンポーネントを提供します。Material-UI (MUI) v7 と Next.js v16 に依存し、一貫したデザインシステムを実現します。

## バージョン

**現在のバージョン**: 1.0.0

## インストール

このライブラリはモノレポ内での使用を想定しており、サービスの `package.json` で参照します。

```json
{
  "dependencies": {
    "@nagiyu/ui": "workspace:*"
  }
}
```

## 依存関係

### Peer Dependencies

- React >= 19.0.0
- React DOM >= 19.0.0
- Next.js >= 16.0.0
- Material-UI >= 7.3.6
- @emotion/react >= 11.14.0
- @emotion/styled >= 11.14.1

### Internal Dependencies

- `@nagiyu/browser` - ブラウザAPI依存の共通ライブラリ

## 提供されるコンポーネント

### Header

アプリケーションのヘッダーコンポーネント。サービス名をカスタマイズ可能。

#### Props

| プロパティ | 型 | デフォルト値 | 説明 |
|-----------|-----|------------|------|
| `title` | `string` | `"Nagiyu Platform"` | ヘッダーに表示するタイトル |
| `href` | `string` | `"/"` | タイトルクリック時の遷移先 |
| `ariaLabel` | `string` | `"{title} - Navigate to homepage"` | アクセシビリティ用のラベル |

#### 使用例

```tsx
import { Header } from '@nagiyu/ui';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header title="Tools" href="/" />
      <main>{children}</main>
    </>
  );
}
```

### Footer

バージョン情報とポリシーリンクを表示するフッターコンポーネント。

#### Props

| プロパティ | 型 | デフォルト値 | 説明 |
|-----------|-----|------------|------|
| `version` | `string` | `"1.0.0"` | 表示するバージョン番号 |

#### 使用例

```tsx
import { Footer } from '@nagiyu/ui';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main>{children}</main>
      <Footer version={process.env.APP_VERSION || '1.0.0'} />
    </>
  );
}
```

### theme

Material-UI のテーマオブジェクト。プラットフォーム共通のカラーパレット、タイポグラフィ、コンポーネントスタイルを定義。

#### 特徴

- **カラーパレット**: プライマリ（青）、セカンダリ（グレー）、エラー、警告、情報、成功の各カラー定義
- **タイポグラフィ**: システムフォントスタック、レスポンシブなフォントサイズ
- **ブレークポイント**: xs(0px), sm(600px), md(900px), lg(1200px), xl(1536px)
- **コンポーネントカスタマイズ**: Button, Card, TextField の統一スタイル

#### 使用例

Next.js App Router での使用:

```tsx
'use client';

import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from '@nagiyu/ui';

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
```

## 開発

### ビルド

```bash
npm run build
```

### テスト

```bash
# 全テストを実行
npm test

# ウォッチモードで実行
npm run test:watch

# カバレッジを取得
npm run test:coverage
```

### リント・フォーマット

```bash
# リント実行
npm run lint

# フォーマット実行
npm run format

# フォーマットチェック
npm run format:check
```

## 設計方針

### 依存関係ルール

- ライブラリ内部では相対パスのみ使用（パスエイリアス禁止）
- `@nagiyu/browser` への依存は許可（一方向依存）
- 循環依存は禁止

### SSR対応

全コンポーネントは Client Component (`'use client'`) として実装されており、Next.js の SSR に対応しています。

### アクセシビリティ

- 適切な ARIA ラベルの設定
- キーボードナビゲーション対応
- セマンティックな HTML 要素の使用

## トラブルシューティング

### Material-UI のスタイルが適用されない

`ThemeProvider` と `CssBaseline` が適切にラップされているか確認してください。

### TypeScript のインポートエラー

ライブラリをビルドしてから使用してください:

```bash
cd libs/ui
npm run build
```

## ライセンス

このライブラリは Nagiyu Platform プロジェクトの一部であり、プロジェクトのライセンスに従います。

## 関連ドキュメント

- [共通ライブラリ設計](../../development/shared-libraries.md)
- [サービステンプレート](../../development/service-template.md)
- [アーキテクチャ方針](../../development/architecture.md)
