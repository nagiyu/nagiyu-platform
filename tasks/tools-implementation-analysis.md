# Tools サービス実装の詳細分析

## 目的
Tools サービスの実装を詳細に分析し、プラットフォーム全体のグランドルールとして抽出すべき点を洗い出す。

---

## 📂 1. ディレクトリ構造の詳細分析

### 実際の構成
```
services/tools/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── api/health/route.ts    # ヘルスチェック API
│   │   ├── offline/page.tsx       # PWA オフラインフォールバック
│   │   ├── transit-converter/     # ツール個別ページ
│   │   ├── page.tsx                # ホーム（ツール一覧）
│   │   ├── layout.tsx              # ルートレイアウト
│   │   └── globals.css             # グローバルスタイル
│   ├── components/
│   │   ├── layout/                 # レイアウトコンポーネント
│   │   │   ├── Header.tsx         # ヘッダー（'use client'）
│   │   │   └── Footer.tsx         # フッター（'use client', version props）
│   │   ├── tools/                  # ツール固有コンポーネント
│   │   │   ├── ToolCard.tsx       # ツールカード表示
│   │   │   └── DisplaySettingsSection.tsx  # 設定UI
│   │   ├── dialogs/
│   │   │   └── MigrationDialog.tsx  # マイグレーション通知
│   │   └── ThemeRegistry.tsx       # Material-UI プロバイダー
│   ├── lib/
│   │   ├── clipboard.ts            # クリップボード操作
│   │   ├── parsers/
│   │   │   ├── transitParser.ts   # 乗り換えテキスト解析
│   │   │   └── __tests__/
│   │   └── formatters/
│   │       ├── formatters.ts      # フォーマット処理
│   │       └── __tests__/
│   ├── types/
│   │   └── tools.ts                # 型定義（Tool, TransitRoute, etc.）
│   └── styles/
│       └── theme.ts                # Material-UI テーマ設定
├── e2e/                            # Playwright E2E テスト
│   ├── basic.spec.ts
│   ├── homepage.spec.ts
│   ├── transit-converter.spec.ts
│   ├── pwa.spec.ts
│   ├── accessibility.spec.ts
│   ├── migration-dialog.spec.ts
│   └── helpers.ts
├── public/
│   ├── manifest.json               # PWA マニフェスト
│   ├── favicon.ico
│   ├── icon-192x192.png
│   ├── icon-512x512.png
│   └── *.xcf                       # デザイン元ファイル
├── package.json
├── tsconfig.json
├── next.config.ts
├── jest.config.ts
├── jest.setup.ts
├── playwright.config.ts
├── eslint.config.mjs
└── .prettierrc
```

### 🔍 分析ポイント

#### A. `src/app/` の構成
- **layout.tsx**: Metadata, Viewport, 環境変数（APP_VERSION）を定義
- **page.tsx**: ツール一覧を配列で定義 → 将来的に動的化の可能性？
- **api/health/**: ヘルスチェック（Lambda 監視用）
- **offline/**: PWA オフライン時のフォールバック

**グランドルール候補:**
- ✅ 全サービスで `app/api/health/` を必須化
- ✅ PWA 対応サービスは `app/offline/` を必須化
- ✅ `layout.tsx` で APP_VERSION 環境変数を使用

#### B. `src/components/` の構成
- **layout/**: Header, Footer を分離
  - Header: シンプル（タイトル + ホームリンク）
  - Footer: バージョン表示 + プライバシーポリシー・利用規約リンク（現在は pointerEvents: 'none'）
- **tools/**: ドメイン固有コンポーネント
- **dialogs/**: モーダル系
- **ThemeRegistry.tsx**: 最上位プロバイダー（AppRouterCacheProvider + ThemeProvider + Layout構造）

**グランドルール候補:**
- ✅ `components/layout/` は共通ライブラリ化
- ✅ `ThemeRegistry` パターンを標準化（Header, Footer を含む Layout 構造）
- ⚠️ Footer の「利用規約」「プライバシーポリシー」リンクは現在無効 → 将来実装時の設計が必要

#### C. `src/lib/` の構成
- **parsers/**: 入力テキストのバリデーション + パース処理
  - エラーメッセージは定数化（`ERROR_MESSAGES`）
  - 正規表現ベースの解析
- **formatters/**: パース済みデータ + 設定 → 出力文字列
  - DisplaySettings による表示項目の切り替え
- **clipboard.ts**: Navigator Clipboard API のラッパー
  - エラーハンドリング統一
  - 日本語エラーメッセージ

**グランドルール候補:**
- ✅ Parser/Formatter パターンを推奨アーキテクチャとして明記
  - ただし、全サービスで必須ではない（適用可能な場合のみ）
- ✅ ブラウザ API ラッパーは共通ライブラリ化
- ✅ エラーメッセージは日本語で定数化

#### D. `src/types/` の構成
- **Tool**: ツールメタデータ（id, title, description, icon, href, category）
- **TransitRoute, RouteStep**: ドメイン固有の型
- **SnackbarState**: UI状態型
- **DisplaySettings**: ユーザー設定型
- **DEFAULT_DISPLAY_SETTINGS**: デフォルト値定数

**グランドルール候補:**
- ✅ 型定義 + デフォルト値をセットで定義
- ⚠️ `Tool` インターフェースは共通化すべき？→ サービス間で共通化の可能性
- ✅ UI状態型（SnackbarState 等）は各サービス固有でOK

#### E. `src/styles/` の構成
- **theme.ts**: Material-UI テーマ詳細定義
  - palette: 6色セット（primary, secondary, error, warning, info, success）
  - typography: h1-h6, body1-2, button, caption
  - breakpoints: xs=0, sm=600, md=900, lg=1200, xl=1536
  - components: Button, Card, TextField のスタイルオーバーライド

**グランドルール候補:**
- ✅ テーマ定義は共通ライブラリ化
  - プラットフォーム全体で統一されたカラーパレット
  - サービス固有のカスタマイズは `createTheme` で extends
- ✅ 日本語フォントスタックの標準化
- ✅ コンポーネントのスタイルオーバーライドパターンを文書化

---

## 🧪 2. テスト戦略の詳細分析

### ユニットテスト (Jest)

#### テストファイル数と構成
- `lib/__tests__/clipboard.test.ts`
- `lib/parsers/__tests__/transitParser.test.ts`
- `lib/formatters/__tests__/formatters.test.ts`

#### テストパターン
```typescript
describe('機能名', () => {
  describe('関数名', () => {
    it('正常系: 説明', () => { /* ... */ });
    it('異常系: 説明', () => { /* ... */ });
    it('エッジケース: 説明', () => { /* ... */ });
  });
});
```

#### モック対象
- `navigator.clipboard` (window.navigator のモック)
- localStorage (SSR 対応)

**グランドルール候補:**
- ✅ ビジネスロジック（`lib/` 配下）は必ずユニットテスト
- ✅ ブラウザ API のモックパターンを標準化
- ✅ `jest.setup.ts` で `@testing-library/jest-dom` をインポート

### E2E テスト (Playwright)

#### テストファイル構成（全7ファイル、計1680行）
1. **basic.spec.ts**: 基本動作確認
2. **homepage.spec.ts**: ホームページ表示・ナビゲーション
3. **transit-converter.spec.ts**: メイン機能テスト
4. **pwa.spec.ts**: PWA 機能（オフライン、インストール）
5. **accessibility.spec.ts**: アクセシビリティ（axe-core）
6. **migration-dialog.spec.ts**: マイグレーションダイアログ
7. **helpers.ts**: テストヘルパー関数

#### テスト対象デバイス
- chromium-desktop: Desktop Chrome (1920x1080)
- chromium-mobile: Pixel 5 (393x851)
- webkit-mobile: iPhone 12 (390x844)

**グランドルール候補:**
- ✅ 主要フローは E2E テスト必須
- ✅ PWA 対応サービスは PWA テスト必須
- ✅ アクセシビリティテスト（axe-core）を標準化
- ✅ デスクトップ + モバイル2種でテスト
- ⚠️ E2E テストの粒度基準が必要（どこまで細かく書くか）

---

## ⚙️ 3. 設定ファイルの詳細分析

### package.json

#### 依存関係の特徴
- **React 19.2.1 + Next.js 16.0.10**: 最新安定版
- **Material-UI v7**: `@mui/material`, `@emotion/react`, `@emotion/styled`
- **next-pwa**: PWA 対応
- **Testing Library**: ユニットテスト
- **Playwright + axe-core**: E2E + アクセシビリティ

#### scripts の特徴
```json
{
  "dev": "next dev",
  "build": "next build --webpack",  // ← --webpack フラグ
  "lint": "eslint",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:headed": "playwright test --headed",
  "test:e2e:report": "playwright show-report"
}
```

**グランドルール候補:**
- ✅ `build` スクリプトに `--webpack` フラグを明示
- ✅ `format` と `format:check` を分離（CI 用）
- ✅ E2E テストの UI モード・headed モードスクリプトを標準化

### tsconfig.json

#### 重要な設定
- `target: ES2020`
- `strict: true` （厳格な型チェック）
- `jsx: "react-jsx"` （React 17+ の新しい JSX Transform）
- `paths: { "@/*": ["./src/*"] }` （パスエイリアス）
- `exclude: ["node_modules", "e2e"]` （E2E テストを除外）

**グランドルール候補:**
- ✅ `strict: true` を全サービス必須
- ✅ `@/*` パスエイリアスを標準化
- ✅ E2E ディレクトリは exclude

### eslint.config.mjs

#### 特徴
- ESLint v9 Flat Config 形式
- `eslint-config-next/core-web-vitals` + `typescript` を使用
- PWA 生成ファイル（sw.js, workbox-*.js）を ignore

**グランドルール候補:**
- ✅ Flat Config 形式を標準化
- ✅ Next.js 公式設定を extends
- ✅ PWA 生成ファイルを ignore に追加

### .prettierrc

#### 設定値
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

**グランドルール候補:**
- ✅ この設定を共通化（モノレポルートに配置？）
- ✅ または `libs/prettier-config` として共有

### next.config.ts

#### 重要な設定
```typescript
{
  output: 'standalone',                              // Lambda デプロイ用
  outputFileTracingRoot: path.join(__dirname, '../../'),  // モノレポ対応
  turbopack: {},                                     // Turbopack 警告抑制
}
```

#### PWA 設定
```typescript
withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',  // 開発時は無効
  register: true,
  skipWaiting: true,
})
```

**グランドルール候補:**
- ✅ `outputFileTracingRoot` は全サービス必須（モノレポ対応）
- ✅ PWA 設定パターンを標準化
- ⚠️ すべてのサービスで PWA が必要か検討

### jest.config.ts

#### 重要な設定
```typescript
{
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  modulePathIgnorePatterns: ['<rootDir>/../../package.json', '<rootDir>/.next/'],
}
```

**グランドルール候補:**
- ✅ `modulePathIgnorePatterns` でモノレポルートを除外
- ✅ E2E テストを Jest から除外

### playwright.config.ts

#### 重要な設定
- `baseURL`: 環境変数で切り替え可能
- `trace: 'on-first-retry'`: リトライ時のみトレース記録
- `screenshot/video: 'on-failure'`: 失敗時のみ
- CI では `workers: 1`, リトライ2回

**グランドルール候補:**
- ✅ CI 最適化設定を標準化
- ✅ トレース・スクリーンショット設定を統一

---

## 🎨 4. UI/UX パターンの分析

### Layout 構造（ThemeRegistry.tsx）

```typescript
<ThemeProvider>
  <CssBaseline />
  <MigrationDialog />  {/* グローバルダイアログ */}
  <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <Header />
    <Box component="main" sx={{ flexGrow: 1 }}>
      {children}
    </Box>
    <Footer version={version} />
  </Box>
</ThemeProvider>
```

**グランドルール候補:**
- ✅ この Layout 構造を標準化
- ✅ `flexGrow: 1` で main を伸ばし、Footer を下に配置
- ⚠️ MigrationDialog のようなグローバルダイアログの扱い方

### Header の設計

- シンプル: タイトル + ホームリンク
- レスポンシブ: `minHeight: { xs: 56, sm: 64 }`
- アクセシビリティ: `aria-label` 付与

**グランドルール候補:**
- ✅ Header はサービス名表示 + ホームリンクを基本とする
- ⚠️ 将来的にナビゲーション追加時の拡張性を考慮

### Footer の設計

- バージョン表示（props 経由）
- プライバシーポリシー・利用規約リンク（現在は無効化）
- 背景色: `theme.palette.grey[200]`

**グランドルール候補:**
- ✅ バージョン表示は全サービス共通
- ⚠️ 利用規約・プライバシーポリシーの実装時期と共通化

### globals.css

```css
* { box-sizing: border-box; padding: 0; margin: 0; }
html, body { max-width: 100vw; overflow-x: hidden; }
a { color: inherit; text-decoration: none; }
```

**グランドルール候補:**
- ✅ この最小限のグローバル CSS を共通化
- ✅ Material-UI のリセットと併用

---

## 🔐 5. PWA 実装の詳細分析

### manifest.json

```json
{
  "name": "Tools - 便利な開発ツール集",
  "short_name": "Tools",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#1976d2",
  "icons": [ /* 192x192, 512x512 */ ],
  "share_target": {  // ← Share API 対応
    "action": "/transit-converter",
    "method": "GET",
    "params": { "title": "title", "text": "text", "url": "url" }
  }
}
```

**グランドルール候補:**
- ✅ manifest.json のテンプレート提供
- ⚠️ `share_target` は機能によってオプショナル

### オフラインページ

- `app/offline/page.tsx` でフォールバック表示
- シンプルなメッセージ

**グランドルール候補:**
- ✅ PWA 対応サービスは必須

---

## 📝 6. その他の重要な実装パターン

### 環境変数の使用

- `APP_VERSION`: package.json の version を注入（ビルド時）
- Footer, health API で使用

**グランドルール候補:**
- ✅ APP_VERSION 環境変数を標準化
- ⚠️ ビルド時の注入方法をドキュメント化

### エラーハンドリング

```typescript
// lib/parsers/transitParser.ts
export const ERROR_MESSAGES = {
  INVALID_FORMAT: '乗り換え案内のテキストを...',
  EMPTY_INPUT: '入力が空です...',
  URL_NOT_SUPPORTED: 'URLの直接入力は...',
  UNKNOWN_ERROR: '予期しないエラーが発生しました。'
} as const;
```

**グランドルール候補:**
- ✅ エラーメッセージは定数オブジェクトで管理
- ✅ ユーザーフレンドリーな日本語メッセージ

### localStorage の扱い

- SSR 対応: `useEffect` 内でアクセス
- try-catch でプライベートモード対応

**グランドルール候補:**
- ✅ localStorage アクセスパターンを共通化
- ✅ 共通ライブラリでラッパー提供

---

## 🤔 グランドルール化における論点

### 論点1: ディレクトリ構造の柔軟性
- **問題**: `lib/parsers/`, `lib/formatters/` は全サービスで適用できる？
- **例**: ブログサービスなら `lib/posts/`, 管理画面なら `lib/api/` かも
- **提案**: `lib/` 配下の構成は「推奨パターン」として、強制はしない

### 論点2: 共通ライブラリの粒度
- **問題**: `libs/nextjs-common` 一つにまとめる？分割する？
- **案1**: 大きく分ける
  - `libs/ui-components` (Header, Footer, ThemeRegistry)
  - `libs/theme` (theme.ts, globals.css)
  - `libs/utils` (clipboard, localStorage)
- **案2**: `libs/nextjs-common` 一つにまとめる
  - メリット: 管理しやすい
  - デメリット: テーマだけ使いたい場合も全部インストール
- **提案**: まずは `libs/nextjs-common` 一つで始め、必要に応じて分割

### 論点3: 設定ファイルの共通化レベル
- **問題**: tsconfig, eslint, prettier を共通化するか？
- **案1**: モノレポルートに base 設定を置き、各サービスで extends
  - `tsconfig.base.json`, `eslint.config.base.mjs`, `.prettierrc.base`
- **案2**: 各サービスで独立管理（現状維持）
- **提案**: base 設定を作成し、extends を推奨（強制はしない）

### 論点4: PWA 対応の必要性
- **問題**: すべてのサービスで PWA が必要？
- **例**: 管理画面は PWA 不要かも
- **提案**: PWA 対応はオプショナル、対応する場合はテンプレートに従う

### 論点5: テスト戦略の現実性
- **問題**: E2E テスト1680行は多い？少ない？
- **問題**: カバレッジ目標80%は現実的？
- **提案**:
  - ユニットテスト: ビジネスロジックは80%目標
  - E2E テスト: 主要フロー100%、細かいケースは判断
  - アクセシビリティテスト: 推奨（必須ではない）

### 論点6: `Tool` インターフェースの共通化
- **問題**: `Tool` 型はサービス間で共通化すべき？
- **例**: Tools サービスでは「ツール一覧」、他サービスでは不要かも
- **提案**: `libs/typescript-common` に置き、使うサービスだけインポート

### 論点7: Footer の利用規約・プライバシーポリシー
- **問題**: 現在は `pointerEvents: 'none'` で無効化
- **問題**: プラットフォーム全体で共通ページ？各サービス独自？
- **提案**:
  - プラットフォームレベルで `/privacy`, `/terms` を用意
  - または外部サイトへのリンク

### 論点8: バージョン管理
- **問題**: APP_VERSION はどう管理？
- **案1**: 各サービスの package.json から取得
- **案2**: モノレポ全体で統一バージョン
- **提案**: 各サービス独立（現状の実装を維持）

---

## ✅ 次のアクション

1. **この分析をベースに論点を議論**
   - 各論点について決定を下す
   - グランドルールの方針を固める

2. **タスクファイルを更新**
   - 決定事項を反映
   - ドキュメント構成を最終化

3. **ドキュメント作成**
   - SERVICE_TEMPLATE.md
   - ARCHITECTURE.md
   - TESTING.md
   - SHARED_LIBRARIES.md

---

## 📌 メモ

- Tools サービスは非常に整理された実装
- テスト体制が充実（ユニット + E2E + アクセシビリティ）
- PWA 対応が丁寧（manifest, offline, share_target）
- Material-UI の活用が適切
- モノレポ対応が既に考慮されている（outputFileTracingRoot 等）

この実装をベースに、柔軟性を持たせたグランドルールを策定するのが良さそう。
