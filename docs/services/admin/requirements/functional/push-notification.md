---
sources: []
---

# Push 通知

運用者の端末を通知の購読として登録し、エラーが記録されたときに Push で知らせる。ユースケースは[ダッシュボードから通知を有効にする](../use-cases/subscribe-notifications.md)と[エラーが記録されると Push が届く](../use-cases/receive-error-notification.md)。

## 要件

- `notifications:write` 権限を持つ運用者が、ダッシュボードから、自分の端末の通知を有効にできる ([Push 購読の経路](../../specs/flow/push-subscription.md))
- 通知の購読の登録と解除は、`notifications:write` 権限を持つ運用者だけが行える ([Push 購読 API](../../specs/api/notify.md))
- エラーが記録されたとき、通知を購読している端末すべてに、そのエラーの Push を送る ([stream-handler](../../specs/batch/stream-handler.md))
- 通知をタップすると、ダッシュボードを介さずに、そのエラーの詳細が開く ([エラー詳細のキー](../../specs/term/error-event-key.md))
- 使えなくなった購読は、送るときに取り除く
- 通知の送信に失敗しても、エラーの記録には影響しない

## やらないこと

- **ダッシュボードから通知を無効にすること**: 購読の解除は API では行えるが、ダッシュボードには操作がない
- **通知の履歴を見る画面**: 通知は、エラーの履歴と対応する。通知だけを別に残さない
- **通知の絞り込みの設定**: どのエラーを通知するかを選ばない。記録されたエラーすべてを通知する
- **Admin 以外のサービスの利用者への Push**: Push の送り先は、Admin に登録された購読だけ
