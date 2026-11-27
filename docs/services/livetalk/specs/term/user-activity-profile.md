---
sources:
  - services/livetalk/core/src/entities/lifecycle.entity.ts
  - services/livetalk/core/src/constants.ts
sources_hash: d8c80c13b72af3055545cd9120be8d6fd27e1ed12b135cb088a46800843b9c99
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
