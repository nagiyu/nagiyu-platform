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
sources_hash: 9f041c69e7d0bc4a7e58671649767d90a80c5bc1a4ee0fc5262f78b5d91531b1
terms: [livetalk/term/api-error]
related_cards: [livetalk/screen/status, platform/term/role]
related_adr:
  - services/livetalk/architecture.md#2.8
---

# 権限とロール

リブトークは、ログインしていれば誰でも使える。管理者向けの機能だけを、ログインした利用者のロールが持つ権限 `livetalk:admin` で分ける。ロールの定義は[ロールと権限の定義](../../platform/term/role.md)にある。

## 説明

| 条件 | できること |
|---|---|
| ログインしていること | 会話、記憶・ノートの閲覧、同意、通知の受け取り、退会など、利用者向けの機能すべて |
| `livetalk:admin` (ロール `livetalk-admin` が持つ) | ステータス画面、ステータス API、テスト通知の送信 |

- 勉強の 1 日の回数は、`livetalk:operator` (運営者) と `livetalk:standard` (スタンダード) で区分を決める。機能の有無は変わらない。区分と回数は[勉強バッチ](../batch/acquire.md)にある

- ページはミドルウェアがログインだけを確かめ、権限は見ない
    - 未ログインは、Auth サービスのサインインへ移す
    - `/legal/` 配下は、ログインしていなくても開ける
- `/api` 配下はミドルウェアを通らず、各 API が自分で判定する。未ログインは 401 (`UNAUTHORIZED`)、`livetalk:admin` を求める API で権限がなければ 403 (`FORBIDDEN`)。本文の形は [API のエラー応答](./api-error.md)
- ステータス画面は、ミドルウェアが通したあと、画面自身が `livetalk:admin` を確かめる。持たなければ「アクセス権限がありません」を出す

## 関連するカード

- [ステータス画面](../screen/status.md)
