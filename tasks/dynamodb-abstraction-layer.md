# DynamoDB 抽象化レイヤーの実装

## 概要

DynamoDB を使用する各サービスにおいて、テスト（特に E2E）で実 DynamoDB を使う構成になっているため、実データに影響されたテストになってしまうという課題がある。

この問題を解決するため、データ管理を抽象化したインターフェース層を導入し、テスト時はインメモリでデータ管理を完結させる方式を実装する。

## 目的

1. **テストの独立性確保**: 実 DynamoDB に依存せず、テスト環境ではインメモリ実装を使用
2. **再現性の向上**: テストデータが外部環境に影響されない
3. **DI による実装切り替え**: Jest / E2E テストで実装を簡単に切り替え可能
4. **適切な抽象化**: DynamoDB の API を直接モックするのではなく、ビジネスロジックに近いレベルで抽象化
5. **新規開発への適用**: 既存サービスの置き換えはマストではなく、今後の新規開発で活用できることを優先

## 現状分析

調査の結果、以下の状況が判明：

### DynamoDB 使用サービス
- **Auth**: ユーザー管理（直接実装、GSI 1つ）
- **Stock-Tracker**: 保有株式・ティッカー・アラート管理（抽象基底クラス使用、GSI 3つ）
- **Codec-Converter**: ジョブ状態更新（軽量な直接実装）

### 既存の実装パターン
- Stock-Tracker は `AbstractDynamoDBRepository` という抽象基底クラスを使用（[libs/aws/src/dynamodb/abstract-repository.ts](../libs/aws/src/dynamodb/abstract-repository.ts)）
- Auth は直接実装
- DI フレームワークは未使用（手動 DI またはシングルトン）

### テストの現状
- ユニットテスト: `jest.mock()` で DynamoDB クライアントをモック
- インテグレーションテスト: `aws-sdk-client-mock` を使用
- **E2E テストは実 DynamoDB を使用**（課題）

## 設計方針

以下の設計方針で実装を進める。

### 1. アーキテクチャ

```
[ビジネスロジック]
       ↓
[Repository Interface] ← ここで抽象化
       ↓
 ┌─────┴─────┐
 ↓           ↓
[DynamoDB   [InMemory
 実装]       実装]
       ↓           ↓
[Mapper]     [Mapper]
       ↓           ↓
[DynamoDBItem] [DynamoDBItem]
       ↓           ↓
[DocumentClient] [SingleTableStore]
```

### 2. 主要コンポーネント

#### Repository Interface
- 基本 CRUD 操作をビジネスキーで定義
- クエリ操作は意味のあるメソッド名で定義
- 例: `getById(userId, tickerId)`, `getByUserId(userId, options)`

#### Entity（ビジネスオブジェクト）
- PK/SK を持たない純粋なビジネスオブジェクト
- DynamoDB の実装詳細に依存しない
- 将来的に別の DB に移行しても Entity は変わらない

```typescript
interface Holding {
  UserID: string;
  TickerID: string;
  Quantity: number;
  AverageCost: number;
  CreatedAt: number;
  UpdatedAt: number;
}
```

#### Mapper
- Entity ↔ DynamoDB Item の変換を担当
- PK/SK の構築ロジックを持つ
- DynamoDB 実装とインメモリ実装で同じ Mapper を共有

```typescript
interface EntityMapper<TEntity, TKey> {
  toItem(entity: TEntity): DynamoDBItem;
  toEntity(item: DynamoDBItem): TEntity;
  buildKeys(key: TKey): { pk: string; sk: string };
}
```

#### InMemorySingleTableStore
- Single Table Design を再現する共通ストア
- PK/SK でデータを管理
- クエリ操作は全件スキャン + フィルタで実装（テストデータは少量なので問題ない）

#### Repository 実装
- `DynamoDBRepository`: 本番環境用（DynamoDB を使用）
- `InMemoryRepository`: テスト環境用（InMemorySingleTableStore を使用）
- 同じ Repository Interface を実装
- 同じ Mapper を使用

### 3. 技術的決定事項

| 項目 | 決定内容 | 理由 |
|------|----------|------|
| 抽象化レベル | Option 3（ハイブリッド）: 基本 CRUD はビジネスキー、クエリは意味のあるメソッド名 | よく使う操作はシンプルに、複雑なクエリは意味のあるメソッド名で表現 |
| Entity 設計 | PK/SK を持たない | ビジネスロジックに集中、将来的な柔軟性が高い |
| Mapper | 採用 | Entity とストレージの境界が明確、DynamoDB 実装とインメモリ実装でコード共有可能 |
| Type フィールド | Mapper が自動付与 | Type は DynamoDB の実装詳細なので Entity に含めない |
| Single Table | 共通ストアを使用 | 各リポジトリが独立したストアではなく、共通の InMemorySingleTableStore を共有 |
| GSI シミュレーション | 全件スキャン + フィルタ | テストデータは少量なのでパフォーマンスは気にしない、実装がシンプル |
| ページネーション | JSON 文字列の不透明トークン | 実装の詳細を完全に隠蔽、DynamoDB と InMemory で異なる lastKey 形式を使える |
| 条件付き操作 | DynamoDB と InMemory で同じエラーを投げる | テストで本番と同じエラーハンドリングを検証できる |
| DI | 手動 DI からスタート | シンプルに始めて、必要に応じて Factory パターンや NestJS DI に移行 |

### 4. ディレクトリ構成

```
libs/
  data-access/          # 新規作成
    src/
      interfaces/       # Repository インターフェース
        repository.interface.ts
        pagination.interface.ts
      mapper/           # Mapper 関連
        entity-mapper.interface.ts
        dynamodb-item.interface.ts
      dynamodb/         # DynamoDB 実装
        repository.ts
      in-memory/        # InMemory 実装
        single-table-store.ts
        repository.ts
      errors/           # エラークラス
        repository-errors.ts
      index.ts          # エクスポート

services/
  {service-name}/
    core/
      src/
        entities/       # Entity 定義
          holding.entity.ts
        mappers/        # Mapper 実装
          holding.mapper.ts
        repositories/   # Repository 実装
          holding.repository.interface.ts
          dynamodb-holding.repository.ts
          in-memory-holding.repository.ts
```

## 実装計画

実装は以下のフェーズに分けて進める。各フェーズは独立した Sub Issue として切り出す。

### Phase 1: 基盤の実装（共通ライブラリ）

**目的**: 各サービスで共通利用する基盤コンポーネントを `libs/data-access` に実装する

**タスク**:
1. ディレクトリ構造の作成
2. インターフェース定義
   - `RepositoryConfig` インターフェース
   - `PaginationOptions` と `PaginatedResult` インターフェース
   - `EntityMapper` インターフェース
   - `DynamoDBItem` インターフェース
3. エラークラスの実装
   - `EntityNotFoundError`
   - `EntityAlreadyExistsError`
   - `InvalidEntityDataError`
   - `DatabaseError`
4. InMemorySingleTableStore の実装
   - 基本操作（get, put, delete）
   - クエリ操作（query, queryByAttribute, scan）
   - ページネーション対応

**成果物**:
- `libs/data-access/src/interfaces/`
- `libs/data-access/src/mapper/`
- `libs/data-access/src/errors/`
- `libs/data-access/src/in-memory/single-table-store.ts`

**受け入れ基準**:
- [ ] 全インターフェースが型定義されている
- [ ] InMemorySingleTableStore が基本操作を提供している
- [ ] エラークラスが定義されている
- [ ] ユニットテストが作成されている

---

### Phase 2: サンプル実装（Holding リポジトリ）

**目的**: Stock-Tracker の Holding エンティティを例に、具体的な実装パターンを確立する

**タスク**:
1. Holding Entity の定義
   - PK/SK を持たない純粋なビジネスオブジェクト
2. HoldingMapper の実装
   - `toItem()`: Entity → DynamoDBItem
   - `toEntity()`: DynamoDBItem → Entity
   - `buildKeys()`: ビジネスキー → PK/SK
3. HoldingRepository インターフェースの定義
   - 基本 CRUD メソッド
   - クエリメソッド（`getByUserId`）
4. DynamoDBHoldingRepository の実装
   - GetCommand, PutCommand, UpdateCommand, DeleteCommand の使用
   - 条件付き操作（ConditionalExpression）
   - GSI を使ったクエリ
   - ページネーション対応
5. InMemoryHoldingRepository の実装
   - InMemorySingleTableStore を使用
   - DynamoDB 実装と同じエラーを投げる
   - ページネーション対応

**成果物**:
- `services/stock-tracker/core/src/entities/holding.entity.ts`
- `services/stock-tracker/core/src/mappers/holding.mapper.ts`
- `services/stock-tracker/core/src/repositories/holding.repository.interface.ts`
- `services/stock-tracker/core/src/repositories/dynamodb-holding.repository.ts`
- `services/stock-tracker/core/src/repositories/in-memory-holding.repository.ts`

**受け入れ基準**:
- [ ] Holding Entity が PK/SK を持たない
- [ ] HoldingMapper が Entity ↔ DynamoDBItem の変換を行う
- [ ] DynamoDB 実装と InMemory 実装が同じインターフェースを実装している
- [ ] 条件付き操作が両実装で同じエラーを投げる
- [ ] ページネーションが両実装で動作する
- [ ] ユニットテストが作成されている

---

### Phase 3: テスト戦略の確立

**目的**: DI を使ってテスト環境で InMemory 実装を使用できることを検証する

**タスク**:
1. 手動 DI パターンの実装例
   - テストでの InMemory リポジトリの使用
   - 本番での DynamoDB リポジトリの使用
2. E2E テストの作成
   - InMemory 実装を使った E2E テスト
   - 複数リポジトリが同じ InMemorySingleTableStore を共有するテスト
3. ユニットテストとインテグレーションテストの作成
   - Mapper のテスト
   - Repository のテスト（モック不要）
4. テストガイドラインの作成
   - テスト環境での DI の使い方
   - InMemorySingleTableStore の初期化方法

**成果物**:
- `services/stock-tracker/core/tests/e2e/holding.repository.e2e.test.ts`
- `services/stock-tracker/core/tests/unit/mappers/holding.mapper.test.ts`
- `services/stock-tracker/core/tests/unit/repositories/holding.repository.test.ts`
- `docs/development/testing-with-in-memory-repositories.md`（テストガイドライン）

**受け入れ基準**:
- [ ] E2E テストで実 DynamoDB を使わずにテストできている
- [ ] 複数リポジトリが同じストアを共有できることが検証されている
- [ ] テストガイドラインが作成されている
- [ ] 全テストがパスしている

---

### Phase 4: 他のエンティティへの展開

**目的**: Holding 以外のエンティティ（Ticker, Alert など）にも同じパターンを適用する

**タスク**:
1. Ticker リポジトリの実装
   - TickerMapper
   - DynamoDBTickerRepository
   - InMemoryTickerRepository
2. Alert リポジトリの実装
   - AlertMapper
   - DynamoDBAlertRepository
   - InMemoryAlertRepository
3. 各リポジトリのテスト作成

**成果物**:
- Ticker, Alert の各実装ファイル
- 各リポジトリのテスト

**受け入れ基準**:
- [ ] Ticker, Alert リポジトリが実装されている
- [ ] 全リポジトリが同じパターンに従っている
- [ ] 全テストがパスしている

---

### Phase 5: ドキュメント化と導入ガイド

**目的**: 他の開発者が同じパターンを適用できるようにドキュメントを整備する

**タスク**:
1. アーキテクチャドキュメントの作成
   - 設計方針の説明
   - コンポーネント図
   - 実装パターンの解説
2. 実装ガイドの作成
   - 新しいエンティティの追加方法
   - Mapper の実装方法
   - Repository の実装方法
3. マイグレーションガイドの作成
   - 既存サービスへの適用方法
   - 段階的な移行戦略

**成果物**:
- `docs/development/data-access-layer.md`（アーキテクチャドキュメント）
- `docs/development/implementing-repositories.md`（実装ガイド）
- `docs/development/migrating-to-new-repository-pattern.md`（マイグレーションガイド）

**受け入れ基準**:
- [ ] ドキュメントが作成されている
- [ ] 他の開発者が読んで実装できる内容になっている
- [ ] コード例が含まれている

---

### Phase 6: 既存サービスへの適用（オプション）

**目的**: 必要に応じて既存サービスに適用する

**Note**: このフェーズは必須ではなく、必要に応じてカスタマイズしながら変更していく。

**タスク**:
1. Auth サービスへの適用検討
2. Codec-Converter サービスへの適用検討

**成果物**:
- 各サービスの実装ファイル

**受け入れ基準**:
- [ ] 既存テストが引き続きパスしている
- [ ] E2E テストが InMemory 実装を使用している

---

## Sub Issue の作成

各フェーズを Sub Issue として作成する際のテンプレート：

### Issue タイトル
```
[DynamoDB Abstraction] Phase X: {フェーズ名}
```

### Issue 本文
```markdown
## 概要
{フェーズの目的}

## 関連ドキュメント
- 親タスク: tasks/dynamodb-abstraction-layer.md
- {その他の関連ドキュメント}

## タスク
- [ ] {タスク1}
- [ ] {タスク2}
- [ ] ...

## 受け入れ基準
- [ ] {基準1}
- [ ] {基準2}
- [ ] ...

## 成果物
- {ファイルパス1}
- {ファイルパス2}
- ...
```

## 技術参考資料

### 既存の実装
- [libs/aws/src/dynamodb/abstract-repository.ts](../libs/aws/src/dynamodb/abstract-repository.ts) - 既存の抽象基底クラス
- [services/stock-tracker/core/src/repositories/holding.ts](../services/stock-tracker/core/src/repositories/holding.ts) - 既存の Holding リポジトリ
- [services/stock-tracker/web/lib/dynamodb.ts](../services/stock-tracker/web/lib/dynamodb.ts) - DynamoDB クライアント初期化

### 設計パターン
- Repository パターン
- Mapper パターン
- Dependency Injection

### DynamoDB 関連
- Single Table Design
- GSI（Global Secondary Index）
- 条件付き操作（ConditionalExpression）
- ページネーション（LastEvaluatedKey）

## 注意事項

1. **既存サービスへの影響を最小化**
   - 既存の実装を壊さない
   - 新規開発で優先的に使用
   - 既存サービスへの適用は任意

2. **抽象化のバランス**
   - DynamoDB に引っ張られすぎない
   - ビジネスロジックに近いレベルで抽象化
   - 将来的な DB 移行を考慮

3. **テストの独立性**
   - E2E テストで実 DynamoDB を使わない
   - テストデータが外部環境に影響されない
   - 複数リポジトリが同じストアを共有できる

4. **段階的な実装**
   - まずサンプル実装で パターンを確立
   - テスト戦略を検証
   - その後、他のエンティティに展開

## 参考リンク

- [調査レポート（エージェント実行結果）](../docs/development/dynamodb-investigation.md) ※作成予定
- [既存の AbstractDynamoDBRepository](../libs/aws/src/dynamodb/abstract-repository.ts)
- [Stock-Tracker DynamoDB スタック](../infra/stock-tracker/lib/dynamodb-stack.ts)

## 更新履歴

| 日付 | 内容 | 担当者 |
|------|------|--------|
| 2026-01-26 | 初版作成 | Claude Code |
