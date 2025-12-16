# Tools アプリケーション

便利な開発ツールを集約した Web アプリケーション。

## 概要

Tools アプリは、日常的な開発作業で使用する小さなツール（JSON整形、エンコード/デコード等）を、ブラウザ上で手軽に利用できるプラットフォームです。

**技術スタック:**

- Next.js 15+ (App Router)
- TypeScript 5+
- React 19+
- Material UI 6 (予定)
- AWS Lambda (デプロイ先)

## セットアップ

### 前提条件

- Node.js 20.x 以上
- npm 10.x 以上

### 依存関係のインストール

```bash
npm install
```

### 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いて確認できます。

### ヘルスチェック API

開発サーバー起動後、以下のエンドポイントでヘルスチェックが可能です:

```bash
curl http://localhost:3000/api/health
```

レスポンス例:

```json
{
  "status": "ok",
  "timestamp": "2025-12-16T14:30:00.000Z"
}
```

## 利用可能なコマンド

| コマンド               | 説明                                       |
| ---------------------- | ------------------------------------------ |
| `npm run dev`          | 開発サーバーを起動 (http://localhost:3000) |
| `npm run build`        | 本番用ビルドを作成                         |
| `npm run start`        | 本番用サーバーを起動 (ビルド後)            |
| `npm run lint`         | ESLint でコードをチェック                  |
| `npm run format`       | Prettier でコードを整形                    |
| `npm run format:check` | Prettier のフォーマットをチェック          |

## プロジェクト構成

```
apps/tools/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   └── health/        # ヘルスチェック API
│   ├── layout.tsx         # 共通レイアウト
│   ├── page.tsx           # トップページ
│   └── globals.css        # グローバルスタイル
├── public/                # 静的ファイル
├── package.json           # 依存関係定義
├── tsconfig.json          # TypeScript 設定
├── next.config.ts         # Next.js 設定
├── eslint.config.mjs      # ESLint 設定
└── .prettierrc            # Prettier 設定
```

## 開発ガイドライン

### コーディング規約

- TypeScript の strict モードを使用
- ESLint と Prettier を使用してコード品質を維持
- コンポーネントは関数コンポーネントで実装
- App Router の規約に従う

### ブランチ戦略

プラットフォームのブランチ戦略に従います。
詳細は [ブランチ戦略ドキュメント](../../docs/branching.md) を参照してください。

## 関連ドキュメント

- [要件定義書](../../docs/services/tools/requirements.md)
- [基本設計書](../../docs/services/tools/basic-design.md)
- [詳細設計書](../../docs/services/tools/detailed-design.md)
- [実装ガイド](../../docs/services/tools/implementation.md)

## ライセンス

このプロジェクトは [MIT License](../../MIT_LICENSE) および [Apache License 2.0](../../Apache_LICENSE) のデュアルライセンスです。
