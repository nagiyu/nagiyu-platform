---
id: auth/term/role-grant
title: 課金の権利
kind: term
service: auth
sources:
  - libs/common/src/auth/role-grants.ts
  - services/auth/web/src/lib/role-grants.ts
  - services/auth/web/src/lib/stripe-customer-unlink.ts
  - services/auth/core/src/billing/grant-diff.ts
  - services/auth/core/src/billing/sync.ts
sources_hash: 986085c6b7f1ab672b880a76b14488749305f5b2f642cf789cbff487d08c7b75
terms: [platform/term/role]
related_cards: [auth/screen/user-edit, auth/screen/plans, auth/api/users, auth/flow/billing-entitlement]
related_adr:
  - services/auth/architecture.md#ADR-002
  - services/auth/architecture.md#ADR-007
---

# 課金の権利

出どころと有効期限を持つ、ユーザーの有料ロールの付与。手動で付けたロールとは別に持つ。

## 説明

| 項目 | 内容 |
|---|---|
| ロール | 付与するロール ID (有料ロール) |
| 出どころ | `manual` (管理者が付ける)、`stripe` (Stripe の契約から作る) |
| 有効期限 | この時刻を過ぎると無効。手動では必須。ちょうどの時刻は無効 |
| 取り消し | 取り消した時刻。取り消した権利も経緯のために残す |
| メモ | 手動ならメモ (200 文字まで)、Stripe なら契約 ID |

- 状態は、取り消されていれば「取り消し」、そうでなく期限を過ぎていれば「期限切れ」、それ以外は「有効」。取り消しが期限より優先される
- 利用者の有効なロールは、手動ロールと、有効な権利のロールを合わせたもの (重複は除く)
- 手動の権利は管理画面から付ける・期限を変える・取り消す。Stripe 由来の権利は、Stripe との同期だけが書き換え、管理画面からは変えられない
- Stripe 由来の権利の期限は、契約の請求期間の終わり + 3 日。同期のたびに更新する
- Stripe の顧客との対応を外すと、Stripe 由来の有効な権利は同じ書き込みで取り消される

## 関連するカード

- [ユーザー編集画面](../screen/user-edit.md)・[ユーザー API](../api/users.md): 手動の権利を変える
- [プラン画面](../screen/plans.md): 手動の権利を「運営による付与」として出す
- [契約がロールになる経路](../flow/billing-entitlement.md): Stripe 由来の権利を作る
