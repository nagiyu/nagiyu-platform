---
sources:
  - services/admin/web/src/app/(protected)/dashboard/page.tsx
  - services/admin/web/src/components/dashboard/DashboardRoleCards.tsx
  - services/admin/web/src/app/(protected)/errors/page.tsx
  - services/admin/web/src/app/(protected)/errors/[eventId]/page.tsx
  - services/admin/web/src/app/api/errors/route.ts
  - services/admin/web/src/app/api/errors/[eventId]/route.ts
  - services/admin/web/src/app/api/notify/subscribe/route.ts
sources_hash: 3668b276baf419c11c99c3a796d83f85991e80c4f660ae8830ce35504718e852
---

# 権限とロール

Admin の画面と API は、ログインした利用者のロールが持つ 2 つの権限で、使える機能を分ける。どのロールがどの権限を持つかは、[ロールと権限](../../../../platform/specs/lib/common/roles-and-permissions.md)にある。

## 説明

| 権限 | できること |
|---|---|
| `notifications:write` | Web Push の購読の登録と解除。ダッシュボードの「通知設定」カードの表示 |
| `errors:read` | エラー履歴の一覧と詳細の閲覧。ダッシュボードの「エラー履歴」カードの表示 |

- 判定は、ロールではなく権限で行う。ロールが持つ権限を足し合わせ、知らないロール ID は権限なしとして扱う ([ロールと権限](../../../../platform/specs/lib/common/roles-and-permissions.md))
- ダッシュボード自体は、ログインしていれば権限がなくても開ける。権限のないカードは出さない
- 画面は、権限がなければ「アクセス権限がありません」を出す。対象は[エラー履歴一覧](../screen/errors.md)と[エラー詳細](../screen/error-detail.md)
- API は、未ログインなら 401 (`UNAUTHORIZED`)、権限がなければ 403 (`FORBIDDEN`) を返す。本文の形は [API のエラー応答](./api-error.md)。対象は[エラー履歴 API](../api/errors.md)と [Push 購読 API](../api/notify.md) (登録と解除)
- `/api/health`、`/api/auth/*` ([システム系の API](../api/system.md))、`/api/notify/vapid-key` ([Push 購読 API](../api/notify.md))、`/api/notify/sns` は権限を見ない。`/api/notify/sns` は、ログインの代わりに SNS の署名と送信元のトピックを確かめる ([SNS 受信 API](../api/notify-sns.md))
