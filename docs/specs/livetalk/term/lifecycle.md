---
id: livetalk/term/lifecycle
title: lifecycle (生活サイクル)
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/entities/lifecycle.entity.ts
  - services/livetalk/core/src/lifecycle/state-resolver.ts
  - services/livetalk/core/src/constants.ts
sources_hash: 44b42e3c6280856c8c81092c843a0784f04d4b8e9fce6c87841dbd0d81544a73
terms: [livetalk/term/user-activity-profile]
related_cards: [livetalk/batch/learn-user-activity, livetalk/batch/acquire, livetalk/batch/notify, livetalk/api/lifecycle]
related_adr:
  - services/livetalk/architecture.md#2.6
---

# lifecycle (生活サイクル)

利用者 × キャラクターごとの、キャラクターの就寝・起床時刻と、[活動時間プロファイル](./user-activity-profile.md) をまとめたもの。

## 説明

- 就寝時刻の既定は 01:30、起床時刻の既定は 09:30 (日本時間)。就寝から起床までの間が「就寝中」で、0 時をまたぐ設定も扱う
- 作るのは、週次の[活動時間学習バッチ](../batch/learn-user-activity.md)だけである。直近 30 日に利用者の発話が 5 件以上あった組に、既定の時刻で作る。それまでは lifecycle がなく、勉強バッチと通知バッチはその組を対象にしない
- 学習のたびに、キャラクターの起床・就寝時刻は利用者の活動に合わせて少しずつずれる
- 就寝中は、勉強バッチがその回を飛ばし、通知バッチは重要通知を含めて送らない

## 関連するカード

- [活動時間学習バッチ](../batch/learn-user-activity.md): 作る・更新する
- [勉強バッチ](../batch/acquire.md)、[通知バッチ](../batch/notify.md): 就寝中の判定に使う
- [生活サイクル API](../api/lifecycle.md): 今の状態を返す
