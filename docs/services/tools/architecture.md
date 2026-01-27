# Tools アーキテクチャ設計書

---

## 1. システム概要

Toolsアプリは、AWS Lambda + Next.js SSR で構築されたサーバーレスWebアプリケーションです。
CloudFront経由でコンテンツを配信し、ユーザーデータはすべてクライアントサイドで処理します。

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

---

## 2. 技術スタック

### 2.1 フロントエンド

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|----------|------|
| フレームワーク | Next.js | 15.x (最新) | React SSR フレームワーク |
| UI ライブラリ | Material UI (MUI) | 6.x (最新) | React コンポーネントライブラリ |
| 言語 | TypeScript | 5.x | 型安全な開発 |
| スタイリング | Emotion (MUI内蔵) | - | CSS-in-JS |
| 状態管理 | React Context / useState | - | ローカル状態管理 |
| PWA | next-pwa | - | Progressive Web App 対応 |

### 2.2 バックエンド

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|----------|------|
| ランタイム | Node.js | 22.x | JavaScript 実行環境 |
| フレームワーク | Next.js API Routes | 15.x | サーバーサイド処理 |
| Lambda Adapter | AWS Lambda Web Adapter | 0.8.x | Lambda で Web アプリ実行 |

### 2.3 インフラ

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| コンピューティング | AWS Lambda | Next.js 実行環境 (コンテナ) |
| コンテナレジストリ | Amazon ECR | Docker イメージ保存 |
| CDN | Amazon CloudFront | コンテンツ配信、カスタムドメイン |
| SSL/TLS | AWS ACM | HTTPS 証明書 (共通基盤) |
| DNS | 外部DNSサービス | ドメイン管理 |
| IaC | AWS CDK (TypeScript) | インフラ定義 |
| CI/CD | GitHub Actions | 自動ビルド・デプロイ |
| シークレット管理 | AWS Secrets Manager | API キー等 (必要時) |

### 2.4 開発ツール

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| パッケージマネージャ | npm | 依存関係管理 |
| リンター | ESLint | コード品質チェック |
| フォーマッター | Prettier | コード整形 |
| テスト (単体) | Jest + React Testing Library | ユニットテスト |
| テスト (E2E) | Playwright | ブラウザ自動化テスト |
| テスト (アクセシビリティ) | @axe-core/playwright | アクセシビリティ検証 |
| CI/CD | GitHub Actions | 自動ビルド・テスト・デプロイ |

---

## 3. アーキテクチャパターン

### 3.1 データフロー

**データフロー概要**:

```
ユーザー (ブラウザ)
    ↓ HTTPS
CloudFront Distribution
    ↓ オリジン
Lambda Function URL (Next.js SSR)
    ├─ Next.js App Router
    ├─ Material UI コンポーネント
    └─ 静的アセット (_next/static, public)
```

すべての処理はクライアントサイドまたはステートレスに実行され、ユーザーデータはサーバーに保存されません。

### 3.2 コンポーネント構成

#### アプリケーションレイヤー

![アプリケーションレイヤー構成図](../../images/services/tools/application-layers.drawio.svg)

#### Next.js App Router 構成

- **レンダリング戦略**: Server Side Rendering (SSR)
- **ルーティング**: App Router (`app/` ディレクトリ)
- **レイアウト**: 共通レイアウトを `app/layout.tsx` で定義
- **ページ**: 各ツールを動的ルートで実装

**実装されているツールページ**:
- `/` - ツール一覧ページ（トップページ）
- `/transit-converter` - 乗り換え変換ツール
- `/json-formatter` - JSON 整形ツール（フェーズ2で実装予定）

**設計方針**:
- 各ツールは独立したページとして実装
- 共通のレイアウト・UIコンポーネントを再利用
- クライアントサイドで完結する処理を優先

#### Material UI 構成

- **テーマ**: ライトテーマのみ (将来ダークモード対応予定)
- **カスタマイズ**: プライマリカラー、フォント等をカスタマイズ
- **レスポンシブ**: MUIのBreakpointsを活用
    - `xs`: 0px〜 (スマートフォン)
    - `sm`: 600px〜 (タブレット)
    - `md`: 900px〜 (小型PC)
    - `lg`: 1200px〜 (デスクトップ)
    - `xl`: 1536px〜 (大型ディスプレイ)

#### ツール固有のコンポーネント設計

各ツールは以下の設計パターンに従います。

**共通設計方針**:
- 縦並びレイアウト（入力エリア → アクションボタン → 出力エリア）
- クリップボード読み取り・書き込み機能の統一
- エラー表示は Snackbar で統一
- レスポンシブ対応

**JSON Formatter の設計要素**:
- **入力コンポーネント**: `TextField`（Material UI）、複数行テキストエリア
- **アクションボタン**:
  - 「整形」ボタン: `JSON.stringify(JSON.parse(input), null, 2)` を実行
  - 「圧縮」ボタン: `JSON.stringify(JSON.parse(input))` を実行
  - 「クリア」ボタン: 入力・出力をリセット
  - クリップボード読み取りボタン: Clipboard API 使用
- **出力コンポーネント**: `TextField`（読み取り専用）、複数行テキストエリア
- **エラーハンドリング**: `JSON.parse()` の例外を `try-catch` でキャッチし、Snackbar に表示
- **コピー機能**: Clipboard API 使用、成功時に Snackbar でフィードバック

**再利用可能なコンポーネント**:
- クリップボード読み取りボタン（Transit Converter と共通化可能）
- コピーボタン（Transit Converter と共通化可能）
- エラー表示 Snackbar

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

---

## 4. データモデル

### 4.1 データベーススキーマ

現時点ではデータベースを使用しません。すべてのデータはクライアントサイド（LocalStorage）またはステートレスに処理されます。

将来的にデータベースが必要になった場合は DynamoDB を検討します。

### 4.2 API 型定義

#### Health API

**エンドポイント**: `/api/health`

**レスポンス**:
```typescript
{
  status: "ok",
  timestamp: string,  // ISO 8601形式
  version: string     // アプリケーションバージョン
}
```

#### JSON Formatter 型定義

JSON Formatter はクライアントサイドで完結する処理のため、API は不要です。
型定義の設計指針のみを示します。

**設計方針**:
- `JSON.parse()` と `JSON.stringify()` を使用した標準的な実装
- エラーハンドリング: `try-catch` で `JSON.parse()` の例外をキャッチ
- 入出力の型安全性を確保
- バリデーション結果の明確な表現

**型定義の例**:
```typescript
// JSON 操作の結果
interface JsonFormatResult {
  success: boolean;
  data?: string;        // 整形/圧縮されたJSON文字列
  error?: string;       // エラーメッセージ
}

// JSON バリデーション結果
interface JsonValidationResult {
  valid: boolean;
  error?: string;       // エラーメッセージ
}
```

**実装の考慮事項**:
- インデント: 2スペース固定
- 大きなJSONの処理パフォーマンス（10MB以内を推奨）
- 循環参照の検出（`JSON.stringify()` がエラーを投げる）

---

## 5. インフラ構成

![AWS インフラ構成図](../../images/services/tools/aws-architecture.drawio.svg)

### 5.2 リソース一覧

| リソース | 説明 | 設定 |
|---------|------|------|
| ECR Repository | Docker イメージ保存 | `nagiyu/tools`, ライフサイクルポリシー: 最新10イメージ保持 |
| Lambda Function | Next.js 実行環境 | Node.js 22 コンテナ、1024MB、30秒タイムアウト |
| Lambda Function URL | HTTP(S) エンドポイント | 認証なし、CORS許可 |
| CloudFront Distribution | CDN、カスタムドメイン | オリジン: Lambda Function URL、HTTPS強制 |
| ACM Certificate | SSL/TLS証明書 | 共通基盤（`*.nagiyu.com`）、us-east-1 |

### 5.3 ネットワーク設計

**現時点**: VPC 不要
- Lambda は VPC 外で実行 (パブリックインターネットアクセス)
- データベース等のプライベートリソースがないため

**将来**: DynamoDB や RDS を使用する場合
- VPC 内で Lambda を実行
- 共通基盤の VPC を使用

**DNS 設定**:

外部DNSサービスでの設定:

| レコードタイプ | 名前 | 値 | TTL |
|--------------|------|-----|-----|
| CNAME | `tools.example.com` | `d123456.cloudfront.net` | 300 |
| CNAME | `dev-tools.example.com` | `d789012.cloudfront.net` | 300 |

**注**: `d123456.cloudfront.net` は CloudFront のドメイン名 (スタック出力から取得)

---

## 6. セキュリティ設計

### 6.1 認証・認可

- CloudFront で SSL/TLS 終端
- ACM 証明書を使用 (共通基盤)
- HTTP → HTTPS リダイレクト強制

**Lambda セキュリティ**:

- **IAM ロール**: 最小権限の原則
    - CloudWatch Logs への書き込み
    - (必要時) Secrets Manager からのシークレット取得
    - ECR からのイメージプル
- **環境変数**: 機密情報は Secrets Manager から取得してデプロイ時に設定

### 6.3 セキュリティヘッダー

CloudFront Response Headers Policy で以下を設定:

```yaml
SecurityHeadersPolicy:
  Strict-Transport-Security: "max-age=31536000; includeSubDomains"
  X-Content-Type-Options: "nosniff"
  X-Frame-Options: "DENY"
  X-XSS-Protection: "1; mode=block"
  Referrer-Policy: "strict-origin-when-cross-origin"
```

### 6.4 その他のセキュリティ対策

**CORS 設定**:

- 基本的に CORS は不要 (同一オリジン)
- 将来的に外部APIを使用する場合のみ設定

**データの取り扱い**:
- 入力データはブラウザ内で処理 (サーバーに送信しない方針)
- バックエンドAPIを使用する場合も、ログには機密情報を含めない

---

## 7. 技術選定理由

### Next.js

**理由**:
- React ベースの SSR フレームワークとして成熟
- App Router による直感的なファイルベースルーティング
- AWS Lambda でのコンテナ実行が容易
- PWA 対応が容易

**代替案との比較**:
- Remix: Next.js の方が AWS Lambda との統合実績が豊富
- Astro: MPA ではなく SPA が必要なため不適

### Material-UI (MUI)

**理由**:
- React 用の成熟した UI ライブラリ
- レスポンシブデザインが容易
- アクセシビリティ対応が充実
- カスタマイズ性が高い

**代替案との比較**:
- Chakra UI: Material Design に準拠したい
- Tailwind CSS: コンポーネントライブラリとして MUI の方が高機能

### AWS Lambda (コンテナ)

**理由**:
- サーバーレスでコスト効率が高い
- Next.js SSR がコンテナで実行可能
- 自動スケーリング
- Lambda Web Adapter による簡単な実装

**代替案との比較**:
- ECS Fargate: Lambda の方がコスト効率が高い
- Vercel: AWS 上での完全な制御が必要

---

## 8. 制約事項

### 8.1 技術的制約

1. **ブラウザ依存**:
    - モダンブラウザのみ対応 (IE11等のレガシーブラウザは非対応)
    - JavaScriptが有効である必要がある
    - Clipboard API が使用可能である必要がある

2. **データサイズ制限**:
    - ブラウザのメモリ制限により、大きなデータの処理には限界がある
    - 入力データは10MB以内を推奨

3. **Lambda 制約**:
    - タイムアウト: 最大30秒 (Function URL の制約)
    - メモリ: 最大10GB (現在は1024MB)
    - コンテナイメージ: 最大10GB

### 8.2 運用制約

1. **保守体制**:
    - 個人による保守のため、障害対応は迅速でない可能性
    - SLAは提供しない

2. **コスト制約**:
    - AWS無料枠の範囲内で運用 (可能な限り)
    - 大規模なトラフィックは想定しない

---

## 9. 将来拡張

### 検討事項

- **データベース統合**: ユーザー設定の永続化が必要になった場合は DynamoDB を検討
- **認証機能**: ユーザー固有の機能が必要になった場合は Cognito または Auth0 を検討
- **API Gateway 統合**: REST API が必要になった場合は API Gateway を追加
- **ダークモード対応**: Material-UI のテーマ機能を活用したダークモード実装
- **多言語対応**: i18n ライブラリによる国際化対応
- **CDN キャッシュ最適化**: 静的アセットのキャッシュポリシー最適化
