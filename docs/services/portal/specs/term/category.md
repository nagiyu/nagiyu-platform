---
sources:
  - services/portal/web/src/lib/content.ts
  - services/portal/web/src/app/tech/page.tsx
  - services/portal/web/src/app/tech/[slug]/page.tsx
  - services/portal/web/src/lib/redirects.ts
sources_hash: 8626f8b8115e92120b7a6b4e0aa8606578d6f31f7fc28a16bda2eb4f2d59e9df
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
- ラベルは[技術記事一覧画面](../screen/tech.md)のカードと、[記事詳細画面](../screen/tech-article.md)に出る。トップページのカードには出ない
- チップは押せない。カテゴリ別の画面はなく、`/tech/category/...` の URL は `/tech` へリダイレクトする
- 記事の `categories` は任意。なければラベルの欄ごと出ない

## 理由

- 押せないラベルにして集約ページを持たない理由は、[目的](../../requirements/purpose.md)にある
