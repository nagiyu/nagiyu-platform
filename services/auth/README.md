# Auth Service

Nagiyu Platform の認証サービス。NextAuth.js v5 + Google OAuth による認証、JWT セッション管理、シングルサインオン (SSO) をサポートします。

## 技術スタック

- **フレームワーク**: Next.js 16.x
- **UI**: Material-UI 7.x
- **認証**: NextAuth.js 5.x (beta)
- **データベース**: Amazon DynamoDB
- **言語**: TypeScript 5.x

## 主要機能

- ✅ Google OAuth 認証
- ✅ JWT ベースのセッション管理
- ✅ DynamoDB によるユーザー管理
- ✅ ロールベースアクセス制御 (RBAC)
- ✅ シングルサインオン (SSO) - `.nagiyu.com` ドメイン全体で有効

## 開発環境のセットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local` ファイルを作成し、以下の環境変数を設定します。

```bash
cp .env.local.example .env.local
```

必要な環境変数:

```env
# Google OAuth 認証情報
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret

# NextAuth.js 設定
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret-here-min-32-characters

# DynamoDB 設定
DYNAMODB_TABLE_NAME=nagiyu-auth-users-dev
AWS_REGION=ap-northeast-1
```

### 3. Google OAuth の設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成または選択
3. **APIs & Services > OAuth consent screen** で同意画面を設定
4. **APIs & Services > Credentials** で OAuth 2.0 クライアント ID を作成
5. **承認済みのリダイレクト URI** に以下を追加:
   - ローカル開発: `http://localhost:3000/api/auth/callback/google`
   - 開発環境: `https://dev-auth.nagiyu.com/api/auth/callback/google`
   - 本番環境: `https://auth.nagiyu.com/api/auth/callback/google`
6. クライアント ID とクライアントシークレットを `.env.local` に設定

### 4. NEXTAUTH_SECRET の生成

```bash
openssl rand -base64 32
```

出力された文字列を `.env.local` の `NEXTAUTH_SECRET` に設定します。

### 5. DynamoDB テーブルの作成（ローカル開発）

ローカル開発では、AWS 上の開発用 DynamoDB テーブルを使用するか、DynamoDB Local をセットアップします。

#### AWS DynamoDB を使用する場合

1. AWS CLI の設定:

```bash
aws configure
```

2. テーブルが存在することを確認:

```bash
aws dynamodb describe-table --table-name nagiyu-auth-users-dev
```

#### DynamoDB Local を使用する場合

Docker で DynamoDB Local を起動:

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

テーブルを作成:

```bash
aws dynamodb create-table \
  --table-name nagiyu-auth-users-dev \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=googleId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=googleId-index,KeySchema=[{AttributeName=googleId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --endpoint-url http://localhost:8000
```

`.env.local` に DynamoDB Local のエンドポイントを追加:

```env
AWS_ENDPOINT_URL=http://localhost:8000
```

### 6. 開発サーバーの起動

```bash
npm run dev
```

アプリケーションは http://localhost:3000 で起動します。

## ビルドとテスト

### ビルド

```bash
npm run build
```

### リント

```bash
npm run lint
```

### フォーマット

```bash
npm run format
```

### 単体テスト

```bash
npm test
```

### E2E テスト

```bash
npm run test:e2e
```

## アーキテクチャ

### 認証フロー

1. ユーザーが `/signin` にアクセス
2. Google OAuth ボタンをクリック
3. Google の認証画面にリダイレクト
4. ユーザーが認証・同意
5. Google が `/api/auth/callback/google` にリダイレクト
6. NextAuth.js が認証情報を検証
7. DynamoDB にユーザー情報を保存/更新
8. JWT トークンを生成し、Cookie にセット (domain: `.nagiyu.com`)
9. ダッシュボードにリダイレクト

### ディレクトリ構造

```
services/auth/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   │   └── route.ts          # NextAuth API ルート
│   │   │   └── health/
│   │   │       └── route.ts          # ヘルスチェック
│   │   ├── auth/
│   │   │   └── error/
│   │   │       └── page.tsx          # 認証エラーページ
│   │   ├── dashboard/
│   │   │   └── page.tsx              # ダッシュボード（保護ページ）
│   │   ├── signin/
│   │   │   └── page.tsx              # サインインページ
│   │   ├── layout.tsx                # ルートレイアウト
│   │   └── page.tsx                  # ホームページ（リダイレクト）
│   ├── components/
│   │   └── ThemeRegistry.tsx         # MUI テーマプロバイダー
│   ├── lib/
│   │   ├── auth/
│   │   │   └── auth.ts               # NextAuth 設定
│   │   └── repositories/
│   │       └── UserRepository.ts     # DynamoDB ユーザーリポジトリ
│   ├── types/
│   │   └── next-auth.d.ts            # NextAuth 型定義
│   └── middleware.ts                 # 認証ミドルウェア
├── e2e/
│   └── auth.spec.ts                  # E2E テスト
├── .env.local.example                # 環境変数のサンプル
├── package.json
└── README.md
```

## セッション管理

- **戦略**: JWT (ステートレス)
- **有効期限**: 30日
- **Cookie 名**: `__Secure-next-auth.session-token`
- **Cookie ドメイン**: `.nagiyu.com` (SSO 対応)
- **Cookie 属性**: `HttpOnly; Secure; SameSite=Lax`

## ロール・権限システム

### デフォルトロール

- **admin**: すべての権限（ユーザー管理、ロール割り当て）
- **user-manager**: ユーザー管理のみ

### 権限

- `users:read`: ユーザー情報の閲覧
- `users:write`: ユーザー情報の作成・更新
- `roles:assign`: ロールの割り当て

詳細は [docs/services/auth/roles-and-permissions.md](../../docs/services/auth/roles-and-permissions.md) を参照。

## トラブルシューティング

### Google OAuth エラー

**Error: redirect_uri_mismatch**

- Google Cloud Console で設定したリダイレクト URI が、アプリケーションの URL と一致しているか確認
- `NEXTAUTH_URL` が正しく設定されているか確認

### DynamoDB 接続エラー

**Error: ResourceNotFoundException**

- DynamoDB テーブルが存在するか確認
- AWS 認証情報が正しく設定されているか確認
- リージョンが正しいか確認

### JWT 検証エラー

**Error: [next-auth][error][JWTSessionError]**

- `NEXTAUTH_SECRET` が設定されているか確認
- `NEXTAUTH_SECRET` が十分な長さ（32文字以上）か確認

## 関連ドキュメント

- [アーキテクチャ設計](../../docs/services/auth/architecture.md)
- [API 仕様](../../docs/services/auth/api-spec.md)
- [ロール・権限システム](../../docs/services/auth/roles-and-permissions.md)
- [NextAuth.js v5 公式ドキュメント](https://authjs.dev/)

## ライセンス

このプロジェクトは MIT ライセンスと Apache License 2.0 のデュアルライセンスです。
