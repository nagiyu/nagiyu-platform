---
id: auth/term/plan-tier
title: プランの段
kind: term
service: auth
sources:
  - libs/common/src/auth/roles.ts
  - services/auth/web/src/lib/plans.ts
sources_hash: 16ecd322307f662fec99177cf025483adeca7d1a2ee5d1adcca42ffa656f58ba
terms: [platform/term/role]
related_cards: [auth/screen/plans, auth/api/billing, auth/flow/billing-entitlement]
related_adr:
  - services/auth/architecture.md#ADR-009
  - services/auth/architecture.md#ADR-013
---

# プランの段

有料サービスの中の、価格の違う選択肢。1 つの段が 1 つの有料ロールに対応する。

## 説明

| サービス | 段 (下から順) |
|---|---|
| LiveTalk | `livetalk-standard` |
| Quick Clip | `quick-clip-standard`、`quick-clip-pro` |

- 契約は、段ではなくサービスの単位。同じサービスで同時に有効な契約は 1 つで、別の段へは「切り替え」で移る (申し込みでは断る)
- 段の順位は、有料ロールの定義が持つ。上の段は、下の段の権限も含む
- 価格はコードに持たず、Stripe の価格で持つ。価格の `lookup_key` を有料ロール ID にそろえて、段と結びつける。Stripe に価格がない段は、売っていないものとして扱う
- 上げは Stripe の確認画面で即時に切り替え、下げは請求期間の終わりに切り替わる予約を作る (返金はない)

## 関連するカード

- [プラン画面](../screen/plans.md): 段をカードで並べる
- [課金 API](../api/billing.md): 申し込みと切り替え
- [契約がロールになる経路](../flow/billing-entitlement.md): 契約から段のロールを付ける
