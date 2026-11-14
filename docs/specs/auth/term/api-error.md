---
id: auth/term/api-error
title: 認証 API のエラー応答
kind: term
service: auth
sources:
  - services/auth/web/src/lib/api-error-reporting.ts
  - libs/common/src/constants/error-messages.ts
  - libs/nextjs/src/error-reporting.ts
  - libs/aws/src/error-events/report.ts
sources_hash: d3bf10c955a5f27f4defc835a0ebd104890565544688d6ddbf23f849751e540f
terms: [platform/term/error-event]
related_cards: [auth/api/users, auth/api/billing, auth/api/billing-webhook, admin/flow/error-notification]
---

# 認証 API のエラー応答

Auth の API が失敗したときに返す形と、想定外の失敗を Admin の[エラー履歴](../../platform/term/error-event.md)へ報告する仕組み。

## 説明

- 本文は `{ error: <日本語の文> }`。コードではなく文が `error` に入る (Admin の `{ error: <コード>, message }` とは違う)。補足があれば `details` を付ける

| 失敗の種類 | 状態 | `error` | `details` |
|---|---|---|---|
| 未ログイン | 401 | 認証が必要です | なし |
| 権限なし | 403 | この操作を実行する権限がありません | `Required permission: <権限>` (ユーザー API) |
| 入力の不正 (ユーザー API) | 400 | リクエストボディが不正です / リクエストパラメータが不正です | `{ field, message }` の配列 |
| 入力の不正 (課金 API) | 400 | 経路ごとの文 | なし |
| 対象がない | 404 | ユーザーが見つかりません など | なし |
| 競合 | 409 | 経路ごとの文 | なし |
| 課金が無効 | 503 | 課金は有効になっていません | なし |
| 想定外の失敗 | 500 | 経路ごとに決めた固定の文 | なし |

- 想定外の失敗は、ルートが例外を投げたときに 500 固定で返す。例外の内容は本文に出さない
- 例外で 500 になったときは、[ErrorEvent](../../platform/term/error-event.md) として Admin の履歴へ報告する。`serviceId` は `auth`、重大度は `error`、題名は経路ごとの文 (`Web API: ...`)、本文は例外のメッセージ、context は HTTP メソッドとパス (検索語は載せない) と例外の情報
    - 報告できなくても応答は変わらない。ログに残すだけ
    - 経路が自分で返す 4xx と、503・409 は報告しない
- ルートの外 (認証ライブラリのコールバック) の失敗も、同じ仕組みで報告する ([サインインの経路](../flow/sign-in.md))。経路は[エラー通知の経路](../../admin/flow/error-notification.md)にある

## 関連するカード

- [ユーザー API](../api/users.md)・[課金 API](../api/billing.md)・[Stripe 通知 API](../api/billing-webhook.md): この形で返す
