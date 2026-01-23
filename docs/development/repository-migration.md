# Repository Pattern 移行ガイド

## 目的

本ドキュメントは、既存のデータアクセス実装から `@nagiyu/aws` を使用した Repository Pattern への移行手順を提供する。

## 移行の利点

- **コードの統一**: プラットフォーム全体で一貫したデータアクセスパターン
- **エラーハンドリングの標準化**: 共通エラークラスによる統一的なエラー処理
- **バリデーションの自動化**: 標準バリデーション関数による型安全性
- **テスト容易性**: モック化しやすい設計
- **保守性向上**: 共通基底クラスによる実装の簡略化

## 移行前の準備

### 1. 依存パッケージのインストール

```bash
# サービスの core パッケージに追加
npm install @nagiyu/aws --workspace=your-service-core
```

### 2. 既存実装の分析

以下を確認する：

- [ ] エンティティ型定義が明確か
- [ ] CRUD 操作が実装されているか
- [ ] カスタムクエリ（検索、フィルタ等）があるか
- [ ] エラーハンドリングのパターン
- [ ] バリデーションロジック

### 3. テストの準備

移行前のテストを実行し、既存の動作を確認する。

```bash
npm test --workspace=your-service-core
```

## 移行手順

### Step 1: エンティティ型定義の確認

既存のエンティティ型が適切に定義されているか確認する。

#### Before: 既存の型定義

```typescript
// 既存: types.ts
export interface User {
  userId: string;
  name: string;
  email: string;
  createdAt: number;
  updatedAt: number;
}
```

#### After: 型定義はそのまま使用可能

```typescript
// 変更なし: types.ts
export interface User {
  userId: string;
  name: string;
  email: string;
  createdAt: number;
  updatedAt: number;
}
```

**注意点**:

- `createdAt` / `updatedAt` フィールドは `number` 型（Unix timestamp）であること
- フィールド名は camelCase であること

### Step 2: リポジトリクラスの作成

`AbstractDynamoDBRepository` を継承した新しいリポジトリクラスを作成する。

#### Before: 既存の実装

```typescript
// 既存: user-repository.ts
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { User } from './types.js';

export class UserRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  async getById(userId: string): Promise<User | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    // 手動マッピング
    return {
      userId: result.Item.UserId as string,
      name: result.Item.Name as string,
      email: result.Item.Email as string,
      createdAt: result.Item.CreatedAt as number,
      updatedAt: result.Item.UpdatedAt as number,
    };
  }

  async create(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const now = Date.now();
    const newUser = {
      ...user,
      createdAt: now,
      updatedAt: now,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${user.userId}`,
          SK: 'PROFILE',
          Type: 'User',
          UserId: user.userId,
          Name: user.name,
          Email: user.email,
          CreatedAt: now,
          UpdatedAt: now,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );

    return newUser;
  }

  // ... 他の CRUD メソッド
}
```

#### After: AbstractDynamoDBRepository を使用

```typescript
// 移行後: user-repository.ts
import {
  AbstractDynamoDBRepository,
  type DynamoDBItem,
  validateStringField,
  validateTimestampField,
} from '@nagiyu/aws';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { User } from './types.js';

export class UserRepository extends AbstractDynamoDBRepository<User, { userId: string }> {
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

  protected mapToItem(
    entity: Omit<User, 'createdAt' | 'updatedAt'>
  ): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
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

**変更点**:

1. `AbstractDynamoDBRepository` を継承
2. `buildKeys()`, `mapToEntity()`, `mapToItem()` の3つのメソッドを実装
3. バリデーション関数を使用して型安全性を向上
4. CRUD 操作は基底クラスで提供されるため、実装不要

### Step 3: カスタムクエリの移行

GSI を使用したカスタムクエリは、そのまま移行できる。

#### Before: 既存のカスタムクエリ

```typescript
async getByEmail(email: string): Promise<User | null> {
    const result = await this.docClient.send(
        new QueryCommand({
            TableName: this.tableName,
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

    // 手動マッピング
    return {
        userId: result.Items[0].UserId as string,
        name: result.Items[0].Name as string,
        email: result.Items[0].Email as string,
        createdAt: result.Items[0].CreatedAt as number,
        updatedAt: result.Items[0].UpdatedAt as number,
    };
}
```

#### After: mapToEntity() を活用

```typescript
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';

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

        // mapToEntity() を使用して型安全にマッピング
        return this.mapToEntity(result.Items[0]);
    } catch (error) {
        throw new DatabaseError(
            `メールアドレスでのユーザー取得エラー: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
        );
    }
}
```

**変更点**:

1. `this.mapToEntity()` を使用してマッピング（バリデーション自動適用）
2. エラーハンドリングを標準化（`DatabaseError` を使用）

### Step 4: エラーハンドリングの更新

カスタムエラークラスを標準エラークラスに置き換える。

#### Before: カスタムエラークラス

```typescript
export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`ユーザーが見つかりません: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

export class UserAlreadyExistsError extends Error {
  constructor(userId: string) {
    super(`ユーザーは既に存在します: ${userId}`);
    this.name = 'UserAlreadyExistsError';
  }
}
```

#### After: 標準エラークラスを使用

```typescript
// エラークラスの定義は不要（@nagiyu/aws から import）
import { EntityNotFoundError, EntityAlreadyExistsError, DatabaseError } from '@nagiyu/aws';

// 使用例
throw new EntityNotFoundError('User', userId);
throw new EntityAlreadyExistsError('User', userId);
```

**注意点**:

- 既存のエラーハンドリングコードで `UserNotFoundError` を使用している箇所を `EntityNotFoundError` に置き換える
- エラーメッセージの形式が変わる可能性があるため、テストを更新する

### Step 5: 呼び出し側の更新

リポジトリの呼び出し方法を更新する。

#### Before: 既存の呼び出し

```typescript
const user = await userRepository.getById('user-123');
```

#### After: キーオブジェクトを使用

```typescript
const user = await userRepository.getById({ userId: 'user-123' });
```

**変更点**:

- `getById()`, `update()`, `delete()` はキーオブジェクト（`{ userId: string }`）を受け取る
- `create()` は変更なし

### Step 6: テストの更新

テストコードを更新し、すべてのテストがパスすることを確認する。

#### Before: 既存のテスト

```typescript
test('getById - ユーザーが存在する場合', async () => {
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

  const user = await repository.getById('user-123');
  expect(user?.userId).toBe('user-123');
});
```

#### After: キーオブジェクトを使用

```typescript
test('getById - ユーザーが存在する場合', async () => {
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

  const user = await repository.getById({ userId: 'user-123' });
  expect(user?.userId).toBe('user-123');
});
```

## 移行チェックリスト

### 移行前

- [ ] 既存実装の動作確認（全テストがパス）
- [ ] エンティティ型定義の確認
- [ ] CRUD 操作の洗い出し
- [ ] カスタムクエリの洗い出し
- [ ] エラーハンドリングパターンの確認
- [ ] `@nagiyu/aws` パッケージのインストール

### 移行中

- [ ] `AbstractDynamoDBRepository` を継承した新しいリポジトリクラスを作成
- [ ] `buildKeys()` メソッドを実装
- [ ] `mapToEntity()` メソッドを実装（バリデーション関数を使用）
- [ ] `mapToItem()` メソッドを実装
- [ ] カスタムクエリを移行（`mapToEntity()` を使用）
- [ ] エラークラスを標準エラークラスに置き換え
- [ ] 呼び出し側のコードを更新（キーオブジェクトを使用）
- [ ] テストコードを更新

### 移行後

- [ ] 全テストがパスすることを確認
- [ ] インテグレーションテストを実行（可能な場合）
- [ ] リファクタリング（共通ロジックの抽出等）
- [ ] 古い実装ファイルを削除
- [ ] ドキュメントの更新

## トラブルシューティング

### 問題 1: 型エラーが発生する

**症状**:

```
Type 'string | undefined' is not assignable to type 'string'.
```

**原因**:
バリデーション関数を使用せずに型キャストしている。

**解決策**:

```typescript
// ❌ 型キャスト
userId: item.UserId as string;

// ✅ バリデーション関数を使用
userId: validateStringField(item.UserId, 'UserId');
```

### 問題 2: テストが失敗する

**症状**:

```
Expected "USER#user-123" but received { userId: "user-123" }
```

**原因**:
`getById()`, `update()`, `delete()` の引数がキーオブジェクトに変更されている。

**解決策**:

```typescript
// ❌ 文字列を直接渡す
await repository.getById('user-123');

// ✅ キーオブジェクトを渡す
await repository.getById({ userId: 'user-123' });
```

### 問題 3: CreatedAt/UpdatedAt が自動設定されない

**症状**:

```
CreatedAt is undefined
```

**原因**:
`mapToItem()` で `CreatedAt`/`UpdatedAt` を含めている。

**解決策**:

```typescript
// ❌ タイムスタンプを含める
protected mapToItem(entity: Omit<User, 'createdAt' | 'updatedAt'>): DynamoDBItem {
    return {
        ...keys,
        Type: 'User',
        CreatedAt: Date.now(),  // 削除
        UpdatedAt: Date.now(),  // 削除
        // ...
    };
}

// ✅ タイムスタンプは基底クラスで自動設定
protected mapToItem(entity: Omit<User, 'createdAt' | 'updatedAt'>): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
    return {
        ...keys,
        Type: 'User',
        // CreatedAt/UpdatedAt は基底クラスで自動設定される
        // ...
    };
}
```

### 問題 4: ConditionalCheckFailedException が処理されない

**症状**:
エンティティ作成時に重複エラーが正しく処理されない。

**原因**:
基底クラスで自動的に `EntityAlreadyExistsError` に変換される。

**解決策**:

```typescript
try {
  await repository.create(user);
} catch (error) {
  if (error instanceof EntityAlreadyExistsError) {
    // 重複エラー処理
  }
}
```

### 問題 5: カスタムクエリでバリデーションエラーが発生する

**症状**:

```
InvalidEntityDataError: フィールド "UserId" が文字列ではありません
```

**原因**:
DynamoDB からのレスポンスデータが想定と異なる。

**解決策**:

1. DynamoDB のデータ構造を確認
2. バリデーション関数のオプションを調整（例: `allowEmpty: true`）
3. カスタムバリデーション関数を作成

```typescript
// デバッグ用にデータを出力
console.log('Raw item:', result.Items[0]);

// バリデーションをスキップしてマッピング（一時的）
return {
  userId: item.UserId as string, // 一時的に型キャスト
  // ...
};
```

## ベストプラクティス

### 1. 段階的な移行

一度にすべてのリポジトリを移行するのではなく、1つずつ移行する。

```
1. User Repository を移行 → テスト → デプロイ
2. Watchlist Repository を移行 → テスト → デプロイ
3. ...
```

### 2. 並行運用期間を設ける

新旧両方の実装を一時的に共存させ、問題があれば元に戻せるようにする。

```typescript
// 移行期間中は両方のリポジトリを保持
import { UserRepository as NewUserRepository } from './user-repository-new.js';
import { UserRepository as OldUserRepository } from './user-repository-old.js';

const repository = USE_NEW_REPOSITORY ? new NewUserRepository(...) : new OldUserRepository(...);
```

### 3. テストカバレッジを維持

移行前後でテストカバレッジが低下しないようにする。

```bash
# 移行前のカバレッジを記録
npm test --coverage > coverage-before.txt

# 移行後のカバレッジを確認
npm test --coverage > coverage-after.txt

# 差分を確認
diff coverage-before.txt coverage-after.txt
```

### 4. ドキュメントの更新

移行後は、READMEやアーキテクチャドキュメントを更新する。

```markdown
## データアクセス層

本サービスでは、`@nagiyu/aws` を使用した Repository Pattern を採用しています。

詳細は以下を参照：

- [Repository Pattern 設計ガイド](../../docs/development/repository-pattern.md)
- [実装例](./src/repositories/)
```

## 参考

- [Repository Pattern 設計ガイド](./repository-pattern.md)
- [共通ライブラリ設計](./shared-libraries.md)
- Stock Tracker 移行例: `services/stock-tracker/core/src/repositories/`
