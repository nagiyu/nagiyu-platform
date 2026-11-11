---
id: portal/term/tag
title: タグ
kind: term
service: portal
sources:
  - services/portal/web/src/lib/content.ts
  - services/portal/web/src/app/tech/page.tsx
  - services/portal/web/src/app/tech/[slug]/page.tsx
  - services/portal/web/src/lib/redirects.ts
sources_hash: 5dfcab237cb1f7c9cf8884db193d9f2f145b2129e7d552b02e150242c1912cb8
terms: [portal/term/article]
related_cards: [portal/screen/home, portal/screen/tech, portal/screen/tech-article]
---

# タグ

[記事](./article.md)の話題を表す短い語。カードと記事詳細に枠線だけのチップで出て、関連記事を選ぶ手がかりになる。

## 説明

- チップは押せない。タグで絞り込む画面はなく、`/tech/tags/...` の URL は `/tech` へリダイレクトする
- 関連記事は、タグが 1 つ以上同じ記事から選ぶ。大文字と小文字を区別し、`AI` と `ai` は別のタグ
- カードに出るタグの数は、トップページの特集記事だけが先頭の 3 つまで。ほかは全部

## 関連するカード

- [ホーム画面](../screen/home.md)
- [技術記事一覧画面](../screen/tech.md)
- [記事詳細画面](../screen/tech-article.md): 関連記事の選び方
