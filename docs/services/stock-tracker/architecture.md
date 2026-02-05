# Stock Tracker アーキテクチャ設計書

## 1. システム概要

Stock Tracker は、株価のリアルタイム監視と条件ベースのアラート通知を提供するサービスです。TradingView API から株価データを取得し、ユーザーが設定した条件（価格閾値など）を満たした場合に Web Push 通知を送信します。また、保有株式の管理とウォッチリスト機能により、投資判断を支援します。

### 1.1 全体構成図

![AWS インフラ構成図](../../images/services/stock-tracker/aws-architecture.drawio.svg)

---

## 2. 技術スタック

### 2.1 フロントエンド

| カテゴリ       | 技術                    | 用途                                     |
| -------------- | ----------------------- | ---------------------------------------- |
| フレームワーク | Next.js 15 (App Router) | サーバーサイドレンダリング、ルーティング |
| UI ライブラリ  | Material-UI v7          | UIコンポーネント                         |
| チャート表示   | ECharts                 | インタラクティブな株価チャート           |
| 言語           | TypeScript              | 型安全な開発                             |
| 通知           | Web Push API            | ブラウザ通知                             |

### 2.2 バックエンド

| カテゴリ       | 技術                                            | 用途                       |
| -------------- | ----------------------------------------------- | -------------------------- |
| ランタイム     | Node.js 20                                      | Lambda 実行環境            |
| フレームワーク | Next.js 15 (API Routes)                         | RESTful API エンドポイント |
| 認証           | NextAuth.js + @nagiyu/auth-core                 | JWT ベース認証             |
| AWS SDK        | @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb | DynamoDB操作               |
| 外部API        | @mathieuc/tradingview                           | 株価データ取得             |
| Web Push       | web-push                                        | プッシュ通知送信           |

### 2.3 インフラ

| カテゴリ           | 技術                               | 用途                         |
| ------------------ | ---------------------------------- | ---------------------------- |
| コンピューティング | AWS Lambda (Web Adapter)           | Next.js アプリケーション実行 |
| バッチ処理         | AWS Lambda + EventBridge Scheduler | 定期的なアラート処理         |
| データベース       | Amazon DynamoDB                    | Single Table Design          |
| シークレット管理   | AWS Secrets Manager                | VAPID キー保管               |
| CDN                | Amazon CloudFront                  | コンテンツ配信               |
| コンテナレジストリ | Amazon ECR                         | Docker イメージ管理          |
| IaC                | AWS CDK (TypeScript)               | インフラ定義                 |

### 2.4 開発ツール

| カテゴリ     | 技術             | 用途                      |
| ------------ | ---------------- | ------------------------- |
| テスト       | Jest, Playwright | ユニットテスト、E2Eテスト |
| Lint         | ESLint           | コード品質チェック        |
| フォーマット | Prettier         | コードスタイル統一        |

**依存パッケージの詳細バージョンは `package.json` を参照してください。**

---

## 3. アーキテクチャパターン

### 3.1 レイヤー分離

Stock Tracker は、以下のレイヤーに分離されています:

- **UI層** (`web/app/`, `web/components/`): Next.js コンポーネント、ページ
- **API層** (`web/app/api/`): Next.js API Routes
- **ビジネスロジック層** (`core/src/`): フレームワーク非依存のビジネスロジック
- **データアクセス層** (`core/src/repositories/`): DynamoDB アクセス、リポジトリパターン
- **バッチ処理層** (`batch/src/`): Lambda 関数（アラート処理）

### 3.2 リポジトリパターン

データアクセス層では、リポジトリパターンを採用し、DI（依存性注入）による実装の切り替えを可能にしています。

**リポジトリの実装タイプ**:

- **DynamoDBリポジトリ**: 本番・開発環境で使用
- **InMemoryリポジトリ**: E2Eテスト・ユニットテストで使用

**リポジトリファクトリ**:

- 環境変数 `USE_MEMORY_REPOSITORY` に基づいて実装を動的に切り替え
- E2Eテスト時はインメモリリポジトリを使用してDynamoDB依存を排除
- テストの安定性と実行速度が向上

**対応リポジトリ**:

- AlertRepository: アラートデータの CRUD
- TickerRepository: ティッカーデータの CRUD
- HoldingRepository: 保有株式データの CRUD

### 3.3 コンポーネント構成

**モノレポ構成**:

```
services/stock-tracker/
├── core/           # ビジネスロジック（フレームワーク非依存）
├── web/            # Next.js アプリケーション（UI + API）
└── batch/          # バッチ処理（Lambda関数）
```

**core パッケージ**:

- `repositories/`: DynamoDB アクセス（Exchange, Ticker, Holding, Watchlist, Alert）
- `services/`: ビジネスロジック（アラート評価、価格計算、取引時間チェック、TradingView連携、認証）

**web パッケージ**:

- `app/`: Next.js App Router（ページ、API Routes）
- `components/`: UI コンポーネント
- `lib/`: クライアント側のユーティリティ

**batch パッケージ**:

- `src/handlers/`: Lambda ハンドラー（minute/hourly/daily）
- `src/lib/`: バッチ処理用のユーティリティ

---

## 4. データモデル

### 4.1 Single Table Design

DynamoDB の Single Table Design を採用し、1つのテーブルで全エンティティを管理します。

**テーブル名**: `nagiyu-stock-tracker-main-{env}`

**キー構成**:

- Partition Key: `PK` (String)
- Sort Key: `SK` (String)
- GSI1: `GSI1PK`, `GSI1SK` (ユーザー別クエリ用)

### 4.2 エンティティ概要

| エンティティ     | PK              | SK                | 説明                        |
| ---------------- | --------------- | ----------------- | --------------------------- |
| Exchange         | `EXCHANGE#{ID}` | `METADATA`        | 取引所                      |
| Ticker           | `TICKER#{ID}`   | `METADATA`        | ティッカー                  |
| Holding          | `USER#{UserID}` | `HOLDING#{ID}`    | 保有株式                    |
| Watchlist        | `USER#{UserID}` | `WATCHLIST#{ID}`  | ウォッチリスト              |
| Alert            | `USER#{UserID}` | `ALERT#{ID}`      | アラート                    |
| PushSubscription | `USER#{UserID}` | `PUSH#{Endpoint}` | Web Push サブスクリプション |

**GSI1 (ユーザー別クエリ用)**:

- ユーザーの保有株式、ウォッチリスト、アラート一覧取得に使用
- GSI1PK: `USER#{UserID}`, GSI1SK: `{EntityType}#{TickerID}`

**アクセスパターンの設計思想**:

- 単一テーブルで複数エンティティを管理することで、クロステーブル結合を不要にしコスト削減
- GSI1 により、ユーザーごとのデータを効率的に取得（ユーザー画面での一覧表示を高速化）
- PK/SK の命名規則により、エンティティタイプを明示的に識別可能
- `begins_with` クエリにより、特定タイプのエンティティのみを効率的にフィルタリング

---

## 5. インフラ構成

### 5.1 AWS リソース

**Lambda 関数**:

- `stock-tracker-web-{env}`: Next.js アプリケーション実行
- `stock-tracker-batch-minute-{env}`: 1分間隔のアラート処理
- `stock-tracker-batch-hourly-{env}`: 1時間間隔のアラート処理
- `stock-tracker-batch-daily-{env}`: 日次のデータクリーンアップ

**DynamoDB**:

- テーブル: `nagiyu-stock-tracker-main-{env}`
- オンデマンドキャパシティモード
- Point-in-Time Recovery (PITR) 有効

**EventBridge Scheduler**:

- `stock-tracker-batch-minute-{env}`: rate(1 minute)
- `stock-tracker-batch-hourly-{env}`: rate(1 hour)
- `stock-tracker-batch-daily-{env}`: cron(0 0 \* _ ? _)

**Secrets Manager**:

- `nagiyu-stock-tracker-vapid-{env}`: Web Push 用 VAPID キー
- `nagiyu-auth-nextauth-secret-{env}`: NextAuth Secret（Auth サービスと共有）

**CloudFront**:

- ディストリビューション: `stock-tracker-{env}`
- カスタムドメイン: `dev-stock-tracker.nagiyu.com`, `stock-tracker.nagiyu.com`
- Lambda Function URL をオリジンに設定

**ECR**:

- `nagiyu-stock-tracker-web-ecr-{env}`: Web Lambda 用イメージ
- `nagiyu-stock-tracker-batch-ecr-{env}`: Batch Lambda 用イメージ

**CloudWatch**:

- ログ保持期間: 30日
- アラーム: Lambda エラー率、実行時間、DynamoDB スロットリング

**リソース設定の方針**:

- Lambda メモリ: Web は 1024MB、Batch は 512MB（処理内容に応じて設定）
- Lambda タイムアウト: Web は 30秒、Batch は 5分（アラート処理時間を考慮）
- 環境変数: DynamoDB テーブル名、Secrets Manager ARN、API設定などを注入

---

## 6. セキュリティ設計

### 6.1 認証・認可

**認証**:

- Auth サービス（NextAuth.js）による JWT 認証
- Cookie: `__Secure-next-auth.session-token`
- 有効期限: 30日

**認可**:

- ロールベースアクセス制御（RBAC）
- 権限: `stocks:read`, `stocks:write-own`, `stocks:manage-data`
- Middleware でエンドポイントごとに権限チェック

### 6.2 データ保護

- **通信**: HTTPS 強制（CloudFront）
- **保存時暗号化**: DynamoDB デフォルト暗号化有効
- **シークレット**: Secrets Manager による管理
- **CORS**: 許可されたオリジンのみ
- **セキュリティヘッダー**: CSP, X-Content-Type-Options, X-Frame-Options など

### 6.3 アクセス制御

- **IAM**: Lambda 実行ロールは最小権限の原則
- **DynamoDB**: Lambda からのアクセスのみ許可
- **Secrets Manager**: Lambda からのアクセスのみ許可

**セキュリティヘッダー設定方針**:

- Content-Security-Policy: 信頼されたソースからのみスクリプト実行を許可
- X-Content-Type-Options: MIME タイプスニッフィング防止
- X-Frame-Options: クリックジャッキング防止
- Strict-Transport-Security: HTTPS 強制

**Middleware 認証フロー**:

1. Cookie から JWT トークンを取得
2. トークンの署名検証と有効期限チェック
3. ユーザーロールから必要な権限を確認
4. 権限不足の場合は 403 Forbidden を返却

---

## 7. 技術選定理由

### 7.1 Next.js

**選定理由**:

- App Router による直感的なルーティング
- Server Components によるパフォーマンス最適化
- API Routes によるフロントエンド・バックエンド統合開発
- Lambda Web Adapter によるサーバーレス実行

### 7.2 DynamoDB Single Table Design

**選定理由**:

- スケーラビリティ（オンデマンドキャパシティ）
- 低レイテンシー（ミリ秒単位）
- サーバーレスアーキテクチャとの親和性
- 複数エンティティを1テーブルで管理することでコスト削減

### 7.3 TradingView API

**選定理由**:

- リアルタイムな株価データ取得
- WebSocket による自動更新
- 複数の取引所・ティッカーに対応
- 既存の finance リポジトリでの動作実績

### 7.4 Web Push

**選定理由**:

- ブラウザネイティブ通知（追加アプリ不要）
- Service Worker によるバックグラウンド受信
- VAPID による安全な通知配信

---

## 8. 制約事項

### 8.1 技術的制約

- **TradingView API**: リクエストレート制限あり（詳細は公式ドキュメント参照）
- **Lambda 実行時間**: 最大15分（バッチ処理で大量データ処理時は AWS Batch への移行を検討）
- **DynamoDB**: 項目サイズ最大 400KB
- **Web Push**: ブラウザで通知許可が必要

### 8.2 Phase 1 スコープ

Phase 1 では以下に機能を限定:

- 価格ベースのシンプルなアラート（`PRICE_ABOVE`, `PRICE_BELOW`）
- 基本的な取引所・ティッカーマスタ管理
- 保有株式・ウォッチリストの CRUD

Phase 2 以降でテクニカル指標、パターン認識などを実装予定。

---

## 9. 将来拡張

### 9.1 機能拡張

- テクニカル指標の追加（移動平均、ボリンジャーバンド、RSI など）
- 高度なパターン認識（赤三兵、三川明けの明星など）
- ポートフォリオ分析機能
- カスタムアラート条件（JavaScript ベースの条件式）

### 9.2 技術的拡張

- **バッチ処理**: Lambda から AWS Batch への移行（大量データ処理時）
- **データソース**: 複数の株価データソース対応
- **キャッシング**: Redis/ElastiCache によるチャートデータキャッシュ
- **通知**: メール・Slack 通知の追加

---

## 10. 参考リンク

- [要件定義書](./requirements.md)
- [API 仕様書](./api-spec.md)
- [デプロイ・運用マニュアル](./deployment.md)
- [テスト仕様書](./testing.md)
- CDK プロジェクト: `infra/stock-tracker/`
- 実装コード: `services/stock-tracker/`
