# Portal 外部設計書

この文書は、画面とコンテンツを設計した理由・方針を書く。画面や API が今どう動くかは[仕様カード](../../specs/README.md)にある。

---

## 1. 画面設計

### 1.1 画面一覧

各画面の入口・表示するもの・操作・状態は、画面の仕様カードを参照する。この文書には、画面を設計した理由と、画面をまたぐ方針だけを書く。

| 画面 ID | 画面名 (仕様カード) | パス | 対応ユースケース | 優先度 |
| ------- | ------ | ---- | -------------- | ------ |
| SCR-001 | [トップページ](../../specs/portal/screen/home.md) | / | UC-001 | 高 |
| SCR-002 | [技術記事一覧](../../specs/portal/screen/tech.md) | /tech | UC-001 | 高 |
| SCR-003 | [技術記事詳細](../../specs/portal/screen/tech-article.md) | /tech/[slug] | UC-001 | 高 |
| SCR-004 | [About ページ](../../specs/portal/screen/about.md) | /about | UC-002 | 高 |
| SCR-005 | [お問い合わせ](../../specs/portal/screen/contact.md) | /contact | UC-002 | 高 |
| SCR-006 | [利用規約](../../specs/portal/screen/legal.md) | /terms | - | 高 |
| SCR-007 | [プライバシーポリシー](../../specs/portal/screen/legal.md) | /privacy | - | 高 |

> サービス紹介・ドキュメント系の画面（旧 `/services` 配下）、およびタグ別・カテゴリ別の集約ページ（旧 `/tech/tags`・`/tech/category` 配下）は持たない。理由は `architecture.md` ADR-004。

### 1.2 画面の設計方針

#### SCR-001: トップページ

技術メディアであることを数秒で伝えるランディングページにする。サービスのカタログ表示は持たない。

#### SCR-003: 技術記事詳細

Markdown コンテンツを静的生成したページにする。タグ・カテゴリは記事の分類ラベルとして表示するのみで、専用の集約ページへはリンクしない（非リンク表示）。

#### SCR-005: お問い合わせ

Google フォームを主たる連絡手段とし、記事フィードバック（誤り指摘・内容への質問）を中心に受け付ける。技術者向けの補助手段として GitHub Issues を併記する。

### 1.3 レスポンシブ方針

- 画面幅が広がるほどカードグリッドの列を増やす（モバイルは 1 カラム）。列数は各画面のカードを参照する

### 1.4 アクセシビリティ方針

- MUI コンポーネントの標準アクセシビリティを活用
- 画像には alt テキストを設定
- WCAG 2.1 AA 準拠を目標

---

## 2. コンテンツ構成

### 2.1 Markdown ファイル配置

コンテンツは技術記事だけを Markdown で格納し、サービスドキュメント用のディレクトリは持たない。配置と公開までの経路は[記事が公開されるまで](../../specs/portal/flow/article-publishing.md)を参照する。

### 2.2 技術記事の題材

実装・運用した技術スタックに基づき、テーマ別に展開する。

- **AWS インフラ編**: ECS vs Lambda 使い分け、CloudFront キャッシュ戦略、S3 Presigned URL、EventBridge、SSM/Secrets Manager
- **Next.js / React 編**: generateStaticParams、Metadata API、MUI ThemeRegistry、RSC 境界設計、Markdown の DOMPurify サニタイズ
- **TypeScript 編**: monorepo + workspaces、strict mode Repository、Zod、discriminated union
- **DevOps 編**: GitHub Actions モノレポ差分デプロイ、Docker multi-stage、Playwright 並列実行、ECR ライフサイクル
- **バックエンド編**: DynamoDB single-table、AWS Batch、Lambda コールドスタート対策

### 2.3 技術記事の題材選定方針

- 自身が実装・運用した技術スタックに基づく一次情報を優先（E-E-A-T の Experience を担保）
- 1 記事 3,000〜5,000 字、コードサンプル必須
- 中立な実運用視点で書き、特定サービスの宣伝・誘導を目的にしない

### 2.4 Markdown フロントマター仕様

項目と意味は[記事](../../specs/portal/term/article.md)を参照する。
