---
id: platform/term/role
title: ロールと権限の定義
kind: term
service: platform
sources:
  - libs/common/src/auth/roles.ts
  - libs/common/src/auth/permissions.ts
sources_hash: 298df8d63a34ca8ef0d34edcc5a7a98cfae01950046b23e65ef3adc410efbc3a
related_cards: [auth/screen/user-edit, auth/api/users, auth/term/plan-tier]
---

# ロールと権限の定義

利用者に付ける「ロール」と、ロールが持つ「権限」の定義。コード (`libs/common`) に持ち、全サービスが同じ定義を使う。

## 説明

| ロール ID | 名前 | 権限 | 備考 |
|---|---|---|---|
| `admin` | 管理者 | `users:read`、`users:write`、`roles:assign`、`notifications:write`、`errors:read` | |
| `user-manager` | ユーザー管理者 | `users:read`、`users:write` | |
| `stock-viewer` | Stock 閲覧者 | `stocks:read` | |
| `stock-user` | Stock ユーザー | `stocks:read`、`stocks:write-own` | |
| `stock-admin` | Stock 管理者 | `stocks:read`、`stocks:write-own`、`stocks:manage-data` | |
| `livetalk-user` | LiveTalk ユーザー | `livetalk:chat` | |
| `livetalk-admin` | LiveTalk 管理者 | `livetalk:chat`、`livetalk:admin` | |
| `livetalk-standard` | LiveTalk スタンダード | `livetalk:standard` | 有料ロール |
| `quick-clip-standard` | Quick Clip スタンダード | `quick-clip:standard` | 有料ロール (下の段) |
| `quick-clip-pro` | Quick Clip プロ | `quick-clip:standard`、`quick-clip:pro` | 有料ロール (上の段) |
| `quick-clip-unlimited` | Quick Clip 使い放題 | `quick-clip:unlimited` | 手動ロール。課金とは結びつけない |
| `billing-tester` | 課金のテスト | `billing:test` | 手動ロール。課金とは結びつけない |

- 権限の名前は `{リソース}:{操作}`。利用者の権限は、持っているロールの権限を足し合わせたもの。知らないロール ID は権限を持たないものとして扱う
- 有料ロールは、サービスごとの[段](../../auth/term/plan-tier.md)を表し、課金の権利として付けられる。それ以外のロールは手動で付ける。有料ロールを手動ロールに入れることはできない
- ロールの付け方は 2 つある。管理者が手動で付けるロールと、[課金の権利](../../auth/term/role-grant.md)として付くロール。利用者のロールは両方を合わせたものになる
- 画面と API は、ロールではなく権限で通すかを決める。サービスごとの権限は、各サービスの権限のカード ([Admin](../../admin/term/permission.md)、[Stock Tracker](../../stock-tracker/term/permission.md)) と、Auth の画面・API のカードにある

## 関連するカード

- [ユーザー編集画面](../../auth/screen/user-edit.md): 手動で付けられるロール (有料ロールを除く) を割り当てに並べる
- [ユーザー API](../../auth/api/users.md): ロール ID の検証に使う。有料ロールは手動ロールに入れられない
