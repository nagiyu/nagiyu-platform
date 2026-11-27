---
sources:
  - libs/common/src/auth/role-grants.ts
  - services/auth/web/src/lib/role-grants.ts
  - services/auth/web/src/lib/role-grant-editing.ts
  - services/auth/web/src/lib/stripe-customer-unlink.ts
  - services/auth/core/src/billing/grant-diff.ts
  - services/auth/core/src/billing/sync.ts
sources_hash: b12cc728e9e649a560e8a96d2f8b6a5d99ddaf86f361bf1d866cf55b9a6acb40
---

# 課金の権利

出どころと有効期限を持つ、ユーザーの有料ロールの付与。手動で付けたロールとは別に持つ。項目と、状態の判定・有効なロールの算出は[課金の権利 (共通ライブラリ)](../../../../platform/specs/lib/common/role-grants.md)にある。

## 説明

- 出どころは `manual` (管理者が付ける) と `stripe` (Stripe の契約から作る)。手動の権利は、有効期限が必須で、メモ (200 文字まで) を付けられる。Stripe 由来の権利は、メモ (`sourceRef`) に契約 ID を持つ
- 手動の権利は、[ユーザー編集画面](../screen/user-edit.md)と[ユーザー API](../api/users.md)から付ける・期限を変える・取り消す。[プラン画面](../screen/plans.md)は、手動の権利を「運営による付与」として出す。Stripe 由来の権利は、Stripe との同期だけが書き換え、管理画面からは変えられない
- Stripe 由来の権利の期限は、契約の請求期間の終わり + 3 日。同期のたびに更新する ([契約がロールになる経路](../flow/billing-entitlement.md))
- Stripe の顧客との対応を外すと、Stripe 由来の有効な権利は同じ書き込みで取り消される
- 取り消した権利も、経緯のために消さず残す

## 理由

- 課金で付くロールを手動ロールと同じ一覧に混ぜると、解約や期限切れで外すときに、管理者が手で付けたロールまで外しかねない。そのため手動ロールとは別の権利として、ロール・出どころ・有効期限を持たせる
- 出どころを分けると、Stripe との同期は Stripe 由来の権利だけを書き換え、手動の付与に触れずに済む。Stripe 由来の権利を管理画面で変えられなくするのは、Stripe 上の契約と食い違わないようにするため
- 手動の権利で有効期限を必須にする。Stripe 以外で受けた支援に手で有料ロールを付けても、外し忘れが起きない
- 取り消した権利を残すのは、管理画面で経緯を読めるようにするため
