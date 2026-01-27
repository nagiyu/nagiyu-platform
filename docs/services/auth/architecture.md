# Auth サービス アーキテクチャ設計書

本ドキュメントでは、Auth サービスのシステムアーキテクチャ、技術スタック、設計思想を説明します。

**関連ドキュメント**:
- [要件定義](./requirements.md) - ビジネス要件、機能要件、非機能要件
- [API 仕様](./api-spec.md) - API エンドポイント詳細
- [ロール・権限定義](./roles-and-permissions.md) - RBAC の詳細仕様
- [デプロイ・運用](./deployment.md) - デプロイ手順、CI/CD、監視
- [テスト仕様](./testing.md) - テスト戦略、カバレッジ目標

---

## 1. システム概要

### 1.1 全体構成図

![システム全体構成図](../../images/services/auth/system-architecture.drawio.svg)

#### 構成概要

```
ユーザー (ブラウザ)
    ↓ HTTPS
外部DNSサービス
    ↓ CNAME (auth.nagiyu.com → d123456.cloudfront.net)
CloudFront Distribution
    ↓ オリジン
Lambda Function URL (Next.js SSR + Lambda Web Adapter)
    ├─ Next.js App Router
    ├─ NextAuth.js (Google OAuth)
    ├─ Material UI コンポーネント
    └─ DynamoDB アクセス (ユーザー管理)
```

### 1.2 サービスの責務

Auth サービスは、nagiyu プラットフォームの **認証・認可の中核** を担います。

#### 主要責務

1. **認証 (Authentication)**
    - Google OAuth による外部認証
    - JWT トークンの発行・検証
    - セッション管理 (ステートレスJWT)

2. **ユーザー管理**
    - プラットフォーム共通ユーザー ID の管理
    - Google ID とプラットフォーム ID の紐付け
    - ユーザープロフィール情報の管理

3. **認可 (Authorization)**
    - ロールベースアクセス制御 (RBAC)
    - ユーザーへのロール割り当て
    - 権限情報の提供 (JWT に含める)

4. **シングルサインオン (SSO) 基盤**
    - domain: '.nagiyu.com' での JWT クッキー発行
    - 他サービス (admin など) への認証情報共有

#### スコープ外

スコープ外の詳細については [requirements.md](./requirements.md) を参照してください。

---

## 2. 設計思想

### 2.1 認証と認可の分離

- **認証 (Who are you?)**: NextAuth.js が OAuth フローを処理
- **認可 (What can you do?)**: ロール・権限システムをアプリケーション層で実装
- **利点**: OAuth プロバイダー変更時も認可ロジックは不変

### 2.2 ステートレス認証

- **JWT トークン**: ユーザー情報・ロールをトークンに含める
- **DynamoDB**: プロフィール更新時のみアクセス
- **利点**: Lambda コールドスタート時もデータベース接続不要、スケーラビリティ向上

### 2.3 最小権限の原則

- ロールは **必要最小限の権限セット**
- デフォルトは権限なし (明示的な割り当てが必要)
- 権限の命名規則: `{リソース}:{操作}` (Phase 1 例: `users:write`, `roles:assign`)
- 詳細は [roles-and-permissions.md](./roles-and-permissions.md) を参照

### 2.4 拡張性の確保

- **OAuth プロバイダー追加**: NextAuth.js の providers 配列に追加するだけ
- **独自認証への移行**: NextAuth.js を外して custom JWT 発行に切り替え可能
- **DynamoDB スキーマ**: Single Table Design で柔軟な属性追加が可能

---

## 3. 技術スタック

### 3.1 フロントエンド

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|----------|------|
| フレームワーク | Next.js | 16.x | React SSR フレームワーク |
| UI ライブラリ | Material UI (MUI) | 7.x | React コンポーネントライブラリ |
| 言語 | TypeScript | 5.x | 型安全な開発 |
| 認証ライブラリ | NextAuth.js | 5.x (beta) | OAuth + セッション管理 |
| 状態管理 | React Context / useState | - | ローカル状態管理 |

### 3.2 バックエンド

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|----------|------|
| ランタイム | Node.js | 22.x | JavaScript 実行環境 |
| フレームワーク | Next.js API Routes | 16.x | サーバーサイド処理 |
| Lambda Adapter | AWS Lambda Web Adapter | 0.8.x | Lambda で Web アプリ実行 |
| OAuth Provider | Google OAuth 2.0 | - | 外部認証 |

### 3.3 インフラ

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| コンピューティング | AWS Lambda | Next.js 実行環境 (コンテナ) |
| データベース | Amazon DynamoDB | ユーザー情報管理 |
| シークレット管理 | AWS Secrets Manager | Google OAuth 認証情報 |
| コンテナレジストリ | Amazon ECR | Docker イメージ保存 |
| CDN | Amazon CloudFront | コンテンツ配信、カスタムドメイン |
| SSL/TLS | AWS ACM | HTTPS 証明書 (共通基盤) |
| DNS | 外部DNSサービス | ドメイン管理 |
| IaC | AWS CDK (TypeScript) | インフラ定義 |
| CI/CD | GitHub Actions | 自動ビルド・デプロイ |

### 3.4 開発ツール

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| パッケージマネージャ | npm | 依存関係管理 |
| リンター | ESLint | コード品質チェック |
| フォーマッター | Prettier | コード整形 |
| テスト (単体) | Jest + React Testing Library | ユニットテスト |
| テスト (E2E) | Playwright | ブラウザ自動化テスト |

---

## 4. 認証アーキテクチャ

### 4.1 OAuth 認証フロー

```mermaid
sequenceDiagram
    participant User as ユーザー<br/>ブラウザ
    participant Auth as Auth Service<br/>auth.nagiyu.com
    participant Google as Google OAuth
    participant DB as DynamoDB

    User->>Auth: 1. /signin アクセス
    Auth->>User: 2. Google OAuth URL へリダイレクト<br/>(client_id, redirect_uri, state)
    User->>Google: 3. Google 認証画面へ
    Note over Google: 4. Google アカウントで<br/>ログイン＆同意
    Google->>User: 5. Authorization Code 発行<br/>callback へリダイレクト
    User->>Auth: 6. /api/auth/callback/google<br/>?code=xxx&state=yyy
    Auth->>Google: 7. code を access token に交換
    Google-->>Auth: access token
    Auth->>Google: 8. ユーザー情報取得<br/>(email, name)
    Google-->>Auth: ユーザー情報
    Auth->>DB: 9. googleId で検索/作成
    DB-->>Auth: 10. ユーザー情報返却
    Note over Auth: 11. JWT 生成<br/>(userId, email, roles)
    Auth->>User: 12. JWT Cookie セット<br/>リダイレクト (dashboard)
```

### 4.2 JWT トークン構造

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user_01234567890abcdef",  // userId
    "email": "user@example.com",
    "name": "山田太郎",
    "roles": ["admin"],
    "iat": 1703001234,  // 発行時刻
    "exp": 1705593234   // 有効期限 (30日後)
  },
  "signature": "..."
}
```

#### JWT 設計方針

- **最小限の情報**: ユーザーID、ロールのみ (詳細はDynamoDBから取得)
- **短期有効期限**: 30日 (セキュリティとUXのバランス)
- **自動更新**: NextAuth.js が自動的にトークンをリフレッシュ

### 4.3 セッション管理

#### ステートレスJWT戦略

- **保存場所**: 暗号化された HTTP-only クッキー
- **検証方法**: JWT 署名検証 (NEXTAUTH_SECRET)
- **有効期限**: 30日間 (アクセスごとに延長)

#### クッキー設定

```typescript
cookies: {
  sessionToken: {
    name: 'nagiyu-session',
    options: {
      httpOnly: true,     // XSS 対策
      sameSite: 'lax',    // CSRF 対策
      path: '/',
      secure: !isDevelopment,  // ローカル開発環境以外では HTTPS のみ
      // 環境別 domain 設定:
      // - ローカル開発環境 (NODE_ENV=development): 未設定（localhost のみ）
      // - dev 環境 (NODE_ENV=dev): 未設定（dev-auth.nagiyu.com のみ、SSO 不要）
      // - prod 環境 (NODE_ENV=prod): .nagiyu.com（全サブドメインで SSO 共有）
      domain: isProduction ? '.nagiyu.com' : undefined,
    }
  }
}
```

**重要な設計判断:**

- **dev 環境**: `domain` を未設定にすることで、クッキーは `dev-auth.nagiyu.com` のみで有効
  - dev 環境では他のサービスとの SSO 連携は不要のため、よりセキュアな設定
  - prod 環境とクッキーが混同されることを防ぐ
  
- **prod 環境**: `domain: '.nagiyu.com'` により、全サブドメインでクッキーを共有
  - `auth.nagiyu.com`, `admin.nagiyu.com`, `tools.nagiyu.com` などで SSO を実現

### 4.4 他サービスとの認証共有 (SSO)

```mermaid
sequenceDiagram
    participant User as ユーザー<br/>ブラウザ
    participant Auth as Auth Service<br/>auth.nagiyu.com
    participant Admin as Admin Service<br/>admin.nagiyu.com
    participant Tools as Tools Service<br/>tools.nagiyu.com

    Note over User,Auth: 初回ログイン
    User->>Auth: 1. auth.nagiyu.com へアクセス
    Note over Auth: 2. Google OAuth ログイン
    Auth->>User: 3. JWT Cookie セット<br/>(domain: .nagiyu.com)

    Note over User,Admin: Admin へアクセス
    User->>Admin: 4. admin.nagiyu.com へアクセス<br/>JWT Cookie 自動送信
    Note over Admin: 5. JWT 検証<br/>(署名、有効期限、権限)
    Admin->>User: 6. アクセス許可<br/>ダッシュボード表示

    Note over User,Tools: Tools へアクセス (Phase 2+)
    User->>Tools: 7. tools.nagiyu.com へアクセス<br/>JWT Cookie 自動送信
    Note over Tools: 8. JWT 検証<br/>(署名、有効期限、権限)
    Tools->>User: 9. アクセス許可<br/>ツール画面表示
```

#### SSO の仕組み

**JWT Cookie 詳細:**
- **Cookie 名**: `nagiyu-session`
- **Domain**:
  - **ローカル開発環境** (NODE_ENV=development): 未設定（localhost のみ）
  - **dev 環境** (NODE_ENV=dev): 未設定（dev-auth.nagiyu.com のみ、他サービスとの SSO は不要）
  - **prod 環境** (NODE_ENV=prod): `.nagiyu.com`（全サブドメインで SSO 共有）
- **属性**: `HttpOnly; Secure; SameSite=Lax`
- **有効期限**: 30日

**メリット:**
- ✓ 一度のログインで全サービスにアクセス可能（prod 環境のみ）
- ✓ 各サービスは独立して JWT を検証（Auth Service への問い合わせ不要）
- ✓ 認証ロジックが Auth Service に集約され保守性向上
- ✓ dev 環境と prod 環境でクッキーが混同されない（セキュリティ向上）

#### シナリオ: admin.nagiyu.com へのアクセス

```
1. ユーザーが admin.nagiyu.com にアクセス
    ↓
2. Admin サービスのミドルウェアがクッキーをチェック
    - クッキー名: nagiyu-session
    - domain: .nagiyu.com なので admin でも読み取れる
    ↓
3. クッキーがない場合
    → auth.nagiyu.com/api/auth/signin にリダイレクト
    → OAuth ログイン後、admin.nagiyu.com に戻る
    ↓
4. クッキーがある場合
    → JWT を検証 (NEXTAUTH_SECRET で署名確認)
    → payload から userId, roles を取得
    → 権限チェック (例: users:read が必要)
    → OK なら画面表示、NG なら 403 Forbidden
```

---

## 5. ユーザー管理アーキテクチャ

### 5.1 DynamoDB スキーマ設計

#### テーブル名

`nagiyu-auth-users-{env}`
- dev: `nagiyu-auth-users-dev`
- prod: `nagiyu-auth-users-prod`

#### Primary Key

| 属性名 | 型 | キータイプ | 説明 |
|--------|---|----------|------|
| userId | String | HASH (PK) | プラットフォーム共通ユーザーID (UUID v4) |

#### Global Secondary Index (GSI)

**Index 名**: `googleId-index`

| 属性名 | 型 | キータイプ | 説明 |
|--------|---|----------|------|
| googleId | String | HASH | Google OAuth ID |

**用途**: Google ID からユーザーを検索 (OAuth callback 時)

#### 属性

| 属性名 | 型 | 必須 | 説明 |
|--------|---|------|------|
| userId | String | ✅ | プラットフォーム共通ユーザーID (UUID v4) |
| googleId | String | ✅ | Google OAuth ID (sub claim) |
| email | String | ✅ | メールアドレス |
| name | String | ✅ | 表示名 |
| roles | String[] | ✅ | ロールID配列 (例: ["admin", "user-manager"]) |
| createdAt | String | ✅ | 作成日時 (ISO 8601) |
| updatedAt | String | ✅ | 更新日時 (ISO 8601) |
| lastLoginAt | String | - | 最終ログイン日時 (ISO 8601) |

#### 設計方針

- **Single Table Design**: 将来的に拡張可能
- **GSI による高速検索**: googleId → userId の変換
- **ロール配列**: 複数ロール対応 (例: `["admin", "user-manager"]`)
- **ISO 8601 日時**: タイムゾーン非依存、ソート可能

### 5.2 ユーザーライフサイクル

#### 新規ユーザー作成

```
Google OAuth 初回ログイン
    ↓
NextAuth.js signIn callback
    ↓
DynamoDB Query (googleId-index)
    - 結果なし (新規ユーザー)
    ↓
userId 生成 (UUID v4)
    ↓
DynamoDB PutItem
    - userId, googleId, email, name
    - roles: [] (デフォルトは権限なし)
    - createdAt, updatedAt
    ↓
JWT 発行 (roles: [])
```

#### ユーザー情報更新

```
管理者が /users/{userId} で編集
    ↓
API Route: PUT /api/users/{userId}
    ↓
DynamoDB UpdateItem
    - name, roles, updatedAt を更新
    ↓
次回ログイン時に新しい roles が JWT に反映
```

#### ロール変更の反映タイミング

- **即座には反映されない**: JWT は既に発行済み
- **反映タイミング**: 次回ログイン時、または JWT 有効期限切れ時
- **強制反映**: ユーザーにサインアウト → サインインを依頼

---

## 6. ロール・権限アーキテクチャ

Auth サービスは RBAC (Role-Based Access Control) を採用しています。

### 6.1 基本設計

- **ロール定義はコードで管理**: `libs/common/src/auth/roles.ts` に定義
- **権限の命名規則**: `{リソース}:{操作}` (例: `users:read`, `users:write`, `roles:assign`)
- **最小権限の原則**: デフォルトは権限なし、明示的な割り当てが必要
- **複数ロール対応**: ユーザーは複数のロールを持つことが可能

### 6.2 Phase 1 で定義されるロール

| ロールID | ロール名 | 権限 |
|---------|---------|------|
| `admin` | 管理者 | `users:read`, `users:write`, `roles:assign` |
| `user-manager` | ユーザー管理者 | `users:read`, `users:write` |

### 6.3 権限チェックの実装

**サーバーサイド** (必須):
```typescript
// API Route での権限チェック
const session = await auth();
if (!session || !hasPermission(session.user.roles, 'users:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

**クライアントサイド** (UI表示制御のみ):
```typescript
// UI コンポーネントでの表示制御
const canManageUsers = hasPermission(user.roles, 'users:write');
```

**詳細**: ロール・権限の詳細仕様、将来の拡張計画については [roles-and-permissions.md](./roles-and-permissions.md) を参照してください。

---

## 7. セキュリティ設計

### 7.1 OAuth セキュリティ

#### CSRF 対策

- **state パラメータ**: NextAuth.js が自動生成・検証
- **SameSite クッキー**: `sameSite: 'lax'` で CSRF 攻撃を防止

#### リダイレクト URI 検証

- Google OAuth Console で許可する URI を制限
- dev: `https://dev-auth.nagiyu.com/api/auth/callback/google`
- prod: `https://auth.nagiyu.com/api/auth/callback/google`

#### クライアントシークレットの管理

- **保存場所**: AWS Secrets Manager
- **取得タイミング**: Lambda 起動時に環境変数から取得
- **ローテーション**: 四半期ごとに手動更新 (将来自動化)

### 7.2 セッションセキュリティ

#### JWT 署名

- **アルゴリズム**: HS256 (HMAC + SHA-256)
- **秘密鍵**: `NEXTAUTH_SECRET` (32文字以上のランダム文字列)
- **保存場所**: Secrets Manager

#### クッキーセキュリティ

| 属性 | 値 | 目的 |
|------|---|------|
| httpOnly | true | JavaScript からのアクセス防止 (XSS 対策) |
| secure | true | HTTPS 通信のみ (中間者攻撃対策) |
| sameSite | lax | CSRF 攻撃防止 |
| domain | .nagiyu.com | サブドメイン全体で共有 (SSO) |
| path | / | 全パスでアクセス可能 |
| maxAge | 2592000 | 30日間 (秒単位) |

### 7.3 API セキュリティ

#### 認証チェック

すべての保護APIで `auth()` を呼び出し、セッション存在を確認

```typescript
const session = await auth();
if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

#### 権限チェック

操作ごとに必要な権限を確認

```typescript
if (!hasPermission(session.user.roles, 'users:write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

#### 入力検証

- Zod スキーマで型安全なバリデーション
- SQLインジェクション対策 (DynamoDB は NoSQL だが、属性名の検証は実施)
- XSS 対策 (React の自動エスケープ + DOMPurify)

### 7.4 インフラセキュリティ

#### Lambda IAM ロール

最小権限の原則:

```yaml
Policies:
  - DynamoDBAccess:
      - dynamodb:GetItem
      - dynamodb:PutItem
      - dynamodb:UpdateItem
      - dynamodb:Query
      - dynamodb:Scan
    Resource: arn:aws:dynamodb:*:*:table/nagiyu-auth-users-*

  - SecretsManagerAccess:
      - secretsmanager:GetSecretValue
    Resource: arn:aws:secretsmanager:*:*:secret:nagiyu/auth/*
```

#### DynamoDB 暗号化

- **At Rest**: AWS KMS による暗号化
- **In Transit**: HTTPS 通信

---

## 8. 技術選定理由

### Next.js + NextAuth.js

**理由**:
- Next.js 16 による最新の React SSR 機能
- NextAuth.js による OAuth 実装の簡素化
- Material-UI との統合が容易

**代替案との比較**:
- **Express + Passport.js**: より柔軟だが、SSR の実装コストが高い
- **独自実装**: OAuth の実装が複雑、セキュリティリスクが高い

### AWS Lambda (コンテナ)

**理由**:
- サーバーレスで運用コストが低い
- 自動スケーリング
- Next.js のコンテナイメージをそのまま実行可能

**代替案との比較**:
- **ECS Fargate**: 常時起動のため、コストが高い
- **EC2**: 運用コストが高い、スケーリングが手動

### DynamoDB

**理由**:
- サーバーレスで運用不要
- オンデマンド課金で自動スケール
- Single Table Design で柔軟な拡張が可能

**代替案との比較**:
- **RDS**: 運用コストが高い、サーバーレスとの親和性が低い
- **Aurora Serverless**: コストが高い、Lambda のコールドスタートに不向き

---

## 9. 制約事項

### 9.1 技術的制約

- **OAuth プロバイダー**: Phase 1 は Google のみ (GitHub, メールアドレス認証は Phase 2 以降)
- **PWA**: Auth サービスは PWA 無効 (認証が必須のため)
- **JWT 有効期限**: 固定30日 (カスタマイズ不可)

### 9.2 運用制約

- **Google OAuth 認証情報**: 手動でSecrets Managerに登録
- **初期管理者**: デプロイ後、手動でDynamoDBに登録
- **ロール変更の即時反映**: 不可 (次回ログイン時に反映)

---

## 10. 将来拡張

### Phase 2 以降で検討

- GitHub OAuth 対応
- メールアドレス + パスワード認証
- 多要素認証 (MFA)
- パスワードリセット機能
- アカウント削除のセルフサービス
- 監査ログ (ログイン履歴、操作履歴)
