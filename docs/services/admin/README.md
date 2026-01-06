# Admin Service

管理画面サービス - Auth サービスからの JWT 認証を使用した管理画面

## 概要

このサービスは、Auth サービスで発行された JWT トークンを検証し、認証されたユーザーのみがアクセスできる管理画面を提供します。

## 機能

- **JWT 検証**: Auth サービスから発行された JWT トークンを検証
- **自動リダイレクト**: 未認証ユーザーを Auth サービスのサインインページにリダイレクト
- **セッション管理**: Server Components でセッション情報を取得

## 環境変数

以下の環境変数が必要です:

```env
# Auth サービスとの連携
NEXTAUTH_SECRET=your-nextauth-secret-here  # Auth サービスと同じ値
NEXTAUTH_URL=https://auth.nagiyu.com       # Auth サービスの URL
NEXT_PUBLIC_AUTH_URL=https://auth.nagiyu.com

# アプリケーション設定
APP_VERSION=1.0.0
```

`.env.example` ファイルを `.env.local` としてコピーし、適切な値を設定してください。

## セットアップ

1. 依存パッケージのインストール:

```bash
npm install
```

2. 環境変数の設定:

```bash
cp .env.example .env.local
# .env.local を編集して適切な値を設定
```

3. 開発サーバーの起動:

```bash
npm run dev
```

## テスト

### ユニットテスト

```bash
# すべてのユニットテストを実行
npm test

# カバレッジを含めて実行
npm run test:coverage

# ウォッチモード
npm run test:watch
```

### E2E テスト

```bash
# すべての E2E テストを実行
npm run test:e2e

# UI モードで実行
npm run test:e2e:ui

# ヘッドモードで実行
npm run test:e2e:headed
```

## ビルド

```bash
npm run build
```

## アーキテクチャ

### ミドルウェア (`src/middleware.ts`)

すべてのリクエストを JWT 検証を通してフィルタリングします:

1. 公開ルート (`/api/health`) はスキップ
2. JWT クッキー (`__Secure-next-auth.session-token`) を取得
3. JWT を検証
4. 検証成功時: ユーザー情報をリクエストヘッダーに追加
5. 検証失敗時: Auth サービスへリダイレクト

### セッション取得 (`src/lib/auth/session.ts`)

Server Components でセッション情報を取得するヘルパー関数:

```typescript
import { getSession } from '@/lib/auth/session';

export default async function MyPage() {
  const session = await getSession();

  if (!session) {
    // セッションがない場合の処理
  }

  // session.user.id, session.user.email, session.user.roles を使用
}
```

## ライセンス

MIT
