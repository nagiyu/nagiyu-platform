# Toolsアプリ 基本設計書

---

## 1. システムアーキテクチャ

### 1.1 全体構成図

![システム全体構成図](../../images/services/tools/system-architecture.drawio.svg)

#### 構成概要

```
ユーザー (ブラウザ)
    ↓ HTTPS
外部DNSサービス
    ↓ CNAME (tools.example.com → d123456.cloudfront.net)
CloudFront Distribution
    ↓ オリジン
Lambda Function URL (Next.js SSR + Lambda Web Adapter)
    ├─ Next.js App Router
    ├─ Material UI コンポーネント
    └─ 静的アセット (_next/static, public)
```

### 1.2 技術スタック

#### フロントエンド

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|----------|------|
| フレームワーク | Next.js | 15.x (最新) | React SSR フレームワーク |
| UI ライブラリ | Material UI (MUI) | 6.x (最新) | React コンポーネントライブラリ |
| 言語 | TypeScript | 5.x | 型安全な開発 |
| スタイリング | Emotion (MUI内蔵) | - | CSS-in-JS |
| 状態管理 | React Context / useState | - | ローカル状態管理 |
| PWA | next-pwa | - | Progressive Web App 対応 |

#### バックエンド

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|----------|------|
| ランタイム | Node.js | 22.x | JavaScript 実行環境 |
| フレームワーク | Next.js API Routes | 15.x | サーバーサイド処理 |
| Lambda Adapter | AWS Lambda Web Adapter | 0.8.x | Lambda で Web アプリ実行 |

#### インフラ

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| コンピューティング | AWS Lambda | Next.js 実行環境 (コンテナ) |
| コンテナレジストリ | Amazon ECR | Docker イメージ保存 |
| CDN | Amazon CloudFront | コンテンツ配信、カスタムドメイン |
| SSL/TLS | AWS ACM | HTTPS 証明書 (共通基盤) |
| DNS | 外部DNSサービス | ドメイン管理 |
| IaC | AWS CloudFormation | インフラ定義 |
| CI/CD | GitHub Actions | 自動ビルド・デプロイ |
| シークレット管理 | AWS Secrets Manager | API キー等 (必要時) |

#### 開発ツール

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| パッケージマネージャ | npm | 依存関係管理 |
| リンター | ESLint | コード品質チェック |
| フォーマッター | Prettier | コード整形 |
| テスト (単体) | Jest + React Testing Library | ユニットテスト |
| テスト (E2E) | Playwright | ブラウザ自動化テスト |
| テスト (アクセシビリティ) | @axe-core/playwright | アクセシビリティ検証 |
| CI/CD | GitHub Actions | 自動ビルド・テスト・デプロイ |

### 1.3 コンポーネント構成

#### アプリケーションレイヤー

![アプリケーションレイヤー構成図](../../images/services/tools/application-layers.drawio.svg)

---

## 2. アプリケーションアーキテクチャ

### 2.1 フロントエンド構成

#### Next.js App Router 構成

- **レンダリング戦略**: Server Side Rendering (SSR)
- **ルーティング**: App Router (`app/` ディレクトリ)
- **レイアウト**: 共通レイアウトを `app/layout.tsx` で定義
- **ページ**: 各ツールを動的ルートで実装

#### Material UI 構成

- **テーマ**: ライトテーマのみ (将来ダークモード対応予定)
- **カスタマイズ**: プライマリカラー、フォント等をカスタマイズ
- **レスポンシブ**: MUIのBreakpointsを活用
    - `xs`: 0px〜 (スマートフォン)
    - `sm`: 600px〜 (タブレット)
    - `md`: 900px〜 (小型PC)
    - `lg`: 1200px〜 (デスクトップ)
    - `xl`: 1536px〜 (大型ディスプレイ)

#### PWA 構成

- **パッケージ**: next-pwa (Next.js用PWAプラグイン)
- **Service Worker**: 自動生成
    - 静的アセットのキャッシュ
    - オフライン時のフォールバック
- **Manifest**: `public/manifest.json`
    - アプリ名: "Tools"
    - 表示モード: standalone
    - テーマカラー: #1976d2 (プライマリカラー)
    - アイコン: 192x192, 512x512
- **Web Share Target**: 他のアプリから共有されたコンテンツを受け取る
    - アクション: `/transit-converter`
    - メソッド: GET
    - パラメータ: title, text, url
    - 用途: 乗換案内URLや乗換案内テキストを他のアプリから直接受け取り、自動的に入力欄に挿入
    - 制約: HTTPS環境でのみ動作、iOS Safariでは制限あり
- **キャッシュ戦略**:
    - 静的ファイル: Cache First
    - API: Network First (オフライン時はキャッシュ)
- **オフライン対応**:
    - 基本的なクライアントサイドツールはオフラインで動作
    - オンライン/オフライン状態の表示

### 2.2 バックエンド構成

#### Next.js API Routes

Next.js の API Routes (`app/api/` ディレクトリ) を使用。
現時点では、ほとんどの処理がクライアントサイドで完結するため、最小限の API を実装。

**想定される API:**
- `/api/health` - ヘルスチェック (Lambda 稼働確認用)
- (将来) `/api/tools/*` - サーバーサイド処理が必要なツール

#### Lambda 実行環境

- **ランタイム**: Node.js 22 (コンテナイメージ)
- **メモリ**: 512MB〜1024MB (パフォーマンスを見て調整)
- **タイムアウト**: 30秒 (API Gateway最大値)
- **環境変数**:
    - `NODE_ENV=production`
    - `PORT=3000` (Lambda Web Adapter用)
    - その他、必要に応じて追加

---

## 3. インフラ設計

### 3.1 AWS構成図

![AWS インフラ構成図](../../images/services/tools/aws-architecture.drawio.svg)

### 3.2 CloudFormationスタック設計

#### スタック一覧

| スタック名 | テンプレート | 説明 | 依存関係 |
|-----------|-------------|------|---------|
| `nagiyu-tools-ecr` | `infra/tools/ecr.yaml` | ECR リポジトリ | なし |
| `nagiyu-tools-lambda-dev` | `infra/tools/lambda.yaml` | Lambda 関数 (dev) | ECR |
| `nagiyu-tools-lambda-prod` | `infra/tools/lambda.yaml` | Lambda 関数 (prod) | ECR |
| `nagiyu-tools-cloudfront-dev` | `infra/tools/cloudfront.yaml` | CloudFront (dev) | Lambda (dev) 、ACM (共通) |
| `nagiyu-tools-cloudfront-prod` | `infra/tools/cloudfront.yaml` | CloudFront (prod) | Lambda (prod) 、ACM (共通) |

#### スタック詳細

**1. ECR リポジトリ**
- リポジトリ名: `nagiyu/tools`
- イメージタグ: `latest`, `{git-commit-sha}`, `{環境}-{version}`
- ライフサイクルポリシー: 最新10イメージのみ保持

**2. Lambda 関数**
- 関数名: `nagiyu-tools-app-{env}`
- イメージURI: ECRから取得
- メモリ: 1024MB
- タイムアウト: 30秒
- Function URL: 有効化 (認証なし)
- 環境変数:
    - `NODE_ENV=production`
    - `PORT=3000`
    -  (必要に応じて) Secrets Manager から取得した値

**3. CloudFront Distribution**
- オリジン: Lambda Function URL
- ビヘイビア:
    - デフォルト: すべてのリクエストをLambdaに転送
    - キャッシュポリシー: `CachingDisabled` (SSRのため)
- 証明書: ACM (共通基盤の `nagiyu-shared-acm-certificate`)
- カスタムドメイン:
    - dev: `dev-tools.example.com`
    - prod: `tools.example.com`
- HTTPS: Redirect HTTP to HTTPS

#### パラメータ管理

各スタックで使用するパラメータ:

```yaml
Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, prod]
    Description: 環境名

  ImageUri:
    Type: String
    Description: ECR イメージ URI

  CustomDomain:
    Type: String
    Description: カスタムドメイン名

  CertificateArn:
    Type: String
    Description: ACM 証明書 ARN (共通基盤からImport)
```

### 3.3 ネットワーク設計

#### VPC 使用の有無

**現時点**: VPC 不要
- Lambda は VPC 外で実行 (パブリックインターネットアクセス)
- データベース等のプライベートリソースがないため

**将来**: DynamoDB や RDS を使用する場合
- VPC 内で Lambda を実行
- 共通基盤の VPC を使用

#### DNS 設定

外部DNSサービスでの設定:

| レコードタイプ | 名前 | 値 | TTL |
|--------------|------|-----|-----|
| CNAME | `tools.example.com` | `d123456.cloudfront.net` | 300 |
| CNAME | `dev-tools.example.com` | `d789012.cloudfront.net` | 300 |

**注**: `d123456.cloudfront.net` は CloudFront のドメイン名 (スタック出力から取得)

### 3.4 セキュリティ設計

#### HTTPS 通信

- CloudFront で SSL/TLS 終端
- ACM 証明書を使用 (共通基盤)
- HTTP → HTTPS リダイレクト強制

#### Lambda セキュリティ

- **IAM ロール**: 最小権限の原則
    - CloudWatch Logs への書き込み
    - (必要時) Secrets Manager からのシークレット取得
    - ECR からのイメージプル
- **環境変数**: 機密情報は Secrets Manager から取得してデプロイ時に設定

#### セキュリティヘッダー

CloudFront Response Headers Policy で以下を設定:

```yaml
SecurityHeadersPolicy:
  Strict-Transport-Security: "max-age=31536000; includeSubDomains"
  X-Content-Type-Options: "nosniff"
  X-Frame-Options: "DENY"
  X-XSS-Protection: "1; mode=block"
  Referrer-Policy: "strict-origin-when-cross-origin"
```

#### CORS 設定

- 基本的に CORS は不要 (同一オリジン)
- 将来的に外部APIを使用する場合のみ設定

---

## 4. CI/CD 設計

### 4.1 GitHub Actions ワークフロー構成

Tools アプリでは、2つの GitHub Actions ワークフローを使用します:

#### 1. プルリクエスト検証ワークフロー (`tools-pr.yml`)

**目的**: develop および integration/** ブランチへのプルリクエスト時に品質を検証

**トリガー条件**:
- `pull_request` イベント
- 対象ブランチ: `develop`, `integration/**`
- 対象パス:
    - `services/tools/**`
    - `infra/tools/**`
    - `.github/workflows/tools-pr.yml`

**実行内容**:
1. **Next.js ビルド検証**
    - `npm ci` で依存関係をインストール
    - `npm run build` でプロダクションビルドを実行
    - ビルドエラーの早期検出

2. **Docker イメージビルド検証** (Lambda 用)
    - Lambda デプロイ用 Docker イメージをビルド
    - Dockerfile の構文エラーやビルドエラーを検出
    - ECR へのプッシュは行わない (検証のみ)

3. **単体テスト実行**
    - `npm test` で Jest テストスイートを実行
    - テストカバレッジの確認
    - 全テストの合格を必須とする

**マージ条件**:
- すべてのジョブ (Next.js ビルド、Docker ビルド、テスト) が成功すること
- GitHub のブランチプロテクションルールで必須チェックとして設定

#### 2. デプロイワークフロー (`tools-deploy.yml`)

**目的**: develop, integration/**, master ブランチへのプッシュ時に自動デプロイ

**トリガー条件**:
- `push` イベント
- 対象ブランチ: `develop`, `integration/**`, `master`
- 対象パス:
    - `services/tools/**`
    - `infra/tools/**`
    - `.github/workflows/tools-deploy.yml`

**実行内容**:
1. インフラストラクチャのデプロイ (ECR)
2. Docker イメージのビルドと ECR へのプッシュ
3. Lambda 関数のデプロイ
4. CloudFront ディストリビューションのデプロイ

**環境分離**:
- `develop`, `integration/**` → 開発環境 (dev)
- `master` → 本番環境 (prod)

### 4.2 CI/CD フロー図

```
Pull Request (to develop/integration/**)
    ↓
PR検証ワークフロー実行
    ├─ Next.js ビルド検証
    ├─ Docker イメージビルド検証
    └─ 単体テスト実行
    ↓
すべて成功 → マージ可能
    ↓
マージ (develop/integration/** へ push)
    ↓
デプロイワークフロー実行
    ├─ ECR スタックデプロイ
    ├─ Docker ビルド & プッシュ
    ├─ Lambda デプロイ
    └─ CloudFront デプロイ
    ↓
開発環境へデプロイ完了
```

### 4.3 ワークフロー設計方針

#### PR検証の重要性

- **master ブランチは対象外**: 本番環境への直接プッシュは行わないため、PR検証も不要
- **早期フィードバック**: マージ前に問題を検出し、デプロイ失敗を防ぐ
- **品質保証**: すべてのコードがビルド・テストを通過してからマージ
- **コスト最適化**:
    - PR段階では ECR プッシュやデプロイを行わない
    - 検証のみに留めることで AWS リソース使用を最小化

#### テスト戦略

**単体テスト対象**:
- ビジネスロジック (`src/lib/parsers/`, `src/lib/formatters/`)
- ユーティリティ関数 (`src/lib/clipboard.ts`)
- API Routes (`src/app/api/**`)

**テスト要件**:
- 全テストが合格すること
- 重要なロジックにはテストカバレッジを確保

#### ブランチ保護ルール

develop および integration/** ブランチには以下を設定:
- PR検証ワークフローの成功を必須とする
- 直接プッシュを禁止 (PR経由のみ)
- レビュー承認を推奨 (チーム規模に応じて)

---

## 5. API設計

### 5.1 エラーハンドリング方針

#### クライアントサイド

- ユーザー入力エラー: Material UI の Snackbar でフィードバック
- ネットワークエラー: リトライ機能を提供
- パースエラー: エラーメッセージを表示し、入力の修正を促す

#### サーバーサイド

- Lambda エラー: CloudWatch Logs に記録
- HTTP ステータスコード:
    - `200`: 成功
    - `400`: クライアントエラー (不正なリクエスト)
    - `500`: サーバーエラー (内部エラー)

---

## 6. 画面設計

### 6.1 画面遷移図

![画面遷移図](../../images/services/tools/screen-transition.drawio.svg)

#### 画面遷移フロー

```
トップページ (ツール一覧)
  ├─→ 乗り換え変換ツール
  └─→  (将来) その他のツール
```

### 6.2 画面一覧

| 画面ID | 画面名 | URL | 説明 |
|--------|-------|-----|------|
| SCR-001 | トップページ | `/` | ツール一覧を表示 |
| SCR-002 | 乗り換え変換ツール | `/transit-converter` | 乗り換え情報を変換 |

### 6.3 ワイヤーフレーム (主要画面)

#### SCR-001: トップページ (ツール一覧)

![トップページワイヤーフレーム](../../images/services/tools/wireframe-top.drawio.svg)

**構成要素:**
- ヘッダー: アプリ名「Tools」(中央揃え)
- メインコンテンツ: ツールカード一覧 (Grid レイアウト)
- フッター: バージョン表示、将来実装予定リンク (プライバシーポリシー、利用規約)

**レイアウト:**
- PC: 3カラム
- タブレット: 2カラム
- スマートフォン: 1カラム

---

#### SCR-002: 乗り換え変換ツール

![乗り換え変換ツールワイヤーフレーム](../../images/services/tools/wireframe-transit.drawio.svg)

**構成要素:**
- ヘッダー: 共通
- メインコンテンツ:
    - 入力エリア: テキストフィールド (URLまたはテキスト貼り付け)
    - クリップボード読み取りボタン (Clipboard API使用)
    - 変換ボタン
    - 出力エリア: 整形された結果表示
    - コピーボタン
- フッター: 共通

---

## 7. 外部インターフェース

### 7.1 外部DNS連携

#### DNS レコード設定

外部DNSサービス (例: お名前.com、ムームードメイン等) で以下を設定:

**開発環境:**
- ホスト名: `dev-tools`
- タイプ: `CNAME`
- 値: CloudFront Distribution のドメイン名 (例: `d789012.cloudfront.net`)
- TTL: 300秒

**本番環境:**
- ホスト名: `tools` (または `www.tools`)
- タイプ: `CNAME`
- 値: CloudFront Distribution のドメイン名 (例: `d123456.cloudfront.net`)
- TTL: 300秒

#### SSL/TLS 証明書

- 共通基盤の ACM 証明書を使用
- ワイルドカード証明書: `*.example.com`、`example.com`
- Export値: `nagiyu-shared-acm-certificate-arn`

### 7.2 CloudFront設定

#### オリジン設定

| 設定項目 | 値 |
|---------|---|
| オリジンドメイン | Lambda Function URL (例: `abc123.lambda-url.us-east-1.on.aws`) |
| オリジンプロトコル | HTTPS only |
| オリジンパス | なし |
| カスタムヘッダー | なし |

#### ビヘイビア設定

| 設定項目 | 値 |
|---------|---|
| パスパターン | デフォルト (`*`) |
| ビューワープロトコルポリシー | Redirect HTTP to HTTPS |
| 許可HTTPメソッド | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE |
| キャッシュポリシー | CachingDisabled (SSRのため) |
| オリジンリクエストポリシー | AllViewer |
| レスポンスヘッダーポリシー | SecurityHeadersPolicy (カスタム) |

#### エラーページ

| HTTPステータス | エラーキャッシング最小TTL | カスタムエラーレスポンス |
|--------------|----------------------|---------------------|
| 404 | 10 | `/404` にリダイレクト (将来実装) |
| 500 | 0 | なし (Lambdaのエラーをそのまま返す) |

### 7.3 その他外部サービス連携

#### GitHub (CI/CD)

- **GitHub Actions** でビルド・デプロイを自動化
- ワークフロー:
    1. コードプッシュ
    2. Dockerイメージビルド
    3. ECR にプッシュ
    4. Lambda 関数を更新

#### Secrets Manager (必要時)

- APIキー等のシークレットを保存
- デプロイ時に取得して Lambda 環境変数に設定
