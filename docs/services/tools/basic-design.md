# Toolsアプリ 基本設計書

**バージョン**: 1.0.0
**最終更新日**: 2025-12-14
**ステータス**: 初版作成

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
| テスト | Jest + React Testing Library | ユニットテスト |

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

### 2.3 ディレクトリ構造

```
nagiyu-platform/
├── services/
│   └── tools/                           # Next.js プロジェクトルート
│       ├── src/
│       │   ├── app/                     # App Router
│       │   │   ├── layout.tsx           # 共通レイアウト
│       │   │   ├── page.tsx             # トップページ (ツール一覧)
│       │   │   ├── transit-converter/   # 乗り換え変換ツール
│       │   │   │   └── page.tsx
│       │   │   ├── api/                 # API Routes
│       │   │   │   └── health/
│       │   │   │       └── route.ts     # ヘルスチェックAPI
│       │   │   └── globals.css          # グローバルスタイル
│       │   │
│       │   ├── components/              # React コンポーネント
│       │   │   ├── layout/
│       │   │   │   ├── Header.tsx
│       │   │   │   └── Footer.tsx
│       │   │   ├── tools/
│       │   │   │   ├── ToolCard.tsx
│       │   │   │   └── TransitConverter.tsx
│       │   │   └── common/
│       │   │       ├── Button.tsx
│       │   │       └── CopyButton.tsx
│       │   │
│       │   ├── lib/                     # ユーティリティ・ロジック
│       │   │   ├── parsers/
│       │   │   │   └── transitParser.ts  # 乗り換えパーサー
│       │   │   ├── clipboard.ts         # クリップボード操作
│       │   │   └── formatters.ts        # データ整形
│       │   │
│       │   ├── styles/                  # スタイル関連
│       │   │   └── theme.ts             # MUIテーマ定義
│       │   │
│       │   └── types/                   # TypeScript型定義
│       │       └── tools.ts
│       │
│       ├── public/                      # 静的ファイル
│       │   ├── icons/
│       │   │   ├── icon-192.png
│       │   │   └── icon-512.png
│       │   ├── manifest.json            # PWAマニフェスト
│       │   └── robots.txt
│       │
│       ├── Dockerfile                   # Lambda コンテナイメージ
│       ├── .dockerignore
│       ├── package.json
│       ├── package-lock.json
│       ├── tsconfig.json
│       ├── next.config.js
│       ├── eslint.config.js
│       ├── .prettierrc
│       └── README.md
│
├── infra/
│   └── tools/                           # CloudFormation テンプレート
│       ├── ecr.yaml                     # ECR リポジトリ
│       ├── lambda.yaml                  # Lambda 関数
│       └── cloudfront.yaml              # CloudFront Distribution
│
└── docs/
    └── services/tools/                  # ドキュメント (本ファイル等)
```

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

## 4. データベース設計

### 4.1 ER図

**現時点**: データベース不要

ユーザーデータを保存しないため、データベースは使用しない。
将来的にツールの使用履歴やお気に入り機能を実装する場合は、ローカルストレージまたは DynamoDB を検討。

### 4.2 テーブル定義 (概要)

該当なし

### 4.3 リレーション

該当なし

---

## 5. API設計

### 5.1 APIエンドポイント一覧

#### 内部API (Next.js API Routes)

| エンドポイント | メソッド | 説明 | リクエスト | レスポンス |
|--------------|---------|------|----------|----------|
| `/api/health` | GET | ヘルスチェック | なし | `{ status: "ok" }` |

**将来追加予定のAPI:**
- `/api/tools/transit` - サーバーサイドで乗り換えをパース (必要な場合)

#### 外部API

なし (現時点では外部APIは使用しない)

### 5.2 認証・認可方式

**認証**: なし (全機能を認証なしで提供)

**将来**: ユーザー機能を追加する場合
- Cognito または Auth0 を検討
- JWT ベースの認証

### 5.3 エラーハンドリング方針

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
- フッター: バージョン表示、将来実装予定リンク（プライバシーポリシー、利用規約）

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

---

## 付録

### A. 技術選定の理由

#### Next.js を選んだ理由
- React エコシステムの中で最も人気のあるフルスタックフレームワーク
- SSR、SSG、ISR など柔軟なレンダリング戦略
- App Router で最新のReact機能 (Server Components等) を学習可能
- Vercel によるサポートが手厚い

#### Material UI を選んだ理由
- 豊富なコンポーネント
- デザインの一貫性が保ちやすい
- レスポンシブデザインが容易
- カスタマイズ性が高い

#### Lambda Web Adapter を選んだ理由
- サーバーレスでコスト最適化
- Next.js を Lambda で動かす最もシンプルな方法
- AWS統一のインフラ構成
- スケーラビリティが高い

### B. 変更履歴

| 日付 | バージョン | 変更内容 | 担当者 |
|------|-----------|---------|--------|
| 2025-12-14 | 1.0.0 | 初版作成 | - |

---

**承認**

本基本設計書は、プロジェクトオーナーの承認を経て確定版となります。

- [ ] 基本設計の承認
- [ ] 次フェーズ (詳細設計) への移行許可
