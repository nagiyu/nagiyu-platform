# niconico-mylist-assistant API 仕様書

本ドキュメントは、niconico-mylist-assistant サービスが提供する API の仕様を定義します。
本サービスは Next.js の API Routes を使用して構築されており、動画基本情報の管理、一括インポート、マイリスト登録バッチの投入機能を提供します。

---

## 1. API 概要

本サービスの API は Next.js API Routes として実装され、認証には Auth プロジェクトとの連携を使用します。
すべてのエンドポイントは HTTPS 経由でアクセスされ、CloudFront を通じて配信されます。

### 1.1 ベース URL

| 環境 | URL                                      |
| ---- | ---------------------------------------- |
| 開発 | `https://dev-niconico-mylist.nagiyu.com` |
| 本番 | `https://niconico-mylist.nagiyu.com`     |

### 1.2 認証方式

本サービスは、Auth プロジェクトによる Google OAuth 認証を使用します。
認証情報は Cookie に保存された JWT トークンにより管理されます。

#### Google OAuth 認証（Auth プロジェクト連携）

- **認証方式**: Cookie ベースの JWT トークン
- **Cookie 名**: Auth プロジェクトで定義された Cookie 名を使用
- **形式**: JWT (JSON Web Token)
- **有効期限**: Auth プロジェクトの設定に準拠
- **スコープ**: ユーザー識別（UserID）によるデータアクセス制御

#### ニコニコアカウント情報の取り扱い

マイリスト登録機能では、ニコニコ動画のアカウント情報（メールアドレスとパスワード）が必要です。

- **パスワード保存**: データベースには保存しない
- **暗号化送信**: フロントエンド → API Routes → AWS Batch の通信経路で暗号化
- **暗号化方式**: AES-256（環境変数 `SHARED_SECRET_KEY` を使用）
- **復号化**: AWS Batch 内でのみ復号化し、メモリ上で一時保持
- **削除**: バッチ処理終了後、即座にメモリから削除

#### リクエスト例

```http
GET /api/videos HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: {auth-cookie-name}={jwt-token}
```

```http
POST /api/videos/bulk-import HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: {auth-cookie-name}={jwt-token}
Content-Type: application/json

{
    "videoIds": ["sm12345678", "sm87654321"]
}
```

### 1.3 共通レスポンス形式

本サービスの API は、シンプルな JSON 形式でレスポンスを返します。

#### 成功レスポンス

```json
{
    "success": true,
    "data": {
        "videos": [...],
        "count": 100
    }
}
```

または、データのみを返す場合:

```json
{
  "videoId": "sm12345678",
  "title": "動画タイトル",
  "isFavorite": false,
  "isSkip": false
}
```

#### エラーレスポンス

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "リクエストが不正です"
  }
}
```

詳細情報が必要な場合:

```json
{
  "error": {
    "code": "BATCH_SUBMIT_FAILED",
    "message": "バッチジョブの投入に失敗しました",
    "details": "AWS Batch サービスに接続できませんでした"
  }
}
```

### 1.4 HTTP ステータスコード

| コード | 意味                  | 用途                                           |
| ------ | --------------------- | ---------------------------------------------- |
| 200    | OK                    | リクエスト成功                                 |
| 201    | Created               | リソース作成成功                               |
| 400    | Bad Request           | リクエストが不正（バリデーションエラー等）     |
| 401    | Unauthorized          | 認証が必要（未ログイン）                       |
| 403    | Forbidden             | 権限不足（他のユーザーのデータへのアクセス等） |
| 404    | Not Found             | リソースが存在しない                           |
| 500    | Internal Server Error | サーバー内部エラー                             |
| 502    | Bad Gateway           | 外部APIエラー（ニコニコ動画API等）             |
| 503    | Service Unavailable   | サービス一時停止（AWS Batch等）                |

### 1.5 エラーコード一覧

| コード                | HTTP ステータス | 説明                                         |
| --------------------- | --------------- | -------------------------------------------- |
| `UNAUTHORIZED`        | 401             | 認証が必要です。ログインしてください         |
| `FORBIDDEN`           | 403             | このリソースへのアクセス権限がありません     |
| `NOT_FOUND`           | 404             | 指定されたリソースが見つかりません           |
| `INVALID_REQUEST`     | 400             | リクエストが不正です（必須パラメータ不足等） |
| `VALIDATION_ERROR`    | 400             | バリデーションエラー（動画ID形式不正等）     |
| `DUPLICATE_VIDEO`     | 400             | 指定された動画は既に登録されています         |
| `VIDEO_NOT_FOUND`     | 404             | 指定された動画が見つかりません（削除済み等） |
| `NICONICO_API_ERROR`  | 502             | ニコニコ動画APIへのアクセスに失敗しました    |
| `BATCH_SUBMIT_FAILED` | 500             | バッチジョブの投入に失敗しました             |
| `DATABASE_ERROR`      | 500             | データベースへのアクセスに失敗しました       |
| `ENCRYPTION_ERROR`    | 500             | パスワードの暗号化に失敗しました             |
| `INTERNAL_ERROR`      | 500             | 内部エラーが発生しました                     |

---

## 2. エンドポイント一覧

本サービスは以下のAPIエンドポイントを提供します。すべてのエンドポイントは Next.js の API Routes として実装されます。

### 2.1 概要

| カテゴリ         | エンドポイント数 | 説明                                          |
| ---------------- | ---------------- | --------------------------------------------- |
| ヘルスチェック   | 1                | サービス稼働状況の確認                        |
| 動画管理         | 5                | 動画基本情報とユーザー設定の CRUD 操作        |
| 一括インポート   | 1                | ニコニコ動画 API から動画情報を一括取得・保存 |
| バッチジョブ管理 | 2                | マイリスト登録バッチの投入とステータス確認    |

### 2.2 全エンドポイント一覧

| メソッド | パス                        | 説明                         | 認証 | 備考                                     |
| -------- | --------------------------- | ---------------------------- | ---- | ---------------------------------------- |
| GET      | `/api/health`               | ヘルスチェック               | 不要 | サービス稼働状況の確認                   |
| GET      | `/api/videos`               | 動画一覧取得                 | 必須 | 認証ユーザーの動画データのみ取得         |
| GET      | `/api/videos/{videoId}`     | 動画詳細取得                 | 必須 | 動画基本情報 + ユーザー設定を取得        |
| POST     | `/api/videos`               | 動画作成（単一）             | 必須 | 動画基本情報 + ユーザー設定を作成        |
| PUT      | `/api/videos/{videoId}`     | 動画更新（ユーザー設定のみ） | 必須 | お気に入り・スキップフラグ・メモを更新   |
| DELETE   | `/api/videos/{videoId}`     | 動画削除                     | 必須 | ユーザー設定のみ削除（動画基本情報保持） |
| POST     | `/api/videos/bulk-import`   | 動画一括インポート           | 必須 | 動画 ID リストから動画情報を一括取得     |
| POST     | `/api/batch/submit`         | バッチジョブ投入             | 必須 | マイリスト登録バッチを AWS Batch に投入  |
| GET      | `/api/batch/status/{jobId}` | バッチステータス確認         | 必須 | ジョブの実行状況と結果を取得             |

### 2.3 認証要件の詳細

#### 認証不要エンドポイント

- `GET /api/health`: 公開エンドポイント

#### 認証必須エンドポイント

すべてのデータ操作エンドポイントは、Auth プロジェクトによる Google OAuth 認証が必須です。

- **認証方式**: Cookie ベースの JWT トークン
- **Cookie 名**: Auth プロジェクトで定義された Cookie 名
- **権限**: `niconico-mylist:use`
- **データアクセス制御**: 認証ユーザーの UserID に紐づくデータのみアクセス可能

#### 認証エラーレスポンス

```json
// 401 Unauthorized (未認証)
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}

// 403 Forbidden (権限不足)
{
    "error": {
        "code": "FORBIDDEN",
        "message": "このリソースへのアクセス権限がありません"
    }
}
```

---

## 3. エンドポイント詳細

本セクションでは、各エンドポイントの詳細仕様を記述します。
すべての API は Next.js の API Routes として実装され、ヘルスチェックを除き認証が必須です。

### 3.1 ヘルスチェック API

サービスの稼働状況を確認するための公開エンドポイント。

#### 3.1.1 ヘルスチェック

サービスの稼働状況を確認します。モニタリングやロードバランサーのヘルスチェックに使用されます。

##### エンドポイント

```
GET /api/health
```

##### 認証

不要（公開エンドポイント）

##### リクエスト例

```http
GET /api/health HTTP/1.1
Host: niconico-mylist.nagiyu.com
```

```bash
curl https://niconico-mylist.nagiyu.com/api/health
```

##### レスポンス (200 OK)

```json
{
    "status": "ok",
    "timestamp": "2026-01-16T10:30:00.000Z",
    "version": "1.0.0"
}
```

##### レスポンスフィールド

| フィールド  | 型     | 説明                                      |
| ----------- | ------ | ----------------------------------------- |
| status      | string | サービスステータス（`ok` または `error`） |
| timestamp   | string | レスポンス生成日時（ISO 8601 形式）       |
| version     | string | サービスバージョン                        |

##### エラーレスポンス

```json
// 503 Service Unavailable
{
    "status": "error",
    "timestamp": "2026-01-16T10:30:00.000Z",
    "version": "1.0.0",
    "error": {
        "code": "SERVICE_UNAVAILABLE",
        "message": "サービスが利用できません"
    }
}
```

---

### 3.2 動画管理 API

動画基本情報とユーザー設定の CRUD 操作を提供します。
すべてのエンドポイントで認証が必須であり、ユーザーは自分のデータのみアクセス可能です。

#### 3.2.1 動画一覧取得

認証ユーザーの動画データ（動画基本情報 + ユーザー設定）を一覧取得します。

##### エンドポイント

```
GET /api/videos
```

##### 必要な権限

- `niconico-mylist:use`

##### クエリパラメータ

| パラメータ   | 型      | 必須 | デフォルト | 説明                                       |
| ------------ | ------- | ---- | ---------- | ------------------------------------------ |
| limit        | number  | -    | 50         | 取得件数（最大 100）                       |
| offset       | number  | -    | 0          | 開始位置                                   |
| isFavorite   | boolean | -    | -          | お気に入りフラグでフィルタ（`true`/`false`）|
| isSkip       | boolean | -    | -          | スキップフラグでフィルタ（`true`/`false`） |

##### リクエスト例

```http
GET /api/videos?limit=10&isFavorite=true HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
```

```bash
curl https://niconico-mylist.nagiyu.com/api/videos?limit=10&isFavorite=true \
    -b "nagiyu-session={jwt-token}"
```

##### レスポンス (200 OK)

```json
{
    "videos": [
        {
            "videoId": "sm12345678",
            "title": "サンプル動画タイトル",
            "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
            "length": "5:30",
            "isFavorite": true,
            "isSkip": false,
            "memo": "お気に入りの曲",
            "createdAt": "2026-01-16T10:30:00.000Z",
            "updatedAt": "2026-01-16T12:00:00.000Z"
        }
    ],
    "total": 250,
    "limit": 10,
    "offset": 0
}
```

##### レスポンスフィールド

| フィールド      | 型       | 説明                                |
| --------------- | -------- | ----------------------------------- |
| videos          | array    | 動画データの配列                    |
| videos[].videoId | string   | 動画 ID（例: `sm12345678`）         |
| videos[].title  | string   | 動画タイトル                        |
| videos[].thumbnailUrl | string | サムネイル画像 URL            |
| videos[].length | string   | 再生時間（例: `5:30`）              |
| videos[].isFavorite | boolean | お気に入りフラグ              |
| videos[].isSkip | boolean  | スキップフラグ                      |
| videos[].memo   | string   | ユーザーメモ（オプション）          |
| videos[].createdAt | string | 登録日時（ISO 8601 形式）        |
| videos[].updatedAt | string | 更新日時（ISO 8601 形式）        |
| total           | number   | 条件に合致する総件数                |
| limit           | number   | 取得件数                            |
| offset          | number   | 開始位置                            |

##### エラーレスポンス

```json
// 401 Unauthorized
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}

// 403 Forbidden
{
    "error": {
        "code": "FORBIDDEN",
        "message": "このリソースへのアクセス権限がありません"
    }
}

// 500 Internal Server Error
{
    "error": {
        "code": "DATABASE_ERROR",
        "message": "データベースへのアクセスに失敗しました"
    }
}
```

---

#### 3.2.2 動画詳細取得

特定の動画の詳細情報（動画基本情報 + ユーザー設定）を取得します。

##### エンドポイント

```
GET /api/videos/{videoId}
```

##### 必要な権限

- `niconico-mylist:use`

##### パスパラメータ

| パラメータ | 型     | 説明                        |
| ---------- | ------ | --------------------------- |
| videoId    | string | 動画 ID（例: `sm12345678`） |

##### リクエスト例

```http
GET /api/videos/sm12345678 HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
```

```bash
curl https://niconico-mylist.nagiyu.com/api/videos/sm12345678 \
    -b "nagiyu-session={jwt-token}"
```

##### レスポンス (200 OK)

```json
{
    "videoId": "sm12345678",
    "title": "サンプル動画タイトル",
    "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
    "length": "5:30",
    "isFavorite": true,
    "isSkip": false,
    "memo": "お気に入りの曲",
    "createdAt": "2026-01-16T10:30:00.000Z",
    "updatedAt": "2026-01-16T12:00:00.000Z"
}
```

##### レスポンスフィールド

| フィールド    | 型      | 説明                            |
| ------------- | ------- | ------------------------------- |
| videoId       | string  | 動画 ID（例: `sm12345678`）     |
| title         | string  | 動画タイトル                    |
| thumbnailUrl  | string  | サムネイル画像 URL              |
| length        | string  | 再生時間（例: `5:30`）          |
| isFavorite    | boolean | お気に入りフラグ                |
| isSkip        | boolean | スキップフラグ                  |
| memo          | string  | ユーザーメモ（オプション）      |
| createdAt     | string  | 登録日時（ISO 8601 形式）       |
| updatedAt     | string  | 更新日時（ISO 8601 形式）       |

##### エラーレスポンス

```json
// 401 Unauthorized
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}

// 404 Not Found
{
    "error": {
        "code": "NOT_FOUND",
        "message": "指定された動画が見つかりません"
    }
}

// 500 Internal Server Error
{
    "error": {
        "code": "DATABASE_ERROR",
        "message": "データベースへのアクセスに失敗しました"
    }
}
```

---

#### 3.2.3 動画作成

新しい動画基本情報とユーザー設定を作成します。

##### エンドポイント

```
POST /api/videos
```

##### 必要な権限

- `niconico-mylist:use`

##### リクエストボディ

```json
{
    "videoId": "sm12345678",
    "title": "サンプル動画タイトル",
    "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
    "length": "5:30",
    "isFavorite": false,
    "isSkip": false,
    "memo": ""
}
```

##### リクエストボディスキーマ

| フィールド   | 型      | 必須 | デフォルト | 説明                        |
| ------------ | ------- | ---- | ---------- | --------------------------- |
| videoId      | string  | ✅   | -          | 動画 ID（例: `sm12345678`） |
| title        | string  | ✅   | -          | 動画タイトル                |
| thumbnailUrl | string  | ✅   | -          | サムネイル画像 URL          |
| length       | string  | ✅   | -          | 再生時間（例: `5:30`）      |
| isFavorite   | boolean | -    | false      | お気に入りフラグ            |
| isSkip       | boolean | -    | false      | スキップフラグ              |
| memo         | string  | -    | ""         | ユーザーメモ                |

##### リクエスト例

```http
POST /api/videos HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
Content-Type: application/json

{
    "videoId": "sm12345678",
    "title": "サンプル動画タイトル",
    "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
    "length": "5:30"
}
```

```bash
curl -X POST https://niconico-mylist.nagiyu.com/api/videos \
    -b "nagiyu-session={jwt-token}" \
    -H "Content-Type: application/json" \
    -d '{
        "videoId": "sm12345678",
        "title": "サンプル動画タイトル",
        "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
        "length": "5:30"
    }'
```

##### レスポンス (201 Created)

```json
{
    "videoId": "sm12345678",
    "title": "サンプル動画タイトル",
    "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
    "length": "5:30",
    "isFavorite": false,
    "isSkip": false,
    "memo": "",
    "createdAt": "2026-01-16T10:30:00.000Z",
    "updatedAt": "2026-01-16T10:30:00.000Z"
}
```

##### エラーレスポンス

```json
// 400 Bad Request
{
    "error": {
        "code": "INVALID_REQUEST",
        "message": "リクエストが不正です",
        "details": "videoId は必須です"
    }
}

// 400 Bad Request
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "動画 ID の形式が不正です",
        "details": "動画 ID は sm または so で始まる必要があります"
    }
}

// 400 Bad Request
{
    "error": {
        "code": "DUPLICATE_VIDEO",
        "message": "指定された動画は既に登録されています"
    }
}

// 401 Unauthorized
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}

// 500 Internal Server Error
{
    "error": {
        "code": "DATABASE_ERROR",
        "message": "データベースへのアクセスに失敗しました"
    }
}
```

---

#### 3.2.4 動画更新

既存の動画のユーザー設定（お気に入りフラグ、スキップフラグ、メモ）を更新します。
動画基本情報（タイトル、サムネイル等）は更新されません。

##### エンドポイント

```
PUT /api/videos/{videoId}
```

##### 必要な権限

- `niconico-mylist:use`

##### パスパラメータ

| パラメータ | 型     | 説明                        |
| ---------- | ------ | --------------------------- |
| videoId    | string | 動画 ID（例: `sm12345678`） |

##### リクエストボディ

```json
{
    "isFavorite": true,
    "isSkip": false,
    "memo": "お気に入りの曲"
}
```

##### リクエストボディスキーマ

| フィールド | 型      | 必須 | 説明                 |
| ---------- | ------- | ---- | -------------------- |
| isFavorite | boolean | -    | お気に入りフラグ     |
| isSkip     | boolean | -    | スキップフラグ       |
| memo       | string  | -    | ユーザーメモ         |

**注**: すべてのフィールドはオプションです。指定されたフィールドのみが更新されます。

##### リクエスト例

```http
PUT /api/videos/sm12345678 HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
Content-Type: application/json

{
    "isFavorite": true,
    "memo": "お気に入りの曲"
}
```

```bash
curl -X PUT https://niconico-mylist.nagiyu.com/api/videos/sm12345678 \
    -b "nagiyu-session={jwt-token}" \
    -H "Content-Type: application/json" \
    -d '{
        "isFavorite": true,
        "memo": "お気に入りの曲"
    }'
```

##### レスポンス (200 OK)

```json
{
    "videoId": "sm12345678",
    "title": "サンプル動画タイトル",
    "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
    "length": "5:30",
    "isFavorite": true,
    "isSkip": false,
    "memo": "お気に入りの曲",
    "createdAt": "2026-01-16T10:30:00.000Z",
    "updatedAt": "2026-01-16T12:00:00.000Z"
}
```

##### エラーレスポンス

```json
// 400 Bad Request
{
    "error": {
        "code": "INVALID_REQUEST",
        "message": "リクエストが不正です",
        "details": "更新するフィールドを指定してください"
    }
}

// 401 Unauthorized
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}

// 404 Not Found
{
    "error": {
        "code": "NOT_FOUND",
        "message": "指定された動画が見つかりません"
    }
}

// 500 Internal Server Error
{
    "error": {
        "code": "DATABASE_ERROR",
        "message": "データベースへのアクセスに失敗しました"
    }
}
```

---

#### 3.2.5 動画削除

ユーザー設定を削除します。動画基本情報は他のユーザーも参照する可能性があるため保持されます。

##### エンドポイント

```
DELETE /api/videos/{videoId}
```

##### 必要な権限

- `niconico-mylist:use`

##### パスパラメータ

| パラメータ | 型     | 説明                        |
| ---------- | ------ | --------------------------- |
| videoId    | string | 動画 ID（例: `sm12345678`） |

##### リクエスト例

```http
DELETE /api/videos/sm12345678 HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
```

```bash
curl -X DELETE https://niconico-mylist.nagiyu.com/api/videos/sm12345678 \
    -b "nagiyu-session={jwt-token}"
```

##### レスポンス (200 OK)

```json
{
    "success": true,
    "message": "動画を削除しました"
}
```

##### エラーレスポンス

```json
// 401 Unauthorized
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}

// 404 Not Found
{
    "error": {
        "code": "NOT_FOUND",
        "message": "指定された動画が見つかりません"
    }
}

// 500 Internal Server Error
{
    "error": {
        "code": "DATABASE_ERROR",
        "message": "データベースへのアクセスに失敗しました"
    }
}
```

---

### 3.3 一括インポート API

動画 ID のリストからニコニコ動画 API (`getthumbinfo`) を使用して動画基本情報を取得し、DynamoDB に一括保存します。

#### 3.3.1 動画一括インポート

複数の動画 ID を指定して、動画基本情報を一括取得・保存します。

##### エンドポイント

```
POST /api/videos/bulk-import
```

##### 必要な権限

- `niconico-mylist:use`

##### リクエストボディ

```json
{
    "videoIds": [
        "sm12345678",
        "sm87654321",
        "sm11111111"
    ]
}
```

##### リクエストボディスキーマ

| フィールド | 型           | 必須 | 説明                                      |
| ---------- | ------------ | ---- | ----------------------------------------- |
| videoIds   | string array | ✅   | 動画 ID の配列（例: `["sm12345678", ...]`） |

**注**: 動画 ID は 1 回のリクエストで最大 100 件まで指定可能です。

##### リクエスト例

```http
POST /api/videos/bulk-import HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
Content-Type: application/json

{
    "videoIds": [
        "sm12345678",
        "sm87654321",
        "sm11111111"
    ]
}
```

```bash
curl -X POST https://niconico-mylist.nagiyu.com/api/videos/bulk-import \
    -b "nagiyu-session={jwt-token}" \
    -H "Content-Type: application/json" \
    -d '{
        "videoIds": ["sm12345678", "sm87654321", "sm11111111"]
    }'
```

##### レスポンス (200 OK)

```json
{
    "success": 2,
    "failed": 1,
    "skipped": 0,
    "dbErrors": 0,
    "total": 3,
    "details": [
        {
            "videoId": "sm12345678",
            "status": "success",
            "title": "サンプル動画タイトル1"
        },
        {
            "videoId": "sm87654321",
            "status": "success",
            "title": "サンプル動画タイトル2"
        },
        {
            "videoId": "sm11111111",
            "status": "failed",
            "error": "動画が削除されているか非公開です"
        }
    ]
}
```

##### レスポンスフィールド

| フィールド              | 型     | 説明                                         |
| ----------------------- | ------ | -------------------------------------------- |
| success                 | number | 成功した動画数                               |
| failed                  | number | ニコニコ API エラーで失敗した動画数          |
| skipped                 | number | 既に登録済みでスキップされた動画数           |
| dbErrors                | number | データベース保存エラーで失敗した動画数       |
| total                   | number | 処理対象の総動画数                           |
| details                 | array  | 各動画の処理結果詳細                         |
| details[].videoId       | string | 動画 ID                                      |
| details[].status        | string | 処理結果（`success` / `failed` / `skipped`） |
| details[].title         | string | 動画タイトル（成功時のみ）                   |
| details[].error         | string | エラーメッセージ（失敗時のみ）               |

##### エラーレスポンス

```json
// 400 Bad Request
{
    "error": {
        "code": "INVALID_REQUEST",
        "message": "リクエストが不正です",
        "details": "videoIds は必須です"
    }
}

// 400 Bad Request
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "動画 ID の数が上限を超えています",
        "details": "最大 100 件まで指定可能です"
    }
}

// 401 Unauthorized
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}

// 502 Bad Gateway
{
    "error": {
        "code": "NICONICO_API_ERROR",
        "message": "ニコニコ動画 API へのアクセスに失敗しました",
        "details": "API サーバーが応答しません"
    }
}

// 500 Internal Server Error
{
    "error": {
        "code": "DATABASE_ERROR",
        "message": "データベースへのアクセスに失敗しました"
    }
}
```

---

### 3.4 バッチジョブ管理 API

マイリスト一括登録バッチの投入とステータス確認を行います。

#### 3.4.1 バッチジョブ投入

条件指定により動画を選択し、AWS Batch でマイリストに一括登録するジョブを投入します。

##### エンドポイント

```
POST /api/batch/submit
```

##### 必要な権限

- `niconico-mylist:use`

##### リクエストボディ

```json
{
    "email": "user@example.com",
    "password": "niconicoPassword",
    "mylistName": "お気に入り動画",
    "filters": {
        "excludeSkip": true,
        "favoritesOnly": false
    }
}
```

##### リクエストボディスキーマ

| フィールド                | 型      | 必須 | デフォルト | 説明                                                     |
| ------------------------- | ------- | ---- | ---------- | -------------------------------------------------------- |
| email                     | string  | ✅   | -          | ニコニコ動画のメールアドレス                             |
| password                  | string  | ✅   | -          | ニコニコ動画のパスワード（暗号化して送信）               |
| mylistName                | string  | -    | 日時       | マイリスト名（未指定時: `自動登録 2026/1/16 15:30:45`） |
| filters                   | object  | ✅   | -          | 登録条件                                                 |
| filters.excludeSkip       | boolean | ✅   | -          | スキップフラグを除外するかどうか                         |
| filters.favoritesOnly     | boolean | ✅   | -          | お気に入りのみを登録するかどうか                         |

**セキュリティ注意事項**:
- パスワードは API Routes 内で AES-256-GCM により暗号化され、データベースには保存されません
- バッチ処理内でのみ復号化され、処理完了後は即座にメモリから削除されます

##### リクエスト例

```http
POST /api/batch/submit HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
Content-Type: application/json

{
    "email": "user@example.com",
    "password": "niconicoPassword",
    "mylistName": "お気に入り動画",
    "filters": {
        "excludeSkip": true,
        "favoritesOnly": false
    }
}
```

```bash
curl -X POST https://niconico-mylist.nagiyu.com/api/batch/submit \
    -b "nagiyu-session={jwt-token}" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "user@example.com",
        "password": "niconicoPassword",
        "mylistName": "お気に入り動画",
        "filters": {
            "excludeSkip": true,
            "favoritesOnly": false
        }
    }'
```

##### レスポンス (200 OK)

```json
{
    "jobId": "batch-job-20260116-123456-abc123",
    "status": "SUBMITTED",
    "message": "バッチジョブを投入しました",
    "estimatedVideos": 75
}
```

##### レスポンスフィールド

| フィールド       | 型     | 説明                                   |
| ---------------- | ------ | -------------------------------------- |
| jobId            | string | バッチジョブ ID                        |
| status           | string | ジョブステータス（初期値: `SUBMITTED`）|
| message          | string | メッセージ                             |
| estimatedVideos  | number | 登録予定の動画数（条件に合致した数）   |

##### エラーレスポンス

```json
// 400 Bad Request
{
    "error": {
        "code": "INVALID_REQUEST",
        "message": "リクエストが不正です",
        "details": "email と password は必須です"
    }
}

// 400 Bad Request
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "メールアドレスの形式が不正です"
    }
}

// 401 Unauthorized
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}

// 409 Conflict
{
    "error": {
        "code": "JOB_ALREADY_RUNNING",
        "message": "既に実行中のジョブがあります",
        "details": "前のジョブが完了するまでお待ちください"
    }
}

// 500 Internal Server Error
{
    "error": {
        "code": "ENCRYPTION_ERROR",
        "message": "パスワードの暗号化に失敗しました"
    }
}

// 500 Internal Server Error
{
    "error": {
        "code": "BATCH_SUBMIT_FAILED",
        "message": "バッチジョブの投入に失敗しました",
        "details": "AWS Batch サービスに接続できませんでした"
    }
}
```

---

#### 3.4.2 バッチステータス確認

投入したバッチジョブの実行状況と結果を確認します。

##### エンドポイント

```
GET /api/batch/status/{jobId}
```

##### 必要な権限

- `niconico-mylist:use`

##### パスパラメータ

| パラメータ | 型     | 説明                                          |
| ---------- | ------ | --------------------------------------------- |
| jobId      | string | バッチジョブ ID（例: `batch-job-20260116-...`）|

##### リクエスト例

```http
GET /api/batch/status/batch-job-20260116-123456-abc123 HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
```

```bash
curl https://niconico-mylist.nagiyu.com/api/batch/status/batch-job-20260116-123456-abc123 \
    -b "nagiyu-session={jwt-token}"
```

##### レスポンス (200 OK) - 実行中

```json
{
    "jobId": "batch-job-20260116-123456-abc123",
    "status": "RUNNING",
    "createdAt": "2026-01-16T10:30:00.000Z",
    "updatedAt": "2026-01-16T10:31:00.000Z"
}
```

##### レスポンス (200 OK) - 成功

```json
{
    "jobId": "batch-job-20260116-123456-abc123",
    "status": "SUCCEEDED",
    "result": {
        "registeredCount": 75,
        "failedCount": 0,
        "totalCount": 75
    },
    "createdAt": "2026-01-16T10:30:00.000Z",
    "updatedAt": "2026-01-16T10:45:00.000Z",
    "completedAt": "2026-01-16T10:45:00.000Z"
}
```

##### レスポンス (200 OK) - 失敗

```json
{
    "jobId": "batch-job-20260116-123456-abc123",
    "status": "FAILED",
    "result": {
        "registeredCount": 50,
        "failedCount": 25,
        "totalCount": 75,
        "errorMessage": "ニコニコ動画へのログインに失敗しました"
    },
    "createdAt": "2026-01-16T10:30:00.000Z",
    "updatedAt": "2026-01-16T10:40:00.000Z",
    "completedAt": "2026-01-16T10:40:00.000Z"
}
```

##### レスポンスフィールド

| フィールド                   | 型     | 説明                                                                    |
| ---------------------------- | ------ | ----------------------------------------------------------------------- |
| jobId                        | string | バッチジョブ ID                                                         |
| status                       | string | ジョブステータス（`SUBMITTED` / `RUNNING` / `SUCCEEDED` / `FAILED`）    |
| result                       | object | 実行結果（完了時のみ）                                                  |
| result.registeredCount       | number | 登録成功した動画数                                                      |
| result.failedCount           | number | 登録失敗した動画数                                                      |
| result.totalCount            | number | 処理対象の総動画数                                                      |
| result.errorMessage          | string | エラーメッセージ（失敗時のみ）                                          |
| createdAt                    | string | ジョブ作成日時（ISO 8601 形式）                                         |
| updatedAt                    | string | ジョブ更新日時（ISO 8601 形式）                                         |
| completedAt                  | string | ジョブ完了日時（ISO 8601 形式、完了時のみ）                             |

##### エラーレスポンス

```json
// 401 Unauthorized
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}

// 404 Not Found
{
    "error": {
        "code": "NOT_FOUND",
        "message": "指定されたジョブが見つかりません"
    }
}

// 500 Internal Server Error
{
    "error": {
        "code": "DATABASE_ERROR",
        "message": "データベースへのアクセスに失敗しました"
    }
}
```

---

## 4. データモデル詳細

<!-- このセクションは既存の「5. データモデル」セクションと統合または削除する予定 -->
<!-- 現在、セクション 3 にエンドポイント詳細が記載されたため、このセクションは将来的に整理します -->

---

## 5. データモデル

<!-- 記入ガイド: API で使用する主要なデータモデルを記述してください -->

### 5.1 {Model}

<!-- 記入ガイド: データモデルの説明を1-2行で記述してください -->

#### スキーマ

```typescript
interface {Model} {
    {field1}: string;           // {説明}
    {field2}: number;           // {説明}
    {field3}?: string;          // {説明}（オプション）
}
```

#### 例

```json
{
    "{field1}": "{value1}",
    "{field2}": 123,
    "{field3}": "{value3}"
}
```

---

## 6. 権限一覧

<!-- [任意] -->
<!-- 記入ガイド: 権限ベースのアクセス制御を使用する場合に記述してください -->

### 6.1 権限定義

| 権限               | 説明                         |
| ------------------ | ---------------------------- |
| `{resource}:read`  | {リソース}の閲覧             |
| `{resource}:write` | {リソース}の作成・更新・削除 |

### 6.2 ロールと権限のマッピング

<!-- [任意] ロールベースのアクセス制御を使用する場合に記述 -->

| ロールID | ロール名 | 権限                                  |
| -------- | -------- | ------------------------------------- |
| `admin`  | 管理者   | `{resource}:read`, `{resource}:write` |
| `viewer` | 閲覧者   | `{resource}:read`                     |

---

## 7. レート制限

<!-- [任意] -->
<!-- 記入ガイド: レート制限を実装する場合に記述してください -->

### 7.1 制限事項

| エンドポイント    | 制限                         |
| ----------------- | ---------------------------- |
| `/api/{endpoint}` | {数}リクエスト/{期間}/{単位} |

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

<!-- [任意] -->
<!-- 記入ガイド: API バージョニング戦略を記述してください -->

### 8.1 バージョン管理方針

<!-- 記入例: URL パス、ヘッダー、クエリパラメータのいずれでバージョンを指定するか -->

- **Phase 1**: バージョニングなし (v1 として扱う)
- **Phase 2 以降**: URL パスでバージョン指定 (`/api/v2/{endpoint}`)

### 8.2 後方互換性

<!-- 記入ガイド: 後方互換性の維持方針を記述してください -->

- 既存フィールドの削除は行わない
- 新規フィールド追加時は省略可能にする
- 破壊的変更時は新バージョンとして提供

---

## 9. セキュリティ

<!-- [任意] -->
<!-- 記入ガイド: API 固有のセキュリティ要件を記述してください -->

### 9.1 CORS 設定

<!-- [任意] CORS が必要な場合 -->

```json
{
    "AllowedOrigins": ["https://{domain}"],
    "AllowedMethods": ["GET", "POST", "PUT", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
}
```

### 9.2 セキュリティヘッダー

<!-- [任意] 推奨されるセキュリティヘッダー -->

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'
```

### 9.3 その他のセキュリティ対策

<!-- 記入ガイド: API 固有のセキュリティ対策を記述してください -->
<!-- 記入例: 入力検証、SQL インジェクション対策、XSS 対策など -->

---

## 10. その他

<!-- [任意] -->
<!-- 記入ガイド: 上記に該当しない API 固有の情報があれば記述してください -->

### 10.1 ページネーション

<!-- [任意] ページネーションを実装する場合 -->

リスト系エンドポイントでは以下のクエリパラメータでページネーションをサポートします。

| パラメータ | 型     | デフォルト | 説明                   |
| ---------- | ------ | ---------- | ---------------------- |
| limit      | number | 50         | 取得件数（最大100）    |
| offset     | number | 0          | 開始位置               |
| cursor     | string | -          | カーソル（オプション） |

### 10.2 ソート・フィルタリング

<!-- [任意] ソート・フィルタリングを実装する場合 -->

リスト系エンドポイントでは以下のクエリパラメータでソート・フィルタリングをサポートします。

| パラメータ | 型     | 説明                           |
| ---------- | ------ | ------------------------------ |
| sort       | string | ソート順（`+field`, `-field`） |
| filter     | string | フィルタ条件                   |

### 10.3 Webhook

<!-- [任意] Webhook を提供する場合 -->

特定のイベント発生時に、登録された URL にリクエストを送信します。

#### イベント一覧

| イベント名     | 説明             |
| -------------- | ---------------- |
| `{event.name}` | {イベントの説明} |

#### Webhook ペイロード

```json
{
    "event": "{event.name}",
    "timestamp": "2024-01-15T12:34:56.789Z",
    "data": {
        "{field}": "{value}"
    }
}
```
