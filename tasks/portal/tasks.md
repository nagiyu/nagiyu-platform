# Portal - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/portal/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/portal/requirements.md  — 受け入れ条件・ユースケース
    - tasks/portal/external-design.md — URL 設計・コンテンツ構成・フロントマター仕様
    - tasks/portal/design.md        — ディレクトリ構造・型定義・インフラ変更箇所
-->

## Phase 1: Portal サービス基盤構築

<!-- Next.js プロジェクトの初期化、Markdown 処理基盤、SSG ルーティングの実装 -->

- [ ] `services/portal/web/` の Next.js プロジェクト初期化（依存: なし）
      - `package.json` の `workspaces` に `services/portal/web` を追加する
      - 既存 `services/tools/` の設定を参考に Next.js 15 + MUI 6 + TypeScript strict で構築
- [ ] `gray-matter`・`remark`・`rehype-stringify` 依存追加（依存: 上記）
- [ ] `types/content.ts` の型定義（`ServiceDocumentMeta`・`ArticleMeta`・`ServiceCard` 等）
- [ ] `lib/content.ts` の実装（`getServiceDocument`・`getAllServiceSlugs`・`getArticle`・`getAllArticles`）
- [ ] `lib/services.ts` のサービス URL マッピング定数実装
- [ ] SSG ルーティング実装（依存: lib/content.ts）
      - `app/services/[slug]/page.tsx`（`generateStaticParams` + `getServiceDocument`）
      - `app/services/[slug]/guide/page.tsx`
      - `app/services/[slug]/faq/page.tsx`
      - `app/tech/[slug]/page.tsx`（`generateStaticParams` + `getArticle`）
- [ ] `app/layout.tsx` に AdSense / Analytics スクリプト組み込み
      - `services/tools/src/app/layout.tsx` の実装を参考にする
      - `process.env.NODE_ENV === 'production'` 条件で本番のみ有効化
- [ ] `app/api/health/route.ts` 実装（ALB ヘルスチェック用、`{ status: 'ok' }` を返す）
- [ ] `Dockerfile` 作成（`services/tools/Dockerfile` を参考に）
- [ ] `public/robots.txt` 作成

## Phase 2: コンテンツ実装

<!-- Markdown コンテンツの作成。1 ファイルあたりの文字数を守ること -->

**サービスドキュメント（8 サービス × 3 ファイル）:**

- [ ] `content/services/tools/{index,guide,faq}.md`（index: 500 字以上、guide: 800 字以上、faq: 400 字以上）
- [ ] `content/services/quick-clip/{index,guide,faq}.md`
- [ ] `content/services/codec-converter/{index,guide,faq}.md`
- [ ] `content/services/stock-tracker/{index,guide,faq}.md`
- [ ] `content/services/niconico-mylist-assistant/{index,guide,faq}.md`
- [ ] `content/services/share-together/{index,guide,faq}.md`
- [ ] `content/services/auth/{index,guide,faq}.md`
- [ ] `content/services/admin/{index,guide,faq}.md`

**その他ページ:**

- [ ] About ページコンテンツ（`app/about/page.tsx` に直接記述、開発者プロフィール含む）
- [ ] 利用規約ページ（`app/terms/page.tsx`）
- [ ] プライバシーポリシーページ（`app/privacy/page.tsx`）

**技術記事（5 本、各 800 字以上）:**

- [ ] `content/tech/aws-batch-architecture.md`
- [ ] `content/tech/nextjs-ssg-markdown.md`
- [ ] `content/tech/vapid-web-push.md`
- [ ] `content/tech/video-codec-comparison.md`
- [ ] `content/tech/cloudfront-ecs-deployment.md`

## Phase 3: インフラ構築

<!-- インフラの変更。詳細は tasks/portal/design.md の「インフラ設計」セクションを参照 -->

- [x] `infra/bin/nagiyu-platform.ts` に portal ECR リポジトリスタックを追加（依存: なし）
      - 既存の tools ECR スタック定義を参考に同じパターンで追加
- [x] `infra/root/lib/ecs-service-stack.ts` の ECR イメージ参照を `portal` に変更
      - `getEcrRepositoryName('tools', environment)` → `getEcrRepositoryName('portal', environment)`
- [x] `infra/root/lib/cloudfront-stack.ts` にドメイン環境分岐を追加（依存: なし）
      - prod → `nagiyu.com` / dev → `dev.nagiyu.com`
      - 詳細は `design.md` のコードスニペットを参照
- [x] `.github/workflows/root-deploy.yml` に dev/prod 環境分岐を追加
      - `tools-deploy.yml` の `setup-environment` アクション使用パターンを参考にする
      - `develop` ブランチ → dev 環境 / `master` ブランチ → prod 環境

## Phase 4: デプロイ・検証

- [ ] `tools.nagiyu.com` が正常稼働していることを確認（prod デプロイ前の前提条件）
- [ ] dev 環境デプロイ（`dev.nagiyu.com` で動作確認）
      - 全ページが表示されること
      - 404 ページが適切に表示されること
      - `/api/health` が `{ status: 'ok' }` を返すこと
- [ ] Lighthouse スコア確認（Performance・Accessibility ともに 90 以上）
- [ ] Google Search Console に `dev.nagiyu.com` を登録し、インデックス状況を確認
- [ ] prod 環境デプロイ（`nagiyu.com` 切り替え）
- [ ] prod 環境で同様の動作確認

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] 全ページで Lighthouse Performance・Accessibility スコアが 90 以上
- [ ] Lint・型チェックがすべて通過している（`npm run lint`・`npm run typecheck`）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/portal/` を作成・更新した
- [ ] `docs/infra/root/` を更新した
- [ ] `tasks/portal/` ディレクトリを削除した
