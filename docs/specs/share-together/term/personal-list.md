---
id: share-together/term/personal-list
title: 個人リスト
kind: term
service: share-together
sources:
  - services/share-together/core/src/types/index.ts
  - services/share-together/core/src/libs/list.ts
  - services/share-together/core/src/libs/sort.ts
  - services/share-together/web/src/app/api/users/route.ts
sources_hash: da9c1c2b4c1f0a6057c020bbba6eb672278f5a5a9ae3baa8fc1ac9ad87b90fd9
terms: [share-together/term/shared-list]
related_cards: [share-together/screen/lists, share-together/api/personal-lists, share-together/api/personal-todos, share-together/api/users]
---

# 個人リスト

利用者本人だけが見られる ToDo のリスト。ほかの人には共有されない。

## 説明

- リストは、リスト ID、持ち主の利用者 ID、名前、デフォルトかどうか (`isDefault`) を持つ。名前は 1〜100 文字 (前後の空白を除く)
- 初めてサービスを使うとき、「デフォルトリスト」が自動で 1 つ作られ、利用者の `defaultListId` に結び付く ([ユーザー API](../api/users.md))。デフォルトのリストは削除できない
- 1 人が持てるのは 100 件まで (デフォルトを含む)。超えると 409 `PERSONAL_LIST_LIMIT_EXCEEDED`
- 一覧は、デフォルトを先頭に、残りを作成の古い順に並べる。同じ時刻なら ID の文字列順
- リストを削除すると、その ToDo も先に消える
- ToDo は、タイトル (1〜200 文字、前後の空白を除く)、完了したか、作った人、完了した人 (完了にした人の ID。未完了に戻すと消える) を持つ。作成の古い順に返す

## 関連するカード

- [個人リスト API](../api/personal-lists.md)
- [個人 ToDo API](../api/personal-todos.md)
- [共有リスト](./shared-list.md): グループに属するリスト
