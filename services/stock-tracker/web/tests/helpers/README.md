# テストヘルパー

このディレクトリには、E2E テストで使用するヘルパー関数が含まれています。

## cleanup.ts

インメモリリポジトリのクリーンアップヘルパー。

### 概要

E2E テスト実行時に `USE_IN_MEMORY_REPOSITORY=true` が設定されている場合、全てのリポジトリ（Alert, Holding, Ticker, Exchange, Watchlist）はインメモリ実装を使用します。

テスト間でデータが干渉しないようにするため、各テストの実行後にインメモリストアをクリアする必要があります。

### 使用方法

#### 基本的な使い方

```typescript
import { test } from '@playwright/test';
import { cleanupRepositories } from '../helpers/cleanup';

test.describe('テストスイート', () => {
  test.afterEach(async () => {
    // テスト実行後にリポジトリをクリーンアップ
    await cleanupRepositories();
  });

  test('テストケース', async ({ page }) => {
    // テストロジック
  });
});
```

#### TestDataFactory と組み合わせる場合

TestDataFactory は API 経由でデータを削除しますが、インメモリストアのクリーンアップも必要です：

```typescript
import { test } from '@playwright/test';
import { TestDataFactory } from './utils/test-data-factory';
import { cleanupRepositories } from '../helpers/cleanup';

test.describe('テストスイート', () => {
  let factory: TestDataFactory;

  test.beforeEach(async ({ request }) => {
    factory = new TestDataFactory(request);
    // テストデータ作成
    await factory.createTicker();
  });

  test.afterEach(async () => {
    // 1. TestDataFactory でAPI経由のデータ削除
    await factory.cleanup();
    // 2. インメモリストアのクリーンアップ
    await cleanupRepositories();
  });

  test('テストケース', async ({ page }) => {
    // テストロジック
  });
});
```

### 注意事項

- **環境に応じた動作**: この関数は環境変数に関係なく常に `clearMemoryStore()` を呼び出します
  - `USE_IN_MEMORY_REPOSITORY=true` の場合: インメモリストアとリポジトリインスタンスがリセットされます
  - DynamoDB モードの場合: リポジトリインスタンスのみがリセットされます（実際のデータは影響を受けません）
- **シングルトンのリセット**: リポジトリインスタンスとメモリストア（存在する場合）の両方がリセットされます
- **テスト分離**: 複数のテストが並列実行される場合でも、各テスト後にクリーンアップすることでデータの干渉を防ぎます

### 対象リポジトリ

以下のリポジトリ種別に対応:

- Alert Repository
- Holding Repository
- Ticker Repository
- Exchange Repository
- Watchlist Repository

### 実装詳細

この関数は内部的に `repository-factory.ts` の `clearMemoryStore()` を呼び出し、以下を実行します：

1. `InMemorySingleTableStore` のシングルトンインスタンスをクリア
2. 全リポジトリのシングルトンインスタンスをクリア

次回リポジトリが要求されると、新しいインスタンスが作成されます。

## 関連ドキュメント

- [テスト戦略](../../../docs/services/stock-tracker/testing.md)
- [Repository Factory](../../lib/repository-factory.ts)
- [タスクドキュメント](../../../../../tasks/stock-tracker-e2e-in-memory-repository.md)
