---
id: livetalk/term/notification-event
title: 通知の記録
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/entities/notification-event.entity.ts
  - services/livetalk/core/src/constants.ts
  - services/livetalk/web/src/app/api/push/first-word/route.ts
  - services/livetalk/web/src/app/api/push/pending/route.ts
sources_hash: 345d098b038c52bb59d0f0999fdb6c17939568e920b0af6109322ef2a77a1a8a
related_cards: [livetalk/batch/notify, livetalk/api/push-notification, livetalk/screen/home, livetalk/screen/status, livetalk/flow/notification-open]
---

# 通知の記録

キャラクターから利用者へ Web Push を送ったことの記録 (NotificationEvent)。通知バッチと、ステータス画面のテスト送信が書く。

## 説明

- 持ち物は、通知元のキャラクター、種別 (`normal` 平常、`critical` 重要)、題名、本文、元になった話題、返信の下書き (`suggestedReply`)、消化の日時
- 本文は、利用者がホーム画面を開いたときのキャラクターの「第一声」に使う。消化の日時があるものは、第一声にも未読の知らせにも出ない
- 30 日で自動削除する
- 1 日の上限や、反応のない通知を重ねたときの間隔の延長の数えは、この記録が元になる ([通知バッチ](../batch/notify.md))

## 関連するカード

- [通知バッチ](../batch/notify.md): 書く
- [通知まわりの API](../api/push-notification.md): 読む・消化する
- [通知から会話への経路](../flow/notification-open.md)
