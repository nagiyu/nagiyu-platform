# niconico-mylist-assistant Web Application

Next.js ベースのフロントエンドアプリケーション。

## 概要

- **フレームワーク**: Next.js 16 (App Router)
- **言語**: TypeScript
- **UI**: Material-UI v7
- **テスト**: Playwright (E2E)
- **認証**: NextAuth v5

## 開発

### 環境構築

```bash
# 依存関係のインストール（モノレポルートで実行）
npm ci

# 共通ライブラリのビルド
npm run build --workspace @nagiyu/common
npm run build --workspace @nagiyu/browser
npm run build --workspace @nagiyu/aws
npm run build --workspace @nagiyu/ui

# coreライブラリのビルド
npm run build --workspace @nagiyu/niconico-mylist-assistant-core
```

### 開発サーバーの起動

```bash
# モノレポルートから
npm run dev --workspace=@nagiyu/niconico-mylist-assistant-web

# または web ディレクトリで
npm run dev
```

### ビルド

```bash
# モノレポルートから
npm run build --workspace=@nagiyu/niconico-mylist-assistant-web
```

## テスト

### E2E テスト（Playwright）

#### 前提条件

```bash
# Playwright ブラウザのインストール
npx playwright install --with-deps chromium
```

#### テスト実行

```bash
# 全テストを実行（全デバイス: chromium-desktop, chromium-mobile, webkit-mobile）
npm run test:e2e --workspace=@nagiyu/niconico-mylist-assistant-web

# 特定のデバイスのみで実行
PROJECT=chromium-mobile npm run test:e2e --workspace=@nagiyu/niconico-mylist-assistant-web

# UIモード（デバッグ用）
npm run test:e2e:ui --workspace=@nagiyu/niconico-mylist-assistant-web

# ブラウザ表示モード
npm run test:e2e:headed --workspace=@nagiyu/niconico-mylist-assistant-web

# テストレポートの表示
npm run test:e2e:report --workspace=@nagiyu/niconico-mylist-assistant-web
```

#### テスト構成

- **テストファイル**: `e2e/` ディレクトリ
- **デバイス**: 3種類（chromium-desktop, chromium-mobile, webkit-mobile）
- **テストケース数**: 70（総実行数: 210）
- **テスト環境**: インメモリDynamoDB、認証バイパス

詳細なテスト仕様は [`tasks/niconico-mylist-assistant/testing.md`](../../../tasks/niconico-mylist-assistant/testing.md) を参照してください。

### テストファイル一覧

| ファイル | テストケース数 | 内容 |
|---------|---------------|------|
| `e2e/test-setup.spec.ts` | 3 | セットアップ検証 |
| `e2e/video-list.spec.ts` | 43 | 動画一覧、フィルター、ページネーション |
| `e2e/video-detail.spec.ts` | 9 | 動画詳細モーダル |
| `e2e/bulk-import.spec.ts` | 15 | 一括インポート |

## コード品質

### Lint

```bash
npm run lint --workspace=@nagiyu/niconico-mylist-assistant-web
```

### Format

```bash
# フォーマットチェック
npm run format:check --workspace=@nagiyu/niconico-mylist-assistant-web

# フォーマット適用
npm run format --workspace=@nagiyu/niconico-mylist-assistant-web
```

## ディレクトリ構成

```
web/
├── e2e/                  # E2Eテスト（Playwright）
│   ├── helpers/         # テストヘルパー
│   └── *.spec.ts        # テストファイル
├── public/              # 静的ファイル
├── src/
│   ├── app/            # Next.js App Router
│   │   ├── api/        # API Routes
│   │   └── */          # ページ
│   ├── components/     # Reactコンポーネント
│   └── lib/            # ユーティリティ
├── types/              # 型定義
├── .env.example        # 環境変数のサンプル
├── .env.test           # テスト用環境変数
├── playwright.config.ts # Playwright設定
└── next.config.ts      # Next.js設定
```

## 環境変数

`.env.example` を参照してください。

テスト環境では `.env.test` が使用されます。

## CI/CD

### Fast CI
- **トリガー**: `integration/**` ブランチへのPR
- **テスト**: chromium-mobile のみ
- **所要時間**: 約5-10分

### Full CI
- **トリガー**: `develop` ブランチへのPR
- **テスト**: 全デバイス（chromium-desktop, chromium-mobile, webkit-mobile）
- **所要時間**: 約15-20分

## 関連ドキュメント

- [テスト仕様書](../../../tasks/niconico-mylist-assistant/testing.md)
- [アーキテクチャ](../../../tasks/niconico-mylist-assistant/architecture.md)
- [API仕様](../../../tasks/niconico-mylist-assistant/api-spec.md)
- [デプロイ手順](../../../tasks/niconico-mylist-assistant/deployment.md)
