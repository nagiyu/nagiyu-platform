# 共通ライブラリ設計

## 目的

本ドキュメントは、プラットフォームにおける共通ライブラリの設計方針と利用ガイドラインを定義する。

## 実装状況

**現在のバージョン**: 全ライブラリ 1.0.0

| ライブラリ | バージョン | 実装状況 | 主要機能 |
|-----------|----------|---------|---------|
| `@nagiyu/common` | 1.0.0 | ✅ Phase 1 完了 | パッケージ構造整備（実装予定） |
| `@nagiyu/browser` | 1.0.0 | ✅ Phase 2 完了 | Clipboard API, localStorage API |
| `@nagiyu/ui` | 1.0.0 | ✅ Phase 3 完了 | Header, Footer, theme |

**Phase 4 完了**: Tools サービスからの切り出し完了

詳細な実装状況については、各ライブラリの README を参照してください。

## 基本方針

- **依存関係の明確化**: ライブラリ間の依存を一方向に保つ
- **責務の分離**: フレームワーク依存度によって分割
- **再利用性**: サービス間で共通コードを共有

## ライブラリ構成

### 3分割の設計

```
libs/
├── ui/           # Next.js + Material-UI 依存
├── browser/      # ブラウザAPI依存
└── common/       # 完全フレームワーク非依存
```

### 依存関係ルール

```
ui → browser → common
```

- **一方向のみ**: 上位から下位への依存のみ許可
- **循環依存禁止**: 下位ライブラリは上位を参照しない
- **独立性**: common は外部依存なし

## libs/ui/

### 責務

Next.jsとMaterial-UIに依存するUIコンポーネント。

### 実装済み機能

- **Header コンポーネント**: サービス名をカスタマイズ可能なヘッダー
- **Footer コンポーネント**: バージョン情報とポリシーリンクを表示
- **theme**: Material-UI テーマオブジェクト（カラーパレット、タイポグラフィ、コンポーネントスタイル）

### パッケージ名

`@nagiyu/ui`

### 利用方法

#### インストール

package.json に依存を追加:

```json
{
  "dependencies": {
    "@nagiyu/ui": "workspace:*"
  }
}
```

#### 使用例

```tsx
import { Header, Footer, theme } from '@nagiyu/ui';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Header title="My Service" href="/" />
          <main>{children}</main>
          <Footer version={process.env.APP_VERSION || '1.0.0'} />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

詳細な API ドキュメントは [libs/ui/README.md](../../libs/ui/README.md) を参照してください。

## libs/browser/

### 責務

ブラウザAPIに依存するユーティリティ。

### 実装済み機能

- **Clipboard API ラッパー**: `readFromClipboard()`, `writeToClipboard()`
  - エラーハンドリングの統一
  - 日本語エラーメッセージ
- **localStorage ラッパー**: `getItem()`, `setItem()`, `removeItem()`
  - SSR 対応（ブラウザ環境チェック）
  - 自動 JSON パース/文字列化
  - ストレージ容量超過のハンドリング

### パッケージ名

`@nagiyu/browser`

### 設計のポイント

- エラーハンドリングの統一
- SSR対応（ブラウザ環境チェック）
- テスト容易性（モック化しやすい設計）

### 利用方法

#### インストール

package.json に依存を追加:

```json
{
  "dependencies": {
    "@nagiyu/browser": "workspace:*"
  }
}
```

#### 使用例

```typescript
import { readFromClipboard, writeToClipboard, getItem, setItem } from '@nagiyu/browser';

// クリップボード操作
async function handleCopy(text: string) {
  try {
    await writeToClipboard(text);
    alert('コピーしました');
  } catch (error) {
    alert(error.message);
  }
}

async function handlePaste() {
  try {
    const text = await readFromClipboard();
    console.log('Pasted:', text);
  } catch (error) {
    alert(error.message);
  }
}

// localStorage 操作
function saveSettings(theme: string) {
  setItem('settings', { theme, language: 'ja' });
}

function loadSettings() {
  const settings = getItem<{ theme: string; language: string }>('settings');
  return settings || { theme: 'light', language: 'ja' };
}
```

詳細な API ドキュメントは [libs/browser/README.md](../../libs/browser/README.md) を参照してください。

## libs/common/

### 責務

完全フレームワーク非依存の汎用ユーティリティ。

### 実装状況

**Phase 1 完了**: パッケージ構造とビルド環境が整備されました。

現在は具体的な実装がありませんが、将来的に以下の機能が追加される予定です。

### 将来の実装予定

- 共通型定義（API レスポンス、エラー、ページネーション等）
- 汎用ユーティリティ関数（データ変換、バリデーション、文字列操作等）
- 日付・数値操作関数

### パッケージ名

`@nagiyu/common`

### 設計のポイント

- 純粋関数として実装
- 外部依存なし（Node.js標準ライブラリのみ可）
- 高いテストカバレッジを維持

### 利用方法

#### インストール

package.json に依存を追加:

```json
{
  "dependencies": {
    "@nagiyu/common": "workspace:*"
  }
}
```

#### 使用例（将来）

```typescript
// 型定義の使用（将来実装予定）
import type { ApiResponse } from '@nagiyu/common';

const response: ApiResponse<UserData> = {
  success: true,
  data: { id: '1', name: 'John' },
};
```

詳細なドキュメントは [libs/common/README.md](../../libs/common/README.md) を参照してください。

## バージョン管理

### 基本方針

- **各ライブラリで独立管理**: ui, browser, common それぞれが独自のバージョン
- **セマンティックバージョニング**: 破壊的変更はメジャーバージョンアップ
- **初期バージョン**: 1.0.0（全ライブラリで統一）

### 現在のバージョン

| ライブラリ | バージョン | リリース日 |
|-----------|----------|-----------|
| `@nagiyu/common` | 1.0.0 | 2024-12 |
| `@nagiyu/browser` | 1.0.0 | 2024-12 |
| `@nagiyu/ui` | 1.0.0 | 2024-12 |

### 更新の影響範囲

各ライブラリの更新は、それを利用するサービスにのみ影響。

## 利用ガイド

### Next.jsサービスでの使用

#### 1. 依存関係の追加

package.json で必要なライブラリを指定。

```json
{
    "dependencies": {
        "@nagiyu/ui": "workspace:*",
        "@nagiyu/browser": "workspace:*",
        "@nagiyu/common": "workspace:*"
    }
}
```

#### 2. ライブラリのビルド

サービスから使用する前に、各ライブラリをビルドします:

```bash
# すべてのライブラリをビルド
npm run build --workspaces --if-present

# または個別にビルド
cd libs/ui && npm run build
cd libs/browser && npm run build
cd libs/common && npm run build
```

#### 3. インポート方法

```typescript
// UIコンポーネントのインポート
import { Header, Footer, theme } from '@nagiyu/ui';

// ブラウザAPIユーティリティのインポート
import { clipboard, getItem, setItem } from '@nagiyu/browser';

// 共通ユーティリティのインポート（将来）
import { someUtil } from '@nagiyu/common';
```

### 実装例

#### レイアウトでの使用

```tsx
// app/layout.tsx
import { Header, Footer, theme } from '@nagiyu/ui';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Header title="Tools" href="/" />
          <main style={{ minHeight: '80vh' }}>{children}</main>
          <Footer version={process.env.APP_VERSION || '1.0.0'} />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

#### クリップボード操作

```tsx
// components/CopyButton.tsx
'use client';

import { useState } from 'react';
import { Button } from '@mui/material';
import { writeToClipboard } from '@nagiyu/browser';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await writeToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <Button onClick={handleCopy} variant="contained">
      {copied ? 'コピーしました' : 'コピー'}
    </Button>
  );
}
```

#### localStorage 操作

```tsx
// hooks/useSettings.ts
'use client';

import { useEffect, useState } from 'react';
import { getItem, setItem } from '@nagiyu/browser';

interface Settings {
  theme: 'light' | 'dark';
  language: 'ja' | 'en';
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    // クライアントサイドでのみ実行
    const saved = getItem<Settings>('settings');
    setSettings(saved || { theme: 'light', language: 'ja' });
  }, []);

  const updateSettings = (newSettings: Settings) => {
    setItem('settings', newSettings);
    setSettings(newSettings);
  };

  return { settings, updateSettings };
}
```

詳細な使用方法は各ライブラリの README を参照してください:
- [libs/ui/README.md](../../libs/ui/README.md)
- [libs/browser/README.md](../../libs/browser/README.md)
- [libs/common/README.md](../../libs/common/README.md)

## ライブラリ内部の実装ルール

### パスエイリアス禁止

ライブラリ内部では相対パスのみ使用。

```typescript
// ❌ 禁止
import { something } from '@/components/Button';

// ✅ 推奨
import { something } from '../components/Button';
```

### 理由

- ライブラリとして配布する際の一貫性
- ビルド設定の複雑化を回避
- 依存関係の明確化

## TypeScript設定の方針

### テストコードも型チェック対象に含める

ライブラリの `tsconfig.json` では、`tests/` ディレクトリを型チェック対象に含める。

### 理由

- **早期発見**: テストコードの型エラーを開発時に検出
- **品質向上**: Testing Library のマッチャー（`toBeInTheDocument` 等）の型補完が効く
- **一貫性**: プロダクションコードと同じ型安全性をテストコードでも維持

### 設計のポイント

- `include` に `tests/**/*` を追加
- `rootDir` は指定しない（TypeScript が自動的に共通の親ディレクトリを判断）
- ビルド出力は `dist/src/` と `dist/tests/` に分かれるが、`package.json` の `exports` で `dist/src/index.js` を指定
- テストファイル（`.test.ts`）は実行時のみ使用され、配布には影響しない

## 拡張性

### 将来の展開

- 他フレームワーク対応（Vue, Svelte等）の場合、新しいライブラリを追加
- 依存関係ルールは維持（一方向性）

### 新規ライブラリの追加基準

- 複数サービスで共通利用される
- 明確な責務を持つ
- 既存ライブラリと責務が重複しない

## 参考

- [service-template.md](./service-template.md): サービステンプレート
- [architecture.md](./architecture.md): アーキテクチャ方針
