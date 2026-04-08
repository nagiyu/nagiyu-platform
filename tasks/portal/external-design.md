<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/portal/external-design.md に統合して削除します。

    入力: tasks/portal/requirements.md
    次に作成するドキュメント: tasks/portal/design.md
-->

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
| SCR-009 | 技術記事一覧 | /tech | UC-003 | 中 |
| SCR-010 | 技術記事詳細 | /tech/[slug] | UC-003 | 中 |

**slug 一覧（サービス）:**

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

Portal のランディングページ。nagiyu が提供する全サービスをカード形式で一覧表示し、
各サービスへの導線と Portal の目的を伝える。

**主要 UI 要素**

| 要素 | 種別 | 説明 |
| ---- | ---- | ---- |
| ヒーローセクション | テキスト | Portal の概要・キャッチコピー（200 字程度） |
| サービスカードグリッド | カード一覧 | 8 サービス分のカード。アイコン・名前・1 行説明・ドキュメントリンク |
| 技術記事プレビュー | カード一覧 | 最新 3 本の記事タイトル・概要 |
| ナビゲーション | ヘッダー | Home / Services / Tech / About |

**ユーザーインタラクション**

| 操作 | 結果 |
| ---- | ---- |
| サービスカードクリック | `/services/[slug]` へ遷移 |
| 記事カードクリック | `/tech/[slug]` へ遷移 |

#### SCR-006: サービス概要ページ

**概要**

Markdown ファイル（`content/services/[slug]/index.md`）を静的生成したページ。
サービスの目的・特徴・対象ユーザー・スクリーンショットを含む 500 字以上の説明文を表示する。

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

Markdown ファイル（`content/tech/[slug].md`）を静的生成したページ。
コードブロック・見出し・画像を含む技術解説記事を表示する。

**主要 UI 要素**

| 要素 | 種別 | 説明 |
| ---- | ---- | ---- |
| 記事タイトル | 見出し | フロントマターの title |
| メタ情報 | テキスト | 公開日・タグ |
| 記事本文 | 本文 | Markdown レンダリング（800 字以上） |
| 目次 | サイドバー or インライン | h2/h3 見出しから自動生成（任意） |

### 1.4 レスポンシブ方針

- モバイル（スマートフォン）: MUI の `Grid` / `Container` で 1 カラム表示
- タブレット: 2 カラム表示
- デスクトップ: 3〜4 カラム表示（サービスカードグリッド）

### 1.5 アクセシビリティ方針

- MUI コンポーネントの標準アクセシビリティを活用
- 画像には alt テキストを設定
- WCAG 2.1 AA 準拠を目標

---

## 2. コンテンツ構成

### 2.1 Markdown ファイル配置

```
services/portal/web/src/content/
├── services/
│   ├── tools/
│   │   ├── index.md         ← サービス概要（500 字以上）
│   │   ├── guide.md         ← 使い方ガイド（800 字以上）
│   │   └── faq.md           ← FAQ（400 字以上）
│   ├── quick-clip/
│   │   ├── index.md
│   │   ├── guide.md
│   │   └── faq.md
│   ├── codec-converter/
│   │   ├── index.md
│   │   ├── guide.md
│   │   └── faq.md
│   ├── stock-tracker/
│   │   ├── index.md
│   │   ├── guide.md
│   │   └── faq.md
│   ├── niconico-mylist-assistant/
│   │   ├── index.md
│   │   ├── guide.md
│   │   └── faq.md
│   ├── share-together/
│   │   ├── index.md
│   │   ├── guide.md
│   │   └── faq.md
│   ├── auth/
│   │   ├── index.md
│   │   ├── guide.md
│   │   └── faq.md
│   └── admin/
│       ├── index.md
│       ├── guide.md
│       └── faq.md
└── tech/
    ├── aws-batch-architecture.md
    ├── nextjs-ssg-markdown.md
    ├── vapid-web-push.md
    ├── video-codec-comparison.md
    └── cloudfront-ecs-deployment.md
```

### 2.2 技術記事の題材（初期 5 本）

| slug | タイトル案 | 関連サービス |
| ---- | --------- | ----------- |
| `aws-batch-architecture` | AWS Batch で重い処理をサーバーレス化した構成 | Quick Clip / Codec Converter |
| `nextjs-ssg-markdown` | Next.js で Markdown を静的ページに変換する実装 | Portal 自体 |
| `vapid-web-push` | Web Push 通知を実装する（VAPID キーの仕組みと使い方） | Stock Tracker / Tools |
| `video-codec-comparison` | H.264 / VP9 / AV1 のコーデック比較と使い分け | Codec Converter |
| `cloudfront-ecs-deployment` | CloudFront + ECS で Next.js をデプロイする構成解説 | ルートドメイン共通 |

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
tags: ["AWS", "Next.js"]
---
```

---

## 3. 設計上の決定事項（ADR）

### ADR-001: ブログではなくドキュメント型にした理由

**背景・問題**

AdSense 審査通過にはテキストコンテンツが必要だが、ブログ形式は定期的な記事投稿が必要で運用コストが高い。

**決定**

サービスドキュメント（マニュアル）を主体とし、技術紹介記事を補助的に加えるドキュメント型ポータルにする。

**根拠・トレードオフ**

- ドキュメントはサービスの機能追加・変更に合わせて更新するため、自然な更新サイクルが生まれる
- ブログと比べて記事の「鮮度」プレッシャーがない
- E-A-T 観点で「開発者が自分のサービスを解説する」構成は専門性を示しやすい
- トレードオフ: ブログに比べて SEO 的な流入キーワードが限定的になる可能性があるが、
  AdSense 承認が目的の第一段階ではドキュメントの充実度の方が重要

### ADR-002: gray-matter + remark/rehype（plain Markdown）にした理由

**背景・問題**

コンテンツに React コンポーネントを埋め込む必要があるか検討した。

**決定**

plain Markdown + gray-matter でフロントマター解析、remark/rehype で HTML 変換する構成を採用する。

**根拠・トレードオフ**

- サービスドキュメントや技術記事に JSX を混在させる必要がない
- MDX に比べてライブラリ依存が少なく、コンテンツ作成者が Markdown の知識だけで書ける
- 将来的に MDX へ移行することを妨げない構成（lib/content.ts の実装を変えるだけ）
