---
sources:
  - libs/common/src/constants/error-codes.ts
  - libs/common/src/constants/error-messages.ts
  - libs/common/src/constants/http-status.ts
  - libs/common/src/api/types.ts
  - libs/common/src/api/error-utils.ts
sources_hash: 380138a40eadef1cd6e23055c2c48d0b4328aeda5c2dde89835af002c9cda51e
---

# エラーコード・エラーメッセージ・応答の型

API が返すエラーコード、画面に出す共通のエラーメッセージ、HTTP ステータスの定数、API の応答の型、エラーからメッセージを取り出す関数。メインの `@nagiyu/common` から import する。

## エラーコード

`ERROR_CODES` は、API の応答の `error` に入れるコード。値はキーと同じ文字列。型 `ErrorCode` はこの値の和集合。

| 種別 | コード |
|---|---|
| 認証・認可 | `UNAUTHORIZED`、`FORBIDDEN` |
| リクエスト | `INVALID_REQUEST`、`VALIDATION_ERROR` |
| サーバー | `INTERNAL_ERROR` |
| リソース | `NOT_FOUND`、`ALREADY_EXISTS` |

## エラーメッセージ

`COMMON_ERROR_MESSAGES` は、サービス共通の日本語のメッセージ。型 `CommonErrorMessageKey` はキーの和集合。

| キー | メッセージ |
|---|---|
| `UNAUTHORIZED` | 認証が必要です |
| `FORBIDDEN` | この操作を実行する権限がありません |
| `SESSION_EXPIRED` | セッションが期限切れです。再度ログインしてください |
| `NETWORK_ERROR` | ネットワーク接続を確認してください |
| `NETWORK_ERROR_OCCURRED` | ネットワークエラーが発生しました |
| `TIMEOUT_ERROR` | 接続がタイムアウトしました。しばらくしてから再度お試しください |
| `SERVER_ERROR` | サーバーエラーが発生しました。しばらくしてから再度お試しください |
| `BAD_REQUEST` | リクエストが不正です |
| `INVALID_REQUEST` | 入力内容に誤りがあります。確認してください |
| `INVALID_REQUEST_BODY` | リクエストボディが不正です |
| `INVALID_REQUEST_PARAMS` | リクエストパラメータが不正です |
| `NOT_FOUND` | 対象のデータが見つかりません |
| `USER_NOT_FOUND` | ユーザーが見つかりません |
| `JOB_NOT_FOUND` | 指定されたジョブが見つかりません |
| `VALIDATION_ERROR` | 入力内容が不正です |
| `UPDATE_FIELDS_REQUIRED` | 更新するフィールドが指定されていません |
| `CREATE_ERROR` | 登録に失敗しました |
| `UPDATE_ERROR` | 更新に失敗しました |
| `DELETE_ERROR` | 削除に失敗しました |
| `FETCH_ERROR` | データの取得に失敗しました |
| `UNKNOWN_ERROR` | 予期しないエラーが発生しました |
| `INTERNAL_SERVER_ERROR` | サーバーエラーが発生しました |

API のクライアントが応答のエラーコードをメッセージに変える対応は、[API クライアント](./api-client.md) にある。

## HTTP ステータス

`HTTP_STATUS` は、よく使うものだけを定義した定数。

| キー | 値 |
|---|---|
| `OK` | 200 |
| `CREATED` | 201 |
| `BAD_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `INTERNAL_SERVER_ERROR` | 500 |

サービスからは使われていない。

## 応答の型

| 型 | 形 |
|---|---|
| `ApiSuccessResponse<T>` | `{ data: T }` |
| `APIErrorResponse` (別名 `ErrorResponse`) | `{ error: string, message: string, details?: string[] }`。`error` はエラーコード |
| `ApiResponse<T>` | `ApiSuccessResponse<T>` と `APIErrorResponse` の和集合 |
| `PaginatedResponse<T>` | `{ items: T[], pagination: { count: number, lastKey?: string } }`。`lastKey` は base64 エンコードした DynamoDB の `LastEvaluatedKey` |

エラーの応答は、`error` と `message` が並ぶ平らな形。`{ error: { code, message } }` のような入れ子の形は使わない。API クライアントは、`error` と `message` がどちらも文字列の応答だけを、エラーの応答として読む。`PaginatedResponse` はサービスからは使われていない。

## エラーからメッセージを取り出す

| 関数 | 内容 |
|---|---|
| `toErrorMessage(error)` | `Error` ならその `message`、それ以外は `String(error)` |
| `extractErrorMessage(errorData, defaultMessage)` | 応答の本体などの `unknown` から、メッセージを取り出す |

`extractErrorMessage` は次の順に探し、見つからなければ `defaultMessage` を返す。

1. `errorData` がオブジェクトでなければ (`null` を含む)、`defaultMessage`
2. `message` が文字列ならそれ
3. `error.message` が文字列ならそれ
