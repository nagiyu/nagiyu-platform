---
id: stock-tracker/api/system
title: システム系の API
kind: api
service: stock-tracker
sources:
  - services/stock-tracker/web/app/api/health/route.ts
  - services/stock-tracker/web/app/api/auth/[...nextauth]/route.ts
  - services/stock-tracker/web/app/api/test/reset/route.ts
  - libs/nextjs/src/health.ts
  - libs/nextjs/src/session.ts
sources_hash: 3f2d7f8f034b62e289335787e5ffe90ee5bc32fc96826bdaad311253768e1cb1
terms: [stock-tracker/term/permission, stock-tracker/term/api-error]
---

# システム系の API

業務の機能ではない 3 つの API。死活確認、認証セッション、テスト用のデータ初期化。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| GET | `/api/health` | なし |
| GET | `/api/auth/*` (画面が使うのは `/api/auth/session`) | なし (ログインの状態を返す) |
| POST | `/api/test/reset` | なし (テスト用の設定のときだけ動く) |
| DELETE | `/api/test/reset` | なし (同上) |

## 入力と出力

- 死活確認は `{ status: 'ok', service: 'stock-tracker', version, timestamp }` を返す。`version` は環境変数 `APP_VERSION`、なければ `1.0.0`
- 認証は next-auth の GET だけを公開する。環境変数 `SKIP_AUTH_CHECK` が `true` のテスト用の設定では、`/api/auth/session` が認証せずにテスト用のセッションを返す。ロールを指定しなければ `stock-user`
- テスト用の初期化は、環境変数 `USE_IN_MEMORY_DB` が `true` のときだけ動き、メモリ上のデータを空にする
    - POST は本文の `exchanges`、`tickers`、`holdings`、`alerts` をこの順に登録し直す。本文がなければ空にするだけ
    - DELETE は空にするだけ
    - 成功は `{ data: { success: true } }`

## エラー

| 条件 | 状態 | `error` |
|---|---|---|
| テスト用の設定でない (初期化) | 404 | `NOT_FOUND` |
| 初期化の失敗 | 500 | `INTERNAL_SERVER_ERROR` |

## つながり

```mermaid
flowchart TD
    M[死活確認の呼び出し元] --> H["/api/health"]
    C[全画面のログイン判定] --> A["/api/auth"]
    T[E2E テスト] --> R["/api/test/reset"]
    R --> D[(メモリ上のデータ)]
```
