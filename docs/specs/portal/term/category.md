---
id: portal/term/category
title: カテゴリ
kind: term
service: portal
sources:
  - services/portal/web/src/lib/content.ts
  - services/portal/web/src/app/tech/page.tsx
  - services/portal/web/src/app/tech/[slug]/page.tsx
  - services/portal/web/src/lib/redirects.ts
sources_hash: 5dfcab237cb1f7c9cf8884db193d9f2f145b2129e7d552b02e150242c1912cb8
terms: [portal/term/article]
related_cards: [portal/screen/tech, portal/screen/tech-article, portal/flow/article-publishing]
related_adr:
  - services/portal/architecture.md#ADR-004: 技術メディアへの単一目的化（サービスハブの撤去）を採択した理由
---

# カテゴリ

[記事](./article.md)の分類を示す表示用のラベル。塗りつぶしのチップで出る。

## 説明

| slug | 表示名 |
|---|---|
| `aws` | AWS |
| `nextjs` | Next.js |
| `dev-stack` | 開発スタック |

- 表の外の slug は、slug の文字列のまま表示する
- ラベルは技術記事一覧のカードと、記事詳細に出る。トップページのカードには出ない
- チップは押せない。カテゴリ別の画面はなく、`/tech/category/...` の URL は `/tech` へリダイレクトする
- 記事の `categories` は任意。なければラベルの欄ごと出ない

## 関連するカード

- [技術記事一覧画面](../screen/tech.md)
- [記事詳細画面](../screen/tech-article.md)
- [記事が公開されるまで](../flow/article-publishing.md)
