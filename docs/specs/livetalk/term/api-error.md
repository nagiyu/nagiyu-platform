---
id: livetalk/term/api-error
title: API のエラー応答
kind: term
service: livetalk
sources:
  - libs/nextjs/src/auth.ts
  - libs/nextjs/src/error-reporting.ts
  - services/livetalk/web/src/lib/server/api-error-reporting.ts
sources_hash: 428f137d4423f3e1c3b91ace8fc1ddf3cde4d867d2c7ef445e7554147e82afc5
terms: [platform/term/error-event]
related_cards: [livetalk/term/permission, admin/flow/error-notification]
---

# API のエラー応答

リブトークの API が失敗したときに返す共通の形と、想定していない失敗を Admin へ報告する仕組み。

## 説明

- 本文は `{ error: <コード>, message: <日本語の説明> }` の形。各カードのエラー表に書くコードは、この `error` の値である

| 失敗の種類 | 状態 | `error` |
|---|---|---|
| 未ログイン | 401 | `UNAUTHORIZED` |
| 権限なし | 403 | `FORBIDDEN` |
| 入力の不正 | 400 | API ごとのコード (`INVALID_REQUEST` など) |
| 対象が見つからない | 404 | `NOT_FOUND` |
| 想定していない例外 | 500 | API ごとに決めたコード (`FETCH_FAILED` など)。決めていない API は `INTERNAL_ERROR` |

- 想定していない例外は、ルートの入口で受け止めて 500 にし、[ErrorEvent](../../platform/term/error-event.md) として Admin へ報告する ([エラー通知の経路](../../admin/flow/error-notification.md))
- 報告は、例外を握って処理を続ける箇所 (チャットのロック・レートリミットの障害など) でも、その場で行う
- 例外を握って別の応答にする API もある。生活サイクルの取得は、失敗しても 500 にせず `awake` を返す

## 関連するカード

- [権限とロール](./permission.md): 401 と 403 の条件
