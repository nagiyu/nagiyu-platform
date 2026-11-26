---
sources:
  - services/quick-clip/web/src/lib/api-error-reporting.ts
  - libs/nextjs/src/error-reporting.ts
  - libs/nextjs/src/request-body.ts
  - libs/common/src/constants/error-messages.ts
  - libs/aws/src/error-events/report.ts
sources_hash: c2440767014b041fe6b10a2cae4fab7b972decd1fc5c8cd8152071f571d60e7c
---

# API のエラー応答

Quick Clip の API が失敗したときに返す形と、想定外の例外を Admin へ報告する仕組み。

## 説明

- 本文は `{ error: <コード>, message: <日本語の説明> }`。各 API の仕様のエラー表の「コード」は `error` の値
- 本文を読む API (ジョブ作成、アップロードの完了と中断、見どころの更新) は、本文が JSON のオブジェクトでない (壊れた JSON、空、配列など) ものを、入力の誤りとして 400 `INVALID_REQUEST` にする ([リクエストボディの読み取り](../../../../platform/specs/lib/nextjs/request-body.md))

| 失敗の種類 | 状態 | `error` | `message` |
|---|---|---|---|
| 入力の誤り (ジョブ作成、アップロードの完了と中断) | 400 | `INVALID_REQUEST` | リクエストが不正です |
| 入力の誤り (見どころの更新) | 400 | `INVALID_REQUEST` | 更新内容が不正です |
| ジョブがない | 404 | `JOB_NOT_FOUND` | 指定されたジョブが見つかりません |
| 想定外の例外 | 500 | `INTERNAL_SERVER_ERROR` | API ごとに決めた文 (各 API の仕様にある) |

- 想定外の例外は、ルートの入口で受けて 500 にする。例外の内容は本文に出さず、コンソールのログに残す
- 入口で受けた例外を 500 にするときは、[ErrorEvent](../../../../platform/specs/term/error-event.md) として Admin へ報告する ([API ルートのエラー報告](../../../../platform/specs/lib/nextjs/api-error-reporting.md))
    - `serviceId` は `quick-clip`、`source` は `application`、`severity` は `error`。題名は API ごとに決める (「Web API: 見どころ更新エラー」など)
    - 本文はその例外のメッセージ。`context` には、メソッドとパス (クエリは載せない)、例外の名前、メッセージ、スタックが入る
    - ルートが自分で返す 400、404、409 は、想定内なので報告しない。ルートが自分で返す 500 も、例外ではないので報告しない
    - 報告の書き込みに失敗しても、応答は変わらない。ログを残すだけ。環境変数 `ERROR_EVENTS_TABLE_NAME` がないときも同じ
- 例外を握って処理を続ける箇所は、例外が入口に届かないので、その場で報告する。報告の仕組みは[エラー通知の経路](../../../admin/specs/flow/error-notification.md)にある
- 例外: `GET /api/jobs/{jobId}` は、この仕組みを使わず、どんな例外でも 404 `JOB_NOT_FOUND` を返す。報告もしない ([ジョブ API](../api/jobs.md))
