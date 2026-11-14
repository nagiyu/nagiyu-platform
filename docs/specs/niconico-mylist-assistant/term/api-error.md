---
id: niconico-mylist-assistant/term/api-error
title: API のエラー応答
kind: term
service: niconico-mylist-assistant
sources:
  - services/niconico-mylist-assistant/web/src/lib/constants/errors.ts
  - services/niconico-mylist-assistant/web/src/lib/api-error-reporting.ts
  - libs/nextjs/src/error.ts
  - libs/nextjs/src/error-reporting.ts
  - libs/nextjs/src/auth.ts
  - libs/common/src/constants/error-codes.ts
  - libs/common/src/constants/error-messages.ts
sources_hash: 505afbd32deb940b04e9ff1c0f52a8de3b7aeeec81b7d74a358f4763c8cf48fb
terms: [platform/term/error-event]
related_cards: [admin/flow/error-notification]
---

# API のエラー応答

niconico-mylist-assistant の API が失敗したときに返す本文の形と、500 以上を Admin へ報告する仕組み。本文の形は API ごとに 3 通りあり、統一されていない。

## 説明

| 形 | 本文 | 使う API |
|---|---|---|
| A | `{ error: { code, message, details? } }` | 動画一覧 (`GET /api/videos`)、二段階認証コード (`POST /api/batch/2fa`)、ジョブの状態の 404 |
| B | `{ error: <日本語の文> }` | 動画の取得・削除・設定更新、動画の検索、一括インポート、テスト用 API |
| C | `{ error: <コード>, message: <日本語の文> }` | マイリスト登録、ニコニコセッション、ジョブの状態 (未ログインと想定外の失敗)、Push |

- 各カードのエラー表の「応答」欄は、この形のどれかを示す。A は `code`、C は `error` の値をコードとして書き、B は文をそのまま書く
- 未ログインは、どの API も 401。文は、`withAuth` を通るジョブの状態 API が「ログインが必要です」、ほかは「認証が必要です」
- ロールや権限で操作は分けない。ログインしていれば、どの API も使える
- 想定していない例外は、ルートを包む共通の処理が 500 に変える。本文はルートごとに決めた固定のもので、例外の内容は返さない

| 本文の形 | 500 の本文 |
|---|---|
| A (動画一覧、二段階認証コード) | `code` が `DATABASE_ERROR`、`message` が「データベースへのアクセスに失敗しました」 |
| B | 「サーバーエラーが発生しました」 |
| C (マイリスト登録) | `error` が `BATCH_ERROR`、`message` が「バッチジョブの投入に失敗しました」 |
| C (ニコニコセッション) | `error` が `SESSION_STATUS_ERROR`、`SESSION_SAVE_ERROR`、`SESSION_DELETE_ERROR` (操作ごと) |
| C (ジョブの状態) | `error` が `INTERNAL_ERROR`、`message` が「内部エラーが発生しました」 |

- 状態が 500 以上になったときは、[ErrorEvent](../../platform/term/error-event.md) として Admin へ報告する (重大度は `error`)。本文を決めてルートが自分で返す 400 や 404 は報告しない。経路は[エラー通知の経路](../../admin/flow/error-notification.md)にある
- ルートが例外を握って続ける箇所 (一括インポートの保存の失敗、マイリスト登録の DynamoDB の失敗など) は、例外が上に届かないので、その場で報告する

## 関連するカード

- [動画 API](../api/videos.md)、[動画取り込み API](../api/video-import.md)、[マイリスト登録 API](../api/mylist-register.md)、[ジョブ API](../api/batch-jobs.md)、[ニコニコセッション API](../api/niconico-session.md): 各 API のエラー
