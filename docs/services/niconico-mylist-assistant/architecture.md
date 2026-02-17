# niconico-mylist-assistant アーキテクチャ

## 1. システム概要

niconico-mylist-assistantは、ニコニコ動画のマイリスト登録作業を自動化するサーバーレスアプリケーションです。

### 1.1 主要コンポーネント

- **Web（Next.js + Lambda）**: ユーザーインターフェースとAPI提供
- **Batch（AWS Batch + Playwright）**: マイリスト登録の長時間バッチ処理
- **Core（TypeScript Library）**: フレームワーク非依存の共通ビジネスロジック
- **DynamoDB**: 動画基本情報とユーザー設定の保存

## 2. 重要なアーキテクチャ決定

### 2.1 AWS Batchの採用理由

**Lambda の15分制限を回避するため、AWS Batch (Fargate) を採用**

- 最大100個の動画を登録する場合、各動画間に2秒の待機時間を設けると最低200秒（約3.3分）が必要
- ネットワーク遅延やリトライを考慮すると、Lambdaの15分制限では不十分
- AWS Batchは時間制限がなく、Docker コンテナで Playwright を実行可能

### 2.2 3パッケージ構成の設計思想

**core / web / batch の明確な責務分離**

#### core パッケージ

- **完全フレームワーク非依存**のTypeScriptライブラリ
- Pure Business Logic Functions（`libs/`）: 副作用のない計算ロジック
- Repository Pattern（`repositories/`）: データアクセス層の抽象化
- Mapper Pattern（`mappers/`）: Entity ↔ DynamoDB Item 変換
- Services（`services/`）: 外部API連携、Playwright自動化、暗号化

**設計原則**:

- 副作用のないビジネスロジックは`libs/`に配置し、ユニットテストを重点的に実施
- Repository InterfaceによりDynamoDB実装とInMemory実装を切り替え可能にし、テスタビリティを確保
- webとbatchの両方から共通ロジックを再利用

#### web パッケージ

- Next.js による Web UI と API Routes
- core パッケージのロジックを使用し、プレゼンテーション層に専念

#### batch パッケージ

- AWS Batch で実行される Docker コンテナ
- core パッケージのロジックを使用し、Playwright 自動化に専念

### 2.3 データ構造の設計思想

**動画基本情報（全ユーザー共通）とユーザー設定（ユーザー固有）の分離**

#### Single Table Design

DynamoDBは単一テーブルで以下のエンティティを管理:

- **VIDEO**: 動画基本情報（全ユーザー共通）
- **USER_SETTING**: ユーザー設定（ユーザー固有）
- **BATCH_JOB**: バッチジョブステータス

この設計により:

- 動画基本情報の重複を避け、ストレージを効率化
- 各ユーザーは自分の設定のみを管理
- バッチジョブのステータスをリアルタイムに追跡可能

### 2.4 Repository Patternの採用理由

**DynamoDB実装とInMemory実装の切り替えにより、E2Eテストのテスタビリティを向上**

- **DynamoDB Repository**: 本番・開発環境で使用
- **InMemory Repository**: E2Eテスト環境で使用（`@nagiyu/aws` の `InMemorySingleTableStore` を活用）

環境変数 `USE_IN_MEMORY_DB=true` により、E2Eテストでは実DynamoDBではなくインメモリストアを使用し、テストデータの独立性と実行速度を確保。

### 2.5 マイリスト登録の設計方針

**既存マイリストの完全リセット**

ニコニコ動画のマイリスト上限は100件であり、追加登録すると上限を超える可能性がある。そのため、既存の動画を全て削除してから新しい動画を登録する設計とする。

**マイリスト名の自動生成**

ユーザーが指定しない場合、`自動登録 2026/1/16 15:30:45` 形式で自動生成。

**待機時間の厳守**

各動画登録間に**最低2秒**の待機時間を設ける（ニコニコ動画サーバーへの配慮）。

### 2.6 セキュリティ設計

**ニコニコアカウント情報の暗号化**

- パスワードは**絶対にデータベースに保存しない**
- フロントエンド → API Routes → AWS Batch の通信経路で暗号化（AES-256-GCM）
- AWS Batch 内でのみ復号化し、メモリ上で一時保持
- 処理終了後は即座にメモリから削除

### 2.7 セレクタ戦略のフォールバック設計

**ニコニコ動画のHTML構造変更に対応するため、複数の抽出戦略を並行実行**

1.  安定したID/属性ベース（優先度1）
2.  Playwright推奨のRoleセレクタ（優先度2）
3.  JSON-LD/APIデータの利用（優先度3）
4.  部分一致セレクタ（フォールバック）

いずれかが成功すればOKとし、セレクタは定数化して管理。

### 2.8 動画選択ロジックの責務分離

**フィルタ済み母集団の決定とランダム抽出を分離し、公平性と保守性を両立**

- `listVideosWithSettings` は「フィルタリングとページネーション」を責務とし、`limit` 未指定時はフィルタ後の全件を返す
- `selectRandomVideos` は「ランダム抽出」を責務とし、必要件数のみを返す
- マイリスト一括登録APIは `selectRandomVideos` を利用し、フィルタ後の全母集団を対象に抽出する

**採用したランダム抽出アルゴリズム**

- Reservoir Sampling（Algorithm R）を採用
- 理由:
    - 抽出対象が多い場合でも、必要件数のみを保持して処理できる
    - フィルタ後の先頭要素に偏らない公平な抽出を維持できる
    - 既存のAPI入出力を変えずに導入しやすい

## 3. 技術スタック

### 3.1 フロントエンド

- Next.js 16 + React 19 + Material-UI 7
- TypeScript strict mode

### 3.2 バックエンド

- Node.js 22 + TypeScript
- Next.js API Routes

### 3.3 インフラ

- AWS Lambda（Next.js アプリケーション）
- AWS Batch (Fargate)（長時間バッチ処理）
- Amazon DynamoDB（データストア）
- CloudWatch Logs（ログ管理）
- Amazon CloudFront（CDN）
- AWS CDK（IaC）

### 3.4 自動化・通知

- Playwright（ブラウザ自動化）
- web-push（VAPID認証によるPush通知）

## 4. 非機能要件への対応

### 4.1 パフォーマンス

- 動画基本情報取得: 1動画あたり平均1秒以内
- 各動画登録間の待機時間: 最低2秒（安全性優先）

### 4.2 可用性

- Lambda / Batch の自動スケーリングにより高可用性を確保
- リトライロジック（最大3回、指数バックオフ）

### 4.3 テスタビリティ

- Repository Pattern により DynamoDB と InMemory を切り替え
- Pure Business Logic Functions は副作用がなく、ユニットテストが容易
- E2E テストは InMemory ストアを使用し、実行速度とデータ独立性を確保
