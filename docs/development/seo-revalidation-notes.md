# SEO 再検証ノート（Portal）

本ドキュメントは、Portal の SEO（メタデータ・構造化データ・サイトマップ）の再検証に関するメモを記録する。
C2 作業（#3311）の完了後も、後続 PR マージ時の再検証手順として参照すること。

---

## 現状サマリ（C2 検証結果）

### メタデータ（title / description）

| ページ | title | description | 備考 |
|---|---|---|---|
| `/` | nagiyu - サービス一覧・技術ポータル | あり | layout.tsx と page.tsx で同一値を設定済み |
| `/about` | nagiyu について | あり | |
| `/privacy` | プライバシーポリシー | あり | |
| `/terms` | 利用規約 | あり | |
| `/services` | サービス一覧 | あり | |
| `/services/[slug]` | doc.title（動的） | doc.description（動的） | フォールバック: 'サービス' |
| `/services/[slug]/guide` | doc.title（動的） | doc.description（動的） | フォールバック: '使い方ガイド' |
| `/services/[slug]/faq` | doc.title（動的） | doc.description（動的） | フォールバック: 'FAQ' |
| `/tech` | 技術記事 | あり | |
| `/tech/[slug]` | article.title（動的） | article.description（動的） | フォールバック: '技術記事' |
| `/tech/category/[category]` | category.title（動的） | category.description（動的） | フォールバック: 'カテゴリ別ハブ' |
| `/tech/tags/[tag]` | `${tag} の記事一覧` | あり | |

**検出問題**: title/description の重複・欠落なし（C2 検証時点）。

### JSON-LD 整合性

| ページグループ | WebSite | Organization | BlogPosting | BreadcrumbList |
|---|---|---|---|---|
| `/`（トップ） | あり | あり | 不要 | 不要（単ページ） |
| `/tech/[slug]`（技術記事） | なし（トップのみ） | なし（トップのみ） | あり | あり |
| `/tech/category/[category]`（A2 ハブ） | なし | なし | 不要 | **あり（A2 で追加済み）** |
| `/tech/tags/[tag]`（タグページ） | なし | なし | 不要 | あり |
| `/services/[slug]`（サービス） | なし | なし | 不要 | あり |
| `/services/[slug]/guide` | なし | なし | 不要 | あり |
| `/services/[slug]/faq` | なし | なし | 不要 | あり |

**確認事項**:
- WebSite / Organization はトップページのみに出力（全ページへの重複出力は Schema.org 的に不要）
- A2 カテゴリハブ（`/tech/category/{slug}`）の BreadcrumbList は A2 PR で実装済み
  - ホーム → 技術記事 → {カテゴリタイトル} の 3 階層が正しく設定されている

### sitemap.xml 網羅性

`src/app/sitemap.ts` で以下を生成：

| カテゴリ | 件数（概算） | 備考 |
|---|---|---|
| 静的ページ | 6 | `/`, `/about`, `/privacy`, `/terms`, `/services`, `/tech` |
| サービスドキュメント | サービス数 × 3 | overview / guide / faq |
| 技術記事 | 記事ファイル数 | `getAllArticles()` より |
| タグページ | タグ数（記事 2 件以上・ASCII） | `getAllTags()` より |
| カテゴリハブ | 3（aws / nextjs / dev-stack） | `getAllTechCategoryMetas()` より |

**確認事項**:
- A2 ハブ（`/tech/category/{slug}`）は `categoryEntries` として sitemap に含まれている
- A5 で削除された記事はファイルが削除済みのため `getAllArticles()` から除外され、sitemap にも載らない

---

## A4 マージ後の再検証手順

**対象 PR**: #3448（`buildFAQPageJsonLd` 追加）

A4 が `integration/3262-portal-adsense-improvement` へマージされた後、以下を確認すること。

### 1. FAQPage JSON-LD の出力確認

- `/services/{slug}/faq` ページに `FAQPage` 型の JSON-LD が出力されているか確認
- 出力される `@context` が `https://schema.org` であること
- `mainEntity` に FAQ アイテムが含まれていること

### 2. テストの追加・更新

A4 マージ後、`seoValidation.ts` に `validateFAQPageJsonLd` 関数が追加された場合は、
対応するテストを `tests/unit/lib/seoValidation.test.ts` に追加すること。

### 3. sitemap への影響

FAQ ページ（`/services/{slug}/faq`）は C2 時点でも sitemap に含まれている。
A4 で sitemap 自体への変更がない場合は再確認不要。

---

## Rich Results Test 検証手順

Rich Results Test は外部ツール（Google Search Console）を使用するため、
ローカル環境や CI では実行できない。本番デプロイ後に以下の手順で確認すること。

### 手順

1. Google の Rich Results Test（https://search.google.com/test/rich-results）にアクセス
2. 以下の URL を順番に入力してテストを実行する:

   | ページ | 確認対象 JSON-LD |
   |---|---|
   | `https://nagiyu.com/` | WebSite, Organization |
   | `https://nagiyu.com/tech/{任意の記事 slug}` | BlogPosting, BreadcrumbList |
   | `https://nagiyu.com/tech/category/aws` | BreadcrumbList |
   | `https://nagiyu.com/tech/tags/{タグ}` | BreadcrumbList |
   | `https://nagiyu.com/services/{サービス slug}` | BreadcrumbList |
   | `https://nagiyu.com/services/{サービス slug}/faq` | BreadcrumbList（A4 マージ後は FAQPage も確認） |

3. 各ページで「有効なアイテムが検出されました」と表示されることを確認
4. エラーや警告がある場合は内容を記録し、Issue コメントで報告する

### ローカル確認の代替手段

Rich Results Test の代替として、ブラウザの開発者ツールで JSON-LD の出力内容を目視確認できる。

```
// ブラウザコンソールで実行
document.querySelectorAll('script[type="application/ld+json"]')
  .forEach(s => console.log(JSON.parse(s.textContent)));
```

---

## B1 マージ後の再確認事項

**対象 PR**: #3449（トップページ改修）

B1 が `integration/3262-portal-adsense-improvement` へマージされた後、以下を確認すること。

- `/`（トップページ）の metadata が B1 で変更されていないか確認
- トップページで WebSite / Organization JSON-LD が引き続き出力されているか確認
- 上記に変更があった場合は、C2 検証結果を更新する

---

## 関連 Issue・PR

| Issue/PR | 内容 | C2 への影響 |
|---|---|---|
| #3268（A2） | カテゴリハブ追加 | integration マージ済み。ハブ BreadcrumbList 実装確認済み |
| #3276（A4）/ PR #3448 | FAQPage JSON-LD | integration 未マージ。A4 マージ後に上記手順で再検証 |
| #3267（A5） | 記事削除 | integration マージ済み。sitemap から除外済みを確認 |
| #3286（B1）/ PR #3449 | トップ改修 | integration 未マージ。B1 マージ後に上記手順で再確認 |
| #3313（C4） | robots.txt / sitemap 改修 | C4 作業時に sitemap 網羅性を再確認 |
