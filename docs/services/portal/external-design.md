# Portal 外部設計書

---

## 1. 画面設計

### 1.1 画面一覧

| 画面 ID | 画面名 | パス | 対応ユースケース | 優先度 |
| ------- | ------ | ---- | -------------- | ------ |
| SCR-001 | トップページ | / | UC-001 | 高 |
| SCR-002 | About ページ | /about | - | 高 |
| SCR-003 | 利用規約 | /terms | - | 高 |
| SCR-004 | プライバシーポリシー | /privacy | - | 高 |
| SCR-005 | サービス一覧 | /services | UC-001 | 高 |
| SCR-006 | サービス概要 | /services/[slug] | UC-002 | 高 |
| SCR-007 | 使い方ガイド | /services/[slug]/guide | UC-002 | 高 |
| SCR-008 | FAQ | /services/[slug]/faq | UC-002 | 高 |
| SCR-009 | 技術記事一覧 | /tech | UC-003 | 高 |
| SCR-010 | 技術記事詳細 | /tech/[slug] | UC-003 | 高 |

**サービス slug 一覧:**

| slug | サービス名 |
| ---- | --------- |
| `tools` | Tools |
| `quick-clip` | Quick Clip |
| `codec-converter` | Codec Converter |
| `stock-tracker` | Stock Tracker |
| `niconico-mylist-assistant` | niconico-mylist-assistant |
| `share-together` | Share Together |
| `auth` | Auth |
| `admin` | Admin |

### 1.2 画面遷移図

```mermaid
graph LR
    TOP[/ トップ] -->|サービスカードクリック| SVC[/services/slug サービス概要]
    TOP -->|ナビゲーション| TECH[/tech 技術記事一覧]
    TOP -->|ナビゲーション| ABOUT[/about]
    SVC -->|ガイドリンク| GUIDE[/services/slug/guide]
    SVC -->|FAQ リンク| FAQ[/services/slug/faq]
    TECH -->|記事クリック| ARTICLE[/tech/slug 記事詳細]
    SVC_LIST[/services サービス一覧] -->|カードクリック| SVC
    TOP -->|ナビゲーション| SVC_LIST
```

### 1.3 主要画面の設計

#### SCR-001: トップページ

**概要**

Portal のランディングページ。nagiyu が提供する全サービスをカード形式で一覧表示し、各サービスへの導線と Portal の目的を伝える。

**主要 UI 要素**

| 要素 | 種別 | 説明 |
| ---- | ---- | ---- |
| ヒーローセクション | テキスト | Portal の概要・キャッチコピー（200 字程度） |
| サービスカードグリッド | カード一覧 | 8 サービス分のカード。アイコン・名前・1 行説明・ドキュメントリンク |
| 技術記事プレビュー | カード一覧 | 最新 6 本の記事タイトル・概要・タグ |
| 技術カテゴリカード | カード一覧 | 主要タグ（AWS / Next.js / TypeScript / DevOps / Backend）への動線 |
| ナビゲーション | ヘッダー | Home / Services / Tech / About |

**ユーザーインタラクション**

| 操作 | 結果 |
| ---- | ---- |
| サービスカードクリック | サービス概要ページへ遷移 |
| 記事カードクリック | 技術記事詳細ページへ遷移 |

#### SCR-006: サービス概要ページ

**概要**

Markdown コンテンツを静的生成したページ。サービスの目的・特徴・対象ユーザーを含む説明文（500 字以上）を表示する。

**主要 UI 要素**

| 要素 | 種別 | 説明 |
| ---- | ---- | ---- |
| ページタイトル | 見出し | サービス名 |
| 概要テキスト | 本文 | Markdown レンダリング（500 字以上） |
| サブページナビゲーション | タブ/リンク | 概要 / 使い方ガイド / FAQ の切り替え |
| 外部リンク | ボタン | 実際のサービス URL へのリンク |

**表示条件・状態**

- 存在しない slug の場合: 404 ページを表示

#### SCR-010: 技術記事詳細

**概要**

Markdown コンテンツを静的生成したページ。コードブロック・見出し・画像を含む技術解説記事（800 字以上）を表示する。

**主要 UI 要素**

| 要素 | 種別 | 説明 |
| ---- | ---- | ---- |
| 記事タイトル | 見出し | フロントマターの title |
| メタ情報 | テキスト | 著者・公開日・更新日・タグ・推定読了時間 |
| 記事本文 | 本文 | Markdown レンダリング（3,000〜5,000 字） |
| 関連記事 | カード一覧 | タグが共通する記事 3 件（記事下部） |
| パンくず | ナビゲーション | ホーム > 技術記事 > 記事タイトル |

### 1.4 レスポンシブ方針

- モバイル: 1 カラム表示
- タブレット: 2 カラム表示
- デスクトップ: 3〜4 カラム表示（サービスカードグリッド）

### 1.5 アクセシビリティ方針

- MUI コンポーネントの標準アクセシビリティを活用
- 画像には alt テキストを設定
- WCAG 2.1 AA 準拠を目標

---

## 2. コンテンツ構成

### 2.1 Markdown ファイル配置

コンテンツは `services/portal/web/src/content/` 配下に格納する。

```
content/
├── services/
│   └── {slug}/
│       ├── index.md     ← サービス概要（500 字以上）
│       ├── guide.md     ← 使い方ガイド（800 字以上）
│       └── faq.md       ← FAQ（400 字以上）
└── tech/
    └── *.md             ← 技術記事（800 字以上）
```

### 2.2 技術記事の題材（初期 5 本＋拡充 20 本以上）

#### 初期 5 本（実装済み）

| slug | タイトル | 関連サービス |
| ---- | --------- | ----------- |
| `aws-batch-architecture` | AWS Batch で重い処理をサーバーレス化した構成 | Quick Clip / Codec Converter |
| `nextjs-ssg-markdown` | Next.js で Markdown を静的ページに変換する実装 | Portal 自体 |
| `cloudfront-ecs-deployment` | CloudFront + ECS で Next.js をデプロイする構成解説 | ルートドメイン共通 |

#### 拡充計画（20 本以上、テーマ別）

AdSense 再申請対応として、以下のテーマで段階的に追加する（Issue #2867 / PR3〜PR5）。

- **AWS インフラ編**: ECS vs Lambda 使い分け、CloudFront キャッシュ戦略、S3 Presigned URL、AWS WAF
- **Next.js / React 編**: generateStaticParams 完全ガイド、Metadata API、MUI ThemeRegistry、RSC 境界設計
- **TypeScript 編**: monorepo + workspaces、strict mode Repository、Zod、discriminated union
- **DevOps 編**: GitHub Actions モノレポ差分デプロイ、Docker multi-stage、Playwright 並列実行、ECR ライフサイクル
- **バックエンド編**: DynamoDB single-table、AWS Batch 並列度、Web Push サーバー実装、Lambda コールドスタート対策

### 2.3 技術記事の題材選定方針

- 自身が実装した技術スタックに基づく一次情報を優先（E-E-A-T の Experience を担保）
- 1 記事 3,000〜5,000 字、コードサンプル必須
- 関連サービスがある記事は frontmatter `relatedServices` でドキュメントへ相互リンク

### 2.3 Markdown フロントマター仕様

**サービスドキュメント（index.md, guide.md, faq.md）:**

```markdown
---
title: "ページタイトル"
description: "OGP / meta description 用の説明文（120 字程度）"
service: "tools"
type: "overview"  # overview | guide | faq
updatedAt: "2026-04-08"
---
```

**技術記事（tech/*.md）:**

```markdown
---
title: "記事タイトル"
description: "記事の概要（120 字程度）"
slug: "article-slug"
publishedAt: "2026-04-08"
updatedAt: "2026-05-01"      # 任意。最終更新日
author: "なぎゆー"             # 任意。未指定時は AUTHOR 定数のデフォルトを使用
tags: ["AWS", "Next.js"]
relatedServices: ["quick-clip", "codec-converter"]  # 任意。サービスドキュメントへの相互リンク
---
```
