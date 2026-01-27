# 新しいRepositoryパターンへのマイグレーションガイド

## 目的

本ドキュメントは、既存のDynamoDB実装を新しいRepositoryパターン（Entity/Mapper/Repository）に移行する際の手順と戦略を提供する。

## 前提知識

本ガイドを読む前に、以下のドキュメントを理解していることを推奨：

- [データアクセス層アーキテクチャ](./data-access-layer.md) - 設計思想と全体像
- [Repository実装ガイド](./implementing-repositories.md) - 新規実装の手順

## 基本方針

### マイグレーションは必須ではない

**重要**: 既存サービスへのマイグレーションは**必須ではない**。

- 新規開発では新しいパターンを採用
- 既存サービスは動作している限り変更不要
- 必要性が生じた場合に段階的に移行

### 移行を検討すべきケース

以下のような場合に移行を検討する：

1. **テストの独立性が必要**:
   - E2Eテストが実DynamoDBに依存している
   - テストデータの管理が煩雑
   - テスト環境の準備が困難

2. **保守性の向上が必要**:
   - PK/SK構築ロジックが分散している
   - データアクセスコードの重複が多い
   - エラーハンドリングが不統一

3. **機能拡張を予定**:
   - 新しいエンティティの追加予定
   - 複雑なクエリパターンの追加
   - 他のデータストアへの移行可能性

### 移行の原則

- **段階的に移行**: 一度に全てを変更しない
- **既存機能を壊さない**: テストを保持しながら移行
- **並行運用期間を設ける**: 旧実装と新実装を併存させる

## 現状パターンの分類

既存の実装は、以下のいずれかのパターンに分類される：

### パターンA: 直接実装

DynamoDB APIを直接呼び出す実装。

**特徴**:
- Repository層がない
- ビジネスロジックとデータアクセスが混在
- PK/SK構築がコード内に散在

**該当サービス**: Auth（一部）

### パターンB: 抽象基底クラス使用

`AbstractDynamoDBRepository` を継承した実装。

**特徴**:
- Repository層が存在
- 基本CRUD操作は共通化
- PK/SK構築ロジックは各リポジトリ

**該当サービス**: Stock-Tracker

### パターンC: 軽量な直接実装

DynamoDB APIを軽量にラップした実装。

**特徴**:
- Repository層は存在しない
- シンプルなCRUD操作のみ
- 複雑なクエリはない

**該当サービス**: Codec-Converter

## マイグレーション戦略

### 戦略1: 段階的置き換え（推奨）

既存コードを段階的に新パターンに置き換える。

**適用ケース**:
- パターンBの実装（抽象基底クラス使用）
- 既にRepository層が存在
- テストコードが充実している

**利点**:
- リスクが低い
- 並行運用が可能
- 段階的に移行できる

**手順**:

```
1. 新パターンの実装（旧実装と併存）
   ↓
2. テストを新実装に切り替え
   ↓
3. ビジネスロジックを段階的に切り替え
   ↓
4. 旧実装の削除
```

### 戦略2: 完全書き直し

既存コードを捨てて、新パターンで一から実装する。

**適用ケース**:
- パターンAまたはCの実装
- Repository層が存在しない
- テストカバレッジが低い

**利点**:
- 最もクリーンな実装
- 設計を見直す機会
- 技術的負債を解消

**欠点**:
- 一時的に両実装が併存
- テストの書き直しが必要
- 移行期間が長くなる

### 戦略3: 部分的導入

新規エンティティのみ新パターンを採用。

**適用ケース**:
- 既存エンティティは安定稼働
- 新規エンティティ追加予定
- 段階的に移行したい

**利点**:
- リスクが最小
- 既存コードに影響しない
- 新規開発で恩恵を受ける

**欠点**:
- 2つのパターンが併存
- 統一性が一時的に失われる

## 段階的置き換えの詳細手順

### フェーズ1: 新パターンの実装

既存実装を残したまま、新パターンを実装する。

#### 1-1. Entity定義の作成

既存のデータ構造から、PK/SKを除外したEntityを定義。

```typescript
// 既存（例: holding.ts）
interface HoldingData {
  PK: string;              // 削除
  SK: string;              // 削除
  Type: string;            // 削除
  UserID: string;
  TickerID: string;
  Quantity: number;
  AveragePrice: number;
  CreatedAt: number;
  UpdatedAt: number;
}

// 新規（entities/holding.entity.ts）
export interface HoldingEntity {
  // PK/SK/Typeは含めない
  UserID: string;
  TickerID: string;
  Quantity: number;
  AveragePrice: number;
  CreatedAt: number;
  UpdatedAt: number;
}
```

#### 1-2. Mapper実装の作成

既存のPK/SK構築ロジックをMapperに移行。

```typescript
// 既存（holding.ts）
class HoldingRepository {
  private buildKeys(userId: string, tickerId: string) {
    return {
      PK: `USER#${userId}`,
      SK: `HOLDING#${tickerId}`,
    };
  }
}

// 新規（mappers/holding.mapper.ts）
export class HoldingMapper implements EntityMapper<HoldingEntity, HoldingKey> {
  buildKeys(key: HoldingKey): { pk: string; sk: string } {
    return {
      pk: `USER#${key.userId}`,
      sk: `HOLDING#${key.tickerId}`,
    };
  }
  
  toItem(entity: HoldingEntity): DynamoDBItem {
    // 変換ロジック
  }
  
  toEntity(item: DynamoDBItem): HoldingEntity {
    // 変換ロジック
  }
}
```

#### 1-3. Repository Interface定義

既存のメソッドシグネチャをベースに、Interface化。

```typescript
// 既存（holding.ts）
class HoldingRepository {
  async get(userId: string, tickerId: string): Promise<Holding | null> {
    // ...
  }
}

// 新規（repositories/holding.repository.interface.ts）
export interface HoldingRepository {
  getById(userId: string, tickerId: string): Promise<HoldingEntity | null>;
  // 他のメソッド
}
```

#### 1-4. DynamoDB実装とInMemory実装

既存ロジックをDynamoDB実装に移植し、InMemory実装を追加。

```typescript
// 新規（repositories/dynamodb-holding.repository.ts）
export class DynamoDBHoldingRepository implements HoldingRepository {
  // 既存ロジックをここに移植
}

// 新規（repositories/in-memory-holding.repository.ts）
export class InMemoryHoldingRepository implements HoldingRepository {
  // InMemory実装
}
```

#### チェックリスト

- [ ] Entity定義を作成（PK/SK除外）
- [ ] Mapperを実装（既存のPK/SK構築ロジックを移行）
- [ ] Repository Interfaceを定義
- [ ] DynamoDB実装を作成（既存ロジックを移植）
- [ ] InMemory実装を作成
- [ ] 既存実装はそのまま保持

### フェーズ2: テストの移行

新実装に対してテストを作成・移行する。

#### 2-1. Mapperテストの作成

変換ロジックを独立してテスト。

```typescript
describe('HoldingMapper', () => {
  it('EntityをDynamoDBItemに変換する', () => {
    const mapper = new HoldingMapper();
    const entity: HoldingEntity = { /* ... */ };
    const item = mapper.toItem(entity);
    
    expect(item.PK).toBe('USER#user-001');
    expect(item.SK).toBe('HOLDING#AAPL');
  });
});
```

#### 2-2. InMemory実装を使ったE2Eテスト

実DynamoDBを使わないE2Eテストを作成。

```typescript
describe('Holding Repository E2E', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryHoldingRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryHoldingRepository(store);
  });

  it('CRUDフローが動作する', async () => {
    // テストコード
  });
});
```

#### 2-3. 既存テストとの並行実行

既存テストを残したまま、新テストを追加。

```
tests/
├── unit/
│   ├── holding.test.ts              # 既存テスト（保持）
│   └── mappers/
│       └── holding.mapper.test.ts   # 新規テスト
└── e2e/
    ├── holding.e2e.test.ts          # 既存E2E（保持）
    └── holding.repository.e2e.test.ts  # 新規E2E（InMemory使用）
```

#### チェックリスト

- [ ] Mapperテストを作成
- [ ] InMemory実装のE2Eテストを作成
- [ ] 既存テストを保持
- [ ] 新旧テストが両方パスすることを確認

### フェーズ3: ビジネスロジックの切り替え

ビジネスロジック層を新Repository実装に切り替える。

#### 3-1. DI設定の準備

テスト環境と本番環境で実装を切り替える仕組みを用意。

```typescript
// lib/repository-factory.ts
export function createHoldingRepository(
  env: 'production' | 'test'
): HoldingRepository {
  if (env === 'test') {
    const store = new InMemorySingleTableStore();
    return new InMemoryHoldingRepository(store);
  } else {
    const docClient = createDocumentClient();
    const tableName = process.env.DYNAMODB_TABLE_NAME!;
    return new DynamoDBHoldingRepository(docClient, tableName);
  }
}
```

#### 3-2. ビジネスロジックの移行

既存のビジネスロジックを新Repositoryに切り替え。

```typescript
// 既存
import { HoldingRepository as OldRepository } from './repositories/holding';

// 新規
import type { HoldingRepository } from './repositories/holding.repository.interface';
import { createHoldingRepository } from './lib/repository-factory';

class HoldingService {
  constructor(private readonly repository: HoldingRepository) {}
  
  async getUserHoldings(userId: string) {
    return this.repository.getByUserId(userId);
  }
}

// 使用例
const repository = createHoldingRepository('production');
const service = new HoldingService(repository);
```

#### 3-3. 段階的な切り替え

全てのビジネスロジックを一度に切り替えず、段階的に移行。

**優先順位**:
1. 新規機能 → 新Repository使用
2. 変更頻度の高い機能 → 新Repository使用
3. 安定稼働中の機能 → 旧実装のまま（最後に移行）

#### チェックリスト

- [ ] Repository Factoryを実装
- [ ] 環境別に実装を切り替え可能
- [ ] 一部のビジネスロジックを新Repositoryに切り替え
- [ ] 既存機能が正常動作することを確認

### フェーズ4: 旧実装の削除

全てのビジネスロジックが新実装に切り替わったら、旧実装を削除。

#### 4-1. 旧実装の使用箇所確認

```bash
# 旧Repositoryのimportを検索
grep -r "from './repositories/holding'" services/*/core/src/
```

#### 4-2. 旧テストの削除

新テストが全て整備されたら、旧テストを削除。

```
tests/
├── unit/
│   ├── holding.test.ts              # 削除
│   └── mappers/
│       └── holding.mapper.test.ts   # 保持
└── e2e/
    ├── holding.e2e.test.ts          # 削除（実DynamoDB使用）
    └── holding.repository.e2e.test.ts  # 保持（InMemory使用）
```

#### 4-3. 旧実装ファイルの削除

```
repositories/
├── holding.ts                        # 削除
├── holding.repository.interface.ts   # 保持
├── dynamodb-holding.repository.ts    # 保持
└── in-memory-holding.repository.ts   # 保持
```

#### チェックリスト

- [ ] 旧実装の使用箇所がゼロ
- [ ] 旧テストを削除
- [ ] 旧実装ファイルを削除
- [ ] 全テストがパス

## パターン別マイグレーション例

### パターンA: 直接実装からの移行

**現状**:
```typescript
// services/auth/core/src/user-service.ts
class UserService {
  async getUser(userId: string) {
    const result = await dynamoDBClient.send(new GetCommand({
      TableName: 'Users',
      Key: {
        PK: `USER#${userId}`,
        SK: 'METADATA',
      },
    }));
    
    return result.Item;
  }
}
```

**移行後**:
```typescript
// services/auth/core/src/entities/user.entity.ts
export interface UserEntity {
  UserID: string;
  Email: string;
  CreatedAt: number;
}

// services/auth/core/src/repositories/user.repository.interface.ts
export interface UserRepository {
  getById(userId: string): Promise<UserEntity | null>;
}

// services/auth/core/src/user-service.ts
class UserService {
  constructor(private readonly userRepository: UserRepository) {}
  
  async getUser(userId: string) {
    return this.userRepository.getById(userId);
  }
}
```

### パターンB: 抽象基底クラスからの移行

**現状**:
```typescript
// services/stock-tracker/core/src/repositories/holding.ts
class HoldingRepository extends AbstractDynamoDBRepository<Holding> {
  protected buildKeys(userId: string, tickerId: string) {
    return {
      PK: `USER#${userId}`,
      SK: `HOLDING#${tickerId}`,
    };
  }
  
  async get(userId: string, tickerId: string): Promise<Holding | null> {
    const keys = this.buildKeys(userId, tickerId);
    return this.getItem(keys.PK, keys.SK);
  }
}
```

**移行後**:
```typescript
// mappers/holding.mapper.ts
export class HoldingMapper implements EntityMapper<HoldingEntity, HoldingKey> {
  buildKeys(key: HoldingKey): { pk: string; sk: string } {
    return {
      pk: `USER#${key.userId}`,
      sk: `HOLDING#${key.tickerId}`,
    };
  }
  // toItem, toEntity実装
}

// repositories/dynamodb-holding.repository.ts
export class DynamoDBHoldingRepository implements HoldingRepository {
  private readonly mapper = new HoldingMapper();
  
  async getById(userId: string, tickerId: string): Promise<HoldingEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });
    const result = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { PK: pk, SK: sk },
    }));
    
    if (!result.Item) return null;
    return this.mapper.toEntity(result.Item as DynamoDBItem);
  }
}
```

### パターンC: 軽量実装からの移行

**現状**:
```typescript
// services/codec-converter/core/src/job-repository.ts
class JobRepository {
  async updateJobStatus(jobId: string, status: string) {
    await dynamoDBClient.send(new UpdateCommand({
      TableName: 'Jobs',
      Key: { JobID: jobId },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'Status' },
      ExpressionAttributeValues: { ':status': status },
    }));
  }
}
```

**移行後**:
```typescript
// entities/job.entity.ts
export interface JobEntity {
  JobID: string;
  Status: string;
  CreatedAt: number;
  UpdatedAt: number;
}

// repositories/job.repository.interface.ts
export interface JobRepository {
  updateStatus(jobId: string, status: string): Promise<JobEntity>;
}

// repositories/dynamodb-job.repository.ts
export class DynamoDBJobRepository implements JobRepository {
  async updateStatus(jobId: string, status: string): Promise<JobEntity> {
    const result = await this.docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { PK: `JOB#${jobId}`, SK: 'METADATA' },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'Status',
        '#updatedAt': 'UpdatedAt',
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':updatedAt': Date.now(),
      },
      ReturnValues: 'ALL_NEW',
    }));
    
    return this.mapper.toEntity(result.Attributes as DynamoDBItem);
  }
}
```

## よくある課題と対処法

### 課題1: PK/SK構築ロジックが複雑

**状況**: 既存のPK/SK構築ロジックが複雑で、Mapperに移行しにくい。

**対処法**:
- 段階的にMapperに集約
- まずは単純なエンティティから移行
- 複雑なロジックは後回し

### 課題2: 既存テストが実DynamoDBに依存

**状況**: E2Eテストが実DynamoDBを前提としている。

**対処法**:
- 新規E2EテストをInMemory実装で作成
- 既存E2Eテストは並行運用
- 移行完了後に既存E2Eテストを削除

### 課題3: 複数エンティティの移行順序

**状況**: 複数エンティティが相互依存している。

**対処法**:
- 依存関係を可視化
- 依存の少ないエンティティから移行
- 必要に応じて一時的に両実装をサポート

### 課題4: 既存のAbstractDynamoDBRepositoryとの共存

**状況**: 既存の抽象基底クラスと新パターンをどう共存させるか。

**対処法**:
- 新規エンティティは新パターン
- 既存エンティティは段階的に移行
- `AbstractDynamoDBRepository` は非推奨化

## マイグレーション計画テンプレート

### 1. 現状分析

- [ ] 使用しているエンティティを列挙
- [ ] 各エンティティの実装パターンを分類
- [ ] テストカバレッジを確認
- [ ] 依存関係を可視化

### 2. 優先順位付け

| エンティティ | パターン | テストカバレッジ | 変更頻度 | 優先度 |
|------------|---------|----------------|---------|--------|
| Holding    | B       | 80%            | 高      | 1      |
| Ticker     | B       | 70%            | 中      | 2      |
| Alert      | B       | 60%            | 低      | 3      |

### 3. マイグレーションスケジュール

**Week 1-2**: Holding エンティティ
- [ ] 新パターンの実装
- [ ] テストの作成
- [ ] ビジネスロジックの切り替え
- [ ] 旧実装の削除

**Week 3-4**: Ticker エンティティ
- [ ] 新パターンの実装
- [ ] テストの作成
- [ ] ビジネスロジックの切り替え
- [ ] 旧実装の削除

**Week 5-6**: Alert エンティティ
- [ ] 新パターンの実装
- [ ] テストの作成
- [ ] ビジネスロジックの切り替え
- [ ] 旧実装の削除

### 4. リスク管理

| リスク                   | 影響度 | 発生確率 | 対策                          |
|------------------------|-------|---------|-------------------------------|
| 既存機能の動作不良        | 高    | 中      | 並行運用期間を設ける              |
| テストカバレッジの低下     | 中    | 低      | 移行前にテストを充実させる         |
| 開発期間の遅延           | 中    | 中      | 優先度を明確にし、段階的に進める   |

## まとめ

既存サービスのマイグレーションは、以下の原則に従う：

1. **必須ではない**: 動作している実装は無理に変更しない
2. **段階的に**: 一度に全てを変更せず、段階的に移行
3. **並行運用**: 旧実装と新実装を併存させる期間を設ける
4. **テストファースト**: テストを整備してから移行
5. **優先順位**: 変更頻度が高く、テストが充実しているものから

新規開発では積極的に新パターンを採用し、既存サービスは必要に応じて段階的に移行することで、リスクを最小化しながら恩恵を受けることができる。

## 関連ドキュメント

- [データアクセス層アーキテクチャ](./data-access-layer.md) - 設計思想と全体像
- [Repository実装ガイド](./implementing-repositories.md) - 新規実装の手順
- [テスト戦略](./testing.md) - テストガイドラインとカバレッジ要件
