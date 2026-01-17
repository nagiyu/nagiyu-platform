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
| 動画データ取得   | 2                | 動画基本情報 + ユーザー設定の結合データ取得   |
| 動画基本情報管理 | 3                | 動画基本情報の CUD 操作                       |
| ユーザー設定管理 | 3                | ユーザー設定の CUD 操作                       |
| 一括インポート   | 1                | ニコニコ動画 API から動画情報を一括取得・保存 |
| バッチジョブ管理 | 2                | マイリスト登録バッチの投入とステータス確認    |

### 2.2 全エンドポイント一覧

| メソッド | パス                              | 説明                         | 認証 | 備考                                     |
| -------- | --------------------------------- | ---------------------------- | ---- | ---------------------------------------- |
| GET      | `/api/health`                     | ヘルスチェック               | 不要 | サービス稼働状況の確認                   |
| GET      | `/api/videos`                     | 動画一覧取得                 | 必須 | 動画基本情報 + ユーザー設定の結合データ  |
| GET      | `/api/videos/{videoId}`           | 動画詳細取得                 | 必須 | 動画基本情報 + ユーザー設定の結合データ  |
| POST     | `/api/videos/bulk-import`         | 動画一括インポート           | 必須 | 動画 ID リストから動画基本情報を一括取得 |
| POST     | `/api/videos/basic`               | 動画基本情報作成             | 必須 | 動画基本情報を新規作成                   |
| PUT      | `/api/videos/{videoId}/basic`     | 動画基本情報更新             | 必須 | タイトル・サムネイル等の更新             |
| DELETE   | `/api/videos/{videoId}/basic`     | 動画基本情報削除             | 必須 | 動画基本情報を削除（全ユーザーから削除） |
| POST     | `/api/user-settings/{videoId}`    | ユーザー設定作成             | 必須 | お気に入り・スキップフラグ・メモを作成   |
| PUT      | `/api/user-settings/{videoId}`    | ユーザー設定更新             | 必須 | お気に入り・スキップフラグ・メモを更新   |
| DELETE   | `/api/user-settings/{videoId}`    | ユーザー設定削除             | 必須 | ユーザー設定を削除（動画基本情報は保持） |
| POST     | `/api/batch/submit`               | バッチジョブ投入             | 必須 | マイリスト登録バッチを AWS Batch に投入  |
| GET      | `/api/batch/status/{jobId}`       | バッチステータス確認         | 必須 | ジョブの実行状況と結果を取得             |

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

### 3.2 動画データ取得 API

動画基本情報とユーザー設定を結合したデータの取得（READ のみ）を提供します。
認証ユーザーは自分のユーザー設定と結合された動画データのみアクセス可能です。

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
            "videoCreatedAt": "2026-01-16T10:30:00.000Z",
            "userSetting": {
                "isFavorite": true,
                "isSkip": false,
                "memo": "お気に入りの曲",
                "createdAt": "2026-01-16T10:30:00.000Z",
                "updatedAt": "2026-01-16T12:00:00.000Z"
            }
        }
    ],
    "total": 250,
    "limit": 10,
    "offset": 0
}
```

##### レスポンスフィールド

| フィールド                  | 型      | 説明                                |
| --------------------------- | ------- | ----------------------------------- |
| videos                      | array   | 動画データの配列                    |
| videos[].videoId            | string  | 動画 ID（例: `sm12345678`）         |
| videos[].title              | string  | 動画タイトル                        |
| videos[].thumbnailUrl       | string  | サムネイル画像 URL                  |
| videos[].length             | string  | 再生時間（例: `5:30`）              |
| videos[].videoCreatedAt     | string  | 動画基本情報の登録日時（ISO 8601）  |
| videos[].userSetting        | object  | ユーザー設定（存在する場合のみ）    |
| videos[].userSetting.isFavorite | boolean | お気に入りフラグ            |
| videos[].userSetting.isSkip | boolean | スキップフラグ                      |
| videos[].userSetting.memo   | string  | ユーザーメモ（オプション）          |
| videos[].userSetting.createdAt | string | ユーザー設定の作成日時（ISO 8601）|
| videos[].userSetting.updatedAt | string | ユーザー設定の更新日時（ISO 8601）|
| total                       | number  | 条件に合致する総件数                |
| limit                       | number  | 取得件数                            |
| offset                      | number  | 開始位置                            |

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
    "videoCreatedAt": "2026-01-16T10:30:00.000Z",
    "userSetting": {
        "isFavorite": true,
        "isSkip": false,
        "memo": "お気に入りの曲",
        "createdAt": "2026-01-16T10:30:00.000Z",
        "updatedAt": "2026-01-16T12:00:00.000Z"
    }
}
```

##### レスポンスフィールド

| フィールド                | 型      | 説明                                |
| ------------------------- | ------- | ----------------------------------- |
| videoId                   | string  | 動画 ID（例: `sm12345678`）         |
| title                     | string  | 動画タイトル                        |
| thumbnailUrl              | string  | サムネイル画像 URL                  |
| length                    | string  | 再生時間（例: `5:30`）              |
| videoCreatedAt            | string  | 動画基本情報の登録日時（ISO 8601）  |
| userSetting               | object  | ユーザー設定（存在する場合のみ）    |
| userSetting.isFavorite    | boolean | お気に入りフラグ                    |
| userSetting.isSkip        | boolean | スキップフラグ                      |
| userSetting.memo          | string  | ユーザーメモ（オプション）          |
| userSetting.createdAt     | string  | ユーザー設定の作成日時（ISO 8601）  |
| userSetting.updatedAt     | string  | ユーザー設定の更新日時（ISO 8601）  |

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

### 3.3 動画基本情報管理 API

動画基本情報の作成・更新・削除（CUD 操作）を提供します。
動画基本情報は全ユーザーで共有されるデータであり、変更は慎重に行う必要があります。

#### 3.3.1 動画基本情報作成

新しい動画基本情報を作成します。一括インポートAPIを使用せず、個別に動画情報を登録する場合に使用します。

##### エンドポイント

```
POST /api/videos/basic
```

##### 必要な権限

- `niconico-mylist:use`

##### リクエストボディ

```json
{
    "videoId": "sm12345678",
    "title": "サンプル動画タイトル",
    "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
    "length": "5:30"
}
```

##### リクエストボディスキーマ

| フィールド   | 型     | 必須 | 説明                        |
| ------------ | ------ | ---- | --------------------------- |
| videoId      | string | ✅   | 動画 ID（例: `sm12345678`） |
| title        | string | ✅   | 動画タイトル                |
| thumbnailUrl | string | ✅   | サムネイル画像 URL          |
| length       | string | ✅   | 再生時間（例: `5:30`）      |

##### リクエスト例

```http
POST /api/videos/basic HTTP/1.1
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
curl -X POST https://niconico-mylist.nagiyu.com/api/videos/basic \
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
    "videoCreatedAt": "2026-01-16T10:30:00.000Z"
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

#### 3.3.2 動画基本情報更新

動画基本情報（タイトル、サムネイル URL、再生時間）を更新します。
このエンドポイントは、ニコニコ動画側で情報が変更された場合に使用します。

##### エンドポイント

```
PUT /api/videos/{videoId}/basic
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
    "title": "更新後の動画タイトル",
    "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.99999999",
    "length": "5:45"
}
```

##### リクエストボディスキーマ

| フィールド   | 型     | 必須 | 説明               |
| ------------ | ------ | ---- | ------------------ |
| title        | string | -    | 動画タイトル       |
| thumbnailUrl | string | -    | サムネイル画像 URL |
| length       | string | -    | 再生時間           |

**注**: すべてのフィールドはオプションです。指定されたフィールドのみが更新されます。

##### リクエスト例

```http
PUT /api/videos/sm12345678/basic HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
Content-Type: application/json

{
    "title": "更新後の動画タイトル"
}
```

```bash
curl -X PUT https://niconico-mylist.nagiyu.com/api/videos/sm12345678/basic \
    -b "nagiyu-session={jwt-token}" \
    -H "Content-Type: application/json" \
    -d '{
        "title": "更新後の動画タイトル"
    }'
```

##### レスポンス (200 OK)

```json
{
    "videoId": "sm12345678",
    "title": "更新後の動画タイトル",
    "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
    "length": "5:30",
    "videoCreatedAt": "2026-01-16T10:30:00.000Z",
    "videoUpdatedAt": "2026-01-16T15:00:00.000Z"
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

#### 3.3.3 動画基本情報削除

動画基本情報を削除します。全ユーザーから動画が削除されるため、慎重に使用する必要があります。

##### エンドポイント

```
DELETE /api/videos/{videoId}/basic
```

##### 必要な権限

- `niconico-mylist:use`

##### パスパラメータ

| パラメータ | 型     | 説明                        |
| ---------- | ------ | --------------------------- |
| videoId    | string | 動画 ID（例: `sm12345678`） |

##### リクエスト例

```http
DELETE /api/videos/sm12345678/basic HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
```

```bash
curl -X DELETE https://niconico-mylist.nagiyu.com/api/videos/sm12345678/basic \
    -b "nagiyu-session={jwt-token}"
```

##### レスポンス (200 OK)

```json
{
    "success": true,
    "message": "動画基本情報を削除しました"
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

### 3.4 ユーザー設定管理 API

ユーザー固有の設定（お気に入りフラグ、スキップフラグ、メモ）の作成・更新・削除（CUD 操作）を提供します。
すべてのエンドポイントで認証が必須であり、ユーザーは自分の設定のみアクセス可能です。

#### 3.4.1 ユーザー設定作成

新しいユーザー設定を作成します。

##### エンドポイント

```
POST /api/user-settings/{videoId}
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
    "isFavorite": false,
    "isSkip": false,
    "memo": ""
}
```

##### リクエストボディスキーマ

| フィールド | 型      | 必須 | デフォルト | 説明                 |
| ---------- | ------- | ---- | ---------- | -------------------- |
| isFavorite | boolean | -    | false      | お気に入りフラグ     |
| isSkip     | boolean | -    | false      | スキップフラグ       |
| memo       | string  | -    | ""         | ユーザーメモ         |

##### リクエスト例

```http
POST /api/user-settings/sm12345678 HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
Content-Type: application/json

{
    "isFavorite": true,
    "memo": "お気に入りの曲"
}
```

```bash
curl -X POST https://niconico-mylist.nagiyu.com/api/user-settings/sm12345678 \
    -b "nagiyu-session={jwt-token}" \
    -H "Content-Type: application/json" \
    -d '{
        "isFavorite": true,
        "memo": "お気に入りの曲"
    }'
```

##### レスポンス (201 Created)

```json
{
    "videoId": "sm12345678",
    "isFavorite": true,
    "isSkip": false,
    "memo": "お気に入りの曲",
    "createdAt": "2026-01-16T10:30:00.000Z",
    "updatedAt": "2026-01-16T10:30:00.000Z"
}
```

##### エラーレスポンス

```json
// 400 Bad Request
{
    "error": {
        "code": "VIDEO_NOT_FOUND",
        "message": "指定された動画が存在しません",
        "details": "ユーザー設定を作成する前に、動画基本情報を登録してください"
    }
}

// 400 Bad Request
{
    "error": {
        "code": "DUPLICATE_SETTING",
        "message": "指定された動画のユーザー設定は既に存在します"
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

#### 3.4.2 ユーザー設定更新

既存のユーザー設定を更新します。

##### エンドポイント

```
PUT /api/user-settings/{videoId}
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
PUT /api/user-settings/sm12345678 HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
Content-Type: application/json

{
    "isFavorite": true,
    "memo": "お気に入りの曲"
}
```

```bash
curl -X PUT https://niconico-mylist.nagiyu.com/api/user-settings/sm12345678 \
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
        "message": "指定されたユーザー設定が見つかりません"
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

#### 3.4.3 ユーザー設定削除

ユーザー設定を削除します。動画基本情報は削除されません。

##### エンドポイント

```
DELETE /api/user-settings/{videoId}
```

##### 必要な権限

- `niconico-mylist:use`

##### パスパラメータ

| パラメータ | 型     | 説明                        |
| ---------- | ------ | --------------------------- |
| videoId    | string | 動画 ID（例: `sm12345678`） |

##### リクエスト例

```http
DELETE /api/user-settings/sm12345678 HTTP/1.1
Host: niconico-mylist.nagiyu.com
Cookie: nagiyu-session={jwt-token}
```

```bash
curl -X DELETE https://niconico-mylist.nagiyu.com/api/user-settings/sm12345678 \
    -b "nagiyu-session={jwt-token}"
```

##### レスポンス (200 OK)

```json
{
    "success": true,
    "message": "ユーザー設定を削除しました"
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
        "message": "指定されたユーザー設定が見つかりません"
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

### 3.5 一括インポート API

動画 ID のリストからニコニコ動画 API (`getthumbinfo`) を使用して動画基本情報を取得し、DynamoDB に一括保存します。

#### 3.5.1 動画一括インポート

複数の動画 ID を指定して、動画基本情報を一括取得・保存します。
動画基本情報の保存と同時に、認証ユーザーのユーザー設定も自動作成されます。

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
    "total": 3
}
```

##### レスポンスフィールド

| フィールド | 型     | 説明                                   |
| ---------- | ------ | -------------------------------------- |
| success    | number | 成功した動画数                         |
| failed     | number | ニコニコ API エラーで失敗した動画数    |
| skipped    | number | 既に登録済みでスキップされた動画数     |
| total      | number | 処理対象の総動画数                     |

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

### 3.6 バッチジョブ管理 API

マイリスト一括登録バッチの投入とステータス確認を行います。

#### 3.6.1 バッチジョブ投入

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

#### 3.6.2 バッチステータス確認

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

本セクションでは、API で使用する主要なデータモデルを定義します。
すべてのモデルは TypeScript インターフェースとして定義され、JSON 形式でシリアライズされます。

### 5.1 Video (動画基本情報)

ニコニコ動画から取得した動画のメタデータ。全ユーザーで共有される共通データです。

#### スキーマ

```typescript
interface Video {
    videoId: string;           // 動画ID（例: "sm12345678"）
    title: string;             // 動画タイトル
    thumbnailUrl: string;      // サムネイル画像URL
    length: string;            // 再生時間（例: "5:30"）
    videoCreatedAt: string;    // 動画基本情報の登録日時（ISO 8601形式）
    videoUpdatedAt?: string;   // 動画基本情報の更新日時（ISO 8601形式、更新時のみ）
}
```

#### 例

```json
{
    "videoId": "sm12345678",
    "title": "サンプル動画タイトル",
    "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
    "length": "5:30",
    "videoCreatedAt": "2026-01-16T10:30:00.000Z"
}
```

#### 備考

- ニコニコ動画API（`getthumbinfo`）から取得した情報を保存
- DynamoDBに `VIDEO#{videoId}` として保存（全ユーザー共通）
- 複数ユーザーが同じ動画を登録しても、動画基本情報は1つのみ保存される

---

### 5.2 UserSetting (ユーザー設定)

各ユーザーが個別に設定する動画のメタデータ（お気に入りフラグ、スキップフラグ、メモ）。

#### スキーマ

```typescript
interface UserSetting {
    videoId: string;           // 動画ID
    isFavorite: boolean;       // お気に入りフラグ（デフォルト: false）
    isSkip: boolean;           // スキップフラグ（デフォルト: false）
    memo?: string;             // ユーザーメモ（オプション）
    createdAt: string;         // ユーザー設定の作成日時（ISO 8601形式）
    updatedAt: string;         // ユーザー設定の更新日時（ISO 8601形式）
}
```

#### 例

```json
{
    "videoId": "sm12345678",
    "isFavorite": true,
    "isSkip": false,
    "memo": "お気に入りの曲",
    "createdAt": "2026-01-16T10:30:00.000Z",
    "updatedAt": "2026-01-16T12:00:00.000Z"
}
```

#### 備考

- DynamoDBに `USER#{userId}` / `VIDEO#{videoId}` として保存（ユーザー固有）
- ユーザーは自分のユーザー設定のみアクセス可能
- お気に入りフラグとスキップフラグはマイリスト登録時のフィルタ条件として使用される

---

### 5.3 VideoData (動画データ)

動画基本情報とユーザー設定を結合したデータ。API レスポンスで返される主要なデータモデル。

#### スキーマ

```typescript
interface VideoData {
    videoId: string;           // 動画ID（例: "sm12345678"）
    title: string;             // 動画タイトル
    thumbnailUrl: string;      // サムネイル画像URL
    length: string;            // 再生時間（例: "5:30"）
    videoCreatedAt: string;    // 動画基本情報の登録日時（ISO 8601形式）
    userSetting?: UserSetting; // ユーザー設定（存在する場合のみ）
}
```

#### 例

```json
{
    "videoId": "sm12345678",
    "title": "サンプル動画タイトル",
    "thumbnailUrl": "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678",
    "length": "5:30",
    "videoCreatedAt": "2026-01-16T10:30:00.000Z",
    "userSetting": {
        "videoId": "sm12345678",
        "isFavorite": true,
        "isSkip": false,
        "memo": "お気に入りの曲",
        "createdAt": "2026-01-16T10:30:00.000Z",
        "updatedAt": "2026-01-16T12:00:00.000Z"
    }
}
```

#### 備考

- `GET /api/videos` および `GET /api/videos/{videoId}` のレスポンスで使用
- `userSetting` フィールドはオプションで、ユーザー設定が存在しない場合は `undefined`
- 動画基本情報とユーザー設定は別々のDynamoDBエンティティとして保存されるが、API レスポンスでは結合される

---

### 5.4 BatchJob (バッチジョブ)

マイリスト登録バッチジョブのステータスと結果を管理するモデル。

#### スキーマ

```typescript
interface BatchJob {
    jobId: string;                 // バッチジョブID（例: "batch-job-20260116-123456-abc123"）
    status: BatchStatus;           // ジョブステータス
    result?: BatchResult;          // 実行結果（完了時のみ）
    createdAt: string;             // ジョブ作成日時（ISO 8601形式）
    updatedAt: string;             // ジョブ更新日時（ISO 8601形式）
    completedAt?: string;          // ジョブ完了日時（ISO 8601形式、完了時のみ）
}

type BatchStatus = "SUBMITTED" | "RUNNING" | "SUCCEEDED" | "FAILED";

interface BatchResult {
    registeredCount: number;       // 登録成功した動画数
    failedCount: number;           // 登録失敗した動画数
    totalCount: number;            // 処理対象の総動画数
    errorMessage?: string;         // エラーメッセージ（失敗時のみ）
}
```

#### 例 (実行中)

```json
{
    "jobId": "batch-job-20260116-123456-abc123",
    "status": "RUNNING",
    "createdAt": "2026-01-16T10:30:00.000Z",
    "updatedAt": "2026-01-16T10:31:00.000Z"
}
```

#### 例 (成功)

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

#### 例 (失敗)

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

#### 備考

- `POST /api/batch/submit` のレスポンスおよび `GET /api/batch/status/{jobId}` のレスポンスで使用
- `status` フィールドはバッチ処理の進行状況を表す
- `result` フィールドはステータスが `SUCCEEDED` または `FAILED` の場合のみ存在
- DynamoDBに7日間のTTL（Time To Live）を設定し、古いジョブ情報は自動削除される

---

### 5.5 FilterConditions (フィルタ条件)

マイリスト登録時の動画選択条件を指定するモデル。

#### スキーマ

```typescript
interface FilterConditions {
    excludeSkip: boolean;      // スキップフラグを除外するかどうか
    favoritesOnly: boolean;    // お気に入りのみを登録するかどうか
}
```

#### 例 (スキップを除く)

```json
{
    "excludeSkip": true,
    "favoritesOnly": false
}
```

#### 例 (お気に入りのみ)

```json
{
    "excludeSkip": false,
    "favoritesOnly": true
}
```

#### 例 (お気に入りかつスキップを除く)

```json
{
    "excludeSkip": true,
    "favoritesOnly": true
}
```

#### 備考

- `POST /api/batch/submit` のリクエストボディで使用
- 条件に合致する動画を DynamoDB から取得し、ランダムに最大 100 個を選択
- `excludeSkip=true` と `favoritesOnly=true` を同時に指定した場合、両方の条件を満たす動画のみが選択される

---

### 5.6 ErrorResponse (エラーレスポンス)

API エラー発生時のレスポンス形式。

#### スキーマ

```typescript
interface ErrorResponse {
    error: {
        code: string;          // エラーコード（例: "UNAUTHORIZED", "NOT_FOUND"）
        message: string;       // エラーメッセージ（日本語）
        details?: string;      // 詳細情報（オプション）
    };
}
```

#### 例 (認証エラー)

```json
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}
```

#### 例 (バリデーションエラー)

```json
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "動画 ID の数が上限を超えています",
        "details": "最大 100 件まで指定可能です"
    }
}
```

#### 例 (外部APIエラー)

```json
{
    "error": {
        "code": "BATCH_SUBMIT_FAILED",
        "message": "バッチジョブの投入に失敗しました",
        "details": "AWS Batch サービスに接続できませんでした"
    }
}
```

#### 備考

- すべてのエラーレスポンスで使用される共通フォーマット
- `code` フィールドはセクション 1.5 のエラーコード一覧に対応
- `message` フィールドは必ず日本語で記述される
- `details` フィールドは追加情報が必要な場合にのみ含まれる

---

## 6. 権限一覧

本サービスは Auth プロジェクトによる Google OAuth 認証を使用し、シンプルな権限モデルを採用しています。
ロールベースのアクセス制御は使用せず、管理者が手動で認可したユーザーのみがサービスを利用でき、認可されたユーザーは自分の UserID に紐づくデータのみアクセス可能です。

### 6.1 権限定義

本サービスでは、以下の単一権限のみを使用します。

| 権限                  | 説明                                                                                           | 対象エンドポイント                     |
| --------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| `niconico-mylist:use` | niconico-mylist-assistant サービスの利用権限。動画データの閲覧・作成・更新・削除を含む全操作。 | ヘルスチェック以外のすべてのエンドポイント |

#### 権限の詳細

**`niconico-mylist:use`**

- **対象リソース**: 動画基本情報、ユーザー設定、バッチジョブ
- **許可される操作**:
    - 動画データの取得 (`GET /api/videos`, `GET /api/videos/{videoId}`)
    - 動画基本情報の作成・更新・削除 (`POST /api/videos/basic`, `PUT /api/videos/{videoId}/basic`, `DELETE /api/videos/{videoId}/basic`)
    - ユーザー設定の作成・更新・削除 (`POST /api/user-settings/{videoId}`, `PUT /api/user-settings/{videoId}`, `DELETE /api/user-settings/{videoId}`)
    - 動画一括インポート (`POST /api/videos/bulk-import`)
    - バッチジョブの投入とステータス確認 (`POST /api/batch/submit`, `GET /api/batch/status/{jobId}`)
- **データアクセス制御**: 管理者が手動で認可したユーザーのみがサービスを利用でき、認可されたユーザーは自分の UserID に紐づくデータのみアクセス可能
    - 動画基本情報は全ユーザーで共有されるが、ユーザー設定は個別に管理される
    - 他のユーザーのユーザー設定やバッチジョブにはアクセスできない
    - 認可されていないユーザーがアクセスした場合は 403 Forbidden エラーとなる

#### 認証不要エンドポイント

以下のエンドポイントは権限チェックを行わず、公開されています。

| エンドポイント  | 説明                                     |
| --------------- | ---------------------------------------- |
| `GET /api/health` | サービス稼働状況の確認（ヘルスチェック） |

### 6.2 ロールと権限のマッピング

本サービスはロールベースのアクセス制御を使用しません。

**理由**:
- 本サービスは個人利用を想定しており、管理者や閲覧者などのロールは不要
- 認証ユーザーは全員が `niconico-mylist:use` 権限を持ち、自分のデータに対してすべての操作が可能
- データアクセス制御は UserID に基づいて行われ、他のユーザーのデータへのアクセスは不可

**実装詳細**:
- Auth プロジェクトで認証されたユーザーのうち、管理者が手動で認可したユーザーのみに `niconico-mylist:use` 権限が付与される
- 認可されていないユーザーがアクセスした場合は 403 Forbidden エラーとなる
- API Routes 内で JWT トークンから UserID を取得し、DynamoDB のクエリで UserID をフィルタリング
- 他のユーザーのデータへのアクセス試行は 403 Forbidden エラーとなる

### 6.3 権限エラーレスポンス

権限に関するエラーは、以下の HTTP ステータスコードとエラーコードで返されます。

#### 401 Unauthorized（未認証）

認証が必要なエンドポイントに未認証でアクセスした場合。

```json
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です。ログインしてください"
    }
}
```

#### 403 Forbidden（権限不足）

認証済みだが、権限が不足している場合、または他のユーザーのデータへアクセスしようとした場合。

```json
{
    "error": {
        "code": "FORBIDDEN",
        "message": "このリソースへのアクセス権限がありません"
    }
}
```

**403 エラーが発生するケース**:
- 認証済みだが、管理者により認可されていないユーザーがアクセスした場合
- 他のユーザーのユーザー設定にアクセスしようとした場合
- 他のユーザーのバッチジョブのステータスを確認しようとした場合

---

## 7. レート制限

本サービスは現時点で **API レート制限を実装していません**。

### 7.1 実装しない理由

本サービスは個人利用を想定しており、以下の理由から API レート制限は不要と判断しています：

- **想定ユーザー数**: 少数（管理者が手動で認可したユーザーのみ）
- **利用パターン**: 手動での操作が中心で、短時間に大量のリクエストが発生する状況は想定されない
- **バッチ処理の制御**: マイリスト登録は1ユーザーあたり1ジョブまでに制限されており、過度な負荷は発生しない

### 7.2 ニコニコ動画サーバーへの配慮

本サービスの API 自体にはレート制限を設けていませんが、**バッチ処理内部ではニコニコ動画サーバーへの配慮を徹底**しています：

| 項目 | 制限内容 | 目的 |
| ---- | -------- | ---- |
| 動画登録間の待機時間 | **最低 2 秒** | ニコニコ動画サーバーへの過度な負荷を防止、アカウント BAN のリスク軽減 |
| リトライ回数 | 最大 3 回 | 過度なリトライによる負荷を防止 |
| 同時実行ジョブ数 | 1 ユーザーあたり 1 ジョブ | リソースの競合防止、ニコニコ動画への過負荷防止 |

**注記**: これらの制限はバッチ処理の実装仕様であり、API 仕様としてのレート制限ではありません。詳細は [architecture.md](./architecture.md) を参照してください。

### 7.3 将来的な実装の検討

複数ユーザーへの対応が必要になった場合や、サービスの利用状況に応じて、以下の方法でレート制限の実装を検討します：

#### 想定される実装方法

**API Gateway レベル**:
- AWS API Gateway のレート制限機能を使用
- ユーザーごとに異なる制限値を設定可能

**AWS WAF**:
- IP ベースのレート制限
- 特定のエンドポイントへの過度なアクセスを制限

**アプリケーションレベル**:
- Redis を使用したトークンバケット方式
- DynamoDB による制限値の管理

#### 想定される制限値（参考）

| エンドポイント | 制限（例） | 備考 |
| -------------- | ---------- | ---- |
| `/api/videos/bulk-import` | 10 リクエスト/分/ユーザー | 一括インポートは時間がかかるため |
| `/api/batch/submit` | 3 リクエスト/時/ユーザー | バッチ処理は長時間実行のため |
| その他のエンドポイント | 60 リクエスト/分/ユーザー | 通常の CRUD 操作 |

#### 制限超過時のレスポンス（参考）

```json
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
    "error": {
        "code": "RATE_LIMIT_EXCEEDED",
        "message": "リクエスト数の上限を超えました",
        "details": "60秒後に再試行してください"
    }
}
```

**現時点では未実装**: 上記はあくまで将来的な実装の参考例です。現在は API レート制限は実装されていません。

---

## 8. バージョニング

本サービスは個人利用を前提としており、初期リリース（Phase 1）ではバージョニングを実装しません。将来的に破壊的変更が必要になった際に、新バージョンとして提供する方針です。

### 8.1 バージョン管理方針

#### Phase 1（現在）: バージョニングなし

初期リリースではバージョン番号を API パスに含めません。すべてのエンドポイントは `/api/{endpoint}` として提供されます。

**理由**:
- **個人利用前提**: 管理者が手動で認可したユーザーのみがアクセスするため、複数バージョンの並行運用は不要
- **シンプルさの優先**: バージョン管理のオーバーヘッドを避け、初期開発と保守を容易にする
- **柔軟な対応**: 小規模な変更は既存 API の更新で対応し、必要に応じてユーザーに直接通知

#### Phase 2 以降: URL パスでバージョン指定

将来的に破壊的変更が必要になった場合、以下の方針で新バージョンを提供します:

```
/api/v2/{endpoint}
```

**バージョン 2 への移行が必要になるケース（例）**:
- データモデルの大幅な変更（例: 動画基本情報のフィールド構造変更）
- 認証方式の変更（例: Auth プロジェクトからの独立）
- レスポンス形式の根本的な変更

**移行方針**:
1. 新バージョン（v2）を `/api/v2/*` として提供
2. 旧バージョン（v1 相当）は `/api/*` として一定期間併存
3. ユーザーに移行期間を通知し、段階的に移行
4. 移行完了後、旧バージョンを廃止

### 8.2 後方互換性

本サービスは個人利用を前提としており、後方互換性の維持は緩やかに運用します。

#### 基本方針

- **追加はオプション**: 新規フィールド追加時は必ずオプション（省略可能）にする
- **削除は通知**: フィールド削除時はユーザーに事前通知し、影響範囲を説明
- **変更は柔軟**: 既存フィールドの型や意味を変更する場合、ユーザーに直接通知して対応

#### 互換性維持のガイドライン

| 変更の種類 | 対応方針 | 例 |
| ---------- | -------- | -- |
| 新規フィールド追加 | オプションとして追加 | `videos[].description?: string` |
| 既存フィールドの型変更 | 段階的に移行（通知 → 変更 → 確認） | `length: string` → `lengthSeconds: number` |
| 既存フィールドの削除 | ユーザーに通知し、削除前に代替案を提示 | `thumbnailUrl` → `thumbnails: { small, large }` |
| エンドポイントの追加 | 自由に追加 | `POST /api/batch/cancel` |
| エンドポイントの削除 | ユーザーに通知し、段階的に廃止 | `DELETE /api/videos/basic` → 通知 → 廃止 |
| エラーコードの追加 | 自由に追加 | `JOB_CANCELLED` |
| エラーコードの変更 | ユーザーに通知し、影響範囲を確認 | `BATCH_SUBMIT_FAILED` → `JOB_SUBMISSION_FAILED` |

#### 実運用での対応

**小規模な変更（後方互換性あり）**:
- ユーザーへの通知なしで実施可能
- 例: レスポンスへの新規フィールド追加、エラーメッセージの改善

**中規模な変更（部分的な互換性喪失）**:
- ユーザーに事前通知し、影響範囲を説明
- 例: エンドポイントの廃止、既存フィールドの意味変更

**大規模な変更（破壊的変更）**:
- 新バージョン（v2）として提供
- 旧バージョンと並行運用し、移行期間を設ける
- 例: 認証方式の変更、データモデルの根本的な変更

#### 個人利用の利点

本サービスは個人利用を前提としているため、以下の利点があります:

- **直接コミュニケーション**: ユーザーに直接連絡し、変更内容を説明できる
- **影響範囲の把握**: 変更がどのユースケースに影響するか、ユーザーと確認しながら進められる
- **柔軟な対応**: 必要に応じて、既存 API を更新することでシンプルに対応できる

---

**注記**: 将来的に複数ユーザーへの対応が必要になった場合、より厳格な後方互換性維持のルールを導入し、明示的なバージョニング（`/api/v1/*`, `/api/v2/*`）へ移行することを検討します。

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
