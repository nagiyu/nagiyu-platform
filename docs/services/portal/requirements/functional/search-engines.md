---
sources: []
---

# 検索エンジン向けの情報

検索エンジンが全ページを巡回し、内容を正しく理解できるようにする。SEO の流入は、サービスが解決する課題の 1 つである ([目的](../purpose.md))。

## 要件

- 全ページを、ビルド時に静的な HTML として生成する。クローラーがスクリプトを実行しなくても、内容を取得できるようにするため ([記事が公開されるまで](../../specs/flow/article-publishing.md))
- 各ページに、タイトル、説明文、OGP、Twitter カード、canonical URL を設定する
- ホームに `WebSite` と `Organization`、記事に `BlogPosting` と `BreadcrumbList` の構造化データ (JSON-LD) を埋め込む ([ホーム画面](../../specs/screen/home.md)、[記事詳細画面](../../specs/screen/tech-article.md))
- サイトマップを公開する。載せるのは、実在するページだけ ([サイトマップ](../../specs/api/sitemap.md))
- robots.txt を公開し、サイトマップの場所を示す ([robots.txt](../../specs/api/robots.md))

## やらないこと

なし
