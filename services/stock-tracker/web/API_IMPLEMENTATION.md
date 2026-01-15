# Stock Tracker Web - API Implementation

## 取引所一覧 API (`GET /api/exchanges`)

### 概要

全取引所の一覧を取得する API エンドポイントです。

### 実装内容

- **認証**: NextAuth.js による JWT 認証
- **権限**: `stocks:read` 必須
- **データソース**: DynamoDB (Exchange リポジトリ経由)

### 必要な環境変数

`.env.local` ファイルを作成し、以下の環境変数を設定してください:

```bash
# AWS Configuration
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=nagiyu-stock-tracker-main-dev

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here
NEXT_PUBLIC_AUTH_URL=http://localhost:3001
```

### ローカル開発での動作確認

#### 前提条件

1. AWS 認証情報が設定されていること (IAM ユーザーまたはロール)
2. DynamoDB テーブルが作成されていること
3. Auth サービスが起動していること（または `SKIP_AUTH_CHECK=true` を設定）

#### 起動方法

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev -w stock-tracker-web
```

#### API リクエスト例

```bash
# 認証済みの場合
curl http://localhost:3000/api/exchanges \
  -H "Cookie: __Secure-next-auth.session-token=<your-token>"
```

#### 期待されるレスポンス

```json
{
  "exchanges": [
    {
      "exchangeId": "NASDAQ",
      "name": "NASDAQ Stock Market",
      "key": "NSDQ",
      "timezone": "America/New_York",
      "tradingHours": {
        "start": "09:30",
        "end": "16:00"
      }
    }
  ]
}
```

### エラーレスポンス

#### 401 Unauthorized (認証エラー)

```json
{
  "error": "UNAUTHORIZED",
  "message": "認証が必要です"
}
```

#### 403 Forbidden (権限不足)

```json
{
  "error": "FORBIDDEN",
  "message": "この操作を実行する権限がありません"
}
```

#### 500 Internal Server Error

```json
{
  "error": "INTERNAL_ERROR",
  "message": "内部エラーが発生しました"
}
```

### 実装ファイル

- `app/api/exchanges/route.ts` - API エンドポイント
- `src/auth.ts` - NextAuth 設定
- `src/lib/aws-clients.ts` - AWS クライアントシングルトン
- `types/next-auth.d.ts` - NextAuth 型定義

### 依存関係

- `@nagiyu/stock-tracker-core` - Exchange リポジトリ
- `@nagiyu/common` - 権限チェック関数
- `next-auth` - 認証
- `@aws-sdk/lib-dynamodb` - DynamoDB アクセス

### テスト

現時点では手動テストのみ。ユニットテストは Task 1.5 のスコープ外です。

### 次のステップ

- Task 1.6: ティッカー一覧 API 実装
- E2E テスト追加 (Phase 1 後半)
