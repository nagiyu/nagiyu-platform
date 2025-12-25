# @nagiyu/ui

Next.js + Material-UI 依存のUIコンポーネントライブラリ。

## 概要

`@nagiyu/ui` は、プラットフォーム全体で共通利用するUIコンポーネントを提供します。Next.js 16 と Material-UI 7 に最適化されており、レスポンシブデザインとアクセシビリティをサポートしています。

## 特徴

- **統一されたデザイン**: プラットフォーム全体で一貫したUI/UX
- **レスポンシブ対応**: モバイル・タブレット・デスクトップで最適表示
- **アクセシビリティ**: WCAG 2.1 Level AA準拠
- **テーマシステム**: カスタマイズ可能なMaterial-UIテーマ
- **高いテストカバレッジ**: 100%のカバレッジ

## インストール

このライブラリはモノレポ内部で使用されます。`package.json` に以下を追加してください:

```json
{
  "dependencies": {
    "@nagiyu/ui": "workspace:*",
    "@emotion/react": "^11.14.0",
    "@emotion/styled": "^11.14.1",
    "@mui/icons-material": "^7.3.6",
    "@mui/material": "^7.3.6",
    "@mui/material-nextjs": "^7.3.6",
    "next": ">=16.0.0",
    "react": ">=19.0.0",
    "react-dom": ">=19.0.0"
  }
}
```

## 使用方法

### レイアウトコンポーネント

#### Header

```typescript
import { Header } from '@nagiyu/ui';

export default function Layout({ children }) {
  return (
    <>
      <Header serviceName="My App" />
      <main>{children}</main>
    </>
  );
}
```

#### Footer

```typescript
import { Footer } from '@nagiyu/ui';

export default function Layout({ children }) {
  return (
    <>
      <main>{children}</main>
      <Footer version="1.0.0" />
    </>
  );
}
```

### ThemeRegistry

Next.js App Routerでテーマシステムを有効にするには、`ThemeRegistry` でアプリ全体をラップします。

```typescript
import { ThemeRegistry } from '@nagiyu/ui';

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
```

## コンポーネント一覧

### Header

**Props:**

- `serviceName?: string` - サービス名（デフォルト: "Tools"）

### Footer

**Props:**

- `version?: string` - バージョン番号（デフォルト: "1.0.0"）

### ThemeRegistry

**Props:**

- `children: React.ReactNode` - ラップする子要素
- `options?: ThemeRegistryProps['options']` - Material-UIのオプション

## テーマカスタマイズ

Material-UIのテーマをカスタマイズする場合は、`ThemeRegistry` コンポーネント内で使用されている `theme.ts` を参考にしてください。

```typescript
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    // ...
  },
});
```

## 依存関係

- `@nagiyu/browser`: ブラウザAPIユーティリティ
- `@emotion/react`, `@emotion/styled`: CSS-in-JSライブラリ
- `@mui/material`, `@mui/icons-material`: Material-UIコンポーネント
- `next`: Next.jsフレームワーク
- `react`, `react-dom`: Reactライブラリ

## 開発

### ビルド

```bash
npm run build --workspace=@nagiyu/ui
```

### テスト

```bash
# テスト実行
npm run test --workspace=@nagiyu/ui

# ウォッチモード
npm run test:watch --workspace=@nagiyu/ui

# カバレッジレポート（80%以上必須）
npm run test:coverage --workspace=@nagiyu/ui
```

### Lint & Format

```bash
# Lint
npm run lint --workspace=@nagiyu/ui

# Format
npm run format --workspace=@nagiyu/ui

# Format Check
npm run format:check --workspace=@nagiyu/ui
```

## バージョン

現在のバージョン: **1.0.0**

## ライセンス

本プロジェクトは、MIT LicenseまたはApache License 2.0のデュアルライセンスです。
