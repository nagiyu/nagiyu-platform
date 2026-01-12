# Auth サービス API 仕様書

---

## 1. API 概要

### 1.1 ベース URL

| 環境 | URL |
|------|-----|
| 開発 | `https://dev-auth.nagiyu.com` |
| 本番 | `https://auth.nagiyu.com` |

### 1.2 認証方式

#### JWT トークン (Cookie)

- **Cookie 名**: `nagiyu-session`
- **形式**: 暗号化された JWT
- **有効期限**: 30日
- **スコープ**: `.nagiyu.com` (全サブドメインで共有)

#### リクエスト例

```http
GET /api/users HTTP/1.1
Host: auth.nagiyu.com
Cookie: nagiyu-session=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 1.3 共通レスポンス形式

#### 成功レスポンス

```json
{
    "data": { ... },
    "meta": {
        "timestamp": "2024-01-15T12:34:56.789Z"
    }
}
```

#### エラーレスポンス

```json
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です",
        "details": "..."
    },
    "meta": {
        "timestamp": "2024-01-15T12:34:56.789Z"
    }
}
```

### 1.4 HTTP ステータスコード

| コード | 意味 | 用途 |
|--------|------|------|
| 200 | OK | 成功 |
| 201 | Created | リソース作成成功 |
| 400 | Bad Request | リクエストが不正 |
| 401 | Unauthorized | 認証が必要 |
| 403 | Forbidden | 権限不足 |
| 404 | Not Found | リソースが存在しない |
| 500 | Internal Server Error | サーバーエラー |

### 1.5 エラーコード一覧

| コード | HTTP ステータス | 説明 |
|--------|----------------|------|
| `UNAUTHORIZED` | 401 | 認証が必要 |
| `FORBIDDEN` | 403 | 権限が不足している |
| `NOT_FOUND` | 404 | リソースが見つからない |
| `INVALID_REQUEST` | 400 | リクエストが不正 |
| `INTERNAL_ERROR` | 500 | 内部エラー |

---

## 2. 認証 API (NextAuth.js)

### 2.1 サインイン開始

Google OAuth サインインフローを開始します。

#### エンドポイント

```
GET /api/auth/signin
```

#### クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| callbackUrl | string | - | サインイン後のリダイレクト先 (デフォルト: `/`) |

#### リクエスト例

```http
GET /api/auth/signin?callbackUrl=/users HTTP/1.1
Host: auth.nagiyu.com
```

#### レスポンス

```
HTTP/1.1 302 Found
Location: https://accounts.google.com/o/oauth2/v2/auth?...
```

Google OAuth 画面にリダイレクトされます。

---

### 2.2 OAuth コールバック

Google からの OAuth コールバックを処理します（内部使用）。

#### エンドポイント

```
GET /api/auth/callback/google
```

#### クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| code | string | ✅ | Authorization code |
| state | string | ✅ | CSRF トークン |

#### 処理フロー

1. authorization code を access token に交換
2. Google User Info API からプロフィール取得
3. DynamoDB でユーザー検索/作成
4. JWT 発行 + Cookie セット
5. callbackUrl にリダイレクト

---

### 2.3 セッション取得

現在のセッション情報を取得します。

#### エンドポイント

```
GET /api/auth/session
```

#### リクエスト例

```http
GET /api/auth/session HTTP/1.1
Host: auth.nagiyu.com
Cookie: nagiyu-session=...
```

#### レスポンス (ログイン済み)

```json
{
    "user": {
        "id": "user_01234567890abcdef",
        "email": "user@example.com",
        "name": "山田太郎",
        "roles": ["admin"]
    },
    "expires": "2024-02-15T12:34:56.789Z"
}
```

#### レスポンス (未ログイン)

```json
{
    "user": null
}
```

---

### 2.4 サインアウト

セッションを破棄します。

#### エンドポイント

```
POST /api/auth/signout
```

#### リクエスト例

```http
POST /api/auth/signout HTTP/1.1
Host: auth.nagiyu.com
Cookie: nagiyu-session=...
```

#### レスポンス

```
HTTP/1.1 302 Found
Location: /
Set-Cookie: nagiyu-session=; Max-Age=0; Path=/; HttpOnly; Secure
```

Cookie が削除され、トップページにリダイレクトされます。

---

## 3. ユーザー管理 API

### 3.1 ユーザー一覧取得

登録されている全ユーザーを取得します。

#### エンドポイント

```
GET /api/users
```

#### 必要な権限

- `users:read`

#### クエリパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| limit | number | - | 50 | 取得件数 (最大100) |
| lastKey | string | - | - | ページネーション用キー |

#### リクエスト例

```http
GET /api/users?limit=10 HTTP/1.1
Host: auth.nagiyu.com
Cookie: nagiyu-session=...
```

#### レスポンス (200 OK)

```json
{
    "users": [
        {
            "userId": "user_01234567890abcdef",
            "email": "user@example.com",
            "name": "山田太郎",
            "roles": ["admin"],
            "createdAt": "2024-01-01T00:00:00.000Z",
            "lastLoginAt": "2024-01-15T10:00:00.000Z"
        },
        {
            "userId": "user_fedcba0987654321",
            "email": "test@example.com",
            "name": "テストユーザー",
            "roles": ["log-viewer"],
            "createdAt": "2024-01-10T00:00:00.000Z",
            "lastLoginAt": "2024-01-14T15:30:00.000Z"
        }
    ],
    "pagination": {
        "count": 2,
        "lastKey": "user_fedcba0987654321"
    }
}
```

#### エラーレスポンス

```json
// 401 Unauthorized
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です"
    }
}

// 403 Forbidden
{
    "error": {
        "code": "FORBIDDEN",
        "message": "この操作を実行する権限がありません",
        "details": "Required permission: users:read"
    }
}
```

---

### 3.2 ユーザー詳細取得

特定ユーザーの詳細情報を取得します。

#### エンドポイント

```
GET /api/users/{userId}
```

#### 必要な権限

- `users:read`

#### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| userId | string | ユーザーID |

#### リクエスト例

```http
GET /api/users/user_01234567890abcdef HTTP/1.1
Host: auth.nagiyu.com
Cookie: nagiyu-session=...
```

#### レスポンス (200 OK)

```json
{
    "userId": "user_01234567890abcdef",
    "googleId": "1234567890",
    "email": "user@example.com",
    "name": "山田太郎",
    "roles": ["admin"],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-10T00:00:00.000Z",
    "lastLoginAt": "2024-01-15T10:00:00.000Z"
}
```

#### エラーレスポンス

```json
// 404 Not Found
{
    "error": {
        "code": "NOT_FOUND",
        "message": "ユーザーが見つかりません"
    }
}
```

---

### 3.3 ユーザー情報更新

ユーザーの名前やロールを更新します。

#### エンドポイント

```
PUT /api/users/{userId}
```

#### 必要な権限

- `users:write` (名前更新)
- `roles:assign` (ロール変更)

#### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| userId | string | ユーザーID |

#### リクエストボディ

```json
{
    "name": "山田花子",
    "roles": ["user-manager", "log-viewer"]
}
```

#### リクエストボディスキーマ

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| name | string | - | 表示名 (1〜100文字) |
| roles | string[] | - | ロールID配列 |

#### リクエスト例

```http
PUT /api/users/user_01234567890abcdef HTTP/1.1
Host: auth.nagiyu.com
Cookie: nagiyu-session=...
Content-Type: application/json

{
  "name": "山田花子",
  "roles": ["user-manager"]
}
```

#### レスポンス (200 OK)

```json
{
    "userId": "user_01234567890abcdef",
    "email": "user@example.com",
    "name": "山田花子",
    "roles": ["user-manager"],
    "updatedAt": "2024-01-15T12:00:00.000Z"
}
```

#### エラーレスポンス

```json
// 400 Bad Request (バリデーションエラー)
{
    "error": {
        "code": "INVALID_REQUEST",
        "message": "リクエストが不正です",
        "details": {
            "name": "名前は100文字以内で入力してください"
        }
    }
}

// 403 Forbidden (ロール変更権限なし)
{
    "error": {
        "code": "FORBIDDEN",
        "message": "ロールを変更する権限がありません",
        "details": "Required permission: roles:assign"
    }
}
```

---

### 3.4 ユーザー削除

ユーザーを削除します。

#### エンドポイント

```
DELETE /api/users/{userId}
```

#### 必要な権限

- `users:write`

#### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| userId | string | ユーザーID |

#### リクエスト例

```http
DELETE /api/users/user_01234567890abcdef HTTP/1.1
Host: auth.nagiyu.com
Cookie: nagiyu-session=...
```

#### レスポンス (200 OK)

```json
{
    "success": true,
    "deletedUserId": "user_01234567890abcdef"
}
```

#### エラーレスポンス

```json
// 400 Bad Request (自分自身を削除)
{
    "error": {
        "code": "INVALID_REQUEST",
        "message": "自分自身を削除することはできません"
    }
}

// 400 Bad Request (最後の管理者を削除)
{
    "error": {
        "code": "INVALID_REQUEST",
        "message": "最後の管理者を削除することはできません"
    }
}
```

---

## 4. ヘルスチェック API

### 4.1 ヘルスチェック

サービスの稼働状況を確認します。

#### エンドポイント

```
GET /api/health
```

#### 認証

不要（公開エンドポイント）

#### リクエスト例

```http
GET /api/health HTTP/1.1
Host: auth.nagiyu.com
```

#### レスポンス (200 OK)

```json
{
    "status": "ok",
    "timestamp": "2024-01-15T12:34:56.789Z",
    "version": "1.0.0",
    "dependencies": {
        "dynamodb": "ok",
        "secretsManager": "ok"
    }
}
```

#### レスポンス (503 Service Unavailable)

```json
{
    "status": "degraded",
    "timestamp": "2024-01-15T12:34:56.789Z",
    "version": "1.0.0",
    "dependencies": {
        "dynamodb": "error",
        "secretsManager": "ok"
    }
}
```

---

## 5. データモデル

### 5.1 User

ユーザー情報を表すモデル。

#### スキーマ

```typescript
interface User {
    userId: string;           // プラットフォーム共通ユーザーID (UUID v4)
    googleId: string;         // Google OAuth ID
    email: string;            // メールアドレス
    name: string;             // 表示名
    roles: string[];          // ロールID配列
    createdAt: string;        // 作成日時 (ISO 8601)
    updatedAt: string;        // 更新日時 (ISO 8601)
    lastLoginAt?: string;     // 最終ログイン日時 (ISO 8601)
}
```

#### 例

```json
{
    "userId": "user_01234567890abcdef",
    "googleId": "1234567890",
    "email": "user@example.com",
    "name": "山田太郎",
    "roles": ["admin"],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-10T00:00:00.000Z",
    "lastLoginAt": "2024-01-15T10:00:00.000Z"
}
```

### 5.2 Session

セッション情報を表すモデル。

#### スキーマ

```typescript
interface Session {
    user: {
        id: string;             // userId
        email: string;
        name: string;
        image?: string;         // picture
        roles: string[];
    };
    expires: string;          // セッション有効期限 (ISO 8601)
}
```

#### 例

```json
{
    "user": {
        "id": "user_01234567890abcdef",
        "email": "user@example.com",
        "name": "山田太郎",
        "roles": ["admin"]
    },
    "expires": "2024-02-15T12:34:56.789Z"
}
```

---

## 6. 権限一覧

### 6.1 権限定義

| 権限 | 説明 |
|------|------|
| `users:read` | ユーザー情報の閲覧 |
| `users:write` | ユーザー情報の作成・更新・削除 |
| `roles:assign` | ロールの割り当て |
| `logs:read` | ログの閲覧 (logs サービス) |
| `logs:write` | ログの削除 (logs サービス) |

### 6.2 ロールと権限のマッピング

| ロールID | ロール名 | 権限 |
|---------|---------|------|
| `admin` | 管理者 | `users:read`, `users:write`, `roles:assign`, `logs:read`, `logs:write` |
| `log-viewer` | ログ閲覧者 | `logs:read` |
| `user-manager` | ユーザー管理者 | `users:read`, `users:write` |

---

## 7. レート制限

### 7.1 制限事項

| エンドポイント | 制限 |
|--------------|------|
| `/api/auth/*` | 10リクエスト/分/IP |
| `/api/users` (GET) | 100リクエスト/分/ユーザー |
| `/api/users` (POST/PUT/DELETE) | 20リクエスト/分/ユーザー |

### 7.2 制限超過時のレスポンス

```json
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
    "error": {
        "code": "RATE_LIMIT_EXCEEDED",
        "message": "リクエスト数の上限を超えました",
        "details": "1分後に再試行してください"
    }
}
```

---

## 8. バージョニング

### 8.1 バージョン管理方針

- **Phase 1**: バージョニングなし (v1 として扱う)
- **Phase 2 以降**: URL パスでバージョン指定 (`/api/v2/users`)

### 8.2 後方互換性

- 既存フィールドの削除は行わない
- 新規フィールド追加時は省略可能にする
- 破壊的変更時は新バージョンとして提供
