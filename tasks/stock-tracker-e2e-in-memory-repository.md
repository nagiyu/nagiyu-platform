# Stock Tracker の E2E で内部メモリを使うようにする

## 概要

Stock Tracker サービスの E2E テストを DynamoDB から独立させ、インメモリリポジトリを使用できるようにすることで、テストの安定性と速度を向上させる。

## 関連情報

- Issue: 該当 Issue 番号
- タスクタイプ: サービスタスク（Stock Tracker リファクタリング）
- 対象サービス: services/stock-tracker/web
- 関連パッケージ: services/stock-tracker/core

## 背景

### 現状の問題点

- E2E テストが実際の DynamoDB を使用しているため、以下の問題が発生している
    - ネットワーク接続に依存し、テストが不安定になる
    - DynamoDB の状態によってテスト結果が変わる可能性がある
    - テストの実行速度が遅い
    - AWS 認証情報の管理が必要

### 既存の実装状況

`services/stock-tracker/core/src/repositories` 配下には以下のリポジトリが既に存在:

**DynamoDB 実装**:
- `dynamodb-alert.repository.ts`
- `dynamodb-holding.repository.ts`
- `dynamodb-ticker.repository.ts`

**InMemory 実装**:
- `in-memory-alert.repository.ts`
- `in-memory-holding.repository.ts`
- `in-memory-ticker.repository.ts`

**インターフェース**:
- `alert.repository.interface.ts`
- `holding.repository.interface.ts`
- `ticker.repository.interface.ts`

**従来のリポジトリ（リファクタリング前）**:
- `alert.ts` (AlertRepository)
- `holding.ts` (HoldingRepository)
- `ticker.ts` (TickerRepository)
- `exchange.ts` (ExchangeRepository)
- `watchlist.ts` (WatchlistRepository)

## 要件

### 機能要件

#### FR1: リポジトリの完全移行

- すべての API エンドポイントで新しいリポジトリインターフェースを使用する
- 従来のリポジトリ（alert.ts, holding.ts, ticker.ts 等）から新しいインターフェース実装に移行する
- リポジトリの DI (Dependency Injection) を適切に実装する

#### FR2: 環境変数によるリポジトリ切り替え

- 環境変数（例: `USE_IN_MEMORY_REPOSITORY`）を使用してリポジトリの実装を切り替える
- DynamoDB 実装とインメモリ実装を同じインターフェースで利用可能にする
- ファクトリー関数またはファクトリークラスでリポジトリインスタンスを生成する

#### FR3: E2E テストでのインメモリ利用

- Playwright の E2E テスト実行時はインメモリリポジトリを使用する
- `.env.test` で環境変数を設定する
- E2E テストが DynamoDB に依存せず実行できることを確認する

#### FR4: 全リポジトリの対応

以下のすべてのリポジトリに対してインメモリ実装を提供:
- Alert (既存)
- Holding (既存)
- Ticker (既存)
- Exchange (新規作成が必要)
- Watchlist (新規作成が必要)

### 非機能要件

#### NFR1: 後方互換性

- 既存の E2E テストを大幅に変更せずに動作させる
- API エンドポイントの外部インターフェースは変更しない
- DynamoDB を使用する本番環境の動作に影響を与えない

#### NFR2: テストカバレッジ

- 変更後もテストカバレッジ 80% 以上を維持する
- 新しいファクトリー関数やリポジトリ切り替えロジックのユニットテストを作成する

#### NFR3: コード品質

- TypeScript strict mode を維持する
- エラーメッセージは日本語で定数化する
- リポジトリの依存関係は DI パターンで注入する

#### NFR4: パフォーマンス

- インメモリリポジトリ使用時の E2E テスト実行時間を短縮する
- メモリリークが発生しないようにテスト終了時にデータをクリアする

## 実装方針

### 1. リポジトリファクトリーの作成

`services/stock-tracker/web/lib/repository-factory.ts` を新規作成し、環境変数に基づいてリポジトリインスタンスを生成する。

**設計方針**:
- 環境変数 `USE_IN_MEMORY_REPOSITORY` が `true` の場合はインメモリ実装を返す
- それ以外の場合は DynamoDB 実装を返す
- シングルトンパターンでインスタンスを管理する
- 各リポジトリタイプごとにファクトリー関数を提供する

### 2. Exchange と Watchlist のインメモリリポジトリ作成

現在存在しない以下のファイルを作成:
- `services/stock-tracker/core/src/repositories/exchange.repository.interface.ts`
- `services/stock-tracker/core/src/repositories/in-memory-exchange.repository.ts`
- `services/stock-tracker/core/src/repositories/watchlist.repository.interface.ts`
- `services/stock-tracker/core/src/repositories/in-memory-watchlist.repository.ts`

**設計方針**:
- 既存の DynamoDB 実装（exchange.ts, watchlist.ts）のメソッドシグネチャを分析
- インターフェースを定義してメソッドを抽出
- InMemorySingleTableStore を使用したインメモリ実装を作成
- 既存の Alert, Holding, Ticker のインメモリ実装パターンに従う

### 3. API エンドポイントのリファクタリング

`services/stock-tracker/web/app/api/**/*.ts` の全エンドポイントを更新:
- 従来のリポジトリインスタンス生成を削除
- ファクトリー関数を使用してリポジトリを取得
- リポジトリインターフェースを通じて操作を実行

**影響を受けるファイル**:
- `app/api/alerts/route.ts`
- `app/api/alerts/[id]/route.ts`
- `app/api/holdings/route.ts`
- `app/api/holdings/[id]/route.ts`
- `app/api/tickers/route.ts`
- `app/api/tickers/[id]/route.ts`
- `app/api/exchanges/route.ts`
- `app/api/exchanges/[id]/route.ts`
- `app/api/watchlist/route.ts`
- `app/api/watchlist/[id]/route.ts`

### 4. 環境変数の設定

`.env.test` に以下を追加:
```
USE_IN_MEMORY_REPOSITORY=true
```

### 5. E2E テストの調整

- E2E テストで使用する TestDataFactory を確認
- インメモリリポジトリでも正しく動作することを検証
- 必要に応じてテストヘルパーを調整

### 6. DynamoDB 実装の整理

従来のリポジトリ（alert.ts, holding.ts, ticker.ts 等）を段階的に置き換え:
- 新しいインターフェース実装を core パッケージの exports に追加
- 段階的に従来のクラスから新しい実装へ移行
- 既存のテストを更新して新しいインターフェースを使用

## 実装タスク

### Phase 1: リポジトリインターフェースの整備

- [ ] T001: Exchange リポジトリインターフェースを作成
    - ファイル: `services/stock-tracker/core/src/repositories/exchange.repository.interface.ts`
    - 内容: ExchangeRepository のメソッドシグネチャを定義

- [ ] T002: Watchlist リポジトリインターフェースを作成
    - ファイル: `services/stock-tracker/core/src/repositories/watchlist.repository.interface.ts`
    - 内容: WatchlistRepository のメソッドシグネチャを定義

- [ ] T003: InMemory Exchange リポジトリを実装
    - ファイル: `services/stock-tracker/core/src/repositories/in-memory-exchange.repository.ts`
    - 依存: T001

- [ ] T004: InMemory Watchlist リポジトリを実装
    - ファイル: `services/stock-tracker/core/src/repositories/in-memory-watchlist.repository.ts`
    - 依存: T002

- [ ] T005: DynamoDB Exchange リポジトリをインターフェース実装に変更
    - ファイル: `services/stock-tracker/core/src/repositories/dynamodb-exchange.repository.ts`
    - 内容: 既存の exchange.ts を参考に新しいファイルを作成
    - 依存: T001

- [ ] T006: DynamoDB Watchlist リポジトリをインターフェース実装に変更
    - ファイル: `services/stock-tracker/core/src/repositories/dynamodb-watchlist.repository.ts`
    - 内容: 既存の watchlist.ts を参考に新しいファイルを作成
    - 依存: T002

### Phase 2: リポジトリファクトリーの実装

- [ ] T007: リポジトリファクトリーを作成
    - ファイル: `services/stock-tracker/web/lib/repository-factory.ts`
    - 内容: 環境変数に基づいてリポジトリインスタンスを生成する関数群
    - 提供する関数:
        - `createAlertRepository()`
        - `createHoldingRepository()`
        - `createTickerRepository()`
        - `createExchangeRepository()`
        - `createWatchlistRepository()`
    - 依存: T001-T006

- [ ] T008: ファクトリーのユニットテストを作成
    - ファイル: `services/stock-tracker/web/tests/unit/lib/repository-factory.test.ts`
    - 内容: 環境変数による切り替えロジックのテスト
    - 依存: T007

### Phase 3: API エンドポイントの移行

- [ ] T009: Alert API エンドポイントをファクトリー経由に変更
    - ファイル: `app/api/alerts/route.ts`, `app/api/alerts/[id]/route.ts`
    - 依存: T007

- [ ] T010: Holding API エンドポイントをファクトリー経由に変更
    - ファイル: `app/api/holdings/route.ts`, `app/api/holdings/[id]/route.ts`
    - 依存: T007

- [ ] T011: Ticker API エンドポイントをファクトリー経由に変更
    - ファイル: `app/api/tickers/route.ts`, `app/api/tickers/[id]/route.ts`
    - 依存: T007

- [ ] T012: Exchange API エンドポイントをファクトリー経由に変更
    - ファイル: `app/api/exchanges/route.ts`, `app/api/exchanges/[id]/route.ts`
    - 依存: T007

- [ ] T013: Watchlist API エンドポイントをファクトリー経由に変更
    - ファイル: `app/api/watchlist/route.ts`, `app/api/watchlist/[id]/route.ts`
    - 依存: T007

### Phase 4: 環境設定と E2E テストの調整

- [ ] T014: .env.test に環境変数を追加
    - ファイル: `services/stock-tracker/web/.env.test`
    - 内容: `USE_IN_MEMORY_REPOSITORY=true` を追加

- [ ] T015: E2E テストが正常に動作することを確認
    - 全 E2E テストを実行してインメモリリポジトリで動作することを検証
    - 依存: T009-T014

### Phase 5: テストとドキュメント

- [ ] T016: リポジトリファクトリーとインターフェース実装のユニットテストを追加
    - カバレッジ 80% 以上を確保

- [ ] T017: 既存のユニットテストを更新
    - 新しいリポジトリインターフェースに合わせてテストを調整

- [ ] T018: パフォーマンス測定
    - E2E テスト実行時間の改善を測定・記録

- [ ] T019: ドキュメント更新
    - リポジトリアーキテクチャの変更を docs に反映
    - 環境変数の説明を README に追加

## テスト方針

### ユニットテスト

- リポジトリファクトリーのテスト
    - 環境変数が `true` の場合にインメモリ実装が返されることを検証
    - 環境変数が設定されていない場合に DynamoDB 実装が返されることを検証
- 新しいインメモリリポジトリのテスト
    - CRUD 操作が正しく動作することを検証
    - 既存の DynamoDB リポジトリテストと同様のテストケースを実装

### E2E テスト

- 全既存 E2E テストがインメモリリポジトリで動作することを確認
- DynamoDB への接続が発生していないことを確認（ネットワークモニタリング）
- テスト実行時間の短縮を測定

### 受け入れ基準

- [ ] すべての E2E テストが `.env.test` で `USE_IN_MEMORY_REPOSITORY=true` を設定した状態で成功する
- [ ] テストカバレッジが 80% 以上を維持している
- [ ] E2E テスト実行時間が改善されている
- [ ] DynamoDB 接続に関連するエラーが E2E テスト時に発生しない
- [ ] 本番環境（DynamoDB 使用）の動作が変更されていない

## 注意事項とリスク

### 注意事項

- **段階的な移行**: API エンドポイントは一つずつ移行し、各段階でテストを実行する
- **従来のリポジトリとの共存**: 移行期間中は新旧のリポジトリが共存する可能性がある
- **メモリ管理**: E2E テスト終了時にインメモリデータを確実にクリアする
- **インターフェースの一貫性**: 既存のリポジトリ（alert.ts, holding.ts 等）のシグネチャと新しいインターフェースの整合性を保つ

### リスク

1. **既存コードへの影響**
    - 軽減策: 段階的な移行と各段階でのテスト実行
    - 軽減策: 既存のユニットテストを維持し、リグレッションを検出

2. **インメモリ実装と DynamoDB 実装の動作差異**
    - 軽減策: 両実装で共通のテストスイートを実行
    - 軽減策: インターフェース定義を厳密に行う

3. **パフォーマンスの予期しない低下**
    - 軽減策: ベンチマークを取得し、移行前後で比較
    - 軽減策: ファクトリーのオーバーヘッドを最小化（シングルトンパターン）

## 参考ドキュメント

- [コーディング規約](../../docs/development/rules.md)
- [テスト戦略](../../docs/development/testing.md)
- [アーキテクチャ方針](../../docs/development/architecture.md)
- [Stock Tracker サービス設計](../../docs/services/stock-tracker/)

## 備考

- リポジトリ DI の部分実装は既に存在するため、残りのリポジトリの移行が主なタスクとなる
- InMemorySingleTableStore は `@nagiyu/aws` パッケージで提供されている
- Playwright の設定（`playwright.config.ts`）は既に `.env.test` を読み込む設定になっている
