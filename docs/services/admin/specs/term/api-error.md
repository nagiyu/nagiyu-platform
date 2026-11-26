---
sources:
  - services/admin/web/src/lib/api-error-reporting.ts
  - services/admin/web/src/app/api/errors/route.ts
  - services/admin/web/src/app/api/errors/[eventId]/route.ts
  - services/admin/web/src/app/api/notify/subscribe/route.ts
  - services/admin/web/src/app/api/notify/vapid-key/route.ts
  - services/admin/web/src/app/api/notify/sns/route.ts
sources_hash: f096756ae2f88f12ee21c1ac05dec65b1baa14abc097faa3d7f9b24e3a98d7de
---

# API のエラー応答

Admin の API が失敗したときに返す共通の形と、500 を Admin 自身の[エラー履歴](../../../../platform/specs/term/error-event.md)へ報告する仕組み。

## 説明

- 本文は `{ error: <コード>, message: <日本語の説明> }` の形で、コードは[エラーコード](../../../../platform/specs/lib/common/error-codes.md)に従う。各 API の仕様のエラー表に書くコードは、この `error` の値である

| 失敗の種類 | 状態 | `error` | `message` |
|---|---|---|---|
| 未ログイン | 401 | `UNAUTHORIZED` | 「ログインが必要です」 |
| 権限なし | 403 | `FORBIDDEN` | 「この操作を実行する権限がありません」 |
| 入力の不正 | 400 | `INVALID_REQUEST` | 経路ごとに違う (「リクエストパラメータが不正です」「リクエストボディが不正です」など) |
| 対象が見つからない | 404 | `NOT_FOUND` | 経路ごとに違う |
| 想定していない失敗 | 500 | `INTERNAL_ERROR` | 経路ごとに決めた固定の文 |

- 権限の条件は[権限とロール](./permission.md)にある
- [SNS 受信 API](../api/notify-sns.md) は、同じコードを使うが、署名の不一致 (401)、許可されないトピック (403) など、`message` が専用の文になる
- 想定していない失敗は、ルートが例外を投げたときに、500 固定で返す。例外の名前で 404 や 400 に変える共通の変換 ([エラーレスポンス](../../../../platform/specs/lib/nextjs/error-response.md)の `handleApiError`) は使わない。例外の内容は本文に出さず、ログに出す
- 状態が 500 以上になったときは、[ErrorEvent](../../../../platform/specs/term/error-event.md) として Admin 自身の履歴へ報告する。報告の仕組みは [API ルートのエラー報告](../../../../platform/specs/lib/nextjs/api-error-reporting.md)にあり、Admin 固有の値は次のとおり
    - `serviceId` は `admin`、`source` は `application`、`severity` は `error`
    - 題名は経路ごとに決めた文、本文は例外のメッセージ
    - 4xx は、経路が自分で返すものなので報告しない
    - `/api/notify/vapid-key` は、共通のルート部品が自分で 500 を返すので、その 500 を返すときに `onError` から報告する
- `/api/notify/sns` は報告しない。理由は [SNS 受信 API](../api/notify-sns.md) の「理由」にある
