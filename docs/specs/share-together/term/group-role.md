---
id: share-together/term/group-role
title: グループの立場 (オーナーとメンバー)
kind: term
service: share-together
sources:
  - services/share-together/core/src/types/index.ts
  - services/share-together/core/src/libs/group.ts
  - services/share-together/web/src/lib/api/authorization.ts
sources_hash: cddc5a54a7d0ac74a2557765a321eb9fcf707b649ce200b8577505a83dd27330
terms: [platform/term/role]
related_cards: [share-together/term/invitation, share-together/api/groups, share-together/api/group-members, share-together/screen/groups]
related_adr:
  - services/share-together/architecture.md#2.12 共有リスト編集の権限を全承認済みメンバーに付与する
---

# グループの立場 (オーナーとメンバー)

グループの中での利用者の立場。グループごとに決まり、そのグループで何ができるかを分ける。プラットフォーム全体の[ロールと権限](../../platform/term/role.md)とは別のもので、Share Together はロールの権限を判定に使わない。

## 説明

| 立場 | 内容 |
|---|---|
| オーナー (`OWNER`) | グループを作った人。1 グループに 1 人 |
| メンバー (`MEMBER`) | 招待を承認して入った人 |

メンバーシップ (利用者とグループの結び付き) は、立場のほかに[招待](./invitation.md)の状態 (`PENDING`、`ACCEPTED`、`REJECTED`) を持つ。グループの操作ができるのは、状態が `ACCEPTED` の利用者だけである。

| できること | オーナー | メンバー |
|---|---|---|
| グループの共有リストと ToDo を読む・作る・変える・消す | できる | できる |
| グループのメンバー一覧を読む | できる | できる |
| グループの名前を変える、グループを削除する | できる | できない (403 `OWNER_ONLY`) |
| メンバーを招待する | できる | できない (403 `OWNER_ONLY`) |
| ほかのメンバーを外す | できる | できない (403 `OWNER_ONLY`) |
| 自分から抜ける (脱退) | できない (403 `OWNER_CANNOT_LEAVE`) | できる |

- グループの人数は、オーナーを含めて 5 名まで。承認済みのメンバーと、期限内の招待中の人を合わせて数える (承認のときは、承認済みだけを数える)
- オーナーかどうかは、グループの操作では、グループの `ownerUserId` と自分の ID の一致で決める。グループの一覧が返す「自分がオーナーか」は、メンバーシップの立場で決める
- 共有リストの操作はメンバーに制限がなく、立場による違いはない

## 関連するカード

- [招待](./invitation.md): メンバーシップの状態と期限
- [グループ画面](../screen/groups.md): 立場による表示の違い
- [メンバー API](../api/group-members.md): 招待・除外・脱退の条件
