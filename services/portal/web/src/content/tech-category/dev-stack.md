---
title: '開発基盤・モノレポ運用ノート'
description: 'nagiyu-platform を支える開発基盤をまとめたハブページです。npm workspaces によるモノレポ構成、TypeScript strict、判別ユニオンによる型安全な API、GitHub Actions の差分デプロイ、Playwright の並列 CI を、実装ベースで横断的に紹介します。'
slug: 'dev-stack'
---

## このカテゴリで扱うこと

nagiyu-platform は、複数のサービス（Portal / Quick Clip / Stock Tracker など）と共通ライブラリ（`libs/common` / `browser` / `ui` / `react` / `nextjs` / `aws`）を 1 つのリポジトリにまとめたモノレポです。このハブでは、その「土台」——パッケージ管理・型安全・CI/CD・E2E テストといった、機能には直接現れないが開発速度と品質を左右する部分をまとめます。

個別の記事はそれぞれ独立した技法の解説ですが、ここを起点に読むことで「1 人で複数サービスを保守し続けるために、どんな開発基盤を組んだか」という全体設計が見えるようにしています。

## nagiyu-platform での採用状況

依存管理は npm workspaces で統一し、共通ロジックは `libs/*` に切り出して `ui → browser → common` のような一方向の依存に保っています（循環依存は禁止）。TypeScript は全パッケージで strict モードを有効にし、API のレスポンスは判別ユニオン（discriminated union）で表現して、成功・失敗を型レベルで網羅できるようにしています。DynamoDB アクセスは `libs/aws` の抽象リポジトリに集約し、`USE_IN_MEMORY_DB` で InMemory 実装に差し替えられるようにしてテスト容易性を確保しています。

CI/CD は GitHub Actions で組んでいます。私が特に手を入れたのは、`paths:` フィルタで「変更があったサービスだけをデプロイする」差分デプロイと、`.github/actions` の composite action による共通ロジックの抽出です。E2E は Playwright で、`chromium-mobile` を常時実行しつつ、`chromium-desktop` / `webkit-mobile` は develop 向け PR のときだけ走らせる、という段階的な構成にしてフィードバック速度とカバレッジのバランスを取っています。

## 振り返って

モノレポを 1 人で回してみて痛感したのは、「基盤の自動化に投資した分だけ、後の自分が楽になる」ということでした。差分デプロイがなければ毎回全サービスをビルドする羽目になり、strict や判別ユニオンがなければリファクタのたびに実行時エラーに怯えることになります。下の関連記事は、こうした基盤づくりの一つひとつを、実際の設定ファイルやコード付きで掘り下げたものです。

## 参考リンク

- [npm workspaces 公式ドキュメント](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
