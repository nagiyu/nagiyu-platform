# Portal 外部設計書

---

## 1. 画面設計

### 1.1 画面一覧

| 画面 ID | 画面名 | パス | 対応ユースケース | 優先度 |
| ------- | ------ | ---- | -------------- | ------ |
| SCR-001 | トップページ | / | UC-001 | 高 |
| SCR-002 | 技術記事一覧 | /tech | UC-001 | 高 |
| SCR-003 | 技術記事詳細 | /tech/[slug] | UC-001 | 高 |
| SCR-004 | About ページ | /about | UC-002 | 高 |
| SCR-005 | お問い合わせ | /contact | UC-002 | 高 |
| SCR-006 | 利用規約 | /terms | - | 高 |
| SCR-007 | プライバシーポリシー | /privacy | - | 高 |

> サービス紹介・ドキュメント系の画面（旧 `/services` 配下）、およびタグ別・カテゴリ別の集約ページ（旧 `/tech/tags`・`/tech/category` 配下）は持たない。理由は `architecture.md` ADR-004。

### 1.2 画面遷移図

```mermaid
graph LR
    TOP[/ トップ] -->|記事カードクリック| ARTICLE[/tech/slug 記事詳細]
    TOP -->|ナビゲーション| TECH[/tech 技術記事一覧]
    TOP -->|ナビゲーション| ABOUT[/about]
    TECH -->|記事クリック| ARTICLE
    ARTICLE -->|関連記事| ARTICLE
    ABOUT -->|お問い合わせ導線| CONTACT[/contact]
```

### 1.3 主要画面の設計

#### SCR-001: トップページ

**概要**

技術メディアであることを数秒で伝えるランディングページ。サービスのカタログ表示は持たない。

**主要 UI 要素**

| 要素 | 種別 | 説明 |
| ---- | ---- | ---- |
| ヒーローセクション | テキスト | 「AWS・Next.js を中心とした実運用ベースの技術メディア」であることの提示 |
| 特集記事 | カード一覧 | 特集フラグ付き記事。該当が 0 件のときは非表示 |
| 最新記事 | カード一覧 | 公開順の最新記事 |
| ナビゲーション | ヘッダー | ホーム / 技術記事 / About |

#### SCR-003: 技術記事詳細

**概要**

Markdown コンテンツを静的生成したページ。コードブロック・見出し・画像を含む技術解説記事を表示する。

**主要 UI 要素**

| 要素 | 種別 | 説明 |
| ---- | ---- | ---- |
| 記事タイトル | 見出し | フロントマターの title |
| メタ情報 | テキスト | 著者・公開日・更新日・タグ・カテゴリラベル・推定読了時間 |
| 記事本文 | 本文 | Markdown レンダリング（3,000〜5,000 字） |
| 関連記事 | カード一覧 | タグが共通する記事（記事下部） |
| パンくず | ナビゲーション | ホーム > 技術記事 > 記事タイトル |

> タグ・カテゴリは記事の分類ラベルとして表示するのみで、専用の集約ページへはリンクしない（非リンク表示）。

#### SCR-005: お問い合わせ

**概要**

Google フォームを主たる連絡手段とし、記事フィードバック（誤り指摘・内容への質問）を中心に受け付ける。技術者向け補助手段として GitHub Issues を併記する。

### 1.4 レスポンシブ方針

- モバイル: 1 カラム表示
- タブレット: 2 カラム表示
- デスクトップ: 3〜4 カラム表示（記事カードグリッド）

### 1.5 アクセシビリティ方針

- MUI コンポーネントの標準アクセシビリティを活用
- 画像には alt テキストを設定
- WCAG 2.1 AA 準拠を目標

---

## 2. コンテンツ構成

### 2.1 Markdown ファイル配置

コンテンツは `services/portal/web/src/content/tech/` 配下に技術記事として格納する。サービスドキュメント用のディレクトリは持たない。

```
content/
└── tech/
    └── *.md     ← 技術記事（800 字以上）
```

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

```markdown
---
title: "記事タイトル"
description: "記事の概要（120 字程度）"
slug: "article-slug"
publishedAt: "2026-04-08"
updatedAt: "2026-05-01"      # 任意。最終更新日
author: "なぎゆー"             # 任意。未指定時は AUTHOR 定数のデフォルトを使用
tags: ["AWS", "Next.js"]
categories: ["aws"]           # 任意。記事カードの分類ラベル（非リンク）。複数可
featured: true                # 任意。トップページの特集記事として表示する場合 true
---
```
