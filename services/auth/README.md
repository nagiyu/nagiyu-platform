# Auth サービス

nagiyu プラットフォームの認証・認可サービス

## 概要

- **認証**: Google OAuth 2.0 による外部認証
- **セッション管理**: JWT トークンによるステートレス認証
- **SSO**: `.nagiyu.com` ドメイン全体で認証情報を共有
- **ロール管理**: RBAC（ロールベースアクセス制御）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env.local` を作成:

```bash
cp .env.example .env.local
```

以下の環境変数を設定:

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret-here-at-least-32-characters-long
```

### 3. Google OAuth 設定

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) にアクセス
2. OAuth 2.0 クライアント ID を作成
3. 承認済みリダイレクト URI に以下を追加:
   - `http://localhost:3000/api/auth/callback/google` (開発環境)
   - `https://auth.nagiyu.com/api/auth/callback/google` (本番環境)

### 4. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 にアクセス

## スクリプト

| コマンド               | 説明                       |
| ---------------------- | -------------------------- |
| `npm run dev`          | 開発サーバー起動           |
| `npm run build`        | プロダクションビルド       |
| `npm start`            | プロダクションサーバー起動 |
| `npm run lint`         | ESLint 実行                |
| `npm run format`       | Prettier でコード整形      |
| `npm run format:check` | フォーマットチェック       |
| `npm test`             | ユニットテスト実行         |
| `npm run test:e2e`     | E2E テスト実行             |

## 主要な画面

### サインインページ (`/signin`)

Google OAuth によるサインイン画面

### ダッシュボード (`/dashboard`)

認証後のユーザー情報表示画面

- ユーザー名、メールアドレス
- ロール情報
- セッション情報（デバッグ用）

### エラーページ (`/auth/error`)

OAuth 認証エラー時の表示画面

## API エンドポイント

### 認証 API

- `GET /api/auth/signin` - サインイン開始
- `GET /api/auth/callback/google` - OAuth コールバック
- `GET /api/auth/session` - セッション取得
- `POST /api/auth/signout` - サインアウト

### ヘルスチェック

- `GET /api/health` - サービスの稼働状況確認

## アーキテクチャ

### 認証フロー

1. ユーザーが `/signin` にアクセス
2. Google OAuth 画面にリダイレクト
3. Google で認証＆同意
4. コールバック URL に認証コードが返却
5. Auth サービスがアクセストークンを取得
6. ユーザー情報を取得してリポジトリに保存
7. JWT トークンを発行して Cookie にセット
8. ダッシュボードにリダイレクト

### セッション管理

- **方式**: JWT (JSON Web Token)
- **保存場所**: HTTP-only Cookie
- **有効期限**: 30日
- **Cookie 名**: `__Secure-next-auth.session-token`
- **Domain**: `.nagiyu.com` (SSO対応)

### ユーザーリポジトリ

現在は `InMemoryUserRepository` を使用（開発・テスト用）。

将来的には DynamoDB を使用した永続化実装に切り替え予定。

## テスト

### ユニットテスト

```bash
npm test
```

- UserRepository の動作テスト
- ビジネスロジックのテスト

### E2E テスト

```bash
npm run test:e2e
```

- サインインフローのテスト
- ナビゲーションのテスト
- API のテスト

## セキュリティ

### 実装済み

- ✅ OAuth 2.0 による認証
- ✅ JWT 署名検証
- ✅ HTTP-only Cookie (XSS対策)
- ✅ SameSite Cookie (CSRF対策)
- ✅ HTTPS 必須（本番環境）

### 今後の実装予定

- 🔜 DynamoDB との連携
- 🔜 ロール・権限管理 API
- 🔜 レート制限
- 🔜 監査ログ

## 関連ドキュメント

- [アーキテクチャ設計](../../docs/services/auth/architecture.md)
- [API 仕様書](../../docs/services/auth/api-spec.md)
- [ロール・権限設計](../../docs/services/auth/roles-and-permissions.md)

## ライセンス

MIT / Apache 2.0 Dual License
