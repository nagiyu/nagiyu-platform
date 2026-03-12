# 認証・認可の統合ガイド

## 概要

このドキュメントは、nagiyu プラットフォームにおける認証・認可システムの概要と、新規サービスを統合する際の考慮事項をまとめたものです。

## アーキテクチャ概要

### 中央集約型認証

nagiyu プラットフォームは、Auth サービスを中心とした中央集約型の認証アーキテクチャを採用しています。

- **Auth サービス**: OAuth プロバイダーとの連携、JWT トークンの発行を担当
- **Consumer サービス**: Auth サービスが発行した JWT を検証し、認証状態を判定

### シングルサインオン (SSO)

`.nagiyu.com` ドメイン配下の全サービスで、セッション Cookie を共有することで SSO を実現しています。

- 環境別の Cookie 分離: dev 環境と prod 環境で異なる Cookie 名を使用（サフィックスで区別）
- ドメイン横断: `.nagiyu.com` ドメインで Cookie を共有

### トークン検証

Consumer サービスは、NextAuth の JWT 検証機能を利用して、Auth サービスが発行したトークンを検証します。

- 共通の秘密鍵を使用して JWT を検証
- プロバイダー設定は不要（Auth サービスのみが OAuth を処理）

---

## Consumer サービスの統合パターン

### ミドルウェアベース認証

ミドルウェアで全リクエストの認証状態を検証するパターンです。

**特徴:**
- リクエスト毎に自動的に認証チェックが実行される
- 未認証ユーザーを自動的に Auth サービスにリダイレクト
- 特定のパスを認証不要にすることも可能

**実装方針:**
- `@nagiyu/nextjs` の `createAuthMiddleware()` を使用する。オプションとして `getSignInBaseUrl`（サインインページの URL 生成）、`getCallbackUrl`（コールバック URL 生成）、`onAuthConfigError`（設定エラー時のハンドラー）を渡す。
- `SKIP_AUTH_CHECK` 環境変数を設定することで、開発・テスト時に認証チェックをバイパスできる。

**適用サービス例:**
- Admin: 全ページで認証必須
- Niconico Mylist Assistant: ホームページは公開、他は認証必須

### ページレベル認証

ミドルウェアを使わず、各ページでセッション取得と認証チェックを行うパターンです。

**特徴:**
- ページ単位で細かい制御が可能
- ミドルウェアの実行コストがない

**適用サービス例:**
- Stock Tracker

---

## 統合時の一般的な問題と解決策

### 問題1: セッション Cookie の競合

**症状:**
- ログイン後、Consumer サービスにアクセスするとセッション Cookie が削除される
- 一度 Consumer サービスにアクセスすると、他のサービスでも SSO が解除される

**原因:**
Consumer サービスが独自の NextAuth インスタンスを持ち、Auth サービスの Cookie と競合している。

**解決策:**
Consumer サービスでは NextAuth の API ルートハンドラーを**配置しない**。
- Auth サービスのみが OAuth フローと Cookie 管理を担当
- Consumer サービスは JWT 検証のみを行う
- ミドルウェアがある場合でもルートハンドラーは不要

**例外:**
ミドルウェアを使用しないサービスでは、ルートハンドラーがあっても問題が発生しない場合がある。ただし、統一性のため配置しないことを推奨。

### 問題2: クライアントコンポーネントでの環境変数アクセス

**症状:**
- ログインボタンのリダイレクト URL が常に localhost になる
- デプロイ環境で正しい URL が使用されない

**原因:**
Next.js のクライアントコンポーネントは、プレフィックスなしの環境変数にアクセスできない。

**解決策:**
サーバーコンポーネントで環境変数を読み取り、クライアントコンポーネントに props として渡す。
- サーバーコンポーネント: 全ての環境変数にアクセス可能
- クライアントコンポーネント: NEXT_PUBLIC_ プレフィックス付きの変数のみアクセス可能

### 問題3: CDK デプロイ時の Context 伝播

**症状:**
- Lambda 関数の環境変数（AUTH_SECRET など）がデプロイ後にデフォルト値（PLACEHOLDER）に戻る
- 個別のスタックデプロイでは正常だが、別のスタックをデプロイすると値が上書きされる

**原因:**
CDK でスタックを個別にデプロイする際、依存するスタックが再評価されるが、その時に Context が渡されないとデフォルト値が使用される。

**メカニズム:**
1. Lambda Stack を Context 付きでデプロイ → 正常に設定される
2. IAM Stack をデプロイ（Lambda Stack に依存）
3. CDK が Lambda Stack を再評価するが、Context がないためデフォルト値を使用
4. Lambda の環境変数が上書きされる

**解決策:**
全てのアプリケーションスタックを一度にデプロイする。
- --all フラグを使用して全スタックをまとめてデプロイ
- インフラスタック（ECR、DynamoDB など）は --exclude で除外
- Context は1回のコマンドで全スタックに適用される

**デプロイ構成例:**
- インフラスタック: 個別にデプロイ（ECR、DynamoDB など）
- アプリケーションスタック: まとめてデプロイ（Lambda、Batch、IAM、CloudFront など）

---

## セッション型の設計方針

プラットフォームでは、用途が異なる2種類の Session 型を明確に分離する。

### DynamoDB エンティティ用（サーバーサイドのみ）

`@nagiyu/common` の `Session` 型は、DynamoDB に永続化された完全なユーザーエンティティを表す。`createdAt`/`updatedAt`/`lastLoginAt` 等を含む。サーバーサイドのリポジトリ層・バッチ処理のみが参照し、フロントエンドや API ルートの `getSession()` 戻り値には使用しない。

### Web セッション用（フロントエンド・API ルート）

`@nagiyu/nextjs` の `types/next-auth.d.ts` で定義した NextAuth の `Session` 拡張型を使用する。JWT/セッショントークンから復元される軽量な表現（`id`, `email`, `name`, `roles` 等のみ）であり、全 Consumer サービスで統一する。`createdAt`/`updatedAt` が必要なサーバーサイド処理は DynamoDB を直接参照する。

---

## NextAuth 設定の統一パターン

### Auth サービスと Consumer サービスの役割分担

- **Auth サービス**: `@nagiyu/nextjs` の `createAuthServerConfig({ providers })` を使用。OAuth プロバイダー定義と DynamoDB ユーザー永続化処理をサービス側で注入する。
- **Consumer サービス**: `@nagiyu/nextjs` の `createClientAuthConfig()` を使用。JWT 検証のみを行い、OAuth プロバイダー設定は不要。

Cookie オプション（`domain`, `secure`, `sameSite`, `httpOnly` 等）・セッション設定・コールバックの共通部分はファクトリ関数内に集約されており、サービス側で個別に定義しない。

---

## ミドルウェアの統一パターン

ミドルウェアを使用する全 Consumer サービスは `@nagiyu/nextjs` の `createAuthMiddleware()` を使用する。認証不要なパス（公開パス）の設定はミドルウェアのオプションで行う。サービス側でミドルウェアのロジックを個別実装しない。

---

## セッション取得の統一パターン

全 Consumer サービスのセッション取得は `@nagiyu/nextjs` の `createSessionGetter()` を使用する。

- `auth`: サービスの auth 関数を渡す
- `createTestSession`: `SKIP_AUTH_CHECK` が有効な場合に返すモックセッションの生成関数を渡す
- `mapSession`: NextAuth セッションをサービス固有のセッション型に変換する関数を渡す

セッション取得ロジックをサービス側で個別実装しない。

---



### 環境変数の命名

- **AUTH_SECRET**: JWT 検証用の秘密鍵（全サービス共通、Secrets Manager で管理）
- **NEXT_PUBLIC_AUTH_URL**: Auth サービスの URL（クライアントからアクセス可能）
- **APP_URL**: 自サービスの URL（サーバーサイドのみ、callbackUrl 構築に使用）

### Cookie 設定

- 環境別にサフィックスを付与（dev: .dev、prod: なし）
- ドメインは .nagiyu.com（ローカル開発時は未設定）
- secure フラグは本番環境のみ有効
- httpOnly を有効にしてセキュリティを確保

### デプロイワークフロー

- Secret は GitHub Actions で Secrets Manager から取得
- CDK Context として全てのデプロイコマンドに渡す
- --all を使用してアプリケーションスタックをまとめてデプロイ
- インフラスタックは事前に個別デプロイ

### セキュリティ

- AUTH_SECRET は全サービスで統一（Auth サービスで生成、他サービスは共有）
- JWT の有効期限は適切に設定（現状: 30日）
- CORS 設定は必要最小限に制限

---

## 参考情報

### 関連ドキュメント

- Auth サービス: `docs/services/auth/`
- アーキテクチャ全体: `docs/development/architecture.md`
- モノレポ構成: `docs/development/monorepo-structure.md`

### 既存の実装例

- **ミドルウェアあり、ルートハンドラーなし**: Admin、Niconico Mylist Assistant
- **ミドルウェアなし、ルートハンドラーあり**: Stock Tracker

新規サービスを追加する際は、これらの実装を参考にしてください。
