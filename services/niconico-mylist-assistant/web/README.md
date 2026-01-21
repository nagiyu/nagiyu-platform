# @nagiyu/niconico-mylist-assistant-web

ニコニコ動画のマイリスト登録を自動化する補助ツールのWebアプリケーション

## 技術スタック

- Next.js 16
- React 19
- Material-UI 7
- TypeScript 5

## 開発

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build

# テスト
npm test

# E2Eテスト
npm run test:e2e
```

## ディレクトリ構成

```
packages/web/
├── app/              # Next.js App Router
│   ├── layout.tsx    # ルートレイアウト
│   ├── page.tsx      # トップページ
│   └── api/          # API Routes
├── components/       # Reactコンポーネント
├── lib/              # ビジネスロジック
└── tests/            # テスト
    ├── unit/         # ユニットテスト
    └── e2e/          # E2Eテスト
```
