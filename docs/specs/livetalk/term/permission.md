---
id: livetalk/term/permission
title: 権限とロール
kind: term
service: livetalk
sources:
  - libs/common/src/auth/roles.ts
  - libs/nextjs/src/auth.ts
  - libs/nextjs/src/middleware.ts
  - services/livetalk/web/src/middleware.ts
sources_hash: a58b8907136ae0dc8c8de445ac0eb653ff372c6252ca94f419d21d088bfeaa9f
terms: [livetalk/term/api-error]
related_cards: [livetalk/screen/forbidden, livetalk/screen/status, platform/term/role]
related_adr:
  - services/livetalk/architecture.md#2.8
---

# 権限とロール

リブトークの画面と API は、ログインした利用者のロールが持つ 2 つの権限で、使える操作を分ける。ロールの定義は[ロールと権限の定義](../../platform/term/role.md)にある。

## 説明

| 権限 | できること | 持つロール |
|---|---|---|
| `livetalk:chat` | 会話、記憶・ノートの閲覧、同意、通知の受け取り、退会など、利用者向けの機能すべて | `livetalk-user`、`livetalk-admin` |
| `livetalk:admin` | ステータス画面、ステータス API、テスト通知の送信 | `livetalk-admin` |

- `livetalk-admin` は `livetalk:chat` も持つ。利用者向けの機能も使える
- ページはミドルウェアが `livetalk:chat` を要求する
    - 未ログインは、Auth サービスのサインインへ移す
    - ログイン済みで権限がなければ、`/forbidden?from={元のパス}` へ移す ([権限なし画面](../screen/forbidden.md))
    - `/legal/` 配下と `/forbidden` は、権限の判定をしない
- `/api` 配下はミドルウェアを通らず、各 API が自分で判定する。未ログインは 401 (`UNAUTHORIZED`)、権限がなければ 403 (`FORBIDDEN`)。本文の形は [API のエラー応答](./api-error.md)
- ステータス画面は、ミドルウェアが通したあと、画面自身が `livetalk:admin` を確かめる。持たなければ「アクセス権限がありません」を出す

## 関連するカード

- [権限なし画面](../screen/forbidden.md)
- [ステータス画面](../screen/status.md)
