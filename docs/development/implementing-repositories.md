# Repository実装ガイド

## 目的

本ドキュメントは、新しいエンティティに対してRepository パターンを実装する際の手順とベストプラクティスを提供する。

## 前提知識

本ガイドを読む前に、以下のドキュメントを理解していることを推奨：

- [データアクセス層アーキテクチャ](./data-access-layer.md) - 設計思想と全体構造
- [アーキテクチャ方針](./architecture.md) - Repository パターンの基本

## 実装の流れ

新しいエンティティのRepositoryを実装する際は、以下の順序で進める：

```
1. Entity 定義
   ↓
2. Mapper 実装
   ↓
3. Repository Interface 定義
   ↓
4. DynamoDB Repository 実装
   ↓
5. InMemory Repository 実装
   ↓
6. テスト実装
```

## 1. Entity 定義

### 設計指針

Entity（エンティティ）は、ビジネスロジックで扱う純粋なドメインオブジェクト。

**MUST**:
- PK/SK等のストレージ固有属性を含めない
- ビジネス的に意味のある属性のみを持つ
- 全フィールドに型を定義する

**ファイル配置**: `services/{service}/core/src/entities/{entity-name}.entity.ts`

### 実装パターン

```typescript
/**
 * {エンティティ名}エンティティ
 */
export interface {EntityName}Entity {
  /** ビジネスキー1（例: ユーザーID） */
  UserID: string;
  
  /** ビジネスキー2（例: ティッカーID） */
  TickerID: string;
  
  /** ビジネス属性 */
  Quantity: number;
  AveragePrice: number;
  Currency: string;
  
  /** タイムスタンプ（必須） */
  CreatedAt: number;
  UpdatedAt: number;
}

/**
 * 作成時の入力データ（タイムスタンプを除く）
 */
export type Create{EntityName}Input = Omit<{EntityName}Entity, 'CreatedAt' | 'UpdatedAt'>;

/**
 * 更新時の入力データ（更新可能なフィールドのみ）
 */
export type Update{EntityName}Input = Partial<
  Pick<{EntityName}Entity, 'Quantity' | 'AveragePrice' | 'Currency'>
>;

/**
 * ビジネスキー定義
 */
export interface {EntityName}Key {
  userId: string;
  tickerId: string;
}
```

### チェックリスト

- [ ] PK/SKを含んでいない
- [ ] 全フィールドに型が定義されている
- [ ] CreatedAt/UpdatedAtが含まれている
- [ ] Create用の型が定義されている
- [ ] Update用の型が定義されている
- [ ] ビジネスキー型が定義されている
- [ ] JSDocコメントが記述されている

## 2. Mapper 実装

### 設計指針

Mapperは、Entity と DynamoDBItem の相互変換を担当する。

**MUST**:
- `EntityMapper<TEntity, TKey>` インターフェースを実装
- PK/SK構築ロジックを一元化
- Type属性を自動付与

**ファイル配置**: `services/{service}/core/src/mappers/{entity-name}.mapper.ts`

### 実装パターン

```typescript
import type { DynamoDBItem, EntityMapper } from '@nagiyu/aws';
import { validateStringField, validateNumberField, validateTimestampField } from '@nagiyu/aws';
import type { {EntityName}Entity, {EntityName}Key } from '../entities/{entity-name}.entity.js';

/**
 * {EntityName} Mapper
 *
 * {EntityName}Entity と DynamoDB Item 間の変換を行う
 */
export class {EntityName}Mapper implements EntityMapper<{EntityName}Entity, {EntityName}Key> {
  private readonly entityType = '{EntityName}';

  /**
   * Entity を DynamoDB Item に変換
   */
  toItem(entity: {EntityName}Entity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      tickerId: entity.TickerID,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      // GSI設定（必要に応じて）
      GSI1PK: entity.UserID,
      GSI1SK: `${this.entityType}#${entity.TickerID}`,
      // ビジネス属性
      UserID: entity.UserID,
      TickerID: entity.TickerID,
      Quantity: entity.Quantity,
      AveragePrice: entity.AveragePrice,
      Currency: entity.Currency,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   */
  toEntity(item: DynamoDBItem): {EntityName}Entity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      TickerID: validateStringField(item.TickerID, 'TickerID'),
      Quantity: validateNumberField(item.Quantity, 'Quantity'),
      AveragePrice: validateNumberField(item.AveragePrice, 'AveragePrice'),
      Currency: validateStringField(item.Currency, 'Currency'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  /**
   * ビジネスキーから PK/SK を構築
   */
  buildKeys(key: {EntityName}Key): { pk: string; sk: string } {
    return {
      pk: `USER#${key.userId}`,
      sk: `{ENTITY_PREFIX}#${key.tickerId}`,
    };
  }
}
```

### PK/SK命名規則

**推奨パターン**:
- PK: `{エンティティタイプ}#{ID}` または `USER#{ユーザーID}`
- SK: `{エンティティタイプ}#{ID}` または `{エンティティタイプ}#{サブID}`

**理由**:
- エンティティタイプが明確
- Single Table Design で複数エンティティを識別可能
- ソート順序が予測可能

### GSI設計の考慮事項

GSIが必要な場合、以下を考慮：

- **GSI1**: ユーザーごとのエンティティ一覧取得
  - GSI1PK: `UserID`
  - GSI1SK: `{EntityType}#{SubID}`

- **GSI2**: 属性別の検索（必要に応じて）
  - GSI2PK: `{AttributeName}#{Value}`
  - GSI2SK: `{EntityType}#{ID}`

### チェックリスト

- [ ] EntityMapperインターフェースを実装
- [ ] toItem()でPK/SKを構築
- [ ] toItem()でType属性を付与
- [ ] toEntity()でバリデーション関数を使用
- [ ] buildKeys()でPK/SK構築ロジックを定義
- [ ] GSI属性が必要に応じて含まれている
- [ ] JSDocコメントが記述されている

## 3. Repository Interface 定義

### 設計指針

Repository Interfaceは、データアクセスの抽象インターフェース。

**MUST**:
- ビジネスキーでCRUD操作を定義
- PK/SKを含めない
- メソッド名をビジネス的に意味のある名前にする

**ファイル配置**: `services/{service}/core/src/repositories/{entity-name}.repository.interface.ts`

### 実装パターン

```typescript
import type {
  {EntityName}Entity,
  Create{EntityName}Input,
  Update{EntityName}Input,
} from '../entities/{entity-name}.entity.js';
import type { PaginationOptions, PaginatedResult } from '@nagiyu/aws';

/**
 * {EntityName} Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface {EntityName}Repository {
  /**
   * IDで単一エンティティを取得
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @returns エンティティ（存在しない場合はnull）
   */
  getById(userId: string, tickerId: string): Promise<{EntityName}Entity | null>;

  /**
   * ユーザーのエンティティ一覧を取得
   *
   * @param userId - ユーザーID
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  getByUserId(userId: string, options?: PaginationOptions): Promise<PaginatedResult<{EntityName}Entity>>;

  /**
   * 新しいエンティティを作成
   *
   * @param input - エンティティデータ
   * @returns 作成されたエンティティ（CreatedAt, UpdatedAtを含む）
   * @throws {EntityAlreadyExistsError} 既に同じキーのエンティティが存在する場合
   */
  create(input: Create{EntityName}Input): Promise<{EntityName}Entity>;

  /**
   * エンティティを更新
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @param updates - 更新するフィールド
   * @returns 更新されたエンティティ
   * @throws {EntityNotFoundError} エンティティが存在しない場合
   */
  update(userId: string, tickerId: string, updates: Update{EntityName}Input): Promise<{EntityName}Entity>;

  /**
   * エンティティを削除
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @throws {EntityNotFoundError} エンティティが存在しない場合
   */
  delete(userId: string, tickerId: string): Promise<void>;
}
```

### メソッド設計の指針

**基本CRUD**:
- `getById()`: 単一エンティティ取得（存在しない場合はnull）
- `create()`: 新規作成（重複時はEntityAlreadyExistsError）
- `update()`: 更新（存在しない場合はEntityNotFoundError）
- `delete()`: 削除（存在しない場合はEntityNotFoundError）

**一覧取得**:
- `getByXxx()`: 特定条件での一覧取得
- PaginationOptionsを受け取る
- PaginatedResultを返す

**追加メソッド例**:
- `getByUserIdAndStatus()`: 複合条件での取得
- `countByUserId()`: 件数取得
- `existsByXxx()`: 存在確認

### チェックリスト

- [ ] PK/SKを含まないメソッドシグネチャ
- [ ] ビジネスキーでアクセス
- [ ] 全メソッドにJSDocコメント
- [ ] @throws でエラーを文書化
- [ ] ページネーション対応（一覧取得）

## 4. DynamoDB Repository 実装

### 設計指針

DynamoDB Repositoryは、実際のDynamoDBを使用した実装。

**MUST**:
- Repository Interfaceを実装
- Mapperを使用してEntity変換
- 適切なエラーハンドリング

**ファイル配置**: `services/{service}/core/src/repositories/dynamodb-{entity-name}.repository.ts`

### 実装パターン

```typescript
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  EntityNotFoundError,
  EntityAlreadyExistsError,
  DatabaseError,
  type PaginationOptions,
  type PaginatedResult,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { {EntityName}Repository } from './{entity-name}.repository.interface.js';
import type {
  {EntityName}Entity,
  Create{EntityName}Input,
  Update{EntityName}Input,
} from '../entities/{entity-name}.entity.js';
import { {EntityName}Mapper } from '../mappers/{entity-name}.mapper.js';

const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * DynamoDB {EntityName} Repository
 */
export class DynamoDB{EntityName}Repository implements {EntityName}Repository {
  private readonly mapper: {EntityName}Mapper;

  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {
    this.mapper = new {EntityName}Mapper();
  }

  async getById(userId: string, tickerId: string): Promise<{EntityName}Entity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<{EntityName}Entity>> {
    try {
      const limit = options?.limit || 50;
      const exclusiveStartKey = options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64').toString('utf-8'))
        : undefined;

      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'UserIndex',  // GSI名
          KeyConditionExpression: '#gsi1pk = :userId AND begins_with(#gsi1sk, :prefix)',
          ExpressionAttributeNames: {
            '#gsi1pk': 'GSI1PK',
            '#gsi1sk': 'GSI1SK',
          },
          ExpressionAttributeValues: {
            ':userId': userId,
            ':prefix': '{EntityName}#',
          },
          Limit: limit,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      const items = (result.Items || []).map((item) =>
        this.mapper.toEntity(item as unknown as DynamoDBItem)
      );

      const nextCursor = result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined;

      return {
        items,
        nextCursor,
        hasMore: !!result.LastEvaluatedKey,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  async create(input: Create{EntityName}Input): Promise<{EntityName}Entity> {
    try {
      const now = Date.now();
      const entity: {EntityName}Entity = {
        ...input,
        CreatedAt: now,
        UpdatedAt: now,
      };

      const item = this.mapper.toItem(entity);

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return entity;
    } catch (error) {
      if (
        error instanceof Error &&
        'name' in error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        throw new EntityAlreadyExistsError(
          '{EntityName}',
          `${input.UserID}#${input.TickerID}`
        );
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  async update(
    userId: string,
    tickerId: string,
    updates: Update{EntityName}Input
  ): Promise<{EntityName}Entity> {
    if (Object.keys(updates).length === 0) {
      throw new Error(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
    }

    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });
      const now = Date.now();

      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

      // 動的にUpdateExpressionを構築
      let index = 0;
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          updateExpressions.push(`#attr${index} = :val${index}`);
          expressionAttributeNames[`#attr${index}`] = key;
          expressionAttributeValues[`:val${index}`] = value;
          index++;
        }
      });

      updateExpressions.push(`#updatedAt = :updatedAt`);
      expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new Error('更新後のアイテムが取得できませんでした');
      }

      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      if (
        error instanceof Error &&
        'name' in error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        throw new EntityNotFoundError('{EntityName}', `${userId}#${tickerId}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  async delete(userId: string, tickerId: string): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });

      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'name' in error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        throw new EntityNotFoundError('{EntityName}', `${userId}#${tickerId}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
```

### 重要ポイント

**エラーハンドリング**:
- `ConditionalCheckFailedException` → `EntityAlreadyExistsError` / `EntityNotFoundError`
- その他のエラー → `DatabaseError`

**UpdateExpression動的構築**:
- 更新フィールドが可変の場合、動的に構築
- `UpdatedAt` は常に更新

**ページネーション**:
- カーソルはBase64エンコードされたJSON
- `LastEvaluatedKey` を不透明トークン化

### チェックリスト

- [ ] Repository Interfaceを実装
- [ ] Mapperを使用
- [ ] エラーハンドリングが適切
- [ ] ConditionExpressionで条件チェック
- [ ] ページネーション実装（一覧取得）
- [ ] UpdatedAtを自動更新

## 5. InMemory Repository 実装

### 設計指針

InMemory Repositoryは、テスト環境で使用する実装。

**MUST**:
- Repository Interfaceを実装
- DynamoDB実装と同じMapperを使用
- DynamoDB実装と同じエラーを投げる

**ファイル配置**: `services/{service}/core/src/repositories/in-memory-{entity-name}.repository.ts`

### 実装パターン

```typescript
import { InMemorySingleTableStore, EntityNotFoundError, EntityAlreadyExistsError } from '@nagiyu/aws';
import type { PaginationOptions, PaginatedResult } from '@nagiyu/aws';
import type { {EntityName}Repository } from './{entity-name}.repository.interface.js';
import type {
  {EntityName}Entity,
  Create{EntityName}Input,
  Update{EntityName}Input,
} from '../entities/{entity-name}.entity.js';
import { {EntityName}Mapper } from '../mappers/{entity-name}.mapper.js';

const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * InMemory {EntityName} Repository
 */
export class InMemory{EntityName}Repository implements {EntityName}Repository {
  private readonly mapper: {EntityName}Mapper;

  constructor(private readonly store: InMemorySingleTableStore) {
    this.mapper = new {EntityName}Mapper();
  }

  async getById(userId: string, tickerId: string): Promise<{EntityName}Entity | null> {
    const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });
    const item = this.store.get(pk, sk);

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
  }

  async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<{EntityName}Entity>> {
    const limit = options?.limit || 50;
    const lastKey = options?.cursor
      ? JSON.parse(Buffer.from(options.cursor, 'base64').toString('utf-8'))
      : undefined;

    const result = this.store.queryByAttribute(
      {
        attributeName: 'GSI1PK',
        attributeValue: userId,
        sk: {
          attributeName: 'GSI1SK',
          operator: 'begins_with',
          value: '{EntityName}#',
        },
      },
      { limit, lastKey }
    );

    const items = result.items.map((item) => this.mapper.toEntity(item));

    const nextCursor = result.lastKey
      ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
      : undefined;

    return {
      items,
      nextCursor,
      hasMore: !!result.lastKey,
    };
  }

  async create(input: Create{EntityName}Input): Promise<{EntityName}Entity> {
    const now = Date.now();
    const entity: {EntityName}Entity = {
      ...input,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const item = this.mapper.toItem(entity);
    
    // DynamoDBと同じエラーを投げる
    this.store.put(item, { attributeNotExists: true });

    return entity;
  }

  async update(
    userId: string,
    tickerId: string,
    updates: Update{EntityName}Input
  ): Promise<{EntityName}Entity> {
    if (Object.keys(updates).length === 0) {
      throw new Error(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
    }

    const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });
    const existing = this.store.get(pk, sk);

    if (!existing) {
      throw new EntityNotFoundError('{EntityName}', `${userId}#${tickerId}`);
    }

    const existingEntity = this.mapper.toEntity(existing);
    const now = Date.now();

    const updatedEntity: {EntityName}Entity = {
      ...existingEntity,
      ...updates,
      UpdatedAt: now,
    };

    const item = this.mapper.toItem(updatedEntity);
    this.store.put(item);

    return updatedEntity;
  }

  async delete(userId: string, tickerId: string): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });
    
    // DynamoDBと同じエラーを投げる
    this.store.delete(pk, sk, { attributeExists: true });
  }
}
```

### 重要ポイント

**同じエラーを投げる**:
- `create()`: `attributeNotExists: true` → `EntityAlreadyExistsError`
- `delete()`: `attributeExists: true` → `EntityNotFoundError`
- `update()`: 手動で存在チェック → `EntityNotFoundError`

**ページネーション**:
- DynamoDB実装と同じカーソル形式
- Base64エンコードされたJSON

### チェックリスト

- [ ] Repository Interfaceを実装
- [ ] DynamoDB実装と同じMapperを使用
- [ ] DynamoDB実装と同じエラーを投げる
- [ ] InMemorySingleTableStoreを使用
- [ ] ページネーション実装

## 6. テスト実装

### テスト戦略

Repository実装に対して、以下のテストを作成：

1. **Mapperテスト**: 変換ロジックの検証
2. **Repositoryユニットテスト**: 各メソッドの動作検証
3. **E2Eテスト**: InMemory実装を使った統合テスト

### Mapperテスト

**ファイル配置**: `services/{service}/core/tests/unit/mappers/{entity-name}.mapper.test.ts`

```typescript
import { {EntityName}Mapper } from '../../../src/mappers/{entity-name}.mapper';
import type { {EntityName}Entity } from '../../../src/entities/{entity-name}.entity';

describe('{EntityName}Mapper', () => {
  let mapper: {EntityName}Mapper;

  beforeEach(() => {
    mapper = new {EntityName}Mapper();
  });

  describe('toItem', () => {
    it('EntityをDynamoDBItemに変換する', () => {
      const entity: {EntityName}Entity = {
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
        CreatedAt: 1234567890,
        UpdatedAt: 1234567890,
      };

      const item = mapper.toItem(entity);

      expect(item.PK).toBe('USER#user-001');
      expect(item.SK).toBe('{ENTITY_PREFIX}#NSDQ:AAPL');
      expect(item.Type).toBe('{EntityName}');
      expect(item.UserID).toBe('user-001');
      expect(item.Quantity).toBe(100);
    });
  });

  describe('toEntity', () => {
    it('DynamoDBItemをEntityに変換する', () => {
      const item = {
        PK: 'USER#user-001',
        SK: '{ENTITY_PREFIX}#NSDQ:AAPL',
        Type: '{EntityName}',
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
        CreatedAt: 1234567890,
        UpdatedAt: 1234567890,
      };

      const entity = mapper.toEntity(item);

      expect(entity.UserID).toBe('user-001');
      expect(entity.TickerID).toBe('NSDQ:AAPL');
      expect(entity.Quantity).toBe(100);
      expect(entity).not.toHaveProperty('PK');
      expect(entity).not.toHaveProperty('SK');
    });
  });

  describe('buildKeys', () => {
    it('ビジネスキーからPK/SKを構築する', () => {
      const keys = mapper.buildKeys({
        userId: 'user-001',
        tickerId: 'NSDQ:AAPL',
      });

      expect(keys.pk).toBe('USER#user-001');
      expect(keys.sk).toBe('{ENTITY_PREFIX}#NSDQ:AAPL');
    });
  });
});
```

### E2Eテスト

**ファイル配置**: `services/{service}/core/tests/e2e/{entity-name}.repository.e2e.test.ts`

```typescript
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemory{EntityName}Repository } from '../../src/repositories/in-memory-{entity-name}.repository';
import { EntityAlreadyExistsError, EntityNotFoundError } from '@nagiyu/aws';

describe('{EntityName} Repository E2E Tests', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemory{EntityName}Repository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemory{EntityName}Repository(store);
  });

  describe('CRUDフロー', () => {
    it('作成、取得、更新、削除の一連のフローが動作する', async () => {
      // 作成
      const created = await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
      });

      expect(created.UserID).toBe('user-001');
      expect(created.CreatedAt).toBeDefined();

      // 取得
      const retrieved = await repository.getById('user-001', 'NSDQ:AAPL');
      expect(retrieved).toEqual(created);

      // 更新
      const updated = await repository.update('user-001', 'NSDQ:AAPL', {
        Quantity: 150,
      });
      expect(updated.Quantity).toBe(150);

      // 削除
      await repository.delete('user-001', 'NSDQ:AAPL');
      const afterDelete = await repository.getById('user-001', 'NSDQ:AAPL');
      expect(afterDelete).toBeNull();
    });

    it('重複作成時にEntityAlreadyExistsErrorを投げる', async () => {
      await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
      });

      await expect(
        repository.create({
          UserID: 'user-001',
          TickerID: 'NSDQ:AAPL',
          Quantity: 200,
          AveragePrice: 160.0,
          Currency: 'USD',
        })
      ).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('存在しないエンティティの更新時にEntityNotFoundErrorを投げる', async () => {
      await expect(
        repository.update('user-001', 'NSDQ:AAPL', { Quantity: 150 })
      ).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('一覧取得とページネーション', () => {
    it('ユーザーのエンティティ一覧を取得できる', async () => {
      await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
      });

      await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:NVDA',
        Quantity: 50,
        AveragePrice: 450.0,
        Currency: 'USD',
      });

      const result = await repository.getByUserId('user-001');

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('ページネーションが動作する', async () => {
      // 複数エンティティを作成
      for (let i = 0; i < 10; i++) {
        await repository.create({
          UserID: 'user-001',
          TickerID: `TICKER-${i}`,
          Quantity: 100,
          AveragePrice: 150.0,
          Currency: 'USD',
        });
      }

      // 1ページ目
      const page1 = await repository.getByUserId('user-001', { limit: 5 });
      expect(page1.items).toHaveLength(5);
      expect(page1.hasMore).toBe(true);

      // 2ページ目
      const page2 = await repository.getByUserId('user-001', {
        limit: 5,
        cursor: page1.nextCursor,
      });
      expect(page2.items).toHaveLength(5);
      expect(page2.hasMore).toBe(false);
    });
  });
});
```

### チェックリスト

- [ ] Mapperテストが実装されている
- [ ] 基本CRUDフローのテスト
- [ ] エラーケースのテスト
- [ ] ページネーションのテスト
- [ ] 複数リポジトリの統合テスト（必要に応じて）

## まとめ

新しいエンティティのRepository実装は、以下の手順で進める：

1. **Entity定義**: PK/SKを含まない純粋なビジネスオブジェクト
2. **Mapper実装**: Entity ↔ DynamoDBItem の変換を一元化
3. **Repository Interface**: ビジネスキーでのCRUD操作を定義
4. **DynamoDB実装**: 実際のDynamoDBを使用した実装
5. **InMemory実装**: テスト用の実装（DynamoDB実装と同じエラー）
6. **テスト**: Mapper、Repository、E2Eの3層でテスト

このパターンに従うことで、保守しやすく、テストしやすい、一貫したRepositoryを実装できる。

## 関連ドキュメント

- [データアクセス層アーキテクチャ](./data-access-layer.md) - 設計思想と全体像
- [テスト戦略](./testing.md) - テストガイドラインとカバレッジ要件
- [既存サービスへのマイグレーションガイド](./migrating-to-new-repository-pattern.md) - 既存コードの移行方法
