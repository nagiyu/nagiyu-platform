---
sources:
  - services/admin/core/src/notify/subscription-repository.ts
  - services/admin/core/src/notify/subscription-types.ts
  - services/admin/core/src/notify/web-push-sender.ts
sources_hash: c5447c5016aad0ceafe5f3c8271c4ccb4bf09a2bbe7086d3732c1977467de501
---

# Web Push の購読

管理者のブラウザが通知を受け取る宛先。`endpoint` (URL) と 2 つの鍵 (`keys.p256dh`、`keys.auth`) からなり、Admin 自身のテーブルに 1 件ずつ保存する。保存の形 (キー、属性) は [Admin のテーブル](../data/main-table.md)にある。

## 説明

| 項目 | 内容 |
|---|---|
| `subscriptionId` | `endpoint` から決まる ID。同じ端末が登録し直しても、同じ項目を上書きする ([Web Push](../../../../platform/specs/lib/common/web-push.md)) |
| `userId` | 登録した利用者の ID (セッションの利用者) |
| `endpoint`、`keys` | ブラウザが発行した宛先と鍵 |
| `createdAt`、`updatedAt` | 登録と更新の時刻 (epoch ミリ秒) |

- 通知を出すときは、保存されている購読を全件読み、すべてに順に送る。利用者や権限では絞らない。送る側は[stream-handler](../batch/stream-handler.md)と [SNS 受信 API](../api/notify-sns.md)
- 送り方と、購読が「無効」になる条件 (送り先の 404 / 410、許可されない `endpoint`) は [Web Push](../../../../platform/specs/lib/common/web-push.md) にある。無効な購読は、送信の直後に削除する。削除は `endpoint` で引き、同じ `endpoint` の項目をすべて消す
- 無効以外の送信の失敗は、ほかの購読への送信を止めずに、警告ログに残す。呼び出し元には「失敗した件数」として返る
- 読めない項目 (属性の欠けなど) は、通知の配信を止めないよう除外し、件数と内訳 (先頭 10 件まで) をエラーログに出す
- 送信には VAPID 鍵 (環境変数 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`) が要る。どちらかが空だと、送信の部品を作る時点で失敗する。鍵の置き場所は[シークレット](../resource/secrets.md)にある
- 登録から失効までの流れは [Push 購読の経路](../flow/push-subscription.md)、登録と解除の API は [Push 購読 API](../api/notify.md)
