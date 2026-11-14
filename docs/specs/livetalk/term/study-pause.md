---
id: livetalk/term/study-pause
title: 勉強の停止 (3 日ルール)
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/study/active-window.ts
  - services/livetalk/core/src/constants.ts
sources_hash: 5c86cd6cde8d5c4e6de7e9612ab3db46d206ca336737ad7d774f9b3a5f8ff525
related_cards: [livetalk/batch/acquire, livetalk/batch/notify]
related_adr:
  - services/livetalk/architecture.md#2.25
  - services/livetalk/architecture.md#2.27
---

# 勉強の停止 (3 日ルール)

利用者が 72 時間以上話しかけていないキャラクターの勉強と、話題を使う通知を止める決まり。

## 説明

- 利用者の最後の発話からちょうど 72 時間たった時点で止まる。発話が一度もなければ止まっている。キャラクターの発話は「話した」に数えない
- 話しかけると、次のバッチの回から再開する
- 止まっている間の挙動

| バッチ | 挙動 |
|---|---|
| 勉強バッチ | その組を全部飛ばす。1 日の枠を等分する「勉強中の人数」にも数えない |
| 通知バッチ | 話題を使わない。重要通知は出さず、平常通知は話題名の入らない文面だけにする |

## 関連するカード

- [勉強バッチ](../batch/acquire.md)
- [通知バッチ](../batch/notify.md)
