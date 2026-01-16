# niconico-mylist-assistant アーキテクチャ設計書

---

## 1. システム概要

niconico-mylist-assistant は、ニコニコ動画のマイリスト登録作業を自動化するサーバーレスアプリケーションです。ユーザーは Web UI（Next.js）を通じて条件を指定し、DynamoDB に保存された動画データから最大 100 個をランダムに選択してマイリストに一括登録できます。**AWS Batch** を採用することで Lambda の 15 分制限を回避し、各動画間に最低 2 秒の待機時間を設けることでニコニコ動画サーバーへの配慮を徹底しています。

本システムは **3 パッケージ構成（core / web / batch）** により、ビジネスロジック、Web フロントエンド、バッチ処理をそれぞれ独立したモジュールとして管理します。core パッケージは完全フレームワーク非依存の TypeScript ライブラリとして設計され、web パッケージ（Next.js）と batch パッケージ（Playwright 自動化）の両方から共通ロジックを再利用します。これにより、テストの容易性と保守性を確保しています。

### 1.1 全体構成図

```mermaid
graph TB
    subgraph "ユーザー"
        User[ブラウザ]
    end

    subgraph "AWS インフラ"
        subgraph "Web パッケージ"
            CF[CloudFront]
            Lambda["Lambda (Next.js)"]
            API[API Routes<br/>動画情報取得<br/>一括インポート<br/>バッチ投入]
        end

        subgraph "Batch パッケージ"
            Batch[AWS Batch<br/>無制限実行時間<br/>Playwright 自動化]
        end

        subgraph "Core パッケージ"
            Core[共通ビジネスロジック<br/>型定義・定数<br/>ヘルパー関数]
        end

        subgraph "データストア"
            DDB[(DynamoDB<br/>動画基本情報<br/>ユーザー設定)]
        end
    end

    subgraph "外部API"
        NicoAPI[ニコニコ動画 API<br/>getthumbinfo]
        NicoWeb[ニコニコ動画<br/>Web サイト]
    end

    User -->|HTTPS| CF
    CF --> Lambda
    Lambda --> API

    API -->|参照| Core
    API -->|動画基本情報取得| NicoAPI
    API -->|CRUD| DDB
    API -->|ジョブ投入| Batch

    Batch -->|参照| Core
    Batch -->|Playwright| NicoWeb
    Batch -->|登録結果保存| DDB

    Core -.->|型定義・共通ロジック| API
    Core -.->|型定義・共通ロジック| Batch

    style Batch fill:#e1f5ff,stroke:#01579b,stroke-width:3px
    style Core fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    style User fill:#fff3e0,stroke:#e65100
```

---

## 2. 技術スタック

### 2.1 フロントエンド

| カテゴリ       | 技術          | 用途                             |
| -------------- | ------------- | -------------------------------- |
| フレームワーク | Next.js 16    | React ベースのフルスタック開発   |
| UI ライブラリ  | React 19      | ユーザーインターフェース構築     |
| コンポーネント | Material-UI 7 | マテリアルデザインコンポーネント |
| 言語           | TypeScript    | 型安全な開発                     |

### 2.2 バックエンド

| カテゴリ       | 技術       | 用途                       |
| -------------- | ---------- | -------------------------- |
| ランタイム     | Node.js 22 | JavaScript 実行環境        |
| 言語           | TypeScript | 型安全なサーバーサイド開発 |
| フレームワーク | Next.js 16 | API Routes による API 開発 |

### 2.3 インフラ

| カテゴリ           | 技術                 | 用途                             |
| ------------------ | -------------------- | -------------------------------- |
| コンピューティング | AWS Lambda           | Next.js アプリケーションの実行   |
| バッチ処理         | AWS Batch (Fargate)  | 長時間実行（マイリスト一括登録） |
| データベース       | Amazon DynamoDB      | 動画基本情報・ユーザー設定の保存 |
| ログ管理           | CloudWatch Logs      | アプリケーションログ             |
| CDN                | Amazon CloudFront    | コンテンツ配信                   |
| IaC                | AWS CDK (TypeScript) | インフラ定義                     |

### 2.4 開発ツール

| カテゴリ             | 技術             | 用途                |
| -------------------- | ---------------- | ------------------- |
| パッケージマネージャ | npm              | 依存関係管理        |
| リンター             | ESLint           | コード品質チェック  |
| フォーマッター       | Prettier         | コード整形          |
| テスト               | Jest, Playwright | ユニット・E2Eテスト |

---

## 3. アーキテクチャパターン

### 3.1 データフロー

本サービスには主に2つのデータフローがあります：
1. **一括インポートフロー**: 動画IDからニコニコ動画APIで動画基本情報を取得してDynamoDBに保存
2. **マイリスト登録フロー**: 条件指定により動画を選択し、AWS Batchでマイリストに自動登録

#### 3.1.1 一括インポートフロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Web as Web UI<br/>(Next.js)
    participant API as API Routes<br/>(/api/videos/bulk-import)
    participant Nico as ニコニコ動画API<br/>(getthumbinfo)
    participant DDB as DynamoDB<br/>(動画基本情報)

    User->>Web: 動画ID入力（改行区切り）
    User->>Web: 「インポート実行」クリック
    Web->>API: POST /api/videos/bulk-import<br/>{videoIds: [...]}

    loop 各動画IDを順次処理
        API->>Nico: GET /api/getthumbinfo/{videoId}
        Nico-->>API: XML (動画タイトル等)
        API->>DDB: ConditionalPut<br/>(重複チェック)
        alt 新規追加成功
            DDB-->>API: Success
            Note over API: success++
        else 既に存在
            DDB-->>API: ConditionalCheckFailed
            Note over API: skipped++
        else API失敗
            Nico-->>API: Error
            Note over API: failed++
        else DB保存失敗
            DDB-->>API: Error
            Note over API: dbErrors++
        end
    end

    API-->>Web: 結果返却<br/>{success, failed, skipped, dbErrors}
    Web-->>User: 結果表示
```

**処理の特徴**:
- **順次処理**: 各動画IDをforループで1つずつ処理（並列処理なし）
- **エラー継続**: ニコニコAPI失敗やDB保存失敗が発生しても処理を継続
- **重複チェック**: DynamoDBのConditionalPut（`attribute_not_exists`）で重複を検出
- **結果集計**: 成功数、失敗数、スキップ数、DBエラー数を集計して返却

#### 3.1.2 マイリスト登録フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Web as Web UI<br/>(Next.js)
    participant API as API Routes<br/>(/api/batch/submit)
    participant Batch as AWS Batch<br/>(Playwright)
    participant Nico as ニコニコ動画
    participant DDB as DynamoDB
    participant Push as Web Push

    User->>Web: 登録条件指定
    User->>Web: アカウント情報入力<br/>(email, password)
    User->>Web: マイリスト名入力（任意）
    User->>Web: 「登録開始」クリック

    Web->>API: POST /api/batch/submit<br/>{email, password, mylistName, filters}
    Note over API: パスワードを暗号化<br/>(AES-256 + SHARED_SECRET_KEY)
    API->>Batch: ジョブ投入<br/>{email, encryptedPassword, mylistName}
    API->>DDB: ジョブステータス書き込み<br/>{jobId, status: "SUBMITTED"}
    API-->>Web: {jobId, status: "SUBMITTED"}
    Web-->>User: 「処理を開始しました」

    Note over Batch: バックグラウンド処理開始
    Batch->>Batch: パスワード復号化
    Batch->>Nico: Playwright: ログイン
    Batch->>Nico: マイリスト一覧取得

    loop 既存マイリストを全削除
        Batch->>Nico: マイリスト削除
    end

    Batch->>Nico: 新しいマイリスト作成<br/>(ユーザー指定の名前)

    loop 各動画を登録（最大100個）
        Batch->>Nico: 動画をマイリストに追加
        Note over Batch: 2秒待機
    end

    Batch->>DDB: ジョブステータス更新<br/>{status: "SUCCEEDED", result}
    Batch->>Push: Web Push通知送信
    Push-->>User: 「登録完了」通知

    User->>Web: 通知クリック or 画面確認
    Web->>API: GET /api/batch/status/{jobId}
    API->>DDB: ステータス取得
    DDB-->>API: {status, result}
    API-->>Web: {status, result}
    Web-->>User: 結果表示
```

**処理の特徴**:
- **非同期処理**: AWS Batchでバックグラウンド実行（Lambda の15分制限を回避）
- **暗号化**: ニコニコアカウントのパスワードはAPI Routes内で暗号化、Batch内でのみ復号化
- **マイリスト完全リセット**: 既存のマイリストを全削除してから新規作成
- **マイリスト名**: ユーザー指定、未指定時は日時デフォルト（例: `自動登録 2026/1/16 15:30:45`）
- **待機時間**: 各動画登録間に最低2秒待機（ニコニコ動画サーバーへの配慮）
- **完了通知**: Web Push通知 + DynamoDBステータス書き込みのハイブリッド方式

### 3.2 コンポーネント構成

本サービスは **3パッケージ構成** を採用し、ビジネスロジック、Webアプリケーション、バッチ処理をそれぞれ独立したモジュールとして管理します。

#### 3.2.1 パッケージ構成

```
services/niconico-mylist-assistant/
├── packages/
│   ├── core/          # @nagiyu/niconico-mylist-assistant-core
│   ├── web/           # @nagiyu/niconico-mylist-assistant-web
│   └── batch/         # @nagiyu/niconico-mylist-assistant-batch
└── package.json       # ワークスペースルート
```

#### 3.2.2 各パッケージの責務

##### core パッケージ (`@nagiyu/niconico-mylist-assistant-core`)

- **責務**: フレームワーク非依存の共通ビジネスロジック
- **提供機能**:
  - 型定義（動画基本情報、ユーザー設定、バッチジョブ等）
  - 定数定義（待機時間、上限数等）
  - Playwright ヘルパー関数
  - ニコニコ動画 API 連携（getthumbinfo）
  - マイリスト自動化ロジック
- **依存先**: なし（Pure TypeScript）
- **利用元**: web, batch

##### web パッケージ (`@nagiyu/niconico-mylist-assistant-web`)

- **責務**: ユーザーインターフェースとAPI提供
- **提供機能**:
  - フロントエンド（React + Material-UI）
  - API Routes（動画一括インポート、バッチジョブ投入、ステータス確認）
  - 認証（Auth プロジェクト連携）
  - DynamoDB 操作
- **依存先**:
  - `@nagiyu/niconico-mylist-assistant-core`
  - `@nagiyu/common`
  - `@nagiyu/ui`
- **デプロイ先**: AWS Lambda + CloudFront

##### batch パッケージ (`@nagiyu/niconico-mylist-assistant-batch`)

- **責務**: マイリスト登録の長時間バッチ処理
- **提供機能**:
  - Playwright によるニコニコ動画自動操作
  - パスワード復号化
  - マイリスト完全リセット + 新規作成
  - Web Push 通知送信
  - ジョブステータス更新
- **依存先**:
  - `@nagiyu/niconico-mylist-assistant-core`
  - `@nagiyu/browser`
- **デプロイ先**: AWS Batch (Docker コンテナ)

#### 3.2.3 依存関係図

```mermaid
graph TB
    Web["@nagiyu/niconico-mylist-assistant-web"]
    Batch["@nagiyu/niconico-mylist-assistant-batch"]
    Core["@nagiyu/niconico-mylist-assistant-core"]
    Common["@nagiyu/common"]
    UI["@nagiyu/ui"]
    Browser["@nagiyu/browser"]

    Web --> Core
    Web --> Common
    Web --> UI
    Batch --> Core
    Batch --> Browser

    style Core fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    style Web fill:#e3f2fd,stroke:#01579b,stroke-width:2px
    style Batch fill:#e1f5ff,stroke:#01579b,stroke-width:3px
```

---

## 4. データモデル

### 4.1 データベーススキーマ

本サービスは **DynamoDB 単一テーブル設計** を採用します。動画基本情報（全ユーザー共通）とユーザー設定（ユーザー固有）を1つのテーブルで管理し、コスト効率と管理の簡素化を実現します。

#### テーブル定義

**テーブル名**: `nagiyu-niconico-mylist-assistant-dynamodb-{environment}`
- 環境: `dev` または `prod`
- 作成方法: `infra/common/src/utils/naming.ts` の `getDynamoDBTableName()` を使用

**課金モード**: オンデマンド（On-Demand）

**キー構造**:
- **パーティションキー (PK)**: `string`
- **ソートキー (SK)**: `string`

#### エンティティ設計

本テーブルには2種類のエンティティを格納します：

##### 1. 動画基本情報（VIDEO）

全ユーザー共通の動画メタデータ。ニコニコ動画API（`getthumbinfo`）から取得した情報を保存します。

| 属性名 | 型 | 説明 | 必須 |
|--------|------|------|------|
| `PK` | String | `VIDEO#{videoId}` | ✓ |
| `SK` | String | `VIDEO#{videoId}` | ✓ |
| `entityType` | String | `"VIDEO"` （エンティティ識別用） | ✓ |
| `videoId` | String | 動画ID（例: `sm12345678`） | ✓ |
| `title` | String | 動画タイトル | ✓ |
| `thumbnailUrl` | String | サムネイル画像URL | ✓ |
| `length` | String | 再生時間（例: `5:30`） | ✓ |
| `createdAt` | String | 登録日時（ISO 8601形式） | ✓ |

**アクセスパターン**:
- 特定の動画情報を取得: `GetItem(PK=VIDEO#{videoId}, SK=VIDEO#{videoId})`
- 複数の動画情報を一括取得: `BatchGetItem` または個別に `GetItem`

**例**:
```json
{
    "PK": "VIDEO#sm12345678",
    "SK": "VIDEO#sm12345678",
    "entityType": "VIDEO",
    "videoId": "sm12345678",
    "title": "サンプル動画タイトル",
    "thumbnailUrl": "https://example.com/thumb.jpg",
    "length": "5:30",
    "createdAt": "2026-01-16T10:30:00Z"
}
```

##### 2. ユーザー設定（USER_SETTING）

各ユーザーが個別に設定するメタデータ（お気に入りフラグ、スキップフラグ、メモ）。

| 属性名 | 型 | 説明 | 必須 |
|--------|------|------|------|
| `PK` | String | `USER#{userId}` | ✓ |
| `SK` | String | `VIDEO#{videoId}` | ✓ |
| `entityType` | String | `"USER_SETTING"` （エンティティ識別用） | ✓ |
| `userId` | String | Auth プロジェクトの UserID | ✓ |
| `videoId` | String | 動画ID | ✓ |
| `isFavorite` | Boolean | お気に入りフラグ（デフォルト: `false`） | ✓ |
| `isSkip` | Boolean | スキップフラグ（デフォルト: `false`） | ✓ |
| `memo` | String | ユーザーのメモ | ✗ |
| `createdAt` | String | 登録日時（ISO 8601形式） | ✓ |
| `updatedAt` | String | 更新日時（ISO 8601形式） | ✓ |

**アクセスパターン**:
- 特定ユーザーの全動画設定を取得: `Query(PK=USER#{userId})`
- 特定ユーザーの特定動画設定を取得: `GetItem(PK=USER#{userId}, SK=VIDEO#{videoId})`
- 条件付きフィルタ（お気に入りのみ、スキップを除くなど）: アプリ側でフィルタリング

**例**:
```json
{
    "PK": "USER#auth0|abc123",
    "SK": "VIDEO#sm12345678",
    "entityType": "USER_SETTING",
    "userId": "auth0|abc123",
    "videoId": "sm12345678",
    "isFavorite": true,
    "isSkip": false,
    "memo": "お気に入りの曲",
    "createdAt": "2026-01-16T10:30:00Z",
    "updatedAt": "2026-01-16T12:00:00Z"
}
```

#### インデックス

**プライマリインデックスのみ使用**:
- パーティションキー (PK) + ソートキー (SK)

**GSI（Global Secondary Index）**: なし
- 条件付きフィルタ（`isFavorite=true`, `isSkip=false` など）はアプリ側で実装
- 理由: 現在の想定データ量（1ユーザーあたり1,000件程度）では、全件取得してアプリ側でフィルタリングする方がコスト効率が良い
- 将来的にデータ量が増加した場合（10,000件以上）は、GSI の追加を検討

#### データ整合性

**動画基本情報とユーザー設定の関係**:
- ユーザー設定（`USER_SETTING`）は、対応する動画基本情報（`VIDEO`）が存在することを前提とする
- 一括インポート時に動画基本情報を先に保存し、その後ユーザー設定を作成する
- 動画基本情報が削除された場合、対応するユーザー設定も削除する必要がある（アプリ側で制御）

**重複チェック**:
- 動画基本情報: `ConditionalPut` で `attribute_not_exists(PK)` を使用し、重複を防止
- ユーザー設定: 同一ユーザー・同一動画の組み合わせは上書き更新

#### 想定データ量とパフォーマンス

- **1ユーザーあたりの動画数**: 1,000件程度（中規模）
- **1動画あたりのデータサイズ**:
    - 動画基本情報: 約 500 bytes
    - ユーザー設定: 約 200 bytes
- **マイリスト登録時の読み取り**: `Query(PK=USER#{userId})` で全件取得（約 200 KB）
    - DynamoDB の読み取りキャパシティ: 200 KB ÷ 8 KB = 25 RCU（Eventually Consistent Read）
    - レスポンス時間: 数百ミリ秒程度

### 4.2 API 型定義

本サービスの主要APIの型定義を記述します。すべてのAPIは Next.js の API Routes として実装され、認証済みユーザーのみがアクセス可能です。

#### 動画一括インポート API

`POST /api/videos/bulk-import`

```typescript
interface BulkImportRequest {
    videoIds: string[];
}

interface BulkImportResponse {
    success: number;
    failed: number;
    skipped: number;
    dbErrors: number;
    total: number;
}
```

#### バッチジョブ投入 API

`POST /api/batch/submit`

```typescript
interface BatchSubmitRequest {
    email: string;
    password: string;
    mylistName?: string;
    filters: FilterConditions;
}

interface FilterConditions {
    excludeSkip: boolean;
    favoritesOnly: boolean;
}

interface BatchSubmitResponse {
    jobId: string;
    status: string;
}
```

#### バッチステータス取得 API

`GET /api/batch/status/{jobId}`

```typescript
interface BatchStatusResponse {
    jobId: string;
    status: BatchStatus;
    result?: BatchResult;
    createdAt: string;
    updatedAt: string;
}

type BatchStatus = "SUBMITTED" | "RUNNING" | "SUCCEEDED" | "FAILED";

interface BatchResult {
    registeredCount: number;
    failedCount: number;
    totalCount: number;
    errorMessage?: string;
}
```

---

## 5. インフラ構成

### 5.1 AWS 構成図

```mermaid
graph TB
    subgraph "ユーザー"
        User[ブラウザ]
    end

    subgraph "AWS Cloud"
        subgraph "エッジロケーション"
            CF[CloudFront<br/>CDN・HTTPS終端]
        end

        subgraph "us-east-1"
            subgraph "Lambda"
                LambdaFn[Lambda Function<br/>Next.js アプリケーション]
            end

            subgraph "共有 VPC"
                subgraph "Public Subnet"
                    Batch[AWS Batch<br/>Fargate<br/>Playwright 自動化]
                end
            end

            subgraph "マネージドサービス"
                DDB[(DynamoDB<br/>動画基本情報<br/>ユーザー設定<br/>ジョブステータス)]
                ECR[(ECR<br/>Batch コンテナイメージ)]
                CWLogs[CloudWatch Logs<br/>アプリケーションログ]
            end
        end
    end

    subgraph "外部サービス"
        NicoAPI[ニコニコ動画 API<br/>getthumbinfo]
        NicoWeb[ニコニコ動画<br/>Web サイト]
    end

    User -->|HTTPS| CF
    CF -->|HTTPS| LambdaFn

    LambdaFn -->|動画情報取得| NicoAPI
    LambdaFn -->|CRUD| DDB
    LambdaFn -->|ジョブ投入| Batch
    LambdaFn -->|ログ出力| CWLogs

    Batch -->|イメージ取得| ECR
    Batch -->|Playwright| NicoWeb
    Batch -->|ステータス更新| DDB
    Batch -->|ログ出力| CWLogs

    style CF fill:#ff9900,stroke:#232f3e,color:#fff
    style LambdaFn fill:#ff9900,stroke:#232f3e,color:#fff
    style Batch fill:#ff9900,stroke:#232f3e,color:#fff
    style DDB fill:#3b48cc,stroke:#232f3e,color:#fff
    style ECR fill:#ff9900,stroke:#232f3e,color:#fff
    style CWLogs fill:#ff9900,stroke:#232f3e,color:#fff
```

### 5.2 リソース一覧

| リソース | 説明 | 主要な設定 |
|---------|------|-----------|
| **CloudFront** | CDN・HTTPS 終端 | サービス固有ディストリビューション、CloudFrontStackBase 継承、TLS 1.2、HTTP/2・HTTP/3 有効 |
| **Lambda** | Next.js アプリケーション実行 | VPC 外、Function URL 使用 |
| **AWS Batch** | マイリスト登録バッチ処理 | Fargate、共有 VPC (Public Subnet)、vCPU/メモリは運用しながら調整 |
| **DynamoDB** | データストア | オンデマンドキャパシティ、単一テーブル設計、TTL 有効（ジョブステータス用、7日） |
| **ECR** | コンテナイメージ管理 | Batch 用 Playwright イメージ |
| **CloudWatch Logs** | ログ管理 | Lambda・Batch のアプリケーションログ |
| **共有 ACM 証明書** | SSL/TLS 証明書 | `*.nagiyu.com` ワイルドカード証明書（共有リソース） |
| **共有 VPC** | ネットワーク | Batch 用、Public Subnet のみ（共有リソース） |

### 5.3 ネットワーク設計

#### VPC 構成

本サービスは**プラットフォーム共有 VPC** を使用します。

| 環境 | VPC CIDR | サブネット | 用途 |
|------|----------|-----------|------|
| dev | `10.0.0.0/24` | Public (us-east-1a) | AWS Batch (Fargate) |
| prod | `10.1.0.0/24` | Public (us-east-1a, 1b) | AWS Batch (Fargate) |

#### 各コンポーネントのネットワーク配置

| コンポーネント | 配置 | 理由 |
|---------------|------|------|
| Lambda | VPC 外 | DynamoDB へのアクセスは VPC エンドポイント不要、コールドスタート短縮 |
| AWS Batch (Fargate) | 共有 VPC (Public Subnet) | ニコニコ動画へのインターネットアクセスが必要 |
| DynamoDB | マネージドサービス | VPC 外からアクセス（IAM 認証） |

#### セキュリティグループ

AWS Batch 用のセキュリティグループを**サービス専用で作成**します。

| セキュリティグループ | インバウンド | アウトバウンド |
|---------------------|-------------|---------------|
| Batch 用 SG | なし | HTTPS (443) - インターネット向け |

**注記**: Fargate タスクはインターネットへのアウトバウンド通信のみ必要（ニコニコ動画へのアクセス）。インバウンドは不要。

### 5.4 ドメイン設計

| 環境 | ドメイン名 |
|------|-----------|
| dev | `dev-niconico-mylist-assistant.nagiyu.com` |
| prod | `niconico-mylist-assistant.nagiyu.com` |

### 5.5 将来的な設定変更

| 項目 | 初期設定 | 将来的な変更 |
|------|---------|-------------|
| DynamoDB PITR | 無効 | 本番運用安定後に有効化 |
| Batch vCPU/メモリ | 最小構成 | 運用しながら調整 |

---

## 6. セキュリティ設計

### 6.1 認証・認可

#### 認証方式

本サービスは **Auth サービス** と連携し、Google OAuth による認証を行います。

| 項目 | 内容 |
|------|------|
| 認証方式 | Google OAuth（Auth サービス連携） |
| JWT Cookie | `nagiyu-session` |
| Cookie Domain | `.nagiyu.com`（全サブドメインで共有） |
| 有効期限 | 30日 |

Auth サービスで発行された JWT クッキーは `.nagiyu.com` ドメインで共有されるため、本サービス（`niconico-mylist-assistant.nagiyu.com`）でも自動的に認証情報が利用できます。

#### 認可方式

サービス単位の権限チェックを行います。

| 項目 | 内容 |
|------|------|
| 認可方式 | RBAC（Role-Based Access Control） |
| 必要権限 | `niconico-mylist:use` |
| 権限なし時 | 403 Forbidden |

**権限チェックの流れ:**

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Web as Web パッケージ

    User->>Web: リクエスト<br/>(JWT Cookie 自動送信)
    Web->>Web: JWT 検証<br/>(署名、有効期限)

    alt JWT 無効 or 未認証
        Web-->>User: 401 Unauthorized<br/>→ Auth サービスへリダイレクト
    else JWT 有効
        Web->>Web: 権限チェック<br/>(niconico-mylist:use)
        alt 権限なし
            Web-->>User: 403 Forbidden
        else 権限あり
            Web->>Web: ユーザー ID でデータフィルタリング
            Web-->>User: 200 OK（自分のデータのみ）
        end
    end
```

#### データアクセス制御

- ユーザーは **自分のデータのみ** アクセス可能
- DynamoDB のクエリ時に `userId` でフィルタリング
- 他ユーザーのデータにはアクセス不可

### 6.2 データ暗号化

#### 暗号化対象と方式

| 対象 | 暗号化方式 | 保存場所 | 備考 |
|------|-----------|----------|------|
| ニコニコパスワード | AES-256-GCM | メモリのみ（DB 保存なし） | API Routes で暗号化、Batch で復号 |
| 暗号化キー | - | AWS Secrets Manager | 環境変数 `SHARED_SECRET_KEY` |
| DynamoDB データ | AWS KMS（At Rest） | DynamoDB | AWS 管理キーによる自動暗号化 |
| 通信 | TLS 1.2+ | - | CloudFront ↔ Lambda 間 |

#### ニコニコパスワードの暗号化フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Web as Web パッケージ<br/>(API Routes)
    participant SM as Secrets Manager
    participant Batch as Batch パッケージ
    participant Nico as ニコニコ動画

    User->>Web: パスワード入力<br/>(平文、HTTPS)
    Web->>SM: 暗号化キー取得
    SM-->>Web: SHARED_SECRET_KEY

    Note over Web: AES-256-GCM で暗号化<br/>(IV + AuthTag 生成)

    Web->>Batch: ジョブ投入<br/>(暗号化パスワード)

    Note over Batch: Batch 内で復号化
    Batch->>Nico: ログイン<br/>(平文パスワード)

    Note over Batch: 処理完了後<br/>メモリから即座に削除
```

**重要:**
- パスワードは **DB に保存しない**
- バッチ処理内でのみ復号化し、処理完了後は即座にメモリから削除
- 暗号化には認証付き暗号（AES-256-GCM）を使用し、改ざん検知も行う

### 6.3 セキュリティヘッダー

CloudFront 共通設定（`CloudFrontStackBase`）を継承し、以下のセキュリティヘッダーを自動適用します。

| ヘッダー | 値 | 効果 |
|----------|-----|------|
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | HTTPS 強制（2年間） |
| X-Content-Type-Options | nosniff | MIME スニッフィング防止 |
| X-Frame-Options | DENY | iframe 埋め込み禁止（クリックジャッキング対策） |
| X-XSS-Protection | 1; mode=block | ブラウザの XSS フィルタ有効化 |
| Referrer-Policy | strict-origin-when-cross-origin | リファラー情報の制御 |

**注記:**
- Content-Security-Policy（CSP）は現時点では設定しない
- 将来的にニコニコ動画のサムネイル画像読み込みなどで必要になった場合に検討

### 6.4 その他のセキュリティ対策

#### XSS 対策

| 対策 | 内容 |
|------|------|
| React エスケープ | React のデフォルト機能により、出力時に自動エスケープ |
| dangerouslySetInnerHTML | 使用しない |
| ユーザー入力 | 表示前にサニタイズ |

#### CSRF 対策

| 対策 | 内容 |
|------|------|
| SameSite Cookie | Auth サービスの JWT Cookie は `SameSite=Lax` |
| オリジン検証 | クロスオリジンリクエストを制限 |

#### 入力検証

| 対策 | 内容 |
|------|------|
| API Routes | リクエストパラメータを手動でバリデーション |
| 型チェック | TypeScript strict mode による型安全性 |
| 境界値チェック | 動画 ID の形式、配列の長さなどを検証 |

#### ログ出力

| 対策 | 内容 |
|------|------|
| 出力先 | CloudWatch Logs |
| 機密情報 | パスワード、暗号化キー等は **出力しない** |
| マスキング | 必要に応じてユーザー情報をマスキング |

#### Rate Limiting

| 対策 | 内容 |
|------|------|
| ニコニコ動画向け | 各動画登録間に **最低2秒** の待機時間 |
| API 側 | 現時点では設定しない（将来必要に応じて AWS WAF を検討） |

---

## 7. 技術選定理由

### 7.1 TypeScript + Playwright

**選定理由**:

- **プラットフォーム統一**: 本プラットフォームは TypeScript で統一されており、言語の一貫性を維持
- **型安全性**: TypeScript strict mode による実行時エラーの早期発見とバグ削減
- **メンテナンス性**: 単一言語での保守が容易、開発者の学習コスト削減
- **既存ノウハウ**: 本プラットフォームでは E2E テストに Playwright を既に採用しており、知見を活用可能

**代替案との比較（Python + Selenium）**:

| 項目 | TypeScript + Playwright | Python + Selenium |
|------|------------------------|-------------------|
| 実行速度 | 高速（並列実行、効率的な待機） | 比較的遅い |
| API 設計 | モダンで直感的、Promise ベース | 古典的、同期的 |
| 自動待機 | 組み込み（要素の可視性等を自動判定） | 明示的に記述が必要 |
| TypeScript サポート | 公式サポート | サードパーティ型定義 |
| ブラウザ自動化 | Chromium/Firefox/WebKit | 主要ブラウザ |
| プラットフォーム統一 | ✅ 統一可能 | ❌ 別言語が必要 |

**結論**: プラットフォームの技術統一と開発効率の観点から TypeScript + Playwright を採用

---

### 7.2 AWS Batch (Fargate)

**選定理由**:

- **時間制限なし**: Lambda の 15分制限を回避し、100個の動画登録（各2秒待機で最低200秒以上）を一括処理可能
- **シンプルな設計**: チェーン実行や分割処理が不要で、実装・運用がシンプル
- **安定性**: 長時間実行でも安定したコンテナ環境
- **コスト効率**: 使用時のみ課金（Fargate Spot も選択可能）
- **Playwright 互換**: Docker コンテナ内で Playwright + Chromium を問題なく実行可能

**代替案との比較（AWS Lambda）**:

| 項目 | AWS Batch (Fargate) | AWS Lambda |
|------|---------------------|------------|
| 実行時間制限 | なし | 最大15分 |
| 100動画の処理 | ✅ 一括処理可能 | ❌ 分割・チェーン実行が必要 |
| Chromium サイズ | 制限なし | 250MB 制限（Layer 含む） |
| コールドスタート | 数十秒〜数分 | 数秒 |
| コスト | 使用時間課金 | リクエスト + 実行時間課金 |
| 設定の複雑さ | やや複雑（Job Definition 等） | シンプル |

**結論**: マイリスト登録処理は長時間実行が前提のため、時間制限のない AWS Batch を採用。Lambda は Web アプリケーション（Next.js）の実行に使用

---

### 7.3 Amazon DynamoDB

**選定理由**:

- **スキーマレス**: 柔軟なデータ構造の変更が可能、将来の拡張に対応しやすい
- **コスト効率**: オンデマンドキャパシティで使用した分だけ課金、低トラフィック時のコストを最小化
- **サーバーレス親和性**: Lambda/Batch との統合が容易、IAM 認証でセキュアに接続
- **運用負荷**: フルマネージドで運用が簡単、バックアップ・暗号化が標準機能
- **スケーラビリティ**: 自動スケーリングでトラフィック増加にも対応

**代替案との比較（Amazon RDS）**:

| 項目 | DynamoDB | RDS (PostgreSQL/MySQL) |
|------|----------|------------------------|
| 課金モデル | 使用量課金（オンデマンド） | 常時稼働課金 |
| 接続管理 | 不要（HTTP API） | 接続プール管理が必要 |
| スキーマ | スキーマレス | 固定スキーマ |
| 複雑なクエリ | 制限あり（GSI で対応） | SQL で柔軟に対応 |
| トランザクション | 制限あり | フルサポート |
| 想定データ量との適合 | ✅ 適切（1ユーザー1,000件程度） | オーバースペック |
| Lambda との相性 | ✅ 良好 | 接続管理が複雑 |

**結論**: 想定データ量（1ユーザーあたり1,000件程度）とサーバーレスアーキテクチャとの親和性から DynamoDB を採用。RDS は常時稼働コストと接続管理の複雑さがデメリット

---

## 8. 制約事項

<!-- 記入ガイド: 技術的制約、運用制約を記述してください -->

### 8.1 技術的制約

### 8.2 運用制約

---

## 9. 将来拡張

<!-- 記入ガイド: 将来的に検討する機能や改善を記述してください -->
<!-- 記入例: 現在のスコープ外だが、将来的に実装を検討する機能や改善点をリストアップ -->

### 検討事項

- {拡張機能1}
- {拡張機能2}
- {改善案1}
