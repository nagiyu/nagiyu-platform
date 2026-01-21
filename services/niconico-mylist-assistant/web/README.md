# @nagiyu/niconico-mylist-assistant-web

niconico-mylist-assistant Web パッケージ（Next.js 16 アプリケーション）

## セットアップ

```bash
# 依存関係のインストール（モノレポルートから）
npm install

# 開発サーバーの起動
npm run dev

# ビルド
npm run build

# 本番環境で起動
npm run start
```

## テスト

```bash
# ユニットテスト
npm test

# E2Eテスト
npm run test:e2e

# E2Eテスト（UI モード）
npm run test:e2e:ui
```

## 技術スタック

- Next.js 16
- React 19
- Material-UI 7
- TypeScript 5
- Jest 30
- Playwright 1.57

## ディレクトリ構成

```
src/
├── app/          # Next.js App Router
│   ├── api/      # API Routes
│   ├── layout.tsx
│   └── page.tsx
├── components/   # React コンポーネント
├── lib/          # ビジネスロジック
└── types/        # 型定義

tests/
├── unit/         # ユニットテスト
└── e2e/          # E2Eテスト
```
