# 新サービステンプレート

## 目的

本ドキュメントは、プラットフォームに新しいサービスを追加する際の標準構成とルールを定義する。

## 基本方針

- **スマホファースト**: デフォルトでモバイル対応を前提
- **共通設定の継承**: configs/ の設定を extends して一貫性を保つ
- **テスト必須**: ユニットテストとE2Eテストを実装

## ディレクトリ構造

### 必須構成

```
services/{service-name}/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/health/         # ヘルスチェック (必須)
│   │   ├── layout.tsx          # ルートレイアウト
│   │   └── page.tsx            # ホームページ
│   └── lib/                    # ビジネスロジック (構成は自由)
├── tests/
│   ├── unit/                   # ユニットテスト
│   └── e2e/                    # E2Eテスト
├── public/                     # 静的ファイル
├── package.json
├── tsconfig.json
├── next.config.ts
├── jest.config.ts
├── playwright.config.ts
└── eslint.config.mjs
```

### 任意構成

- `src/components/`: UIコンポーネント（推奨）
- `src/types/`: 型定義（推奨）
- `src/styles/`: スタイル定義（推奨）
- `lib/` 配下: サービス特性に応じて自由に構成

## 必須設定ファイル

### package.json

#### スクリプト標準

```json
{
    "scripts": {
        "dev": "next dev",
        "build": "next build --webpack",
        "lint": "eslint",
        "format": "prettier --write .",
        "format:check": "prettier --check .",
        "test": "jest",
        "test:watch": "jest --watch",
        "test:coverage": "jest --coverage",
        "test:e2e": "playwright test",
        "test:e2e:ui": "playwright test --ui"
    }
}
```

#### バージョン管理

- 各サービスで独立管理（1.0.0から開始）
- セマンティックバージョニングに従う

### 設定ファイルの継承

各設定は `configs/` の共通設定を extends する。詳細は [configs.md](./configs.md) を参照。

## PWA 設定

### デフォルトで有効

スマホファースト思想により、デフォルトでPWA対応を推奨。

### 必須ファイル（PWA対応時）

- `app/offline/page.tsx`: オフラインフォールバック
- `public/manifest.json`: PWAマニフェスト
- `public/icon-192x192.png`, `public/icon-512x512.png`: アイコン

### 無効化が必要なケース

- 認証必須の管理画面
- サーバーサイドレンダリングが重要な場合

詳細は [pwa.md](./pwa.md) を参照。

## ヘルスチェック API

### 必須実装

全サービスで `app/api/health/route.ts` を実装（Lambda監視用）。

### 実装例

```typescript
export async function GET() {
    return Response.json({
        status: 'ok',
        version: process.env.APP_VERSION || 'unknown',
    });
}
```

## 環境変数

### APP_VERSION

- `package.json` の version をビルド時に注入
- Footer、Health APIで使用

## 新サービス追加チェックリスト

- [ ] ディレクトリ構造を作成
- [ ] `configs/` の共通設定を extends
- [ ] ヘルスチェック API を実装
- [ ] PWA対応可否を判断・実装
- [ ] ユニットテストを `tests/unit/` に配置
- [ ] E2Eテストを `tests/e2e/` に配置
- [ ] package.json に標準スクリプトを定義
- [ ] README.md を作成（サービス固有の説明）

## 参考

- [architecture.md](./architecture.md): アーキテクチャ方針
- [testing.md](./testing.md): テスト戦略
- [shared-libraries.md](./shared-libraries.md): 共通ライブラリ設計
