---
id: admin/term/push-subscription
title: Web Push の購読
kind: term
service: admin
sources:
  - libs/common/src/push/types.ts
  - libs/common/src/push-subscription/subscription-id.ts
  - libs/common/src/push/bulk.ts
  - libs/common/src/push/client.ts
  - services/admin/core/src/notify/subscription-repository.ts
  - services/admin/core/src/notify/subscription-mapper.ts
  - services/admin/core/src/notify/subscription-types.ts
  - services/admin/core/src/notify/web-push-sender.ts
sources_hash: c506d3bf5a88eb27b5a60a669ccaa88d282ea39b47ee124464f7102ab814dc86
related_cards: [admin/flow/push-subscription, admin/flow/error-notification, admin/api/notify, admin/api/notify-sns, admin/batch/stream-handler, admin/screen/dashboard]
---

# Web Push の購読

管理者のブラウザが通知を受け取る宛先。`endpoint` (URL) と 2 つの鍵 (`keys.p256dh`、`keys.auth`) からなり、Admin 自身の DynamoDB テーブル (`nagiyu-admin-main-{env}`) に 1 件ずつ保存する。

## 説明

| 項目 | 内容 |
|---|---|
| `subscriptionId` | `endpoint` の SHA-256 の先頭 32 文字に `sub_` を付けた ID。同じ端末が登録し直しても、同じ項目を上書きする |
| `userId` | 登録した利用者の ID (セッションの利用者) |
| `endpoint`、`keys` | ブラウザが発行した宛先と鍵 |
| `createdAt`、`updatedAt` | 登録と更新の時刻 (epoch ミリ秒) |

- 通知を出すときは、保存されている購読を全件読み、すべてに順に送る。利用者や権限では絞らない
- 送ったときに、通知の送り先のサービスが 404 か 410 を返した購読は「無効」になり、送信の直後に削除する。無効の判定は、状態コードがなければ、エラーのメッセージに 404 か 410 を含むかで補う
- 無効以外の送信の失敗は、ほかの購読への送信を止めずに、警告ログに残す。呼び出し元には「失敗した件数」として返る
- 読めない項目 (属性の欠けなど) は、通知の配信を止めないよう除外し、件数と内訳 (先頭 10 件まで) をエラーログに出す
- 削除は `endpoint` で引く。同じ `endpoint` の項目をすべて消し、消した件数を返す
- 送信には VAPID 鍵 (環境変数 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`) が要る。どちらかが空だと、送信の部品を作る時点で失敗する

## 関連するカード

- [Push 購読の経路](../flow/push-subscription.md): 登録から失効まで
- [Push 購読 API](../api/notify.md): 登録と解除
- [SNS 受信 API](../api/notify-sns.md)・[stream-handler](../batch/stream-handler.md): 購読すべてに送る
- [エラー通知の経路](../flow/error-notification.md): 通知が届くまでの全体
