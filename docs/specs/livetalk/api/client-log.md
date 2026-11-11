---
id: livetalk/api/client-log
title: クライアントログ API
kind: api
service: livetalk
sources:
  - services/livetalk/web/src/app/api/client-log/route.ts
  - services/livetalk/web/src/app/api/client-log/constants.ts
  - services/livetalk/web/src/lib/client-logger.ts
sources_hash: 759be62fb916d3fd81908b4b18786d76ee8eb2030a365e46b95e902ba0c69a1c
terms: [livetalk/term/permission, livetalk/term/api-error, platform/term/error-event]
related_cards: [livetalk/screen/home, admin/flow/error-notification]
---

# クライアントログ API

ブラウザで起きた失敗を受け取り、[ErrorEvent](../../platform/term/error-event.md) として Admin へ報告する。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| POST | `/api/client-log` | `livetalk:chat` |

## 入力と出力

| 項目 | 条件 |
|---|---|
| `severity` | 必須。`warning`、`error`、`critical` のどれか |
| `title` | 必須。1〜200 文字 |
| `message` | 必須。1〜1,000 文字 |
| `context` | 任意。オブジェクト |
| `occurredAt` | 任意。文字列 |

- 成功は本文なしの 204。報告の `serviceId` は `livetalk`。`context` には、先に利用者の ID を入れ、続けて受け取った `context` の項目を重ねる
- 画面が送るのは、チャット通信の失敗、音声の再生・デコードの失敗、捕捉されなかった例外、画面の描画中の例外。画面側の送信は、失敗しても何もしない

## エラー

| 条件 | 状態 | `error` |
|---|---|---|
| 本文が JSON のオブジェクトでない、項目が条件に合わない | 400 | `INVALID_REQUEST` |

- 権限の不足は 401 / 403。形は [API のエラー応答](../term/api-error.md)

## つながり

```mermaid
flowchart TD
    S[各画面のエラー処理] --> A[クライアントログ API]
    A --> T[(error-events テーブル)]
    T --> D[Admin のエラー履歴と Push]
```
