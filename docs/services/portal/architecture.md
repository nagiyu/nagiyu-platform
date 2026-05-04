# Portal アーキテクチャ

## システム概要

Portal は nagiyu.com のルートドメインで稼働するサービス紹介・ドキュメントサイトです。
全ページを SSG（静的サイト生成）で出力し、DB・外部 API・認証なしのシンプルな構成とします。
コンテンツは Markdown ファイルとして管理し、ビルド時に静的 HTML に変換します。

## コンポーネント

| コンポーネント | 役割 | 技術 |
| -------------- | ---- | ---- |
| **CloudFront** | CDN、SSL/TLS 終端、セキュリティヘッダー付与 | Amazon CloudFront |
| **Lambda (Web)** | Next.js SSG ページ配信（Dev 環境） | AWS Lambda + Lambda Web Adapter |
| **ECS Fargate** | Next.js SSG ページ配信（Prod 環境） | AWS ECS + ALB |
| **ECR** | コンテナイメージレジストリ | Amazon ECR |

---

## 設計決定記録（ADR）

### ADR-001: ドキュメント型ポータル＋技術ブログのハイブリッド構成を採択した理由

**背景・問題**

AdSense 審査通過にはテキストコンテンツが必要。当初は「サービスドキュメント主体・記事は補助」のドキュメント型ポータルとして運用していたが、技術記事 5 本のみの構成では Google AdSense 審査で「有用性の低いコンテンツ」と判定され不承認となった（Issue #2867 参照）。

**決定**

サービスドキュメントは維持しつつ、**技術記事を計画的に追加して 25 本以上を目標とする**「ドキュメント型ポータル＋技術ブログ」のハイブリッド構成へ位置付けを変更する。

**根拠・トレードオフ**

- AdSense 審査では独自テキストコンテンツの量・質・更新性が重視されるため、記事数を確保する
- サービスドキュメントは引き続きサービスの機能追加・変更に合わせて更新する
- 技術記事はサービス開発で得た知見をテーマ別（AWS / Next.js / TypeScript / DevOps / バックエンド）に展開し、ロングテール SEO 流入も狙う
- E-E-A-T 観点で「実装経験をもつ開発者が自身のサービス基盤を解説する」構成は Experience（経験）と Expertise（専門性）の両方を示しやすい
- トレードオフ: 記事執筆の運用コストが発生するが、AdSense 承認・SEO トラフィック獲得という事業目的に対するリターンが大きい

---

### ADR-002: gray-matter + remark/rehype（plain Markdown）を採択した理由

**背景・問題**

コンテンツに React コンポーネントを埋め込む必要があるか検討した。

**決定**

plain Markdown + gray-matter でフロントマター解析、remark/rehype で HTML 変換する構成を採用する。

**根拠・トレードオフ**

- サービスドキュメントや技術記事に JSX を混在させる必要がない
- MDX に比べてライブラリ依存が少なく、コンテンツ作成者が Markdown の知識だけで書ける
- 将来的に MDX へ移行することを妨げない構成（コンテンツ読み込みロジックの実装を変えるだけで済む）

---

### ADR-003: Dev は Lambda・Prod は ALB + ECS とした理由

**背景・問題**

Dev VPC はシングル AZ（us-east-1a のみ）のため ALB が使用不可（ALB は最低 2 AZ を要求）。一方 Prod ではコールドスタートを回避するため常時稼働のコンテナが必要。

**決定**

環境によってスタック構成を切り替える。

- **Dev**: ECR → Lambda（Function URL）→ CloudFront
- **Prod**: ECR → ECS Cluster + ALB → ECS Service → CloudFront

**根拠・トレードオフ**

- Dev VPC のシングル AZ 制約を回避するために Lambda Function URL を採用
- Prod では AdSense 審査期間中に常時稼働が必要なため ALB + ECS Fargate を採用（コールドスタート回避）
- 将来的に Prod も Lambda に統一する場合はスタック分岐条件の変更のみで移行可能
