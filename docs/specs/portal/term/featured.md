---
id: portal/term/featured
title: 特集記事
kind: term
service: portal
sources:
  - services/portal/web/src/lib/content.ts
  - services/portal/web/src/components/HomeFeaturedSection.tsx
sources_hash: 2ac4c78de2d489148cb9cbc32ea9e72e72c76bd3d8782d263eaad1387b37d569
terms: [portal/term/article]
related_cards: [portal/screen/home, portal/flow/article-publishing]
---

# 特集記事

フロントマターに `featured: true` を持つ[記事](./article.md)。トップページの「特集記事」に出る。

## 説明

- 公開日の新しい順に最大 3 件を選ぶ。該当が 0 件でも例外にならず、トップページの「特集記事」の枠ごと出さない
- 特集かどうかは、トップページのカードのバッジ「特集」以外には現れない。一覧や記事詳細では、特集の記事も通常の記事と同じ見た目
- 特集の記事も「最新の技術記事」の対象で、新しければそちらにも出る

## 関連するカード

- [ホーム画面](../screen/home.md): 「特集記事」の枠
- [記事が公開されるまで](../flow/article-publishing.md): 特集を選ぶ段階
