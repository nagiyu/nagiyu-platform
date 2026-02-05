# データアクセス層アーキテクチャ

## 目的

本ドキュメントは、DynamoDB を使用するサービスにおけるデータアクセス層の設計思想と実装パターンを定義する。

## 設計思想

### なぜ抽象化が必要なのか

従来の実装では、テスト（特にE2E）で実際のDynamoDBを使用していたため、以下の課題があった：

- **外部依存**: テスト結果が実データの状態に影響される
- **環境依存**: ローカル環境での完全なテストが困難
- **実行速度**: 外部アクセスによるテスト実行の遅延
- **独立性の欠如**: 複数テストの同時実行時の干渉

これらを解決するため、データアクセスを抽象化し、テスト環境ではインメモリ実装を使用する方式を採用した。

### 抽象化レベルの選択

DynamoDBの抽象化には複数のアプローチが考えられる：

1. **低レベル抽象化**: DynamoDB APIを直接ラップ（GetItem, PutItem等）
2. **高レベル抽象化**: 完全にDynamoDB非依存の汎用データアクセスAPI
3. **ハイブリッド**: ビジネスに近いメソッド名 + DynamoDBの強みを活かす設計

本プラットフォームでは**ハイブリッドアプローチ**を採用：

- **基本CRUD**: ビジネスキーで操作（`getById(userId, tickerId)`）
- **クエリ操作**: 意味のあるメソッド名（`getByUserId(userId, options)`）
- **ページネーション**: 実装の詳細を隠蔽した不透明トークン

**選択理由**:
- よく使う操作はシンプルに記述できる
- 複雑なクエリは意味を明確にする
- DynamoDBの特性（GSI、ページネーション等）を活かせる
- 将来的な他DBへの移行も視野に入れつつ、現実的な実装

### Single Table Design への対応

DynamoDBのSingle Table Designパターンを採用する場合、複数のエンティティタイプが1つのテーブルに混在する。このパターンに対応するため、以下の設計を採用：

- **InMemorySingleTableStore**: 全リポジトリで共有する共通ストア
- **PK/SK管理**: Mapperが一元的に管理
- **Type属性**: エンティティタイプを自動付与

これにより、実際のDynamoDBと同じアクセスパターンをテスト環境で再現できる。

## アーキテクチャ構成

### レイヤー構造

```
[ビジネスロジック層]
        ↓
[Repository Interface] ← ビジネスに近い抽象化
        ↓
   ┌────┴────┐
   ↓         ↓
[DynamoDB   [InMemory
 Repository] Repository]
   ↓         ↓
[Mapper]    [Mapper]      ← Entity ↔ DynamoDBItem 変換
   ↓         ↓
[DynamoDB   [InMemory
 Item]       Item]
   ↓         ↓
[DocumentClient] [SingleTableStore]
```

### 各コンポーネントの責務

#### Entity（エンティティ）

**目的**: ビジネスロジックで扱う純粋なドメインオブジェクト

**設計方針**:
- PK/SK等のDynamoDB固有の属性を持たない
- ビジネス的に意味のある属性のみを持つ
- 将来的に別のデータストアに移行してもEntityは変わらない

**なぜPK/SKを含めないのか**:
- ビジネスロジックはストレージの実装詳細に依存すべきでない
- テストコードがDynamoDBの知識を必要としない
- 他のデータストア（RDS等）への移行が容易

```typescript
// ✅ 良い例：ビジネスオブジェクト
interface HoldingEntity {
  UserID: string;
  TickerID: string;
  Quantity: number;
  AveragePrice: number;
  CreatedAt: number;
  UpdatedAt: number;
}

// ❌ 悪い例：DynamoDBの実装詳細が漏れている
interface HoldingEntity {
  PK: string;           // DynamoDB固有
  SK: string;           // DynamoDB固有
  UserID: string;
  TickerID: string;
  Quantity: number;
}
```

#### Mapper（マッパー）

**目的**: Entity と DynamoDBItem の相互変換を担当

**設計方針**:
- PK/SK の構築ロジックを一元管理
- Type属性を自動付与（Entity には含めない）
- DynamoDB実装とInMemory実装で同じMapperを使用

**なぜMapperを独立させるのか**:
- PK/SK構築ロジックの重複を防ぐ
- バリデーションロジックを集約できる
- テストで変換ロジックを独立して検証できる

```typescript
class HoldingMapper implements EntityMapper<HoldingEntity, HoldingKey> {
  toItem(entity: HoldingEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      tickerId: entity.TickerID,
    });
    
    return {
      PK: pk,
      SK: sk,
      Type: 'Holding',        // Mapperが自動付与
      UserID: entity.UserID,
      TickerID: entity.TickerID,
      Quantity: entity.Quantity,
      // ...
    };
  }
  
  buildKeys(key: HoldingKey): { pk: string; sk: string } {
    return {
      pk: `USER#${key.userId}`,
      sk: `HOLDING#${key.tickerId}`,
    };
  }
}
```

#### Repository Interface

**目的**: データアクセスの抽象インターフェース

**設計方針**:
- ビジネスキーでCRUD操作を定義
- クエリは意味のあるメソッド名を使用
- DynamoDBの実装詳細（PK/SK）を含めない

**メソッド命名規則**:
- 基本取得: `getById()`、`getByXxx()`
- 一覧取得: `getByXxx()` + PaginationOptions
- 作成: `create()`
- 更新: `update()`
- 削除: `delete()`

```typescript
interface HoldingRepository {
  // ビジネスキーでアクセス（PK/SKは使わない）
  getById(userId: string, tickerId: string): Promise<HoldingEntity | null>;
  
  // 意味のあるメソッド名
  getByUserId(userId: string, options?: PaginationOptions): Promise<PaginatedResult<HoldingEntity>>;
  
  create(input: CreateHoldingInput): Promise<HoldingEntity>;
  update(userId: string, tickerId: string, updates: UpdateHoldingInput): Promise<HoldingEntity>;
  delete(userId: string, tickerId: string): Promise<void>;
}
```

#### InMemorySingleTableStore

**目的**: DynamoDBのSingle Table Designをインメモリで再現

**設計方針**:
- 全リポジトリで共有する共通ストア
- PK/SKでデータを管理
- クエリ操作は全件スキャン+フィルタで実装（テストデータは少量）

**なぜ共通ストアなのか**:
- 実際のDynamoDBは1テーブルに複数エンティティが混在
- リポジトリ間のデータ整合性を保てる
- GSIのシミュレーションが可能

#### Repository実装（DynamoDB / InMemory）

**目的**: Repository Interfaceの具体的な実装

**設計方針**:
- 同じインターフェースを実装
- 同じMapperを使用
- 同じエラーを投げる（テストの一貫性）

**なぜ同じエラーを投げるのか**:
- テストで本番と同じエラーハンドリングを検証できる
- InMemoryでもConditionalCheckFailedException相当のエラーが発生

```typescript
// DynamoDB実装
class DynamoDBHoldingRepository implements HoldingRepository {
  async create(input: CreateHoldingInput): Promise<HoldingEntity> {
    const item = this.mapper.toItem(entity);
    try {
      await this.docClient.send(new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      }));
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new EntityAlreadyExistsError('Holding', `${userId}#${tickerId}`);
      }
      throw error;
    }
  }
}

// InMemory実装
class InMemoryHoldingRepository implements HoldingRepository {
  async create(input: CreateHoldingInput): Promise<HoldingEntity> {
    const item = this.mapper.toItem(entity);
    // 同じエラーを投げる
    this.store.put(item, { attributeNotExists: true });
  }
}
```

## 技術的決定事項

本アーキテクチャにおける重要な技術的決定と、その理由を記録する。

### 1. エンティティからPK/SKを除外

**決定**: EntityはPK/SKを持たない

**理由**:
- ストレージ実装の詳細からビジネスロジックを分離
- 将来的なデータストア変更への柔軟性
- テストコードのシンプル化

**トレードオフ**: Mapper層が必要になる

### 2. Mapperパターンの採用

**決定**: Entity ↔ DynamoDBItem の変換を専用クラスで実施

**理由**:
- PK/SK構築ロジックの一元化
- DynamoDB実装とInMemory実装でコード共有
- 変換ロジックの独立したテストが可能

**トレードオフ**: コンポーネント数が増える

### 3. Type属性の自動付与

**決定**: Type属性はMapperが自動付与（Entityには含めない）

**理由**:
- TypeはDynamoDBの実装詳細（Single Table用）
- ビジネスロジックでTypeを意識する必要がない
- Entity定義がシンプルになる

**トレードオフ**: Mapperの実装が必須

### 4. 共通SingleTableStoreの採用

**決定**: 各リポジトリは独立したストアではなく、共通のInMemorySingleTableStoreを共有

**理由**:
- 実際のDynamoDBは1テーブルに複数エンティティが混在
- リポジトリ間のデータ整合性を保証
- GSIのシミュレーションが可能

**トレードオフ**: ストアの初期化を共通化する必要がある

### 5. ページネーションの不透明トークン

**決定**: ページネーションのカーソルはJSON文字列をBase64エンコードした不透明トークン

**理由**:
- 実装の詳細（LastEvaluatedKey形式）を完全に隠蔽
- DynamoDBとInMemoryで異なるlastKey形式を使える
- クライアントがトークンの内部構造を知る必要がない

**トレードオフ**: トークンのサイズが若干大きくなる

### 6. GSIのシミュレーション方法

**決定**: InMemory実装では全件スキャン+フィルタでGSIを再現

**理由**:
- テストデータは少量なのでパフォーマンスは問題ない
- 実装がシンプル
- DynamoDBの動作を正確に再現できる

**トレードオフ**: 本番とパフォーマンス特性が異なる（テストでは問題ない）

### 7. DIの実装方針

**決定**: 手動DIからスタート（将来的にFactoryパターンやNestJS DI導入も検討）

**理由**:
- シンプルに始められる
- テストでの切り替えが明示的
- 必要に応じて段階的に高度なDIに移行可能

**トレードオフ**: テストコードで明示的にリポジトリを初期化する必要がある

## 設計の利点

### テスト容易性

- 実DynamoDBなしでE2Eテストが実行可能
- テストデータが外部環境に影響されない
- 複数リポジトリが同じストアを共有してテスト可能

### 保守性

- PK/SK構築ロジックが一箇所に集約
- エンティティ定義がビジネスロジックに集中
- 変換ロジックが独立してテスト可能

### 拡張性

- 新しいエンティティの追加が容易
- 他のデータストアへの移行が視野に入れられる
- GSIの追加がMapperの変更のみで対応可能

### 一貫性

- 全エンティティが同じパターンに従う
- エラーハンドリングが統一される
- テスト戦略が共通化される

## 非推奨パターン

本アーキテクチャでは、以下のパターンは推奨しない：

### EntityにPK/SKを含める

```typescript
// ❌ 非推奨
interface HoldingEntity {
  PK: string;
  SK: string;
  UserID: string;
  TickerID: string;
}
```

**理由**: ストレージ実装の詳細がビジネスロジックに漏れる

### 低レベルなメソッド名

```typescript
// ❌ 非推奨
interface HoldingRepository {
  get(pk: string, sk: string): Promise<HoldingEntity | null>;
  query(gsi1pk: string, gsi1sk?: string): Promise<HoldingEntity[]>;
}
```

**理由**: DynamoDBの実装詳細が抽象化されていない

### Mapperを使わない直接変換

```typescript
// ❌ 非推奨
class DynamoDBHoldingRepository {
  async getById(userId: string, tickerId: string) {
    const result = await this.docClient.send(new GetCommand({
      Key: {
        PK: `USER#${userId}`,        // PK構築ロジックが分散
        SK: `HOLDING#${tickerId}`,   // PK構築ロジックが分散
      }
    }));
    
    return {
      UserID: result.Item.UserID,
      TickerID: result.Item.TickerID,
      // ... 変換ロジックが分散
    };
  }
}
```

**理由**: PK/SK構築と変換ロジックが分散し、保守性が低下

### 独立したインメモリストア

```typescript
// ❌ 非推奨
class InMemoryHoldingRepository {
  private store = new Map<string, HoldingEntity>();  // 独立したストア
}

class InMemoryTickerRepository {
  private store = new Map<string, TickerEntity>();   // 独立したストア
}
```

**理由**: Single Table Designが再現できず、リポジトリ間の整合性が保証されない

## 実装ガイドライン

### 新規エンティティの実装順序

新しいエンティティを実装する際は、以下の順序で進めることを推奨：

1. **Entity定義**: PK/SKを含まない純粋なビジネスオブジェクト
2. **Mapper実装**: `EntityMapper<TEntity, TKey>` インターフェースを実装し、PK/SK構築ロジックを一元化
3. **Repository Interface**: ビジネスキーでCRUD操作を定義
4. **DynamoDB実装**: 実際のDynamoDBを使用した実装
5. **InMemory実装**: テスト用実装（DynamoDB実装と同じエラーを投げる）
6. **テスト**: Mapper、Repository、E2Eの各層でテスト

### 実装の基本原則

**Entity設計**:
- PK/SK等のストレージ固有属性を含めない
- ビジネス的に意味のある属性のみを持つ
- CreatedAt/UpdatedAtを含める

**Mapper実装**:
- PK/SK構築ロジックを`buildKeys()`に集約
- Type属性を自動付与（Entityには含めない）
- バリデーション関数（`validateStringField`等）を使用

**Repository設計**:
- ビジネスキーでアクセス（PK/SKを使わない）
- 意味のあるメソッド名（`getByUserId`等）
- DynamoDB実装とInMemory実装で同じエラーを投げる

### 既存サービスへの適用

既存サービスへのマイグレーションは**必須ではない**：

- 新規開発では本パターンを採用
- 既存サービスは動作している限り変更不要
- テスト独立性や保守性向上が必要な場合に段階的に移行

移行する場合は、既存実装を残したまま新パターンを併存させ、テストから段階的に切り替えることでリスクを最小化できる。

## 参考資料

### 関連ドキュメント

- [アーキテクチャ方針](./architecture.md) - Repository パターンの基本
- [テスト戦略](./testing.md) - テスト方針とカバレッジ要件
- [共通ライブラリ設計](./shared-libraries.md) - @nagiyu/aws ライブラリの詳細

### 実装例

実際の実装は、本プラットフォームの Stock-Tracker サービスに含まれている。Entity、Mapper、Repository Interface、DynamoDB実装、InMemory実装の全てが実装済みであり、参考にできる。

### 共通ライブラリ

基盤コンポーネントは `@nagiyu/aws` ライブラリに含まれる：

- `EntityMapper<TEntity, TKey>` - Mapperインターフェース
- `InMemorySingleTableStore` - インメモリストア
- `PaginationOptions`、`PaginatedResult` - ページネーション型
- エラークラス（`EntityNotFoundError`、`EntityAlreadyExistsError` 等）

## まとめ

本データアクセス層アーキテクチャは、以下の原則に基づいて設計されている：

1. **ビジネスロジックの独立性**: ストレージ実装の詳細から分離
2. **テスト容易性**: 実DynamoDBなしで完全なテストが可能
3. **保守性**: ロジックの一元化と責務の明確化
4. **拡張性**: 新エンティティ追加や他DBへの移行を視野
5. **一貫性**: 全エンティティで統一されたパターン

これらの原則に従うことで、高品質で保守しやすいデータアクセス層を実現できる。
