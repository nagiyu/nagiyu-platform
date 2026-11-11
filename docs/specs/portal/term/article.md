---
id: portal/term/article
title: 記事
kind: term
service: portal
sources:
  - services/portal/web/src/types/content.ts
  - services/portal/web/src/lib/content.ts
sources_hash: 1ee815696d72c25a1945004148dd19a91ae534d59f8b8121059ec8470263d201
related_cards: [portal/flow/article-publishing, portal/screen/tech-article]
---

# 記事

Portal が載せる技術記事 1 本。Markdown ファイル 1 つで、先頭のフロントマターが記事の情報になる。

## 説明

| フロントマター | 必須 | 内容 |
|---|---|---|
| `title` | 必須 | 題名 |
| `description` | 必須 | 概要。一覧のカードと、記事の冒頭に出る |
| `publishedAt` | 必須 | 公開日。`2026-07-01` のような文字列で、画面にもそのまま出る。一覧の並び順に使う |
| `tags` | 必須 | [タグ](./tag.md)の配列 |
| `updatedAt` | 任意 | 最終更新日。サイトマップの更新日にも使う |
| `author` | 任意 | 著者名。なければ「なぎゆー」 |
| `categories` | 任意 | [カテゴリ](./category.md)の slug の配列 |
| `featured` | 任意 | `true` なら[特集記事](./featured.md) |
| `slug` | (書くが使わない) | URL の識別子はファイル名で決まり、フロントマターの値は使わない |

- 記事は `services/portal/web/src/content/tech/` の `{slug}.md`。URL は `/tech/{slug}`。slug はファイル名から `.md` を除いたもの
- 本文は Markdown。表などの GFM が使え、生の HTML タグは出力に残らない。変換した HTML は DOMPurify でサニタイズしてから描画する
- フロントマターの必須項目を検査する仕組みはない

## 関連するカード

- [記事が公開されるまで](../flow/article-publishing.md)
- [記事詳細画面](../screen/tech-article.md)
