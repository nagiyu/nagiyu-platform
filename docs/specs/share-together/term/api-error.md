---
id: share-together/term/api-error
title: API のエラー応答
kind: term
service: share-together
sources:
  - services/share-together/web/src/lib/api/responses.ts
  - services/share-together/web/src/lib/api-error-reporting.ts
  - services/share-together/web/src/lib/auth/session.ts
  - services/share-together/web/src/lib/constants/errors.ts
  - services/share-together/web/src/middleware.ts
  - libs/nextjs/src/error.ts
  - libs/nextjs/src/error-reporting.ts
sources_hash: 7dfb3221f0dbba18d75c684c7087fdf0757008ca2b7916abb5687ebc0f40736c
terms: [platform/term/error-event]
related_cards: [admin/flow/error-notification, share-together/term/group-role]
---

# API のエラー応答

Share Together の API が失敗したときに返す共通の形と、想定外の失敗を Admin へ報告する仕組み。

## 説明

- 本文は `{ error: <コード>, message: <日本語の説明> }`。各カードのエラー表の `error` は、この値である
- 画面が表示に使うのは、主に `message`。画面によっては `error` で扱いを分ける (招待画面)

| 失敗の種類 | 状態 | `error` |
|---|---|---|
| 未ログイン | 401 | `UNAUTHORIZED` |
| 入力の不正 (本文が JSON のオブジェクトでない、必須の項目がない、長さや型の違反、パスの ID が空) | 400 | `VALIDATION_ERROR` |
| 立場や所有者の不一致 | 403 | `FORBIDDEN` (オーナーだけの操作は `OWNER_ONLY`、オーナーの脱退は `OWNER_CANNOT_LEAVE`) |
| 対象が見つからない | 404 | `NOT_FOUND` (招待先のユーザーがいないときは `USER_NOT_FOUND`) |
| 状態の衝突 | 409 | 個別のコード (`ALREADY_INVITED`、`MEMBER_LIMIT_EXCEEDED`、`PERSONAL_LIST_LIMIT_EXCEEDED` など) |
| 想定していない失敗 | 500 | `INTERNAL_SERVER_ERROR` |

- ログインの確認は API のルートが自分で行う。ページを守るミドルウェアは `/api` を通さないので、未ログインの API 呼び出しはサインインへの移動ではなく 401 になる
- 権限 (ロール) では判定しない。判定は「ログインしているか」と、グループの立場・リストの所有者だけである ([グループの立場](./group-role.md))
- 想定していない失敗 (例外) は、ルートの入口で 500 に変え、状態が 500 以上のものだけを [ErrorEvent](../../platform/term/error-event.md) として Admin へ報告する (`serviceId` は `share-together`、題名は「Web API: …エラー」の形)。報告の経路は[エラー通知の経路](../../admin/flow/error-notification.md)
- ルートが自分で返した 400、403、404、409 は想定内なので報告しない。報告の書き込みに失敗しても応答は変わらない
- 画面 (ブラウザ) の例外は報告しない。エラー画面は `console.error` に出すだけである

## 関連するカード

- [グループの立場](./group-role.md): 403 の条件
