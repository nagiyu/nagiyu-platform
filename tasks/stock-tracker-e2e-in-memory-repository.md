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

### Phase 0: 現状確認結果（2026-02-01 実施）

#### リポジトリの実装状況

**✅ 新パターン完全移行済み（インターフェース + DynamoDB + InMemory）:**

- **Alert**:
  - インターフェース: `alert.repository.interface.ts`
  - DynamoDB実装: `dynamodb-alert.repository.ts` (DynamoDBAlertRepository)
  - InMemory実装: `in-memory-alert.repository.ts` (InMemoryAlertRepository)
  - 特徴: Mapper パターン、GSI2 for Frequency
- **Holding**:
  - インターフェース: `holding.repository.interface.ts`
  - DynamoDB実装: `dynamodb-holding.repository.ts` (DynamoDBHoldingRepository)
  - InMemory実装: `in-memory-holding.repository.ts` (InMemoryHoldingRepository)
  - 特徴: Mapper パターン、PaginationOptions 対応
- **Ticker**:
  - インターフェース: `ticker.repository.interface.ts`
  - DynamoDB実装: `dynamodb-ticker.repository.ts` (DynamoDBTickerRepository)
  - InMemory実装: `in-memory-ticker.repository.ts` (InMemoryTickerRepository)
  - 特徴: 単一IDキー、GSI3 for Exchange

**❌ 従来パターンのみ（DynamoDB実装のみ、InMemory実装なし）:**

- **Exchange**:
  - ファイル: `exchange.ts` (ExchangeRepository extends AbstractDynamoDBRepository)
  - インターフェース: なし
  - InMemory実装: なし
  - 特徴: getAll() メソッドあり、引数の柔軟性 `(id | {id})`
- **Watchlist**:
  - ファイル: `watchlist.ts` (WatchlistRepository extends AbstractDynamoDBRepository)
  - インターフェース: なし
  - InMemory実装: なし
  - 特徴: カスタムエラークラス（WatchlistNotFoundError等）、オーバーロードメソッド

#### API エンドポイントの使用状況

**現状**: すべてのエンドポイントで以下のパターンでリポジトリをインスタンス化

```typescript
const docClient = getDynamoDBClient();
const tableName = getTableName();
const xxxRepo = new XxxRepository(docClient, tableName);
```

**影響を受けるファイル（合計30箇所以上）:**

- `app/api/alerts/route.ts` (2箇所)
- `app/api/alerts/[id]/route.ts` (3箇所)
- `app/api/holdings/route.ts` (4箇所)
- `app/api/holdings/[id]/route.ts` (3箇所)
- `app/api/tickers/route.ts` (2箇所)
- `app/api/tickers/[id]/route.ts` (2箇所)
- `app/api/exchanges/route.ts` (2箇所)
- `app/api/exchanges/[id]/route.ts` (3箇所)
- `app/api/watchlist/route.ts` (4箇所)
- `app/api/watchlist/[id]/route.ts` (1箇所)
- `app/api/push/refresh/route.ts` (1箇所)

#### core パッケージのエクスポート状況

**現状** (`services/stock-tracker/core/src/index.ts`):

- 従来のリポジトリクラスのみエクスポート（AlertRepository, HoldingRepository等）
- 新しいインターフェース、DynamoDB実装、InMemory実装はエクスポートされていない

**必要な対応**:

- インターフェース（AlertRepository, HoldingRepository, TickerRepository 等）のエクスポート
- DynamoDB実装（DynamoDBAlertRepository 等）のエクスポート
- InMemory実装（InMemoryAlertRepository 等）のエクスポート

#### メソッドシグネチャの特徴

| リポジトリ | 移行状態      | getById 引数                   | delete 引数                    | 特徴               |
| ---------- | ------------- | ------------------------------ | ------------------------------ | ------------------ |
| Alert      | ✅ 新パターン | `(userId, alertId)`            | `(userId, alertId)`            | Mapper、GSI2       |
| Holding    | ✅ 新パターン | `(userId, tickerId)`           | `(userId, tickerId)`           | Mapper、Pagination |
| Ticker     | ✅ 新パターン | `(tickerId)`                   | `(tickerId)`                   | 単一ID、GSI3       |
| Exchange   | ❌ 従来       | `(id \| {id})`                 | `(id \| {id})`                 | getAll()あり       |
| Watchlist  | ❌ 従来       | `(userId, tickerId)` / `(key)` | `(userId, tickerId)` / `(key)` | カスタムエラー     |

## 要件

### 機能要件

#### FR1: リポジトリの完全移行

- すべての API エンドポイントでリポジトリファクトリーを使用する
- Exchange と Watchlist を新パターン（インターフェース + 複数実装）に移行する
- リポジトリの DI (Dependency Injection) を適切に実装する

#### FR2: 環境変数によるリポジトリ切り替え

- 環境変数 `USE_IN_MEMORY_REPOSITORY=true` でインメモリ実装を使用
- DynamoDB 実装とインメモリ実装を同じインターフェースで利用可能にする
- ファクトリー関数でリポジトリインスタンスを生成する

#### FR3: E2E テストでのインメモリ利用

- Playwright の E2E テスト実行時はインメモリリポジトリを使用する
- `.env.test` で環境変数を設定する
- E2E テストが DynamoDB に依存せず実行できることを確認する

#### FR4: 全リポジトリの対応

以下のすべてのリポジトリに対してインメモリ実装を提供:

- Alert (✅ 既存)
- Holding (✅ 既存)
- Ticker (✅ 既存)
- Exchange (❌ 新規作成が必要)
- Watchlist (❌ 新規作成が必要)

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

### 1. InMemorySingleTableStore のシングルトン管理

**重要**: すべてのリポジトリで同一の `InMemorySingleTableStore` インスタンスを共有する必要がある。

```typescript
// ファクトリー内でストアを1つ共有
let memoryStore: InMemorySingleTableStore | null = null;

function getOrCreateMemoryStore(): InMemorySingleTableStore {
  if (!memoryStore) {
    memoryStore = new InMemorySingleTableStore();
  }
  return memoryStore;
}

// テストクリーンアップ用
export function clearMemoryStore(): void {
  memoryStore = null;
}
```

### 2. リポジトリファクトリーの作成

`services/stock-tracker/web/lib/repository-factory.ts` を新規作成し、環境変数に基づいてリポジトリインスタンスを生成する。

**設計方針**:

- 環境変数 `USE_IN_MEMORY_REPOSITORY` が `'true'` の場合はインメモリ実装を返す
- それ以外の場合は DynamoDB 実装を返す
- シングルトンパターンでリポジトリインスタンスを管理する
- 各リポジトリタイプごとにファクトリー関数を提供する
- インメモリモード時は DynamoDB クライアントを使用しない

### 3. Exchange と Watchlist のインターフェース設計

**Exchange リポジトリインターフェース**:

```typescript
export interface ExchangeRepository {
  getById(exchangeId: string): Promise<ExchangeEntity | null>;
  getAll(): Promise<ExchangeEntity[]>;
  create(input: CreateExchangeInput): Promise<ExchangeEntity>;
  update(exchangeId: string, updates: UpdateExchangeInput): Promise<ExchangeEntity>;
  delete(exchangeId: string): Promise<void>;
}
```

**Watchlist リポジトリインターフェース**:

```typescript
export interface WatchlistRepository {
  getById(userId: string, tickerId: string): Promise<WatchlistEntity | null>;
  getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<WatchlistEntity>>;
  create(input: CreateWatchlistInput): Promise<WatchlistEntity>;
  delete(userId: string, tickerId: string): Promise<void>;
}
```

**注意**: 既存のカスタムエラークラス（WatchlistNotFoundError等）を維持する。

### 4. API エンドポイントのリファクタリング

**変更前**:

```typescript
const docClient = getDynamoDBClient();
const tableName = getTableName();
const alertRepo = new AlertRepository(docClient, tableName);
```

**変更後**:

```typescript
import { createAlertRepository } from '../../../lib/repository-factory';
const alertRepo = createAlertRepository();
```

### 5. 環境変数の設定

`.env.test` に以下を追加:

```
USE_IN_MEMORY_REPOSITORY=true
```

環境変数の型定義も追加（`env.d.ts` または `next-env.d.ts`）。

### 6. メモリクリーンアップの実装

E2E テスト終了時にデータをクリアする仕組み:

- グローバル teardown でストアをクリア
- または各テストファイルの `afterAll` でクリア

## 実装タスク

### Phase 0: 事前準備（✅ 完了）

- [x] T000: リポジトリ実装状況の調査と整理
  - 既存の実装パターンを分析
  - API エンドポイントの使用状況を確認
  - エクスポート戦略を決定

### Phase 1: リポジトリインターフェースの整備

- [ ] T001: Exchange リポジトリインターフェースを作成
  - ファイル: `services/stock-tracker/core/src/repositories/exchange.repository.interface.ts`
  - 内容: ExchangeRepository のメソッドシグネチャを定義
  - 参考: 既存の exchange.ts のメソッドを分析

- [ ] T002: Watchlist リポジトリインターフェースを作成
  - ファイル: `services/stock-tracker/core/src/repositories/watchlist.repository.interface.ts`
  - 内容: WatchlistRepository のメソッドシグネチャを定義
  - 参考: 既存の watchlist.ts のメソッドを分析
  - 注意: カスタムエラークラスを維持

- [ ] T003: Exchange Entity と Mapper を作成
  - ファイル: `services/stock-tracker/core/src/entities/exchange.entity.ts`
  - ファイル: `services/stock-tracker/core/src/mappers/exchange.mapper.ts`
  - 内容: Entity 型定義と DynamoDBItem との変換ロジック
  - 依存: T001

- [ ] T004: Watchlist Entity と Mapper を作成
  - ファイル: `services/stock-tracker/core/src/entities/watchlist.entity.ts`
  - ファイル: `services/stock-tracker/core/src/mappers/watchlist.mapper.ts`
  - 内容: Entity 型定義と DynamoDBItem との変換ロジック
  - 依存: T002

- [ ] T005: DynamoDB Exchange リポジトリをインターフェース実装に変更
  - ファイル: `services/stock-tracker/core/src/repositories/dynamodb-exchange.repository.ts`
  - 内容: 既存の exchange.ts を参考に DynamoDBExchangeRepository を作成
  - パターン: Alert/Holding/Ticker の DynamoDB 実装に従う
  - 依存: T001, T003

- [ ] T006: DynamoDB Watchlist リポジトリをインターフェース実装に変更
  - ファイル: `services/stock-tracker/core/src/repositories/dynamodb-watchlist.repository.ts`
  - 内容: 既存の watchlist.ts を参考に DynamoDBWatchlistRepository を作成
  - パターン: Alert/Holding/Ticker の DynamoDB 実装に従う
  - カスタムエラークラスを維持
  - 依存: T002, T004

- [ ] T007: InMemory Exchange リポジトリを実装
  - ファイル: `services/stock-tracker/core/src/repositories/in-memory-exchange.repository.ts`
  - 内容: InMemorySingleTableStore を使用した実装
  - パターン: Alert/Holding/Ticker の InMemory 実装に従う
  - 依存: T001, T003

- [ ] T008: InMemory Watchlist リポジトリを実装
  - ファイル: `services/stock-tracker/core/src/repositories/in-memory-watchlist.repository.ts`
  - 内容: InMemorySingleTableStore を使用した実装
  - パターン: Alert/Holding/Ticker の InMemory 実装に従う
  - 依存: T002, T004

- [ ] T009: core パッケージの index.ts を更新
  - ファイル: `services/stock-tracker/core/src/index.ts`
  - 内容: 新しいインターフェース、DynamoDB実装、InMemory実装をエクスポート
  - 追加するエクスポート:
    - インターフェース: `AlertRepository`, `HoldingRepository`, `TickerRepository`, `ExchangeRepository`, `WatchlistRepository`
    - DynamoDB実装: `DynamoDBAlertRepository`, `DynamoDBHoldingRepository`, 等
    - InMemory実装: `InMemoryAlertRepository`, `InMemoryHoldingRepository`, 等
    - Entity型: `AlertEntity`, `HoldingEntity`, 等
  - 依存: T001-T008

### Phase 2: リポジトリファクトリーの実装

- [ ] T010: 環境変数の型定義を追加
  - ファイル: `services/stock-tracker/web/env.d.ts` または `next-env.d.ts`
  - 内容: `USE_IN_MEMORY_REPOSITORY` の型定義を追加

- [ ] T011: リポジトリファクトリーを作成
  - ファイル: `services/stock-tracker/web/lib/repository-factory.ts`
  - 内容: 環境変数に基づいてリポジトリインスタンスを生成する関数群
  - 提供する関数:
    - `createAlertRepository(): AlertRepository`
    - `createHoldingRepository(): HoldingRepository`
    - `createTickerRepository(): TickerRepository`
    - `createExchangeRepository(): ExchangeRepository`
    - `createWatchlistRepository(): WatchlistRepository`
    - `clearMemoryStore(): void` (テストクリーンアップ用)
  - シングルトン管理:
    - InMemorySingleTableStore のシングルトン
    - 各リポジトリインスタンスのシングルトン
  - 依存: T009, T010

- [ ] T012: ファクトリーのユニットテストを作成
  - ファイル: `services/stock-tracker/web/tests/unit/lib/repository-factory.test.ts`
  - 内容: 環境変数による切り替えロジックのテスト
  - テストケース:
    - `USE_IN_MEMORY_REPOSITORY=true` の場合、InMemory実装が返される
    - `USE_IN_MEMORY_REPOSITORY` が未設定の場合、DynamoDB実装が返される
    - シングルトンが正しく機能する
    - `clearMemoryStore()` でストアがクリアされる
  - 依存: T011

### Phase 3: API エンドポイントの移行

**注意**: 各タスクで変更後、該当エンドポイントのユニットテストを実行して動作確認する。

- [ ] T013: Alert API エンドポイントをファクトリー経由に変更
  - ファイル: `app/api/alerts/route.ts`, `app/api/alerts/[id]/route.ts`, `app/api/push/refresh/route.ts`
  - 変更内容: `new AlertRepository()` → `createAlertRepository()`
  - 影響: 5箇所
  - 依存: T011

- [ ] T014: Holding API エンドポイントをファクトリー経由に変更
  - ファイル: `app/api/holdings/route.ts`, `app/api/holdings/[id]/route.ts`
  - 変更内容: `new HoldingRepository()` → `createHoldingRepository()`
  - 影響: 7箇所
  - 依存: T011

- [ ] T015: Ticker API エンドポイントをファクトリー経由に変更
  - ファイル: `app/api/tickers/route.ts`, `app/api/tickers/[id]/route.ts`
  - 変更内容: `new TickerRepository()` → `createTickerRepository()`
  - 注意: Ticker は Alert/Holding/Watchlist の各エンドポイントでも使用されている
  - 影響: 10箇所以上
  - 依存: T011

- [ ] T016: Exchange API エンドポイントをファクトリー経由に変更
  - ファイル: `app/api/exchanges/route.ts`, `app/api/exchanges/[id]/route.ts`
  - 変更内容: `new ExchangeRepository()` → `createExchangeRepository()`
  - 影響: 5箇所
  - 依存: T011

- [ ] T017: Watchlist API エンドポイントをファクトリー経由に変更
  - ファイル: `app/api/watchlist/route.ts`, `app/api/watchlist/[id]/route.ts`
  - 変更内容: `new WatchlistRepository()` → `createWatchlistRepository()`
  - 影響: 5箇所
  - 依存: T011

### Phase 4: 環境設定と E2E テストの調整

- [ ] T018: .env.test に環境変数を追加
  - ファイル: `services/stock-tracker/web/.env.test`
  - 内容: `USE_IN_MEMORY_REPOSITORY=true` を追加

- [ ] T019: テストクリーンアップヘルパーを作成
  - ファイル: `services/stock-tracker/web/tests/helpers/cleanup.ts`
  - 内容: E2E テスト用のクリーンアップ関数
  - 機能: `clearMemoryStore()` を呼び出してストアをクリア
  - 使用方法: グローバル teardown または各テストの `afterAll`

- [ ] T020: TestDataFactory の調整確認
  - E2E テストで使用する TestDataFactory を確認
  - インメモリリポジトリでも正しく動作することを検証
  - 必要に応じてヘルパー関数を追加

- [ ] T021: E2E テストが正常に動作することを確認
  - 全 E2E テストを実行してインメモリリポジトリで動作することを検証
  - DynamoDB への接続が発生していないことを確認
  - 依存: T013-T020

### Phase 5: テストとドキュメント

- [ ] T022: InMemory リポジトリのユニットテストを追加
  - ファイル:
    - `services/stock-tracker/core/tests/repositories/in-memory-exchange.repository.test.ts`
    - `services/stock-tracker/core/tests/repositories/in-memory-watchlist.repository.test.ts`
  - 内容: CRUD 操作が正しく動作することを検証
  - パターン: 既存の InMemory リポジトリテストに従う

- [x] T023: DynamoDB リポジトリのユニットテストを追加（2026-02-04 完了）
  - ファイル:
    - `services/stock-tracker/core/tests/repositories/dynamodb-exchange.repository.test.ts`
    - `services/stock-tracker/core/tests/repositories/dynamodb-watchlist.repository.test.ts`
  - 内容: DynamoDB 操作のモックテスト

- [x] T024: カバレッジ確認とテスト追加（2026-02-04 完了）
  - カバレッジ 80.3% を達成（目標: 80%以上）
  - InMemoryリポジトリのエラーハンドリングテストを追加
  - 結果:
    - Statements: 93.88%
    - Branches: 80.3%
    - Functions: 100%
    - Lines: 93.81%

- [ ] T025: 既存のユニットテストを更新
  - 新しいリポジトリインターフェースに合わせてテストを調整
  - 必要に応じてモックを更新

- [ ] T026: パフォーマンス測定
  - E2E テスト実行時間の改善を測定・記録
  - 移行前後の比較データを取得

- [ ] T027: ドキュメント更新
  - リポジトリアーキテクチャの変更を docs に反映
  - 環境変数の説明を README に追加
  - ファクトリーパターンの使用方法を記載

### Phase 6: クリーンアップ（オプション）

- [ ] T028: 従来のリポジトリクラスを非推奨化
  - ファイル: `alert.ts`, `holding.ts`, `ticker.ts`, `exchange.ts`, `watchlist.ts`
  - 内容: `@deprecated` タグを追加、または完全に削除
  - 注意: 他のパッケージで使用されていないか確認

## テスト方針

### ユニットテスト

- **リポジトリファクトリーのテスト**
  - 環境変数が `'true'` の場合にインメモリ実装が返されることを検証
  - 環境変数が設定されていない場合に DynamoDB 実装が返されることを検証
  - シングルトンパターンが正しく機能することを検証
- **新しいインメモリリポジトリのテスト**
  - CRUD 操作が正しく動作することを検証
  - 既存の DynamoDB リポジトリテストと同様のテストケースを実装
- **カスタムエラークラスのテスト**
  - WatchlistNotFoundError 等が正しくスローされることを検証

### E2E テスト

- 全既存 E2E テストがインメモリリポジトリで動作することを確認
- DynamoDB への接続が発生していないことを確認（ネットワークモニタリング）
- テスト実行時間の短縮を測定
- テスト終了時にメモリがクリアされることを確認

### 受け入れ基準

- [ ] すべての E2E テストが `.env.test` で `USE_IN_MEMORY_REPOSITORY=true` を設定した状態で成功する
- [ ] テストカバレッジが 80% 以上を維持している
- [ ] E2E テスト実行時間が改善されている（目標: 20%以上の短縮）
- [ ] DynamoDB 接続に関連するエラーが E2E テスト時に発生しない
- [ ] 本番環境（DynamoDB 使用）の動作が変更されていない
- [ ] メモリリークが発生していない

## 注意事項とリスク

### 注意事項

- **Phase 0 の結果を踏まえた実装**:
  - Alert, Holding, Ticker は既に新パターンで実装済みなので、ファクトリー経由に変更するだけ
  - Exchange と Watchlist は新パターンへの移行（インターフェース + 複数実装の作成）が必要

- **段階的な移行**:
  - API エンドポイントは一つずつ移行し、各段階でテストを実行する
  - Phase 3 の各タスク完了後に該当エンドポイントのテストを実行

- **メモリ管理**:
  - すべてのリポジトリで同一の InMemorySingleTableStore インスタンスを共有
  - E2E テスト終了時に `clearMemoryStore()` を呼び出してデータをクリア
  - グローバル teardown または各テストの `afterAll` で実装

- **インターフェースの一貫性**:
  - 既存のメソッドシグネチャを維持（特に Watchlist のオーバーロード）
  - カスタムエラークラス（WatchlistNotFoundError等）を維持
  - ページネーション方式を統一（lastKey → cursor への移行は別タスク）

- **DynamoDB クライアント**:
  - インメモリモード時は `getDynamoDBClient()` を呼び出さない
  - ファクトリー内で環境変数をチェックして分岐

- **エクスポート戦略**:
  - core パッケージから新しいインターフェース、実装をエクスポート
  - 従来のリポジトリクラスは非推奨化（Phase 6）

### リスク

1. **既存コードへの影響**
   - リスク: 30箇所以上の API エンドポイントを変更するため、リグレッションの可能性
   - 軽減策: 段階的な移行と各段階でのテスト実行
   - 軽減策: 既存のユニットテストを維持し、リグレッションを検出

2. **インメモリ実装と DynamoDB 実装の動作差異**
   - リスク: ページネーション、エラーハンドリング等の差異が発生する可能性
   - 軽減策: 両実装で共通のテストスイートを実行
   - 軽減策: インターフェース定義を厳密に行い、Mapper パターンで一貫性を保つ

3. **メモリリーク**
   - リスク: テストデータがクリアされずにメモリに残る可能性
   - 軽減策: `clearMemoryStore()` の確実な呼び出し
   - 軽減策: テスト実行前後のメモリ使用量を監視

4. **パフォーマンスの予期しない低下**
   - リスク: ファクトリーのオーバーヘッド、シングルトン管理の影響
   - 軽減策: ベンチマークを取得し、移行前後で比較
   - 軽減策: ファクトリーのオーバーヘッドを最小化（シングルトンパターン）

5. **カスタムエラークラスの互換性**
   - リスク: Watchlist のカスタムエラークラスが失われる可能性
   - 軽減策: インターフェース設計時に既存のエラークラスを維持
   - 軽減策: エラーハンドリングのテストを追加

## 参考ドキュメント

- [コーディング規約](../../docs/development/rules.md)
- [テスト戦略](../../docs/development/testing.md)
- [アーキテクチャ方針](../../docs/development/architecture.md)
- [Stock Tracker サービス設計](../../docs/services/stock-tracker/)

## 備考

### 実装の前提条件

- InMemorySingleTableStore は `@nagiyu/aws` パッケージで提供されている
- Playwright の設定（`playwright.config.ts`）は既に `.env.test` を読み込む設定になっている
- Alert, Holding, Ticker のリポジトリは既に新パターン（インターフェース + 複数実装）に移行済み
- API エンドポイントは現在すべて直接インスタンス化しており、ファクトリーパターンは未使用

### 追加の考慮事項

- **ページネーション方式の統一**: 現在、従来のリポジトリは `lastKey` を使用し、新しいリポジトリは `cursor` (base64エンコード済み) を使用している。この差異は本タスクでは修正せず、別タスクで対応する。
- **環境変数の管理**: `USE_IN_MEMORY_REPOSITORY` の値は文字列 `'true'` であることに注意（boolean ではない）。
- **テストの並列実行**: E2E テストが並列実行される場合、InMemorySingleTableStore の共有による競合に注意。必要に応じてテスト間の分離を実装する。
