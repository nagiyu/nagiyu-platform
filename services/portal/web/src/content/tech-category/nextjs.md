---
title: 'Next.js × Portal 実装ノート'
description: 'この Portal サイトそのものを題材に、Next.js App Router・SSG・Metadata API・RSC 境界・MUI v9 統合・Docker マルチステージビルドの実装をまとめたハブページです。フレームワークの機能を実プロダクトでどう使い分けているかを横断的に紹介します。'
slug: 'nextjs'
---

## このカテゴリで扱うこと

いま読んでいるこの Portal サイト自体が、Next.js の実装サンプルです。技術記事もサービスドキュメントも Markdown ファイルとして持ち、App Router の SSG（静的生成）でビルド時に HTML 化しています。動的な API サーバーを持たずに、記事追加 = ファイル追加だけで完結する構成です。

このハブでは、App Router・Server Components・Metadata API・SSG ルーティングといった Next.js の機能群を、「この Portal で実際にどう組んだか」という単一プロダクトの文脈でまとめます。断片的なチュートリアルではなく、一つのサイトを成立させている実装の集合として読めるようにしています。

## nagiyu-platform での採用状況

Portal の本文描画は、`src/lib/content.ts` を Repository 層に見立てて Markdown を読み込み、remark / rehype で HTML 化したうえで DOMPurify でサニタイズする流れにしています。記事ページ・タグページ・このカテゴリ別ハブはいずれも `generateStaticParams` で URL を列挙し、ビルド時に静的化しています。`dynamicParams = false` を設定して、想定外の URL は 404 に倒すようにしているのも意図的な選択です。

UI は `libs/ui` に切り出した共通コンポーネント（Chip / Link / Button など）を軸に、MUI v9 を App Router のテーマレジストリ経由で統合しています。私が一番こだわったのは Server / Client コンポーネントの境界で、データ取得とメタデータ生成はサーバー側に寄せ、インタラクションが必要な最小範囲だけを Client Component に切り出しています。各ページの `<title>` / OGP / canonical は Metadata API（`generateMetadata`）で個別に出し分け、構造化データ（BlogPosting / BreadcrumbList）も `lib/jsonLd.ts` のヘルパーで一元的に組み立てています。

## 振り返って

App Router を本番で運用してみて実感したのは、「SSG とコンテンツの所在をシンプルに保つほど運用が軽くなる」ことでした。記事を増やすときに触るのは Markdown ファイルだけで、ルーティング・サイトマップ・構造化データは既存のロジックが自動で拾ってくれる——この自動化のおかげで、コンテンツ追加の心理的コストをかなり下げられています。下の関連記事では、その各レイヤーの実装を個別に掘り下げています。

## 参考リンク

- [Next.js App Router ドキュメント](https://nextjs.org/docs/app)
- [MUI（Material UI）公式ドキュメント](https://mui.com/material-ui/getting-started/)
