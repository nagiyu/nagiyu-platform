# Stock Tracker アーキテクチャ設計書

## 1. システム概要

Stock Tracker は、株価のリアルタイム監視と条件ベースのアラート通知を提供するサービスです。TradingView API から株価データを取得し、ユーザーが設定した条件（価格閾値など）を満たした場合に Web Push 通知を送信します。また、保有株式の管理とウォッチリスト機能により、投資判断を支援します。

### 1.1 全体構成図

![AWS インフラ構成図](../../images/services/stock-tracker/aws-architecture.drawio.svg)

---

## 2. 技術スタック

### 2.1 フロントエンド

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| フレームワーク | Next.js 15 (App Router) | サーバーサイドレンダリング、ルーティング |
| UI ライブラリ | Material-UI v7 | UIコンポーネント |
| チャート表示 | ECharts | インタラクティブな株価チャート |
| 言語 | TypeScript | 型安全な開発 |
| 通知 | Web Push API | ブラウザ通知 |

### 2.2 バックエンド

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| ランタイム | Node.js 20 | Lambda 実行環境 |
| フレームワーク | Next.js 15 (API Routes) | RESTful API エンドポイント |
| 認証 | NextAuth.js + @nagiyu/auth-core | JWT ベース認証 |
| AWS SDK | @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb | DynamoDB操作 |
| 外部API | @mathieuc/tradingview | 株価データ取得 |
| Web Push | web-push | プッシュ通知送信 |

### 2.3 インフラ

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| コンピューティング | AWS Lambda (Web Adapter) | Next.js アプリケーション実行 |
| バッチ処理 | AWS Lambda + EventBridge Scheduler | 定期的なアラート処理 |
| データベース | Amazon DynamoDB | Single Table Design |
| シークレット管理 | AWS Secrets Manager | VAPID キー保管 |
| CDN | Amazon CloudFront | コンテンツ配信 |
| コンテナレジストリ | Amazon ECR | Docker イメージ管理 |
| IaC | AWS CDK (TypeScript) | インフラ定義 |

### 2.4 開発ツール

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| テスト | Jest, Playwright | ユニットテスト、E2Eテスト |
| Lint | ESLint | コード品質チェック |
| フォーマット | Prettier | コードスタイル統一 |

**依存パッケージの詳細バージョンは `package.json` を参照してください。**

---

## 3. アーキテクチャパターン

### 3.1 レイヤー分離

Stock Tracker は、以下のレイヤーに分離されています:

- **UI層** (`web/app/`, `web/components/`): Next.js コンポーネント、ページ
- **API層** (`web/app/api/`): Next.js API Routes
- **ビジネスロジック層** (`core/src/`): フレームワーク非依存のビジネスロジック
- **データアクセス層** (`core/src/repositories/`): DynamoDB アクセス
- **バッチ処理層** (`batch/src/`): Lambda 関数（アラート処理）

### 3.2 コンポーネント構成

**モノレポ構成**:
```
services/stock-tracker/
├── core/           # ビジネスロジック（フレームワーク非依存）
├── web/            # Next.js アプリケーション（UI + API）
└── batch/          # バッチ処理（Lambda関数）
```

**core パッケージ**:
- `repositories/`: データアクセス層
    - インターフェース（IAlertRepository, IHoldingRepository, ITickerRepository, IExchangeRepository, IWatchlistRepository）
    - DynamoDB 実装（DynamoDBAlertRepository, DynamoDBHoldingRepository 等）
    - InMemory 実装（InMemoryAlertRepository, InMemoryHoldingRepository 等）
- `entities/`: エンティティ型定義（AlertEntity, HoldingEntity 等）
- `mappers/`: DynamoDB Item とエンティティ間の変換ロジック
- `services/`: ビジネスロジック（アラート評価、価格計算、取引時間チェック、TradingView連携、認証）

**web パッケージ**:
- `app/`: Next.js App Router（ページ、API Routes）
- `components/`: UI コンポーネント
- `lib/`: クライアント側のユーティリティ
    - `repository-factory.ts`: リポジトリファクトリー（環境変数に基づいてリポジトリインスタンスを生成）

**batch パッケージ**:
- `src/handlers/`: Lambda ハンドラー（minute/hourly/daily）
- `src/lib/`: バッチ処理用のユーティリティ

### 3.3 Repository Factory パターン

Stock Tracker では、Repository Factory パターンを採用し、環境変数に基づいてリポジトリの実装を切り替えます。

**設計の目的**:
- **テスト容易性**: E2E テストでは DynamoDB への接続を回避し、インメモリリポジトリを使用
- **依存性の注入**: API エンドポイントはリポジトリインターフェースに依存し、具体的な実装に依存しない
- **保守性**: リポジトリの実装を変更してもエンドポイントのコードを変更する必要がない

**実装パターン**:

```typescript
// lib/repository-factory.ts
export function createAlertRepository(): IAlertRepository {
  const useInMemory = process.env.USE_IN_MEMORY_REPOSITORY === 'true';
  
  if (useInMemory) {
    // E2E テスト用のインメモリ実装
    return new InMemoryAlertRepository(getOrCreateMemoryStore());
  } else {
    // 本番環境用の DynamoDB 実装
    return new DynamoDBAlertRepository(getDynamoDBClient(), getTableName());
  }
}
```

**利用方法**:

```typescript
// app/api/alerts/route.ts
import { createAlertRepository } from '../../../lib/repository-factory';

export async function GET() {
  const alertRepo = createAlertRepository();
  const alerts = await alertRepo.getByUserId(userId);
  return Response.json(alerts);
}
```

**環境変数**:
- `USE_IN_MEMORY_REPOSITORY=true`: インメモリリポジトリを使用（E2E テスト時）
- `USE_IN_MEMORY_REPOSITORY` 未設定または `false`: DynamoDB リポジトリを使用（本番環境）

**シングルトン管理**:
- `InMemorySingleTableStore` は全リポジトリで共有される単一のインスタンス
- 各リポジトリインスタンスもシングルトンとして管理され、パフォーマンスを最適化
- テスト終了時は `clearMemoryStore()` でクリーンアップ

### 3.4 リポジトリインターフェース設計

すべてのリポジトリは共通のインターフェースを持ち、DynamoDB 実装とインメモリ実装が同じインターフェースを実装します。

**インターフェース例**:

```typescript
export interface IAlertRepository {
  getById(userId: string, alertId: string): Promise<AlertEntity | null>;
  getByUserId(userId: string, options?: PaginationOptions): Promise<PaginatedResult<AlertEntity>>;
  create(input: CreateAlertInput): Promise<AlertEntity>;
  update(userId: string, alertId: string, updates: UpdateAlertInput): Promise<AlertEntity>;
  delete(userId: string, alertId: string): Promise<void>;
}
```

**実装の一貫性**:
- すべてのリポジトリは同じパターンで実装（CRUD メソッド、ページネーション対応）
- Mapper パターンにより、DynamoDB Item とエンティティ間の変換ロジックを分離
- エラーハンドリングは各実装で統一（カスタムエラークラスの使用）

---

## 4. データモデル

### 4.1 Single Table Design の適用

DynamoDB の Single Table Design を採用し、1つのテーブルで全エンティティを管理します。

**テーブル名**: `nagiyu-stock-tracker-main-{env}`

**キー構成**:
- Partition Key: `PK` (String)
- Sort Key: `SK` (String)
- GSI1: `GSI1PK`, `GSI1SK` (ユーザー別クエリ用)
- GSI2: `GSI2PK`, `GSI2SK` (頻度別アラートクエリ用)
- GSI3: `GSI3PK`, `GSI3SK` (取引所別ティッカークエリ用)

#### 4.1.1 設計判断

**なぜ Single Table Design を選択したか**:

Stock Tracker における Single Table Design の採用は、以下の要因に基づく戦略的な判断です：

1. **アクセスパターンの明確性**:
    - 本サービスのクエリは主に「ユーザー中心」のアクセスパターンに集中しています
    - ユーザーごとに保有株式、ウォッチリスト、アラートをまとめて取得するケースが大半
    - このようなユーザー中心のデータモデルでは、Single Table Design が最も効率的です

2. **エンティティ間の関係性**:
    - 保有株式、ウォッチリスト、アラートは全て「ユーザーに紐づく」という共通の特性を持ちます
    - 取引所・ティッカーはマスタデータであり、他のエンティティから参照されます
    - これらのエンティティは密接に関連しており、同一テーブルで管理することで整合性を保ちやすくなります

3. **スケーラビリティとコスト**:
    - DynamoDB の Single Table Design は、スケールに応じたコスト最適化が容易です
    - 複数テーブル設計では、各テーブルのキャパシティを個別に管理する必要がありますが、Single Table Design ではテーブル全体で一元管理できます
    - オンデマンドキャパシティモードと組み合わせることで、トラフィックの変動に柔軟に対応できます

4. **運用の簡素化**:
    - バックアップ、復元、監視などの運用タスクが単一テーブルに集約されます
    - インフラ構成がシンプルになり、CDK での定義も簡潔になります
    - DynamoDB Streams を使用したデータ連携も、単一のストリームで実現できます

**他パターンとの比較**:

| 設計パターン | メリット | デメリット | Stock Tracker での適用性 |
|------------|---------|---------|------------------------|
| **Single Table Design** | - クエリが高速<br>- コスト効率が高い<br>- 運用が簡素 | - 設計の複雑性<br>- 学習コストが高い | ✅ **最適** - ユーザー中心のアクセスパターンに最適 |
| **複数テーブル設計** | - 直感的な設計<br>- 学習コストが低い | - クエリが複雑化<br>- コストが高い<br>- 結合が必要 | ❌ **不適** - クロステーブルクエリが頻発し、パフォーマンスとコストが悪化 |
| **RDB (PostgreSQL等)** | - 複雑なクエリが可能<br>- トランザクション対応 | - スケールが困難<br>- 運用コストが高い | ❌ **不適** - サーバーレス構成との親和性が低く、スケーラビリティに課題 |

**プロジェクト要件との整合性**:

- **非機能要件**: 低レイテンシー（ミリ秒単位）、高スケーラビリティ、サーバーレスアーキテクチャ
- **コスト要件**: オンデマンドキャパシティによる従量課金、未使用時のコスト削減
- **保守性要件**: シンプルなインフラ構成、自動スケーリング

Single Table Design はこれらの要件を全て満たしており、Stock Tracker に最適な選択です。

#### 4.1.2 テーブル構造の設計思想

**エンティティ概要**:

| エンティティ | PK | SK | GSI1 | GSI2 | GSI3 | 説明 |
|------------|----|----|------|------|------|------|
| Exchange | `EXCHANGE#{ID}` | `METADATA` | - | - | - | 取引所マスタ |
| Ticker | `TICKER#{ID}` | `METADATA` | - | - | `EXCHANGE#{ExchangeID}` / `TICKER#{ID}` | ティッカーマスタ |
| Holding | `USER#{UserID}` | `HOLDING#{ID}` | `USER#{UserID}` / `HOLDING#{TickerID}` | - | - | 保有株式 |
| Watchlist | `USER#{UserID}` | `WATCHLIST#{ID}` | `USER#{UserID}` / `WATCHLIST#{TickerID}` | - | - | ウォッチリスト |
| Alert | `USER#{UserID}` | `ALERT#{ID}` | `USER#{UserID}` / `ALERT#{TickerID}` | `FREQUENCY#{Frequency}` / `ALERT#{ID}` | - | アラート |
| PushSubscription | `USER#{UserID}` | `PUSH#{Endpoint}` | `USER#{UserID}` / `PUSH#{Endpoint}` | - | - | Web Push サブスクリプション |

**エンティティ間の関係性**:

Stock Tracker のデータモデルは、以下の関係性を持ちます：

1. **ユーザー ↔ 保有株式・ウォッチリスト・アラート**:
    - 1対多の関係（1ユーザーが複数のエンティティを所有）
    - PK に `USER#{UserID}` を使用することで、ユーザーのデータを効率的に取得可能
    - SK にエンティティタイプとIDを組み合わせることで、エンティティを一意に識別

2. **エンティティ ↔ ティッカー**:
    - 多対1の関係（複数のエンティティが同一のティッカーを参照）
    - GSI1 の SK に `{EntityType}#{TickerID}` を使用することで、ティッカー別のエンティティ一覧を取得可能
    - ティッカーIDは各エンティティの属性として保存され、正規化されています

3. **ティッカー ↔ 取引所**:
    - 多対1の関係（複数のティッカーが同一の取引所に属する）
    - GSI3 により、取引所別のティッカー一覧を効率的に取得可能

**PK/SK の命名戦略**:

命名規則は以下の原則に従っています：

1. **明示的なプレフィックス**:
    - `USER#`, `TICKER#`, `EXCHANGE#` などのプレフィックスにより、エンティティタイプを一目で識別可能
    - これにより、デバッグやデータ調査が容易になります

2. **階層的な構造**:
    - PK でエンティティの所有者（ユーザー）または主体（マスタデータ）を表現
    - SK でエンティティの種類と一意性を表現
    - この階層構造により、`begins_with` クエリで特定タイプのエンティティのみをフィルタリング可能

3. **一意性の保証**:
    - PK + SK の組み合わせで、テーブル全体でエンティティを一意に識別
    - ULID を使用することで、ソート可能な一意IDを生成
    - 時系列順のソートが自然に実現されます

**GSI の設計意図**:

Stock Tracker では、3つの GSI を使用しています：

1. **GSI1 (UserIndex) - ユーザー別クエリ**:
    - **役割**: ユーザーに紐づく全エンティティ（保有株式、ウォッチリスト、アラート）を効率的に取得
    - **GSI1PK**: `USER#{UserID}` - ユーザーIDでパーティション
    - **GSI1SK**: `{EntityType}#{TickerID}` - エンティティタイプとティッカーIDでソート
    - **ユースケース**: ユーザー画面での一覧表示、ティッカー別のエンティティ取得
    - **設計意図**: ユーザー中心のアクセスパターンに最適化し、低レイテンシーでのデータ取得を実現

2. **GSI2 (AlertIndex) - 頻度別アラートクエリ**:
    - **役割**: バッチ処理で頻度別（毎分、毎時、毎日）のアラート一覧を取得
    - **GSI2PK**: `FREQUENCY#{Frequency}` - 頻度でパーティション（`MINUTE`, `HOURLY`, `DAILY`）
    - **GSI2SK**: `ALERT#{AlertID}` - アラートIDでソート
    - **ユースケース**: バッチ処理での効率的なアラート取得、並列処理の実現
    - **設計意図**: バッチ処理のパフォーマンスを最適化し、大量のアラートを効率的に処理

3. **GSI3 (ExchangeTickerIndex) - 取引所別ティッカークエリ**:
    - **役割**: 取引所別のティッカー一覧を取得
    - **GSI3PK**: `EXCHANGE#{ExchangeID}` - 取引所IDでパーティション
    - **GSI3SK**: `TICKER#{TickerID}` - ティッカーIDでソート
    - **ユースケース**: ティッカー選択画面での一覧表示、取引所別のデータ集計
    - **設計意図**: マスタデータの効率的な取得と、スケーラブルなデータ配信を実現

**Type フィールドによるエンティティ識別**:

各エンティティには `Type` フィールドを持たせ、エンティティタイプを明示的に識別可能にしています：

- **用途**: アプリケーションレイヤーでのエンティティ判別、型安全性の向上
- **例**: `Type: "Alert"`, `Type: "Holding"`, `Type: "Ticker"`
- **利点**: PK/SK パターンに依存せず、エンティティタイプを判別可能（将来の拡張性）

#### 4.1.3 アクセスパターンの最適化

**ユーザー中心のクエリ設計**:

Stock Tracker のアクセスパターンは、「ユーザーが自分のデータにアクセスする」という要件が中心です：

1. **なぜユーザー別の取得が重要か**:
    - ユーザーは自分の保有株式、ウォッチリスト、アラートのみを閲覧・編集します
    - 他のユーザーのデータにアクセスすることはありません（プライバシーの観点からも重要）
    - この特性により、PK を `USER#{UserID}` とすることで、自然なパーティショニングが実現されます

2. **GSI1 によるユーザー中心クエリの最適化**:
    - ユーザーの全保有株式を取得: `GSI1PK = USER#{UserID}`, `GSI1SK begins_with HOLDING#`
    - ユーザーの全ウォッチリストを取得: `GSI1PK = USER#{UserID}`, `GSI1SK begins_with WATCHLIST#`
    - ユーザーの全アラートを取得: `GSI1PK = USER#{UserID}`, `GSI1SK begins_with ALERT#`
    - これらのクエリは単一のクエリ操作で完了し、低レイテンシーを実現します

3. **ティッカー別のエンティティ取得**:
    - GSI1SK に `{EntityType}#{TickerID}` を格納することで、特定ティッカーに関連するエンティティを効率的に取得可能
    - 例: ユーザーが特定ティッカーの保有株式を持っているか確認する際に、単一クエリで実現

**バッチ処理の考慮事項**:

バッチ処理では、頻度別のアラート一覧を効率的に取得する必要があります：

1. **頻度別アラート取得の設計**:
    - GSI2 により、頻度別（`MINUTE`, `HOURLY`, `DAILY`）のアラート一覧を効率的に取得
    - 例: 毎分実行されるバッチ処理では、`GSI2PK = FREQUENCY#MINUTE` でクエリすることで、1分間隔のアラートのみを取得
    - この設計により、不要なデータのスキャンを回避し、バッチ処理のコストとレイテンシーを削減

2. **並列処理の実現**:
    - 頻度別にパーティションが分かれているため、複数のバッチ処理を並列実行可能
    - 例: 毎分処理と毎時処理を同時に実行しても、異なるパーティションにアクセスするため、スロットリングのリスクが低減

3. **バッチ処理のスケーラビリティ**:
    - アラート数が増加しても、頻度別のパーティショニングにより、各バッチ処理の負荷は分散されます
    - 将来的に5分間隔や週次アラートを追加する場合も、GSI2 に新しい頻度を追加するだけで対応可能

**ページネーション戦略**:

大量データへの対応として、ページネーション戦略を実装しています：

1. **LastEvaluatedKey によるカーソルベースページネーション**:
    - DynamoDB の `LastEvaluatedKey` を使用し、サーバー側でページネーションを制御
    - クライアントは `LastEvaluatedKey` を次のリクエストに含めることで、続きのデータを取得
    - この方式により、大量のアラートや保有株式が存在しても、メモリ使用量を抑制

2. **Limit パラメータによる取得件数の制御**:
    - デフォルトで 50 件、最大 100 件までの取得を許可
    - フロントエンドの表示性能とサーバー負荷のバランスを考慮した設定

3. **効率的なページング**:
    - GSI1 を使用したクエリでは、ソートキーの順序でページングされます
    - ULID を使用することで、時系列順のページングが自然に実現されます

**クロスエンティティクエリの回避**:

Single Table Design では、クロスエンティティクエリ（複数のエンティティを結合するクエリ）を回避することが重要です：

1. **非正規化による結合の回避**:
    - 各エンティティには、必要な情報を非正規化して保存（例: `TickerSymbol`, `ExchangeName`）
    - これにより、ティッカーや取引所の詳細情報を取得するために別途クエリを発行する必要がありません
    - トレードオフとして、マスタデータ更新時には関連エンティティも更新する必要がありますが、マスタデータの更新頻度は低いため、許容可能です

2. **バッチ処理でのデータ取得最適化**:
    - バッチ処理では、必要な全アラートを一度に取得し、メモリ上で処理
    - DynamoDB への追加クエリを最小化することで、レイテンシーとコストを削減

3. **キャッシング戦略**:
    - マスタデータ（取引所、ティッカー）は変更頻度が低いため、アプリケーションレイヤーでキャッシュ
    - キャッシュにより、DynamoDB へのクエリを削減し、パフォーマンスを向上

#### 4.1.4 Repository 層の設計方針

**なぜ Repository パターンを採用したか**:

Repository パターンは、データアクセスロジックをビジネスロジックから分離するための設計パターンです。Stock Tracker では、以下の理由で Repository パターンを採用しています：

1. **テスト容易性**:
    - ビジネスロジックとデータアクセスロジックを分離することで、単体テストが容易になります
    - インメモリ実装とDynamoDB実装を切り替えることで、E2Eテスト時にDynamoDBへの接続を回避
    - モックやスタブを用意する必要がなく、実際の Repository 実装をテストで使用可能

2. **関心の分離**:
    - API エンドポイント（プレゼンテーション層）はビジネスロジックに集中し、データアクセスの詳細を知る必要がありません
    - Repository はデータアクセスの詳細（DynamoDB の PK/SK、GSI の使用方法など）をカプセル化
    - 将来的にデータベースを変更する場合も、Repository の実装を変更するだけで対応可能

3. **再利用性**:
    - 同じ Repository を web パッケージと batch パッケージで共有可能
    - データアクセスロジックの重複を避け、保守性を向上

**エラーハンドリング戦略**:

Repository 層では、カスタムエラークラスを使用してエラーを明確に表現しています：

1. **カスタムエラークラスの設計**:
    - `NotFoundError`: エンティティが見つからない場合
    - `AlreadyExistsError`: エンティティが既に存在する場合（重複作成の防止）
    - `ValidationError`: 入力データが不正な場合
    - これらのエラークラスにより、呼び出し側で適切なエラーハンドリングが可能

2. **エラーメッセージの日本語化**:
    - ユーザー向けのエラーメッセージは全て日本語で提供
    - エラーメッセージは定数化し、一貫性を保つ
    - プラットフォーム共通のコーディング規約に準拠

3. **エラーのログ記録**:
    - Repository 層で発生したエラーは全てログに記録
    - エラーの詳細（ユーザーID、エンティティID、エラー理由など）を含め、デバッグを容易に

**型安全性の実現方法**:

Repository 層では、厳密な型定義とバリデーションにより、型安全性を実現しています：

1. **厳密な型定義**:
    - 各エンティティは TypeScript の型として定義（`AlertEntity`, `HoldingEntity` など）
    - Repository のメソッドは、これらの型をパラメータおよび戻り値として使用
    - TypeScript strict mode により、型エラーをコンパイル時に検出

2. **バリデーションの実装**:
    - 入力データは Repository 層でバリデーション
    - 不正なデータは早期に検出し、ValidationError をスロー
    - バリデーションルールはビジネス要件に基づき定義（例: 価格は正の数値、頻度は有効な値など）

3. **Mapper パターンによる変換**:
    - DynamoDB Item とエンティティ間の変換は、専用の Mapper 関数で実施
    - Mapper はエンティティの型定義に基づき、型安全な変換を保証
    - 変換エラーは早期に検出し、適切なエラーメッセージを提供

**Conditional Writes による整合性保証**:

DynamoDB の Conditional Writes を使用し、データの整合性を保証しています：

1. **重複作成の防止**:
    - `create` メソッドでは、`attribute_not_exists(PK)` 条件を使用
    - 既に同じ PK/SK のアイテムが存在する場合、エラーをスローして重複作成を防止
    - これにより、競合状態でもデータの一貫性が保たれます

2. **楽観的ロックの実装**:
    - `update` メソッドでは、`Version` 属性による楽観的ロックを実装
    - 更新時に Version をインクリメントし、期待される Version と一致しない場合は更新を拒否
    - これにより、同時更新による不整合を防止

3. **削除時の存在確認**:
    - `delete` メソッドでは、`attribute_exists(PK)` 条件を使用
    - 存在しないアイテムを削除しようとした場合、NotFoundError をスロー
    - これにより、誤った削除操作を防止

#### 4.1.5 トレードオフと今後の拡張性

**設計上の制約事項**:

Single Table Design には、以下のような制約事項があります：

1. **複雑なクエリの制限**:
    - DynamoDB は SQL のような複雑な JOIN や集計クエリをサポートしていません
    - 複数のエンティティを結合する必要がある場合、アプリケーション側で処理する必要があります
    - トレードオフ: パフォーマンスとスケーラビリティを優先し、複雑なクエリは諦める

2. **学習コストの高さ**:
    - Single Table Design は、RDB に慣れた開発者にとって直感的ではありません
    - PK/SK の設計、GSI の使用方法などを理解する必要があり、学習コストが高いです
    - トレードオフ: ドキュメント化と Repository パターンにより、学習コストを軽減

3. **設計変更の困難性**:
    - アクセスパターンの大幅な変更は、テーブル設計の再設計を必要とする場合があります
    - GSI の追加は可能ですが、既存データへの影響を考慮する必要があります
    - トレードオフ: Phase 1 で十分なアクセスパターン分析を行い、将来の拡張を考慮した設計を採用

**スケーラビリティの考慮**:

Stock Tracker は、以下のスケーラビリティ戦略を採用しています：

1. **オンデマンドキャパシティ**:
    - トラフィックの変動に応じて自動スケーリング
    - ピーク時のスロットリングを回避し、低トラフィック時のコストを削減
    - 将来的にトラフィックが安定すれば、プロビジョニングキャパシティへの移行も検討可能

2. **GSI の追加容易性**:
    - 新しいアクセスパターンが必要になった場合、GSI を追加することで対応可能
    - 既存の PK/SK 設計を変更する必要がなく、影響範囲を最小化
    - 例: 将来的に「銘柄別の全ユーザーのアラート一覧」が必要になった場合、GSI4 を追加

3. **パーティショニング戦略**:
    - ユーザーIDをPKに使用することで、ユーザー数に応じて自然にパーティションが分散
    - 特定のユーザーに負荷が集中する場合は、複合キーによるさらなる分散を検討可能

**将来の拡張方針**:

Stock Tracker の Single Table Design は、以下の拡張方針を考慮して設計されています：

1. **新規エンティティの追加**:
    - Phase 2 以降で追加される新しいエンティティ（例: ポートフォリオ分析結果、テクニカル指標のスナップショット）も、同じテーブルで管理可能
    - PK/SK パターンを適切に設計することで、既存エンティティとの共存が可能
    - 例: `USER#{UserID}` / `PORTFOLIO#{PortfolioID}` として、ポートフォリオエンティティを追加

2. **GSI の追加**:
    - 新しいアクセスパターンが必要になった場合、GSI4, GSI5 を追加可能
    - 既存データに対して GSI を追加する場合、バックフィルが必要になることに注意
    - 例: テクニカル指標別のアラート取得が必要になった場合、GSI4 を追加

3. **データマイグレーション戦略**:
    - エンティティ構造の変更が必要な場合、段階的なマイグレーション戦略を採用
    - 新しい属性は既存データに追加可能（DynamoDB はスキーマレス）
    - 属性の削除や名前変更が必要な場合、データマイグレーションスクリプトを実装
    - マイグレーション中も既存システムが動作し続けることを保証（ブルーグリーンデプロイ）

4. **パフォーマンス監視と最適化**:
    - CloudWatch メトリクスによる継続的な監視（スロットリング、レイテンシー、コストなど）
    - ボトルネックが発見された場合、GSI の追加やデータモデルの最適化を実施
    - 将来的に DynamoDB Accelerator (DAX) の導入も検討可能（キャッシングによる高速化）

**まとめ**:

Stock Tracker の Single Table Design は、ユーザー中心のアクセスパターン、スケーラビリティ、コスト効率を重視した戦略的な設計です。トレードオフとして学習コストや複雑なクエリの制限がありますが、Repository パターンとドキュメント化により、これらの課題を軽減しています。将来の拡張性を考慮した柔軟な設計により、Phase 2 以降の機能追加にも対応可能です。

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
- `stock-tracker-batch-daily-{env}`: cron(0 0 * * ? *)

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
