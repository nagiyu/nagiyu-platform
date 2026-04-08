# Portal - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/portal/architecture.md に ADR として抽出し、
    tasks/portal/ ディレクトリごと削除します。

    入力: tasks/portal/requirements.md, tasks/portal/external-design.md
    次に作成するドキュメント: tasks/portal/tasks.md
-->

---

## API 仕様

Portal は外部公開 API を持たない（全ページ静的生成）。
ヘルスチェック用に `/api/health` のみ実装する（ECS ALB ヘルスチェック用）。

### ベース URL・認証

認証なし。全エンドポイント公開。

### エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
| ------- | ---- | ---- | ---- |
| GET | /api/health | ECS ALB ヘルスチェック用 | 不要 |

---

## データモデル

### 論理モデル

```typescript
// types/content.ts

/** サービスドキュメントのフロントマター */
type ServiceDocumentMeta = {
    title: string;
    description: string;
    service: string;        // slug（tools / quick-clip / etc.）
    type: 'overview' | 'guide' | 'faq';
    updatedAt: string;      // ISO 8601 date
};

/** サービスドキュメント（フロントマター + 本文） */
type ServiceDocument = ServiceDocumentMeta & {
    content: string;        // HTML（remark/rehype 変換済み）
    slug: string;           // サービス slug
};

/** 技術記事のフロントマター */
type ArticleMeta = {
    title: string;
    description: string;
    slug: string;
    publishedAt: string;    // ISO 8601 date
    tags: string[];
};

/** 技術記事（フロントマター + 本文） */
type Article = ArticleMeta & {
    content: string;        // HTML（remark/rehype 変換済み）
};

/** サービス一覧カード表示用 */
type ServiceCard = {
    slug: string;
    name: string;
    description: string;    // index.md の description フロントマター
    url: string;            // 実際のサービス URL（外部リンク）
};
```

### 物理モデル

DB なし。全データは Markdown ファイル（`src/content/`）から読み込む。

**サービス URL マッピング（ハードコード定義）:**

```typescript
// lib/services.ts
const SERVICE_URLS: Record<string, string> = {
    'tools':                      'https://tools.nagiyu.com',
    'quick-clip':                 'https://quick-clip.nagiyu.com',
    'codec-converter':            'https://codec-converter.nagiyu.com',
    'stock-tracker':              'https://stock-tracker.nagiyu.com',
    'niconico-mylist-assistant':  'https://niconico-mylist-assistant.nagiyu.com',
    'share-together':             'https://share-together.nagiyu.com',
    'auth':                       'https://auth.nagiyu.com',
    'admin':                      'https://admin.nagiyu.com',
};
```

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
| --------- | ---- |
| `portal/web` | UI・静的ページ生成・Markdown 読み込み・レンダリング |

core / batch は不要（外部 API なし、DB なし、バックグラウンド処理なし）。

### 実装モジュール一覧

**lib/**

| モジュール | パス | 役割 |
| --------- | ---- | ---- |
| `getServiceDocument` | `lib/content.ts` | 指定サービス・タイプの Markdown を読み込み HTML を返す |
| `getAllServiceSlugs` | `lib/content.ts` | `content/services/` 配下の全 slug を列挙（SSG 用） |
| `getArticle` | `lib/content.ts` | 指定 slug の技術記事 Markdown を読み込み HTML を返す |
| `getAllArticles` | `lib/content.ts` | `content/tech/` 配下の全記事メタデータを一覧で返す |
| `SERVICE_URLS` | `lib/services.ts` | サービス slug → 実際の URL のマッピング定数 |

**app/（ページ）**

| モジュール | パス | 役割 |
| --------- | ---- | ---- |
| トップページ | `app/page.tsx` | サービスカードグリッド + 記事プレビュー |
| サービス一覧 | `app/services/page.tsx` | 8 サービスカード一覧 |
| サービス概要 | `app/services/[slug]/page.tsx` | `generateStaticParams` + `getServiceDocument` |
| ガイド | `app/services/[slug]/guide/page.tsx` | 同上（type: 'guide'） |
| FAQ | `app/services/[slug]/faq/page.tsx` | 同上（type: 'faq'） |
| 技術記事一覧 | `app/tech/page.tsx` | `getAllArticles` でメタデータ一覧表示 |
| 技術記事詳細 | `app/tech/[slug]/page.tsx` | `generateStaticParams` + `getArticle` |
| About | `app/about/page.tsx` | 静的コンテンツ（Markdown 不要） |
| 利用規約 | `app/terms/page.tsx` | 静的コンテンツ |
| プライバシーポリシー | `app/privacy/page.tsx` | 静的コンテンツ |
| ヘルスチェック | `app/api/health/route.ts` | `{ status: 'ok' }` を返す |

### モジュール間インターフェース

```typescript
// lib/content.ts

/**
 * サービスドキュメントを取得する
 * @param slug - サービス slug（例: 'tools', 'quick-clip'）
 * @param type - ドキュメント種別（'overview' | 'guide' | 'faq'）
 */
async function getServiceDocument(
    slug: string,
    type: 'overview' | 'guide' | 'faq'
): Promise<ServiceDocument>;

/**
 * 全サービス slug を返す（generateStaticParams 用）
 */
function getAllServiceSlugs(): string[];

/**
 * 技術記事を取得する
 * @param slug - 記事 slug
 */
async function getArticle(slug: string): Promise<Article>;

/**
 * 全技術記事のメタデータ一覧を返す（publishedAt 降順）
 */
function getAllArticles(): ArticleMeta[];
```

---

## インフラ設計

### サービス構成

```
services/portal/web/   ← web パッケージのみ
```

DB なし・外部 API なし・認証なし。

### ディレクトリ構造

```
services/portal/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx              ← AdSense / Analytics スクリプト
│   │   ├── page.tsx                ← トップ
│   │   ├── about/page.tsx
│   │   ├── terms/page.tsx
│   │   ├── privacy/page.tsx
│   │   ├── services/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/
│   │   │       ├── page.tsx        ← generateStaticParams
│   │   │       ├── guide/page.tsx
│   │   │       └── faq/page.tsx
│   │   ├── tech/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/page.tsx     ← generateStaticParams
│   │   └── api/
│   │       └── health/route.ts
│   ├── content/
│   │   ├── services/{slug}/{index,guide,faq}.md
│   │   └── tech/*.md
│   ├── lib/
│   │   ├── content.ts
│   │   └── services.ts
│   └── types/
│       └── content.ts
├── public/
│   ├── robots.txt
│   └── sitemap.xml                 ← ビルド時に next-sitemap 等で生成（任意）
├── package.json
├── tsconfig.json
└── Dockerfile
```

### ルートドメイン移行方針

```
現在: nagiyu.com → CloudFront → ALB → ECS（nagiyu/tools イメージ）
変更: nagiyu.com → CloudFront → ALB → ECS（nagiyu/portal イメージ）
```

ECS スタック・ALB スタック・CloudFront スタックはそのまま流用する。
変更が必要なファイルは以下のみ：

**`infra/root/lib/ecs-service-stack.ts`**

```typescript
// 変更前
getEcrRepositoryName('tools', environment)

// 変更後
getEcrRepositoryName('portal', environment)
```

**`infra/bin/nagiyu-platform.ts`**

portal の ECR リポジトリスタックを追加する（既存の tools ECR と同じパターン）。

### dev 環境ドメイン追加

ACM ワイルドカード証明書（`*.nagiyu.com`）は既に対応済みのため証明書変更は不要。

**`infra/root/lib/cloudfront-stack.ts`**

```typescript
// 変更前（共有 SSM パラメータから固定ドメインを取得）
const domainName = ssm.StringParameter.valueForStringParameter(
    this,
    SSM_PARAMETERS.ACM_DOMAIN_NAME
);

// 変更後（環境別ドメイン）
const domainName = environment === 'prod'
    ? 'nagiyu.com'
    : 'dev.nagiyu.com';
```

**`.github/workflows/root-deploy.yml`**

- `setup-environment` アクションを追加（`tools-deploy.yml` の実装を参考）
- `develop` ブランチ → dev 環境
- `master` ブランチ → prod 環境

### AdSense / Analytics 組み込み

現在 `services/tools/src/app/layout.tsx` に実装済み（`ca-pub-6784165593921713`）。
同じパターンを `services/portal/web/src/app/layout.tsx` に移植する。

```typescript
// 本番環境のみ有効
{process.env.NODE_ENV === 'production' && (
    <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6784165593921713"
        crossOrigin="anonymous"
        strategy="afterInteractive"
    />
)}
```

### 参照すべき既存コード

| ファイル | 参照目的 |
| ------- | ------- |
| [services/tools/src/app/layout.tsx](../../services/tools/src/app/layout.tsx) | AdSense / Analytics スクリプト実装パターン |
| [services/tools/src/app/page.tsx](../../services/tools/src/app/page.tsx) | Next.js + MUI ページ実装パターン |
| [services/tools/package.json](../../services/tools/package.json) | パッケージ設定・依存関係の参考 |
| [services/tools/Dockerfile](../../services/tools/Dockerfile) | Dockerfile 構成の参考 |
| [infra/root/lib/cloudfront-stack.ts](../../infra/root/lib/cloudfront-stack.ts) | ドメイン環境分岐の追加先 |
| [infra/root/lib/ecs-service-stack.ts](../../infra/root/lib/ecs-service-stack.ts) | ECR イメージ参照の変更先 |
| [infra/bin/nagiyu-platform.ts](../../infra/bin/nagiyu-platform.ts) | ECR リポジトリスタック追加先 |
| [.github/workflows/root-deploy.yml](../../.github/workflows/root-deploy.yml) | CI/CD の変更先 |
| [.github/workflows/tools-deploy.yml](../../.github/workflows/tools-deploy.yml) | dev/prod 分岐の参考実装 |

---

## 実装上の注意点

### 依存関係・前提条件

- `services/portal/web/` を npm workspace に追加すること（`package.json` の `workspaces` に追記）
- `tools.nagiyu.com` が正常稼働していることを確認してから prod デプロイを行う
- portal ECR リポジトリを先に作成してから ECS デプロイを行う

### パフォーマンス考慮事項

- `generateStaticParams()` で全 slug をビルド時に列挙し、ランタイムでのファイルシステムアクセスをゼロにする
- MUI の `ThemeProvider` は `layout.tsx` に一度だけ配置する
- 画像は `next/image` を使用して最適化する

### セキュリティ考慮事項

- AdSense / Analytics スクリプトは `process.env.NODE_ENV === 'production'` の条件で本番のみ有効化
- `next/script` の `strategy="afterInteractive"` で Core Web Vitals への影響を最小化
- 外部リンク（各サービス URL）には `target="_blank" rel="noopener noreferrer"` を付与

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/portal/requirements.md` を新規作成すること
- [ ] `docs/services/portal/external-design.md` を新規作成すること
- [ ] `docs/services/portal/architecture.md` を新規作成し以下の ADR を追記すること：
      - ADR: ドキュメント型ポータルを採択した理由（AdSense 承認戦略）
      - ADR: gray-matter + remark/rehype を採択した理由
      - ADR: ECS スタック流用・ECR イメージのみ変更した理由
- [ ] `docs/infra/root/` の deploy.md・architecture.md を Portal 対応に更新すること
