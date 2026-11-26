---
sources:
  - libs/common/src/auth/roles.ts
  - services/auth/web/src/lib/plans.ts
  - services/auth/core/src/billing/checkout.ts
  - services/auth/core/src/billing/sync.ts
sources_hash: fcbd3583f6bb67a4ab15e3c362ac1976abbbc2a781bccd4d6d5d33105b830145
---

# プランの段

有料サービスの中の、価格の違う選択肢。1 つの段が 1 つの有料ロールに対応する。

## 説明

| サービス | 段 (下から順) |
|---|---|
| LiveTalk | `livetalk-standard` |
| Quick Clip | `quick-clip-standard`、`quick-clip-pro` |

- 契約は、段ではなくサービスの単位。同じサービスで同時に有効な契約は 1 つで、別の段へは「切り替え」で移る (申し込みでは断る)
- 段の順位は、有料ロールの定義が持つ ([ロールと権限](../../../../platform/specs/lib/common/roles-and-permissions.md))。上の段は、下の段の権限も含む
- 価格はコードに持たず、Stripe の価格で持つ。価格の `lookup_key` を有料ロール ID にそろえて、段と結びつける。Stripe に価格がない段は、売っていないものとして扱う
- 上げは Stripe の確認画面で即時に切り替え ([プラン画面](../screen/plans.md)・[課金 API](../api/billing.md))、下げは請求期間の終わりに切り替わる予約を作る (返金はない)。契約から段のロールが付く経路は[契約がロールになる経路](../flow/billing-entitlement.md)

## 理由

- 有料ロールの ID を Stripe の価格の `lookup_key` とそろえる。対応表を持たずに、段と有料ロールの対応を Stripe の管理画面で変えられる
- 有料ロールと契約をサービスごとに持つ。利用者はサービスごとに申し込み、契約・更新日・解約もサービスごとに独立する。複数のサービスに申し込むと、契約も請求もサービスの数だけ分かれる
- 価格はコードに持たず Stripe の価格で持つ。価格と説明の文言が Stripe の 1 か所になり、画面の表示が Stripe と食い違わない。特定商取引法に基づく表記も金額を持たず、プラン画面へ案内する
- 段ごとに商品を分け、それぞれに価格を付ける。Customer Portal の切り替えの一覧に、同じ商品で請求期間の同じ価格を 2 つ並べられないため。段の説明は商品の説明に持つ
- 上の段が下の段の権限を含む。サービスは「この権限があるか」だけで段の機能を出し分けられ、手動の権利と契約が重なっても、上の権限から順に見れば段が決まる
