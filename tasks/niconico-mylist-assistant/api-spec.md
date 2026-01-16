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

| カテゴリ         | エンドポイント数 | 説明                                           |
| ---------------- | ---------------- | ---------------------------------------------- |
| ヘルスチェック   | 1                | サービス稼働状況の確認                         |
| 動画管理         | 5                | 動画基本情報とユーザー設定の CRUD 操作         |
| 一括インポート   | 1                | ニコニコ動画 API から動画情報を一括取得・保存  |
| バッチジョブ管理 | 2                | マイリスト登録バッチの投入とステータス確認     |

### 2.2 全エンドポイント一覧

| メソッド | パス                             | 説明                                             | 認証 | 備考                                   |
| -------- | -------------------------------- | ------------------------------------------------ | ---- | -------------------------------------- |
| GET      | `/api/health`                    | ヘルスチェック                                   | 不要 | サービス稼働状況の確認                 |
| GET      | `/api/videos`                    | 動画一覧取得                                     | 必須 | 認証ユーザーの動画データのみ取得       |
| GET      | `/api/videos/{videoId}`          | 動画詳細取得                                     | 必須 | 動画基本情報 + ユーザー設定を取得      |
| POST     | `/api/videos`                    | 動画作成（単一）                                 | 必須 | 動画基本情報 + ユーザー設定を作成      |
| PUT      | `/api/videos/{videoId}`          | 動画更新（ユーザー設定のみ）                     | 必須 | お気に入り・スキップフラグ・メモを更新 |
| DELETE   | `/api/videos/{videoId}`          | 動画削除                                         | 必須 | ユーザー設定のみ削除（動画基本情報保持）|
| POST     | `/api/videos/bulk-import`        | 動画一括インポート                               | 必須 | 動画 ID リストから動画情報を一括取得   |
| POST     | `/api/batch/submit`              | バッチジョブ投入                                 | 必須 | マイリスト登録バッチを AWS Batch に投入|
| GET      | `/api/batch/status/{jobId}`      | バッチステータス確認                             | 必須 | ジョブの実行状況と結果を取得           |

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

<!-- 記入ガイド: 各エンドポイントの詳細仕様を記述してください -->
<!-- 記入ガイド: 機能ごとにセクションを分けて整理することを推奨します -->

### 3.1 {機能グループ名} API

<!-- 記入ガイド: 関連するエンドポイントをグループ化して記述してください -->
<!-- 記入例: 認証 API、ユーザー管理 API、ヘルスチェック API など -->

#### 3.1.1 {エンドポイント名}

<!-- 記入ガイド: エンドポイントの概要を1-2行で記述してください -->

##### エンドポイント

```
{METHOD} /api/{path}
```

##### 必要な権限

<!-- [任意] 権限が必要な場合のみ -->

- `{permission:scope}`

##### パスパラメータ

<!-- [任意] パスパラメータがある場合のみ -->

| パラメータ | 型     | 説明   |
| ---------- | ------ | ------ |
| {param}    | string | {説明} |

##### クエリパラメータ

<!-- [任意] クエリパラメータがある場合のみ -->

| パラメータ | 型     | 必須 | デフォルト | 説明   |
| ---------- | ------ | ---- | ---------- | ------ |
| {param}    | string | -    | {default}  | {説明} |

##### リクエストボディ

<!-- [任意] リクエストボディがある場合のみ -->

```json
{
    "{field1}": "{value1}",
    "{field2}": "{value2}"
}
```

##### リクエストボディスキーマ

<!-- [任意] リクエストボディがある場合のみ -->

| フィールド | 型     | 必須 | 説明   |
| ---------- | ------ | ---- | ------ |
| {field}    | string | ✅   | {説明} |

##### リクエスト例

```http
{METHOD} /api/{path} HTTP/1.1
Host: {service}.nagiyu.com
Cookie: {auth-cookie}={token}
Content-Type: application/json

{
    "{field}": "{value}"
}
```

<!-- curl コマンド例も含めることを推奨 -->

```bash
curl -X {METHOD} https://{service}.nagiyu.com/api/{path} \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer {token}" \
    -d '{
        "{field}": "{value}"
    }'
```

##### レスポンス (200 OK)

```json
{
    "{field1}": "{value1}",
    "{field2}": "{value2}"
}
```

##### レスポンスフィールド

<!-- [任意] レスポンスが複雑な場合に記述 -->

| フィールド | 型     | 説明   |
| ---------- | ------ | ------ |
| {field}    | string | {説明} |

##### エラーレスポンス

<!-- 記入ガイド: 想定されるエラーケースを記述してください -->

```json
// 400 Bad Request
{
    "error": {
        "code": "INVALID_REQUEST",
        "message": "リクエストが不正です"
    }
}

// 401 Unauthorized
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "認証が必要です"
    }
}

// 404 Not Found
{
    "error": {
        "code": "NOT_FOUND",
        "message": "リソースが見つかりません"
    }
}
```

---

## 4. ヘルスチェック API

<!-- 記入ガイド: ヘルスチェックエンドポイントの仕様を記述してください -->
<!-- 記入ガイド: 多くのサービスで共通的に必要となるため、専用セクションとして用意 -->

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
Host: {service}.nagiyu.com
```

```bash
curl https://{service}.nagiyu.com/api/health
```

#### レスポンス (200 OK)

```json
{
    "status": "ok",
    "timestamp": "2024-01-15T12:34:56.789Z",
    "version": "1.0.0"
}
```

<!-- [任意] 依存サービスのステータスを含める場合 -->

```json
{
    "status": "ok",
    "timestamp": "2024-01-15T12:34:56.789Z",
    "version": "1.0.0",
    "dependencies": {
        "database": "ok",
        "externalService": "ok"
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
        "database": "error",
        "externalService": "ok"
    }
}
```

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
