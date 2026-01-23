# Repository Pattern 設計ガイド

## 目的

本ドキュメントは、DynamoDB を使用したデータアクセス層の標準化手法として、Repository Pattern の設計と実装ガイドを提供する。

## Repository Pattern とは

Repository Pattern は、データアクセスロジックをビジネスロジックから分離するための設計パターン。データソース（DynamoDB、RDS等）への依存を抽象化し、テスト容易性と保守性を向上させる。

### 主なメリット

- **テスト容易性**: リポジトリをモック化してビジネスロジックを単体テスト可能
- **データソースの抽象化**: データベースの変更がビジネスロジックに影響しない
- **一貫性**: データアクセスのパターンを統一
- **保守性**: データアクセスロジックが一箇所に集約

### 適用ケース

- DynamoDB を使用するサービス
- データアクセスロジックが複雑化しているケース
- 複数のサービスで同じデータモデルを共有するケース

## `@nagiyu/aws` の使い方

`@nagiyu/aws` パッケージは、DynamoDB Repository の共通機能を提供する。

### インストール

```bash
npm install @nagiyu/aws --workspace=your-service-core
```

### 基本構成

```typescript
import {
    AbstractDynamoDBRepository,
    type DynamoDBItem,
    type RepositoryConfig,
    validateStringField,
    validateTimestampField,
} from '@nagiyu/aws';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// エンティティ型定義
interface User {
    userId: string;
    name: string;
    email: string;
    createdAt: number;
    updatedAt: number;
}

// リポジトリ実装
class UserRepository extends AbstractDynamoDBRepository<User, { userId: string }> {
    constructor(docClient: DynamoDBDocumentClient, tableName: string) {
        super(docClient, {
            tableName,
            entityType: 'User',
        });
    }

    protected buildKeys(key: { userId: string }) {
        return {
            PK: `USER#${key.userId}`,
            SK: 'PROFILE',
        };
    }

    protected mapToEntity(item: Record<string, unknown>): User {
        return {
            userId: validateStringField(item.UserId, 'UserId'),
            name: validateStringField(item.Name, 'Name'),
            email: validateStringField(item.Email, 'Email'),
            createdAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
            updatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
        };
    }

    protected mapToItem(entity: Omit<User, 'createdAt' | 'updatedAt'>): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
        const keys = this.buildKeys({ userId: entity.userId });
        return {
            ...keys,
            Type: this.config.entityType,
            UserId: entity.userId,
            Name: entity.name,
            Email: entity.email,
        };
    }
}
```

### 基本的なCRUD操作

```typescript
// リポジトリの初期化
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-northeast-1' }));
const userRepository = new UserRepository(docClient, 'MyTable');

// 作成
const newUser = await userRepository.create({
    userId: 'user-123',
    name: 'John Doe',
    email: 'john@example.com',
});

// 取得
const user = await userRepository.getById({ userId: 'user-123' });

// 更新
const updated = await userRepository.update(
    { userId: 'user-123' },
    { name: 'Jane Doe' }
);

// 削除
await userRepository.delete({ userId: 'user-123' });
```

## AbstractDynamoDBRepository 継承方法

### 必須実装メソッド

#### 1. buildKeys()

PK/SK を構築するメソッド。Single Table Design のキー設計に従う。

```typescript
protected buildKeys(key: { userId: string }): { PK: string; SK: string } {
    return {
        PK: `USER#${key.userId}`,
        SK: 'PROFILE',
    };
}
```

**ポイント**:
- PK: エンティティタイプとIDを組み合わせる（例: `USER#123`）
- SK: サブエンティティやメタデータの種類（例: `PROFILE`, `METADATA`）

#### 2. mapToEntity()

DynamoDB Item をエンティティオブジェクトにマッピング。

```typescript
protected mapToEntity(item: Record<string, unknown>): User {
    return {
        userId: validateStringField(item.UserId, 'UserId'),
        name: validateStringField(item.Name, 'Name'),
        email: validateStringField(item.Email, 'Email'),
        createdAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
        updatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
}
```

**ポイント**:
- バリデーション関数を使用して型安全性を確保
- DynamoDBのフィールド名（PascalCase）をエンティティのフィールド名（camelCase）にマッピング

#### 3. mapToItem()

エンティティを DynamoDB Item にマッピング。

```typescript
protected mapToItem(entity: Omit<User, 'createdAt' | 'updatedAt'>): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
    const keys = this.buildKeys({ userId: entity.userId });
    return {
        ...keys,
        Type: this.config.entityType,
        UserId: entity.userId,
        Name: entity.name,
        Email: entity.email,
    };
}
```

**ポイント**:
- `CreatedAt` / `UpdatedAt` は自動管理されるため除外
- `Type` フィールドは必須（エンティティタイプ識別用）
- GSI 用のフィールド（GSI1PK, GSI1SK等）もここで設定

### カスタムクエリの追加

基本的な CRUD 以外のクエリは、サブクラスで追加実装する。

```typescript
class UserRepository extends AbstractDynamoDBRepository<User, { userId: string }> {
    // ... 基本実装 ...

    /**
     * メールアドレスでユーザーを検索
     * GSI1 (EmailIndex) を使用
     */
    async getByEmail(email: string): Promise<User | null> {
        try {
            const result = await this.docClient.send(
                new QueryCommand({
                    TableName: this.config.tableName,
                    IndexName: 'EmailIndex',
                    KeyConditionExpression: 'GSI1PK = :email',
                    ExpressionAttributeValues: {
                        ':email': email,
                    },
                })
            );

            if (!result.Items || result.Items.length === 0) {
                return null;
            }

            return this.mapToEntity(result.Items[0]);
        } catch (error) {
            throw new DatabaseError(
                `メールアドレスでのユーザー取得エラー: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            );
        }
    }
}
```

## エラーハンドリング ベストプラクティス

### 標準エラークラス

`@nagiyu/aws` が提供する標準エラークラスを使用する。

```typescript
import {
    RepositoryError,          // 基底クラス
    EntityNotFoundError,      // エンティティが見つからない
    EntityAlreadyExistsError, // エンティティが既に存在
    InvalidEntityDataError,   // データが無効
    DatabaseError,            // データベースエラー
} from '@nagiyu/aws';
```

### エラーハンドリングパターン

#### 1. 基本的なエラーハンドリング

```typescript
async function processUser(userId: string) {
    try {
        const user = await userRepository.getById({ userId });
        if (!user) {
            throw new EntityNotFoundError('User', userId);
        }
        // ビジネスロジック
    } catch (error) {
        if (error instanceof EntityNotFoundError) {
            console.error('ユーザーが見つかりません:', error.message);
            // ユーザー向けエラー処理
        } else if (error instanceof DatabaseError) {
            console.error('データベースエラー:', error.message);
            // システムエラー処理
        } else {
            throw error; // 予期しないエラーは再スロー
        }
    }
}
```

#### 2. 作成時の重複チェック

```typescript
try {
    const newUser = await userRepository.create({
        userId: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
    });
} catch (error) {
    if (error instanceof EntityAlreadyExistsError) {
        console.error('ユーザーは既に存在します');
        // 既存ユーザーの処理
    } else {
        throw error;
    }
}
```

#### 3. バリデーションエラー

```typescript
try {
    const user = await userRepository.getById({ userId: 'invalid' });
} catch (error) {
    if (error instanceof InvalidEntityDataError) {
        console.error('データが不正です:', error.message);
        // バリデーションエラー処理
    } else {
        throw error;
    }
}
```

### カスタムエラークラスの追加

サービス固有のエラーが必要な場合は、`RepositoryError` を継承する。

```typescript
export class UserEmailAlreadyExistsError extends RepositoryError {
    constructor(email: string) {
        super(`メールアドレスは既に使用されています: ${email}`);
        this.name = 'UserEmailAlreadyExistsError';
    }
}
```

## バリデーション戦略

### 標準バリデーション関数

`@nagiyu/aws` が提供するバリデーション関数を使用する。

```typescript
import {
    validateStringField,
    validateNumberField,
    validateEnumField,
    validateBooleanField,
    validateTimestampField,
} from '@nagiyu/aws';
```

### 各バリデーション関数の使い方

#### 1. validateStringField

```typescript
// 基本
const name = validateStringField(item.Name, 'Name');

// 空文字列を許可
const nickname = validateStringField(item.Nickname, 'Nickname', { allowEmpty: true });

// 長さ制限
const username = validateStringField(item.Username, 'Username', {
    minLength: 3,
    maxLength: 20,
});
```

#### 2. validateNumberField

```typescript
// 基本
const age = validateNumberField(item.Age, 'Age');

// 範囲制限
const score = validateNumberField(item.Score, 'Score', {
    min: 0,
    max: 100,
});

// 整数のみ
const count = validateNumberField(item.Count, 'Count', { integer: true });
```

#### 3. validateEnumField

```typescript
type UserStatus = 'active' | 'inactive' | 'suspended';

const status = validateEnumField<UserStatus>(
    item.Status,
    'Status',
    ['active', 'inactive', 'suspended']
);
```

#### 4. validateBooleanField

```typescript
const isVerified = validateBooleanField(item.IsVerified, 'IsVerified');
```

#### 5. validateTimestampField

```typescript
// 基本
const createdAt = validateTimestampField(item.CreatedAt, 'CreatedAt');

// 未来の日時を禁止
const birthDate = validateTimestampField(item.BirthDate, 'BirthDate', {
    allowFuture: false,
});
```

### カスタムバリデーションの追加

複雑なバリデーションは、専用関数として実装する。

```typescript
function validateEmail(value: unknown, fieldName: string): string {
    const email = validateStringField(value, fieldName);
    
    // メールアドレス形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new InvalidEntityDataError(`フィールド "${fieldName}" が不正なメールアドレス形式です`);
    }
    
    return email;
}
```

## テスト方法

### ユニットテスト

リポジトリのテストは、DynamoDB をモック化して実行する。

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { UserRepository } from './user-repository';

describe('UserRepository', () => {
    const ddbMock = mockClient(DynamoDBDocumentClient);
    let repository: UserRepository;

    beforeEach(() => {
        ddbMock.reset();
        const docClient = DynamoDBDocumentClient.from({} as any);
        repository = new UserRepository(docClient, 'TestTable');
    });

    test('getById - ユーザーが存在する場合', async () => {
        // モックの設定
        ddbMock.on(GetCommand).resolves({
            Item: {
                PK: 'USER#user-123',
                SK: 'PROFILE',
                Type: 'User',
                UserId: 'user-123',
                Name: 'John Doe',
                Email: 'john@example.com',
                CreatedAt: 1234567890,
                UpdatedAt: 1234567890,
            },
        });

        // テスト実行
        const user = await repository.getById({ userId: 'user-123' });

        // 検証
        expect(user).not.toBeNull();
        expect(user?.userId).toBe('user-123');
        expect(user?.name).toBe('John Doe');
    });

    test('create - 新規ユーザーを作成', async () => {
        // モックの設定
        ddbMock.on(PutCommand).resolves({});

        // テスト実行
        const newUser = await repository.create({
            userId: 'user-456',
            name: 'Jane Doe',
            email: 'jane@example.com',
        });

        // 検証
        expect(newUser.userId).toBe('user-456');
        expect(newUser.name).toBe('Jane Doe');
        expect(ddbMock.calls()).toHaveLength(1);
    });

    test('getById - エンティティが存在しない場合', async () => {
        // モックの設定
        ddbMock.on(GetCommand).resolves({ Item: undefined });

        // テスト実行
        const user = await repository.getById({ userId: 'not-found' });

        // 検証
        expect(user).toBeNull();
    });
});
```

### インテグレーションテスト

実際の DynamoDB に対してテストする場合は、テスト用テーブルを使用する。

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { UserRepository } from './user-repository';

describe('UserRepository Integration Test', () => {
    let repository: UserRepository;
    const testTableName = 'TestTable';

    beforeAll(() => {
        const client = new DynamoDBClient({
            region: 'ap-northeast-1',
            endpoint: 'http://localhost:8000', // DynamoDB Local
        });
        const docClient = DynamoDBDocumentClient.from(client);
        repository = new UserRepository(docClient, testTableName);
    });

    afterEach(async () => {
        // テストデータのクリーンアップ
        try {
            await repository.delete({ userId: 'test-user' });
        } catch (error) {
            // エンティティが存在しない場合は無視
        }
    });

    test('CRUD操作のフルサイクル', async () => {
        // 作成
        const created = await repository.create({
            userId: 'test-user',
            name: 'Test User',
            email: 'test@example.com',
        });
        expect(created.userId).toBe('test-user');

        // 取得
        const fetched = await repository.getById({ userId: 'test-user' });
        expect(fetched).not.toBeNull();
        expect(fetched?.name).toBe('Test User');

        // 更新
        const updated = await repository.update(
            { userId: 'test-user' },
            { name: 'Updated Name' }
        );
        expect(updated.name).toBe('Updated Name');

        // 削除
        await repository.delete({ userId: 'test-user' });
        const deleted = await repository.getById({ userId: 'test-user' });
        expect(deleted).toBeNull();
    });
});
```

## Single Table Design

### 概要

Single Table Design は、複数のエンティティタイプを1つの DynamoDB テーブルに格納する設計手法。

### 基本構造

```
┌─────────────────┬──────────────────┬──────────┬─────────────┬─────────────┐
│ PK              │ SK               │ Type     │ GSI1PK      │ GSI1SK      │
├─────────────────┼──────────────────┼──────────┼─────────────┼─────────────┤
│ USER#user-123   │ PROFILE          │ User     │ user-123    │ User#...    │
│ USER#user-123   │ WATCHLIST#AAPL   │Watchlist │ user-123    │Watchlist#...│
│ TICKER#AAPL     │ METADATA         │ Ticker   │ NSDQ        │ TICKER#AAPL │
│ EXCHANGE#NSDQ   │ METADATA         │ Exchange │ -           │ -           │
└─────────────────┴──────────────────┴──────────┴─────────────┴─────────────┘
```

### メリット

1. **パフォーマンス向上**: 関連データを1回のクエリで取得可能
2. **コスト削減**: テーブル数が減り、プロビジョニングコストが削減
3. **トランザクション**: 複数エンティティを一貫性を持って更新可能
4. **スケーラビリティ**: パーティションキーの分散が容易

### デメリット

1. **設計の複雑性**: キー設計が複雑になる
2. **学習コスト**: Single Table Design の理解が必要
3. **変更コスト**: 後からアクセスパターンを追加する場合、移行が必要
4. **デバッグの困難性**: 複数エンティティが混在するため、データ確認が難しい

### 採用判断基準

#### Single Table Design を採用すべきケース

- **関連性の高いエンティティ**: User と Watchlist のように、常に一緒にクエリされる
- **アクセスパターンが明確**: クエリパターンが事前に定義できている
- **高いパフォーマンス要求**: レスポンス時間が重要
- **コスト最適化**: テーブル数を最小化したい

#### Multiple Table Design を採用すべきケース

- **エンティティ間の独立性が高い**: 異なるライフサイクルを持つ
- **アクセスパターンが不明確**: 将来の要件が予測できない
- **シンプルさ優先**: チーム全体の理解とメンテナンス性を重視
- **バックアップ戦略が異なる**: エンティティごとに異なるバックアップ要件

### Stock Tracker の実装例

Stock Tracker では、Single Table Design を採用している。

#### エンティティ設計

```typescript
// User と Watchlist（関連性が高い）
PK: USER#${userId}
SK: PROFILE | WATCHLIST#${tickerId}

// Ticker と Exchange（関連性が高い）
PK: TICKER#${tickerId} | EXCHANGE#${exchangeId}
SK: METADATA
```

#### アクセスパターン

1. **ユーザーのプロフィールとウォッチリストを取得**
   ```typescript
   // Query: PK = USER#user-123
   // → PROFILE, WATCHLIST#AAPL, WATCHLIST#GOOGL を一度に取得
   ```

2. **ティッカー情報を取得**
   ```typescript
   // GetItem: PK = TICKER#AAPL, SK = METADATA
   ```

3. **取引所ごとのティッカーを検索**
   ```typescript
   // Query GSI3: GSI3PK = NSDQ
   // → その取引所の全ティッカーを取得
   ```

#### 実装コード例

```typescript
// Stock Tracker の Watchlist Repository
class WatchlistRepository {
    async getByUserId(userId: string): Promise<Watchlist[]> {
        const result = await this.docClient.send(
            new QueryCommand({
                TableName: this.tableName,
                IndexName: 'UserIndex',
                KeyConditionExpression: 'GSI1PK = :userId AND begins_with(GSI1SK, :prefix)',
                ExpressionAttributeValues: {
                    ':userId': userId,
                    ':prefix': 'Watchlist#',
                },
            })
        );
        return result.Items?.map(item => this.mapToEntity(item)) || [];
    }
}
```

詳細は `services/stock-tracker/core/src/repositories/` を参照。

### 代替案: Multiple Table Design

エンティティごとに独立したテーブルを作成する従来の設計。

#### 構成例

```
UserTable:
  PK: userId
  Fields: name, email, createdAt, updatedAt

WatchlistTable:
  PK: userId
  SK: tickerId
  Fields: createdAt

TickerTable:
  PK: tickerId
  Fields: symbol, name, exchangeId, createdAt, updatedAt

ExchangeTable:
  PK: exchangeId
  Fields: name, key, createdAt, updatedAt
```

#### メリット

- **シンプル**: エンティティごとに独立した構造
- **理解しやすい**: SQL データベースの経験があれば直感的
- **変更容易**: テーブルごとに独立して変更可能
- **バックアップ管理**: テーブルごとに異なる戦略を適用可能

#### デメリット

- **パフォーマンス**: 複数テーブルへのクエリが必要
- **コスト**: テーブル数に応じてコストが増加
- **トランザクション制限**: 複数テーブルにまたがるトランザクションが複雑

#### 使い分け

| 要件                     | Single Table | Multiple Table |
| ------------------------ | ------------ | -------------- |
| エンティティ間の関連性   | 高い         | 低い           |
| アクセスパターンの明確性 | 明確         | 不明確         |
| パフォーマンス要求       | 高い         | 中〜低         |
| シンプルさ               | 低い         | 高い           |
| 学習コスト               | 高い         | 低い           |

## 参考

- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [Single-Table Design with DynamoDB](https://www.alexdebrie.com/posts/dynamodb-single-table/)
- Stock Tracker 実装: `services/stock-tracker/core/src/repositories/`
- `@nagiyu/aws` パッケージ: `libs/aws/src/dynamodb/`
