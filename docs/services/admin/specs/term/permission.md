---
sources:
  - services/admin/web/src/app/(protected)/dashboard/page.tsx
  - services/admin/web/src/components/dashboard/DashboardRoleCards.tsx
  - services/admin/web/src/app/(protected)/errors/page.tsx
  - services/admin/web/src/app/(protected)/errors/[eventId]/page.tsx
  - services/admin/web/src/app/api/errors/route.ts
  - services/admin/web/src/app/api/errors/[eventId]/route.ts
  - services/admin/web/src/app/api/notify/subscribe/route.ts
  - services/admin/web/src/middleware.ts
sources_hash: 78a790982f31137b0742ce82e6dd25d6a83e0a6427ba2caa881af5348cdf79cf
---

# 権限とロール

Admin の画面と API は、ログインした利用者のロールが持つ 3 つの権限で、使える機能を分ける。どのロールがどの権限を持つかは、[ロールと権限](../../../../platform/specs/lib/common/roles-and-permissions.md)にある。

## 説明

| 権限 | できること |
|---|---|
| `users:read` | Admin の画面 (`/forbidden` を除く) を開く。現在、`admin` と `user-manager` が持つ |
| `notifications:write` | Web Push の購読の登録と解除。ダッシュボードの「通知設定」カードの表示 |
| `errors:read` | エラー履歴の一覧と詳細の閲覧。ダッシュボードの「エラー履歴」カードの表示 |

- 判定は、ロールではなく権限で行う。ロールが持つ権限を足し合わせ、知らないロール ID は権限なしとして扱う ([ロールと権限](../../../../platform/specs/lib/common/roles-and-permissions.md))
- `users:read` は、すべての画面の手前でミドルウェアが確かめる。なければ、元のパスと検索文字列を `from` に付けて[権限なし画面](../screen/forbidden.md)へリダイレクトする。`/forbidden` 自身と `/api` 配下はこの判定の対象外
- ダッシュボードは、権限のないカードを出さない
- 画面は、`errors:read` がなければ「アクセス権限がありません」を出す。対象は[エラー履歴一覧](../screen/errors.md)と[エラー詳細](../screen/error-detail.md)
- API は、未ログインなら 401 (`UNAUTHORIZED`)、権限がなければ 403 (`FORBIDDEN`) を返す。本文の形は [API のエラー応答](./api-error.md)。対象は[エラー履歴 API](../api/errors.md)と [Push 購読 API](../api/notify.md) (登録と解除)
- `/api/health`、`/api/auth/*` ([システム系の API](../api/system.md))、`/api/notify/vapid-key` ([Push 購読 API](../api/notify.md))、`/api/notify/sns` は権限を見ない。`/api/notify/sns` は、ログインの代わりに SNS の署名と送信元のトピックを確かめる ([SNS 受信 API](../api/notify-sns.md))
