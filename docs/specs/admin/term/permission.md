---
id: admin/term/permission
title: 権限とロール
kind: term
service: admin
sources:
  - libs/common/src/auth/roles.ts
  - libs/common/src/auth/permissions.ts
  - services/admin/web/src/middleware.ts
sources_hash: ba70b0bb9dbf29cf89982f0ba2729db153f6ffa54a48b28355829c0741750fd1
terms: [admin/term/api-error]
related_cards: [admin/screen/dashboard, admin/screen/forbidden, admin/screen/errors, admin/screen/error-detail, admin/api/errors, admin/api/notify]
---

# 権限とロール

Admin の画面と API は、ログインした利用者のロールが持つ 3 つの権限で、使える機能を分ける。

## 説明

| 権限 | できること | 持つロール |
|---|---|---|
| `users:read` | Admin の画面 (`/forbidden` を除く) を開く | `admin`、`user-manager` |
| `notifications:write` | Web Push の購読の登録と解除。ダッシュボードの「通知設定」カードの表示 | `admin` |
| `errors:read` | エラー履歴の一覧と詳細の閲覧。ダッシュボードの「エラー履歴」カードの表示 | `admin` |

- ロールが持つ権限は、コード (`ROLES`) に書かれている。ロールごとの権限を足し合わせて判定する。知らないロール ID は、権限を持たないものとして扱う
- この 3 つのうち、`user-manager` が持つのは `users:read` だけ。`admin` と `user-manager` 以外のロールは、どれも持たない
- `users:read` は、すべての画面の手前でミドルウェアが確かめる。なければ[権限なし画面](../screen/forbidden.md)へリダイレクトする
- API は、未ログインなら 401 (`UNAUTHORIZED`)、権限がなければ 403 (`FORBIDDEN`) を返す。本文の形は [API のエラー応答](./api-error.md)
- 画面は、`errors:read` などの権限がなければ「アクセス権限がありません」を出す。権限のないカードはダッシュボードに出さない
- `/api/health`、`/api/notify/vapid-key`、`/api/notify/sns` は権限を見ない (ログインの要否は各カードを参照)

## 関連するカード

- [ダッシュボード画面](../screen/dashboard.md): `users:read` がないと開けない。権限でカードを出し分ける
- [権限なし画面](../screen/forbidden.md): `users:read` がないときの移り先
- [エラー履歴一覧画面](../screen/errors.md)・[エラー詳細画面](../screen/error-detail.md): `errors:read` がないと開けない
- [エラー履歴 API](../api/errors.md)・[Push 購読 API](../api/notify.md): 権限を確かめる
