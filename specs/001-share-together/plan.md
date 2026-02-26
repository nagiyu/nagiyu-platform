# 実装計画: みんなでシェアリスト (Share Together)

**ブランチ**: `copilot/define-requirements-again` | **日付**: 2025-06-12 | **仕様**: [spec.md](./spec.md)
**入力**: `/specs/001-share-together/spec.md` の機能仕様書

## 概要

「みんなでシェアリスト (Share Together)」は、nagiyu プラットフォームの Auth サービスと連携した ToDo 共有ツールである。
ユーザーは個人の ToDo リストを複数管理でき、さらに複数ユーザーでグループを作成して共有 ToDo リストを運用できる。

MVP では以下を実現する:
- Auth サービス（JWT/Cookie 共有）による SSO 認証
- 個人 ToDo リストの作成・編集・削除（デフォルトリスト自動生成）
- グループの作成・招待・参加・脱退・除外
- グループ共有 ToDo リストの作成・閲覧・編集・削除
- モバイルファーストの PWA（プッシュ通知シェルは含むが未実装）

技術的アプローチ:
- Next.js App Router + NextAuth v5（Auth サービス JWT 検証）
- DynamoDB シングルテーブル設計（PK/SK + GSI）
- AWS Lambda（コンテナ） + CloudFront 配信
- インフラは AWS CDK（TypeScript）

---

## 技術コンテキスト

**言語/バージョン**: TypeScript 5.x / Node.js 22+
**主要な依存関係**:
- Next.js 15.x（App Router）
- React 19.x
- NextAuth v5（next-auth@^5.0.0-beta）
- @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb（3.x）
- @nagiyu/common, @nagiyu/ui, @nagiyu/aws
- AWS CDK 2.x（インフラ）
- Jest（ユニットテスト）、Playwright（E2E テスト）
- Material-UI (MUI) v6

**ストレージ**: DynamoDB シングルテーブル（PK/SK + 2 GSI）、オンデマンドキャパシティ、PITR 有効

**テスト**: Jest（ユニット、ビジネスロジック 80% カバレッジ）、Playwright（E2E: chromium-mobile 優先、全3デバイス）

**ターゲットプラットフォーム**: AWS Lambda（コンテナイメージ）+ CloudFront + ECR

**プロジェクト種別**: core + web（batch なし）

**パフォーマンス目標**:
- ToDo 一覧取得: 200ms 以内（P90）
- グループ共有更新のページリフレッシュ反映: 5 秒以内（SC-003）

**制約**:
- モバイルファースト（スマホ最優先）
- リアルタイム同期なし（ページリフレッシュで最新状態を取得）
- グループ招待通知はサービス内通知（メール通知は MVP 外）
- Auth サービスとのインテグレーションは JWT 検証のみ（Consumer パターン）

**スコープ**:
- ドメイン: `dev-share-together.nagiyu.com`（dev）、`share-together.nagiyu.com`（prod）
- 外部 DNS + CNAME → CloudFront
- PWA: manifest.json + service worker シェル（プッシュ通知実装は将来対応）

---

## 憲法チェック

*ゲート: フェーズ0の調査前に通過すること。フェーズ1の設計後に再チェックすること。*

- [x] **TypeScript 型安全性 (I)**: `"strict": true` を採用。`configs/tsconfig.base.json` を継承。型定義は `types/` に集約。アクセス修飾子を全クラスメンバーに明示。ライブラリ内では相対パスを使用。
- [x] **アーキテクチャ・レイヤー分離 (II)**: `core`（ビジネスロジック・フレームワーク非依存）と `web`（Next.js UI）に分離。`core` は `next`・`react` に依存しない。依存方向: `web → core → なし`。
- [x] **コード品質・Lint・フォーマット (III)**: `configs/eslint.config.base.mjs` を継承した ESLint 設定。Prettier 設定（`semi: true`, `singleQuote: true`, `printWidth: 100`, `tabWidth: 2`, `trailingComma: "es5"`）。エラーメッセージは `ERROR_MESSAGES` 定数で管理、日本語で記述。
- [x] **テスト戦略 (IV)**: Jest（ユニット）、Playwright（E2E）。`core` のビジネスロジック 80% カバレッジ。E2E は `chromium-desktop`, `chromium-mobile`（Pixel 5）, `webkit-mobile`（iPhone）。テスト命名は `describe > it` 形式、AAA パターン。
- [x] **ブランチ戦略・CI/CD (V)**: `share-together-web-verify-fast.yml`（integration/** 向け）、`share-together-web-verify-full.yml`（develop 向け）。ワークスペース指定はパッケージ名（`@nagiyu/share-together-web`）。依存関係順での個別ビルド。
- [x] **共通ライブラリ設計 (VI)**: `core` は `@nagiyu/common` のみに依存。`web` は `@nagiyu/common`, `@nagiyu/browser`, `@nagiyu/ui` に依存可。サービス間直接依存なし。
- [x] **ドキュメント駆動開発 (VII)**: 本 spec.md・plan.md・research.md・data-model.md・contracts/api.md・quickstart.md を日本語で作成。実装前にドキュメント駆動で進める。

---

## プロジェクト構成

### ドキュメント（本機能）

```text
specs/001-share-together/
├── spec.md              # 機能仕様書
├── plan.md              # 本ファイル (実装計画)
├── research.md          # フェーズ0の出力
├── data-model.md        # フェーズ1の出力
├── quickstart.md        # フェーズ1の出力
├── contracts/
│   └── api.md           # フェーズ1: REST API 仕様
└── tasks.md             # フェーズ2の出力 (/speckit.tasks コマンドで作成)
```

### ソースコード（リポジトリルート）

```text
services/share-together/
├── core/                          # ビジネスロジック（フレームワーク非依存）
│   ├── package.json               # @nagiyu/share-together-core
│   ├── tsconfig.json
│   ├── jest.config.ts
│   ├── eslint.config.mjs
│   └── src/
│       ├── libs/                  # 純粋関数（ビジネスロジック）
│       │   ├── todo.ts            # ToDo 操作ロジック
│       │   ├── list.ts            # リスト操作ロジック
│       │   └── group.ts           # グループ操作ロジック
│       ├── repositories/          # データアクセス層
│       │   ├── user-repository.interface.ts
│       │   ├── dynamodb-user-repository.ts
│       │   ├── in-memory-user-repository.ts
│       │   ├── list-repository.interface.ts
│       │   ├── dynamodb-list-repository.ts
│       │   ├── in-memory-list-repository.ts
│       │   ├── todo-repository.interface.ts
│       │   ├── dynamodb-todo-repository.ts
│       │   ├── in-memory-todo-repository.ts
│       │   ├── group-repository.interface.ts
│       │   ├── dynamodb-group-repository.ts
│       │   ├── in-memory-group-repository.ts
│       │   ├── membership-repository.interface.ts
│       │   ├── dynamodb-membership-repository.ts
│       │   └── in-memory-membership-repository.ts
│       └── types/                 # 型定義
│           └── index.ts
│   └── tests/
│       └── unit/
├── web/                           # Next.js フロントエンド
│   ├── package.json               # @nagiyu/share-together-web
│   ├── tsconfig.json
│   ├── jest.config.ts
│   ├── playwright.config.ts
│   ├── eslint.config.mjs
│   ├── next.config.ts
│   ├── auth.ts                    # NextAuth 設定（Auth サービス JWT 検証）
│   ├── public/
│   │   ├── manifest.json          # PWA マニフェスト
│   │   ├── sw.js                  # Service Worker（プッシュ通知シェル）
│   │   ├── favicon.ico
│   │   ├── icon-192x192.png
│   │   └── icon-512x512.png
│   ├── src/
│   │   ├── app/                   # Next.js App Router
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx           # トップページ（個人デフォルトリスト）
│   │   │   ├── lists/
│   │   │   │   └── [listId]/page.tsx
│   │   │   ├── groups/
│   │   │   │   ├── page.tsx       # グループ一覧
│   │   │   │   ├── [groupId]/page.tsx
│   │   │   │   └── [groupId]/lists/[listId]/page.tsx
│   │   │   ├── invitations/
│   │   │   │   └── page.tsx       # 招待一覧
│   │   │   └── api/
│   │   │       ├── auth/[...nextauth]/route.ts
│   │   │       ├── users/route.ts
│   │   │       ├── lists/route.ts
│   │   │       ├── lists/[listId]/route.ts
│   │   │       ├── lists/[listId]/todos/route.ts
│   │   │       ├── lists/[listId]/todos/[todoId]/route.ts
│   │   │       ├── groups/route.ts
│   │   │       ├── groups/[groupId]/route.ts
│   │   │       ├── groups/[groupId]/members/route.ts
│   │   │       ├── groups/[groupId]/members/[userId]/route.ts
│   │   │       ├── groups/[groupId]/lists/route.ts
│   │   │       ├── groups/[groupId]/lists/[listId]/route.ts
│   │   │       ├── groups/[groupId]/lists/[listId]/todos/route.ts
│   │   │       ├── groups/[groupId]/lists/[listId]/todos/[todoId]/route.ts
│   │   │       └── invitations/route.ts
│   │   ├── components/            # React コンポーネント
│   │   │   ├── ThemeRegistry.tsx
│   │   │   ├── ServiceWorkerRegistration.tsx
│   │   │   ├── Navigation.tsx
│   │   │   ├── TodoList.tsx
│   │   │   ├── TodoItem.tsx
│   │   │   ├── TodoForm.tsx
│   │   │   ├── ListSidebar.tsx
│   │   │   ├── GroupCard.tsx
│   │   │   └── InvitationBadge.tsx
│   │   ├── lib/                   # Web 層のユーティリティ
│   │   │   ├── auth/
│   │   │   │   └── session.ts
│   │   │   ├── aws-clients.ts
│   │   │   └── constants/
│   │   │       └── errors.ts      # ERROR_MESSAGES（日本語）
│   │   └── types/                 # Web 層の型定義
│   │       └── index.ts
│   └── tests/
│       ├── unit/
│       └── e2e/

infra/share-together/
├── package.json
├── tsconfig.json
├── cdk.json
├── bin/
│   └── share-together.ts          # CDK アプリエントリポイント
└── lib/
    ├── dynamodb-stack.ts           # DynamoDB（シングルテーブル）
    ├── ecr-stack.ts                # ECR（web 用リポジトリ）
    ├── lambda-stack.ts             # Lambda（コンテナ: web）
    ├── iam-stack.ts                # IAM（開発用ユーザー - dev のみ）
    ├── cloudfront-stack.ts         # CloudFront（CloudFrontStackBase 継承）
    └── policies/
        └── web-runtime-policy.ts   # Lambda 実行ポリシー
```

**構成の決定**: `core + web` 構成を採用。バッチ処理（定期実行）は本 MVP では不要なため `batch` は持たない。将来的なプッシュ通知実装時に `batch` を追加する。

---

## 複雑性の追跡

> 憲法チェックに違反があり正当化が必要な場合のみ記入

現時点では憲法への違反なし。すべての原則に準拠した設計を採用している。
