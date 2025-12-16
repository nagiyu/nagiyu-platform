# Tools アプリケーション

便利な開発ツールを集約した Web アプリケーション。

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **ランタイム**: Node.js 20.x
- **言語**: TypeScript 5.x
- **React**: 19.x

## セットアップ手順

### 1. 依存関係のインストール

```bash
cd apps/tools
npm install
```

### 2. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスして確認します。

### 3. ビルド

```bash
npm run build
```

### 4. 本番サーバーの起動

```bash
npm run start
```

## 開発コマンド

| コマンド               | 説明                                |
| ---------------------- | ----------------------------------- |
| `npm run dev`          | 開発サーバーを起動（Turbopack使用） |
| `npm run build`        | 本番用にビルド                      |
| `npm run start`        | 本番サーバーを起動                  |
| `npm run lint`         | ESLintでコードチェック              |
| `npm run format`       | Prettierでコード整形                |
| `npm run format:check` | Prettierのチェックのみ実行          |

## ディレクトリ構成

```
apps/tools/
├── app/                # Next.js App Router
│   ├── api/           # API Routes
│   │   └── health/    # ヘルスチェックAPI
│   ├── layout.tsx     # 共通レイアウト
│   ├── page.tsx       # トップページ
│   └── globals.css    # グローバルスタイル
├── public/            # 静的ファイル
├── .prettierrc        # Prettier設定
├── eslint.config.mjs  # ESLint設定
├── next.config.ts     # Next.js設定
├── tsconfig.json      # TypeScript設定
└── package.json       # パッケージ定義
```

## API エンドポイント

### ヘルスチェック

- **URL**: `/api/health`
- **Method**: `GET`
- **Response**:
  ```json
  {
    "status": "ok",
    "timestamp": "2025-12-16T14:00:00.000Z"
  }
  ```

## 関連ドキュメント

- [要件定義書](../../docs/services/tools/requirements.md)
- [基本設計書](../../docs/services/tools/basic-design.md)
- [詳細設計書](../../docs/services/tools/detailed-design.md)
- [実装ガイド](../../docs/services/tools/implementation.md)
