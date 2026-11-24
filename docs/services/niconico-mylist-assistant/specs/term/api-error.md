---
sources:
  - services/niconico-mylist-assistant/web/src/lib/constants/errors.ts
  - services/niconico-mylist-assistant/web/src/lib/api-error-reporting.ts
sources_hash: ccbec78df8e4429bd9e9ff4dd63de0edb10e61f54751f6ed2a77bd5f549f5fb3
---

# API のエラー応答

niconico-mylist-assistant の API が失敗したときに返す本文の形と、500 以上を Admin へ報告する仕組み。本文の形は API ごとに 3 通りあり、統一されていない。

## 説明

| 形 | 本文 | 使う API |
|---|---|---|
| A | `{ error: { code, message, details? } }` | 動画一覧 (`GET /api/videos`)、ジョブの状態の 404 |
| B | `{ error: <日本語の文> }` | 動画の取得・削除・設定更新、動画の検索、一括インポート、テスト用 API |
| C | `{ error: <コード>, message: <日本語の文> }` | マイリスト登録、ニコニコセッション、ジョブの状態 (未ログインと想定外の失敗)、Push |

- 各 API の仕様のエラー表の「応答」欄は、この形のどれかを示す。A は `code`、C は `error` の値をコードとして書き、B は文をそのまま書く
- 未ログインは、どの API も 401。ジョブの状態 API は `withAuth` を通り、応答は[認証付きルートハンドラ](../../../../platform/specs/lib/nextjs/with-auth.md)のとおり。ほかは、共通メッセージの `UNAUTHORIZED` ([エラーコード・エラーメッセージ・応答の型](../../../../platform/specs/lib/common/error-codes.md)) の文を返す
- ロールや権限で操作は分けない。ログインしていれば、どの API も使える
- 想定していない例外は、ルートを包む `withApiErrorReporting` が 500 に変える ([API ルートのエラー報告](../../../../platform/specs/lib/nextjs/api-error-reporting.md))。本文はルートごとに決めた固定のもので、例外の内容は返さない

| 本文の形 | 500 の本文 |
|---|---|
| A (動画一覧) | `code` が `DATABASE_ERROR`、`message` が「データベースへのアクセスに失敗しました」 |
| B | 共通メッセージの `INTERNAL_SERVER_ERROR` ([エラーコード・エラーメッセージ・応答の型](../../../../platform/specs/lib/common/error-codes.md)) の文 |
| C (マイリスト登録) | `error` が `BATCH_ERROR`、`message` が「バッチジョブの投入に失敗しました」 |
| C (ニコニコセッション) | `error` が `SESSION_STATUS_ERROR`、`SESSION_SAVE_ERROR`、`SESSION_DELETE_ERROR` (操作ごと) |
| C (ジョブの状態) | `handleApiError` の 500 の応答 ([エラーレスポンス](../../../../platform/specs/lib/nextjs/error-response.md)) |

- 例外が 500 以上の応答になったときは、`withApiErrorReporting` が [ErrorEvent](../../../../platform/specs/term/error-event.md) として Admin へ報告する (重大度は `error`)。ルートが自分で返す 400 や 404 は報告しない ([API ルートのエラー報告](../../../../platform/specs/lib/nextjs/api-error-reporting.md))。経路は[エラー通知の経路](../../../../specs/admin/flow/error-notification.md)にある
- ルートが例外を握って続ける箇所 (一括インポートの保存の失敗、マイリスト登録の DynamoDB の失敗など) と、Push のルートが自前で返す 500 は、例外が `withApiErrorReporting` に届かないので、その場で報告する
