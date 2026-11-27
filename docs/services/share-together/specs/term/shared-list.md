---
sources:
  - services/share-together/core/src/types/index.ts
  - services/share-together/core/src/libs/sort.ts
  - services/share-together/web/src/app/api/groups/[groupId]/lists/route.ts
sources_hash: 8d7f3883723b59a92581e0803c1e57d046e59ed6b11d48b12babc025a4cc99ed
---

# 共有リスト

グループに属する ToDo のリスト。グループの承認済みメンバーなら誰でも、リストの作成・名前の変更・削除と、ToDo の操作ができる。

## 説明

- リストは、リスト ID、グループ ID、名前、作成した人 (`createdBy`) を持つ。名前は 1〜100 文字 (前後の空白を除く)
- 1 グループが持てる数に上限はない。一覧は作成の古い順に並ぶ
- リストを削除すると、その ToDo も消える
- ToDo は[個人リスト](./personal-list.md)と同じ形で、完了した人 (`completedBy`) は共有リストでも持つ
- 画面では、リスト画面の「共有」の表示範囲に出る ([リスト画面](../screen/lists.md))。グループ画面からも作成し、開ける
