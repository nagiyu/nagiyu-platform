# Auth サービス

Nagiyu Platform の認証サービス。NextAuth.js v5 + Google OAuth による認証を提供します。

---

## ドキュメント一覧

| ドキュメント | 説明 |
|------------|------|
| [architecture.md](./architecture.md) | システムアーキテクチャ、認証フロー、技術スタック |
| [api-spec.md](./api-spec.md) | API仕様、エンドポイント定義 |
| [roles-and-permissions.md](./roles-and-permissions.md) | ロール・権限システム |

---

## 主要機能

- Google OAuth 認証
- JWT ベースのセッション管理（30日間有効）
- ロールベースアクセス制御 (RBAC)
- シングルサインオン (SSO) - `.nagiyu.com` ドメイン全体で有効

---

## 開発環境セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local` ファイルを作成:

```bash
cp services/auth/.env.local.example services/auth/.env.local
```

必要な環境変数:
- `GOOGLE_CLIENT_ID` - Google OAuth クライアント ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth クライアントシークレット
- `NEXTAUTH_URL` - アプリケーション URL
- `NEXTAUTH_SECRET` - JWT 署名用シークレット（32文字以上）
- `COOKIE_DOMAIN` - Cookie ドメイン（ローカル: `localhost`、本番: `.nagiyu.com`）
- `DYNAMODB_TABLE_NAME` - DynamoDB テーブル名
- `AWS_REGION` - AWS リージョン（`us-east-1`）

詳細は `services/auth/.env.local.example` を参照。

### 3. 開発サーバーの起動

```bash
npm run dev --workspace @nagiyu/auth
```

---

## 関連ドキュメント

- [プラットフォームドキュメント](../../README.md)
- [インフラドキュメント](../../infra/README.md)

