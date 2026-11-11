---
id: share-together/api/group-lists
title: 共有リスト API
kind: api
service: share-together
sources:
  - services/share-together/web/src/app/api/groups/[groupId]/lists/route.ts
  - services/share-together/web/src/app/api/groups/[groupId]/lists/[listId]/route.ts
  - services/share-together/web/src/lib/api/authorization.ts
  - services/share-together/core/src/libs/sort.ts
sources_hash: 5a350e64a221e95ecadfb9fd02d2ab4fe658340678e8bbd0fcd7aea885a6f651
terms: [share-together/term/shared-list, share-together/term/group-role, share-together/term/api-error]
related_cards: [share-together/screen/lists, share-together/screen/groups, share-together/api/group-todos, share-together/api/groups]
related_adr:
  - services/share-together/architecture.md#2.12 共有リスト編集の権限を全承認済みメンバーに付与する
---

# 共有リスト API

グループの[共有リスト](../term/shared-list.md)の一覧、作成、名前の変更、削除。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| GET | `/api/groups/{groupId}/lists` | グループの承認済みメンバー |
| POST | `/api/groups/{groupId}/lists` | 同上 |
| PUT | `/api/groups/{groupId}/lists/{listId}` | 同上 |
| DELETE | `/api/groups/{groupId}/lists/{listId}` | 同上 |

オーナーとメンバーで違いはない ([グループの立場](../term/group-role.md))。

## 入力と出力

- 一覧は `{ data: { lists: [...] } }`。作成の古い順。リストは `listId`、`groupId`、`name`、`createdBy`、`createdAt`、`updatedAt`
- 作成と変更の入力は `{ name }`。前後の空白を除いて 1〜100 文字。作成は 201 でリストを `{ data: リスト }` で返す (`createdBy` は自分の ID、リスト ID はランダムな UUID)。変更は 200 で更新後のリストを返す
- 削除は 204 で本文はない。リストの ToDo を先に消してからリストを消す
- 1 グループが持てる数に上限はない

## エラー

| 条件 | 状態 | `error` |
|---|---|---|
| 未ログイン | 401 | `UNAUTHORIZED` |
| パスの ID が空 | 400 | `VALIDATION_ERROR` |
| 本文が不正、`name` が空白だけ・100 文字超 | 400 | `VALIDATION_ERROR` (文言は「リスト名は1〜100文字で入力してください」。本文が不正なときは既定の文言) |
| 承認済みのメンバーでない (招待中・拒否済み・メンバーシップなしを含む) | 403 | `FORBIDDEN` |
| リストがない (変更・削除) | 404 | `NOT_FOUND` |

- 形は[API のエラー応答](../term/api-error.md)。

## つながり

```mermaid
flowchart TD
    S1[リスト画面<br/>共有リスト] -->|一覧・作成・変更・削除| A[共有リスト API]
    S2[グループ画面] -->|一覧・作成| A
    A -->|メンバーの確認| M[(メンバーシップ)]
    A --> L[(共有リスト)]
    A -->|削除のとき| T[(ToDo)]
```
