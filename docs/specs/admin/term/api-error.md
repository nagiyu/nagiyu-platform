---
id: admin/term/api-error
title: API のエラー応答
kind: term
service: admin
sources:
  - libs/nextjs/src/error.ts
  - libs/nextjs/src/error-reporting.ts
  - libs/common/src/constants/error-messages.ts
  - libs/aws/src/error-events/report.ts
  - services/admin/web/src/lib/api-error-reporting.ts
sources_hash: 49edd914bb7ee6f024de51f7983e696cd1bc8198b50860299024d151cc4bec90
terms: [platform/term/error-event, admin/term/permission]
related_cards: [admin/api/errors, admin/api/notify, admin/api/notify-sns]
---

# API のエラー応答

Admin の API が失敗したときに返す共通の形と、500 を Admin 自身の[エラー履歴](../../platform/term/error-event.md)へ報告する仕組み。

## 説明

- 本文は `{ error: <コード>, message: <日本語の説明> }` の形。各カードのエラー表に書くコードは、この `error` の値である

| 失敗の種類 | 状態 | `error` | `message` |
|---|---|---|---|
| 未ログイン | 401 | `UNAUTHORIZED` | 「ログインが必要です」 |
| 権限なし | 403 | `FORBIDDEN` | 「この操作を実行する権限がありません」 |
| 入力の不正 | 400 | `INVALID_REQUEST` | 経路ごとに違う (「リクエストパラメータが不正です」「リクエストボディが不正です」など) |
| 対象が見つからない | 404 | `NOT_FOUND` | 経路ごとに違う |
| 想定していない失敗 | 500 | `INTERNAL_ERROR` | 経路ごとに決めた固定の文 |

- 権限の条件は[権限とロール](./permission.md)にある
- 想定していない失敗は、例外が投げられたときに、500 固定で返す。例外の内容は本文に出さない
- 状態が 500 以上になったときは、[ErrorEvent](../../platform/term/error-event.md) として Admin 自身の履歴へ報告する。報告は `application` / `error`、serviceId は `admin`
    - 題名は経路ごとに決めた文、本文は例外のメッセージ、context は HTTP メソッドとパス (問い合わせの文字列は載せない) と例外の情報
    - 報告できなくても (テーブル名の環境変数がない、書き込みに失敗した)、応答は変わらない。ログに残すだけ
    - 4xx は、経路が自分で返すものなので報告しない
- `/api/notify/sns` は報告しない (自己監視の経路を、監視対象の履歴に依存させないため)

## 関連するカード

- [エラー履歴 API](../api/errors.md)・[Push 購読 API](../api/notify.md)・[SNS 受信 API](../api/notify-sns.md): この形で返す
