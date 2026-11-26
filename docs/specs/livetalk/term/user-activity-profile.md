---
id: livetalk/term/user-activity-profile
title: 活動時間プロファイル
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/entities/lifecycle.entity.ts
  - services/livetalk/core/src/constants.ts
sources_hash: 94dfdf85e9d6a6470a1f601ac98f0b515a678656e6e58cbde3503a4a02b5e201
terms: [livetalk/term/lifecycle]
related_cards: [livetalk/batch/learn-user-activity, livetalk/batch/acquire, livetalk/batch/notify]
related_adr:
  - services/livetalk/architecture.md#2.11
---

# 活動時間プロファイル

利用者がよく話しかける時間帯。朝のピークと夜のピークを「HH:00」の形で持つ。[lifecycle](./lifecycle.md) の一部である。

## 説明

- 週次の[活動時間学習バッチ](../batch/learn-user-activity.md)が、過去の発話から求めて書く。未学習の間は持たない
- ピークの前後は「利用者が活動している時間」とみなす

| 使うバッチ | 使い方 |
|---|---|
| 勉強バッチ | ピークの前後 2 時間は、自発リサーチをしない (時 (hour) 単位の差で判定) |
| 通知バッチ | ピークの前後 90 分以内にだけ、平常通知を送る |

- 未学習のときは、どちらの制限もかけない

## 関連するカード

- [活動時間学習バッチ](../batch/learn-user-activity.md): 書く
- [勉強バッチ](../batch/acquire.md)、[通知バッチ](../batch/notify.md): 読む
