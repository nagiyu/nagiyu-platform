---
id: admin/term/permission
title: 権限とロール
kind: term
service: admin
sources:
  - libs/common/src/auth/roles.ts
  - libs/common/src/auth/permissions.ts
sources_hash: 73765a58ff966d17bfd2eb108f1c2ba488605bd3ff246cc2882eb6c696846074
terms: [admin/term/api-error]
related_cards: [admin/screen/dashboard, admin/screen/errors, admin/screen/error-detail, admin/api/errors, admin/api/notify]
---

# 権限とロール

Admin の画面と API は、ログインした利用者のロールが持つ 2 つの権限で、使える機能を分ける。

## 説明

| 権限 | できること | 持つロール |
|---|---|---|
| `notifications:write` | Web Push の購読の登録と解除。ダッシュボードの「通知設定」カードの表示 | `admin` |
| `errors:read` | エラー履歴の一覧と詳細の閲覧。ダッシュボードの「エラー履歴」カードの表示 | `admin` |

- ロールが持つ権限は、コード (`ROLES`) に書かれている。ロールごとの権限を足し合わせて判定する。知らないロール ID は、権限を持たないものとして扱う
- `user-manager` など `admin` 以外のロールは、どちらの権限も持たない
- ダッシュボード自体は、ログインしていれば権限がなくても開ける
- API は、未ログインなら 401 (`UNAUTHORIZED`)、権限がなければ 403 (`FORBIDDEN`) を返す。本文の形は [API のエラー応答](./api-error.md)
- 画面は、権限がなければ「アクセス権限がありません」を出す。権限のないカードはダッシュボードに出さない
- `/api/health`、`/api/notify/vapid-key`、`/api/notify/sns` は権限を見ない (ログインの要否は各カードを参照)

## 関連するカード

- [ダッシュボード画面](../screen/dashboard.md): 権限でカードを出し分ける
- [エラー履歴一覧画面](../screen/errors.md)・[エラー詳細画面](../screen/error-detail.md): `errors:read` がないと開けない
- [エラー履歴 API](../api/errors.md)・[Push 購読 API](../api/notify.md): 権限を確かめる
