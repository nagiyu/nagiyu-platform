# InMemory リポジトリを使ったテストガイド

## 概要

本ドキュメントは、DynamoDB Abstraction Layer で提供される InMemory リポジトリを使用したテストの書き方を解説します。

InMemory 実装により、実 DynamoDB を使わずにテストを実行できるため、以下のメリットが得られます：

- **テストの独立性**: 外部環境に影響されないテストデータ管理
- **実行速度の向上**: インメモリでの高速な CRUD 操作
- **再現性の確保**: テスト実行ごとに初期状態からスタート
- **並列実行の安全性**: 各テストが独立したストアを使用

## 設計思想

### なぜ InMemory 実装が必要なのか

従来の DynamoDB を使ったテストでは以下の課題がありました：

1. **外部依存**: 実 DynamoDB または LocalStack が必要
2. **データ汚染**: テスト間でデータが残り、結果に影響を与える
3. **実行速度**: ネットワーク通信によるオーバーヘッド
4. **セットアップコスト**: テーブル作成やテストデータ投入の手間

InMemory 実装は、これらの課題を解決し、開発者がビジネスロジックのテストに集中できる環境を提供します。

### DI（Dependency Injection）による実装切り替え

Repository パターンと DI を組み合わせることで、本番環境とテスト環境で異なる実装を使い分けます：

- **本番環境**: DynamoDB リポジトリを使用
- **テスト環境**: InMemory リポジトリを使用

この設計により、ビジネスロジックのコードを変更せずに、データアクセス層だけを差し替えることができます。

## 基本的な使い方

### 1. テストファイルのセットアップ

#### ユニットテスト

ユニットテストでは、リポジトリ単体の動作を検証します。

```typescript
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryHoldingRepository } from '../src/repositories/in-memory-holding.repository.js';

describe('HoldingRepository', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryHoldingRepository;

  beforeEach(() => {
    // 各テストケースで新しいストアとリポジトリを作成
    store = new InMemorySingleTableStore();
    repository = new InMemoryHoldingRepository(store);
  });

  it('保有株式を作成できる', async () => {
    const input = {
      UserID: 'user-123',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Quantity: 100,
      AveragePrice: 150.0,
      Currency: 'USD',
    };

    const result = await repository.create(input);

    expect(result).toMatchObject(input);
    expect(result.CreatedAt).toBeDefined();
  });
});
```

#### E2E テスト

E2E テストでは、複数のリポジトリを組み合わせた統合的な動作を検証します。

```typescript
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryHoldingRepository } from '../src/repositories/in-memory-holding.repository.js';

describe('保有株式管理フロー E2E', () => {
  let store: InMemorySingleTableStore;
  let holdingRepo: InMemoryHoldingRepository;

  beforeEach(() => {
    // 共通のストアを使用（Single Table Design をシミュレート）
    store = new InMemorySingleTableStore();
    holdingRepo = new InMemoryHoldingRepository(store);
  });

  it('保有株式を作成、取得、更新、削除できる', async () => {
    // 作成
    const created = await holdingRepo.create({
      UserID: 'user-123',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Quantity: 100,
      AveragePrice: 150.0,
      Currency: 'USD',
    });

    // 取得
    const retrieved = await holdingRepo.getById('user-123', 'NSDQ:AAPL');
    expect(retrieved).toEqual(created);

    // 更新
    const updated = await holdingRepo.update('user-123', 'NSDQ:AAPL', {
      Quantity: 150,
    });
    expect(updated.Quantity).toBe(150);

    // 削除
    await holdingRepo.delete('user-123', 'NSDQ:AAPL');
    const afterDelete = await holdingRepo.getById('user-123', 'NSDQ:AAPL');
    expect(afterDelete).toBeNull();
  });
});
```

### 2. InMemorySingleTableStore の特徴

#### Single Table Design のシミュレーション

InMemorySingleTableStore は、DynamoDB の Single Table Design を再現します。

- 全データを PK/SK で管理
- GSI（Global Secondary Index）のシミュレーション
- ページネーション対応

#### 複数リポジトリでの共有

実 DynamoDB と同じように、複数のリポジトリが同じストアを共有できます。

```typescript
describe('複数リポジトリの統合', () => {
  let store: InMemorySingleTableStore;
  let holdingRepo: InMemoryHoldingRepository;
  let tickerRepo: InMemoryTickerRepository;

  beforeEach(() => {
    // 同じストアを共有
    store = new InMemorySingleTableStore();
    holdingRepo = new InMemoryHoldingRepository(store);
    tickerRepo = new InMemoryTickerRepository(store);
  });

  it('保有株式とティッカー情報を関連付けて管理できる', async () => {
    // ティッカー情報を作成
    await tickerRepo.create({
      TickerID: 'NSDQ:AAPL',
      Name: 'Apple Inc.',
      ExchangeID: 'NASDAQ',
    });

    // 保有株式を作成
    await holdingRepo.create({
      UserID: 'user-123',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Quantity: 100,
      AveragePrice: 150.0,
      Currency: 'USD',
    });

    // 両方のデータが同じストアに存在することを確認
    const ticker = await tickerRepo.getById('NSDQ:AAPL');
    const holding = await holdingRepo.getById('user-123', 'NSDQ:AAPL');

    expect(ticker).not.toBeNull();
    expect(holding).not.toBeNull();
    expect(holding?.TickerID).toBe(ticker?.TickerID);
  });
});
```

## テストパターン

### パターン 1: 基本的な CRUD テスト

作成、取得、更新、削除の基本操作を検証します。

```typescript
describe('基本的な CRUD 操作', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryHoldingRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryHoldingRepository(store);
  });

  it('作成したデータを取得できる', async () => {
    const input = {
      UserID: 'user-123',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Quantity: 100,
      AveragePrice: 150.0,
      Currency: 'USD',
    };

    const created = await repository.create(input);
    const retrieved = await repository.getById('user-123', 'NSDQ:AAPL');

    expect(retrieved).toEqual(created);
  });
});
```

### パターン 2: エラーケースのテスト

エラーハンドリングが正しく動作することを検証します。

```typescript
describe('エラーハンドリング', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryHoldingRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryHoldingRepository(store);
  });

  it('存在しないデータの取得は null を返す', async () => {
    const result = await repository.getById('non-existent', 'non-existent');
    expect(result).toBeNull();
  });

  it('重複作成時にエラーをスローする', async () => {
    const input = {
      UserID: 'user-123',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Quantity: 100,
      AveragePrice: 150.0,
      Currency: 'USD',
    };

    await repository.create(input);
    await expect(repository.create(input)).rejects.toThrow();
  });

  it('存在しないデータの更新時にエラーをスローする', async () => {
    await expect(
      repository.update('non-existent', 'non-existent', { Quantity: 100 })
    ).rejects.toThrow();
  });
});
```

### パターン 3: ページネーションのテスト

クエリ操作とページネーションを検証します。

```typescript
describe('ページネーション', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryHoldingRepository;

  beforeEach(async () => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryHoldingRepository(store);

    // テストデータを作成（10件）
    for (let i = 1; i <= 10; i++) {
      await repository.create({
        UserID: 'user-123',
        TickerID: `TICKER-${i}`,
        ExchangeID: 'NASDAQ',
        Quantity: i * 10,
        AveragePrice: i * 100,
        Currency: 'USD',
      });
    }
  });

  it('limit 指定で取得件数を制限できる', async () => {
    const result = await repository.getByUserId('user-123', { limit: 5 });

    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeDefined();
    expect(result.count).toBe(10); // 総件数
  });

  it('cursor を使用して次のページを取得できる', async () => {
    const firstPage = await repository.getByUserId('user-123', { limit: 5 });
    const secondPage = await repository.getByUserId('user-123', {
      limit: 5,
      cursor: firstPage.nextCursor,
    });

    expect(firstPage.items).toHaveLength(5);
    expect(secondPage.items).toHaveLength(5);
    expect(secondPage.nextCursor).toBeUndefined();

    // ページ間でデータが重複していないことを確認
    const firstIds = firstPage.items.map((h) => h.TickerID);
    const secondIds = secondPage.items.map((h) => h.TickerID);
    const intersection = firstIds.filter((id) => secondIds.includes(id));
    expect(intersection).toHaveLength(0);
  });
});
```

### パターン 4: 複数リポジトリの統合テスト

複数のリポジトリが同じストアを共有するシナリオを検証します。

```typescript
describe('複数リポジトリの統合', () => {
  let store: InMemorySingleTableStore;
  let repo1: InMemoryHoldingRepository;
  let repo2: InMemoryHoldingRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repo1 = new InMemoryHoldingRepository(store);
    repo2 = new InMemoryHoldingRepository(store);
  });

  it('repo1 で作成したデータを repo2 で取得できる', async () => {
    await repo1.create({
      UserID: 'user-123',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Quantity: 100,
      AveragePrice: 150.0,
      Currency: 'USD',
    });

    const retrieved = await repo2.getById('user-123', 'NSDQ:AAPL');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.Quantity).toBe(100);
  });

  it('repo2 で更新したデータを repo1 で取得できる', async () => {
    await repo1.create({
      UserID: 'user-123',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Quantity: 100,
      AveragePrice: 150.0,
      Currency: 'USD',
    });

    await repo2.update('user-123', 'NSDQ:AAPL', { Quantity: 150 });

    const updated = await repo1.getById('user-123', 'NSDQ:AAPL');
    expect(updated?.Quantity).toBe(150);
  });
});
```

## 本番環境との切り替え

### 手動 DI パターン

テスト環境と本番環境で異なる実装を注入します。

```typescript
// テスト環境
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryHoldingRepository } from './repositories/in-memory-holding.repository.js';

const store = new InMemorySingleTableStore();
const holdingRepo = new InMemoryHoldingRepository(store);

// 本番環境
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBHoldingRepository } from './repositories/dynamodb-holding.repository.js';

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);
const holdingRepo = new DynamoDBHoldingRepository(docClient, 'StockTrackerTable');
```

### ファクトリーパターン

環境変数に応じて適切な実装を生成するファクトリーを作成します。

```typescript
// シングルトンパターンでストアを管理（テスト環境での共有ストア）
let sharedStore: InMemorySingleTableStore | null = null;

function getOrCreateSharedStore(): InMemorySingleTableStore {
  if (!sharedStore) {
    sharedStore = new InMemorySingleTableStore();
  }
  return sharedStore;
}

export function createHoldingRepository(): HoldingRepository {
  if (process.env.NODE_ENV === 'test') {
    // テスト環境では共有ストアを使用（Single Table Designを再現）
    const store = getOrCreateSharedStore();
    return new InMemoryHoldingRepository(store);
  } else {
    // 本番環境ではDynamoDBを使用
    const client = new DynamoDBClient({ region: process.env.AWS_REGION });
    const docClient = DynamoDBDocumentClient.from(client);
    return new DynamoDBHoldingRepository(docClient, process.env.TABLE_NAME!);
  }
}

// テスト間でストアをリセットする関数（テストのbeforeEachで使用）
export function resetSharedStore(): void {
  sharedStore = null;
}
```

**注意**: ファクトリーパターンを使用する場合、複数のリポジトリが同じストアを共有する必要があります。上記の例では、シングルトンパターンでストアを管理し、全てのリポジトリが同じストアインスタンスを使用します。

## ベストプラクティス

### 1. テストごとにストアをリセット

各テストケースで `beforeEach` を使用して新しいストアを作成し、テスト間の独立性を保ちます。

```typescript
beforeEach(() => {
  store = new InMemorySingleTableStore();
  repository = new InMemoryHoldingRepository(store);
});
```

### 2. テストデータは最小限に

テストの意図が明確になるよう、必要最小限のテストデータを使用します。

```typescript
// ❌ 良くない例: 不要なフィールドが多い
const input = {
  UserID: 'user-123',
  TickerID: 'NSDQ:AAPL',
  ExchangeID: 'NASDAQ',
  Quantity: 100,
  AveragePrice: 150.0,
  Currency: 'USD',
  Note: 'Some note',
  Tags: ['tech', 'growth'],
  // ... 他にも多数のフィールド
};

// ✅ 良い例: テストに必要なフィールドのみ
const input = {
  UserID: 'user-123',
  TickerID: 'NSDQ:AAPL',
  ExchangeID: 'NASDAQ',
  Quantity: 100,
  AveragePrice: 150.0,
  Currency: 'USD',
};
```

### 3. アサーションは明確に

期待値と実際の値を明確に比較します。

```typescript
// ❌ 良くない例: 曖昧なアサーション
expect(result).toBeTruthy();

// ✅ 良い例: 具体的なアサーション
expect(result).toMatchObject(input);
expect(result.CreatedAt).toBeDefined();
expect(result.UpdatedAt).toBeDefined();
```

### 4. エラーメッセージを検証

エラーケースでは、エラータイプだけでなくメッセージも検証します。

```typescript
// ❌ 良くない例: エラータイプのみ
await expect(repository.create(input)).rejects.toThrow();

// ✅ 良い例: エラーメッセージも検証
await expect(repository.create(input)).rejects.toThrow('は既に存在します');
```

### 5. テストケース名は日本語で明確に

テストケース名は、何を検証しているか一目でわかるようにします。

```typescript
// ❌ 良くない例: 曖昧な名前
it('test create', async () => {});

// ✅ 良い例: 明確な名前
it('保有株式を作成できる', async () => {});
it('重複作成時にEntityAlreadyExistsErrorをスローする', async () => {});
```

## よくある質問

### Q1: InMemory 実装と DynamoDB 実装でテスト結果が異なる場合は？

A: これは設計上の問題です。Mapper やリポジトリの実装を見直し、両実装で同じ動作になるよう修正してください。InMemory 実装は DynamoDB の動作を忠実に再現することを目指しています。

### Q2: ページネーションのカーソルはどのように扱うべきか？

A: カーソルは不透明なトークン（JSON 文字列）として扱います。テストではカーソルの内容を解析せず、`nextCursor` が存在するかどうかのみを検証します。

```typescript
expect(result.nextCursor).toBeDefined(); // OK
expect(result.nextCursor).toContain('index'); // NG: カーソルの内容を検証しない
```

### Q3: 複数のリポジトリで同じストアを共有する必要があるのはなぜ？

A: Single Table Design では、複数のエンティティタイプが同じテーブルに格納されます。InMemory 実装でも同じ動作を再現するため、複数のリポジトリが同じストアを共有する必要があります。

### Q4: テストデータの初期化はどこで行うべきか？

A: ユニットテストでは `beforeEach` で初期化します。E2E テストでは、テストケースごとに必要なデータを作成するのが望ましいです。

```typescript
describe('E2E テスト', () => {
  beforeEach(() => {
    // ストアとリポジトリの初期化のみ
    store = new InMemorySingleTableStore();
    repository = new InMemoryHoldingRepository(store);
  });

  it('複雑なシナリオのテスト', async () => {
    // テストケースごとに必要なデータを作成
    await repository.create({ ... });
    await repository.create({ ... });

    // テストロジック
  });
});
```

## まとめ

InMemory リポジトリを使用することで、外部依存なしに高速で信頼性の高いテストを実装できます。

重要なポイント：

1. **各テストで新しいストアを作成**: テスト間の独立性を保つ
2. **DI パターンで実装を切り替え**: テスト環境と本番環境で異なる実装を使用
3. **複数リポジトリで同じストアを共有**: Single Table Design をシミュレート
4. **エラーケースもしっかりテスト**: 本番環境と同じエラーハンドリングを検証

この設計により、開発者はビジネスロジックのテストに集中でき、外部環境のセットアップや管理に時間を取られることがなくなります。
