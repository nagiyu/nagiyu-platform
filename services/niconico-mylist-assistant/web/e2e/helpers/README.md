# E2E テストヘルパー

このディレクトリには、E2E テスト用のヘルパー関数が含まれています。

## test-data.ts

インメモリ DB を使用したテスト環境でのデータ管理機能を提供します。

### clearTestData()

テストデータをクリアします。

**使用例:**

```typescript
import { test } from '@playwright/test';
import { clearTestData } from './helpers/test-data';

test.beforeEach(async () => {
  // テスト間のデータ独立性を保証
  await clearTestData();
});
```

### seedTestData(data?)

テストデータをシードします（将来の拡張用）。

**使用例:**

```typescript
import { test } from '@playwright/test';
import { clearTestData, seedTestData } from './helpers/test-data';

test.beforeEach(async () => {
  await clearTestData();
  // 将来的に初期データが必要な場合
  await seedTestData({
    videos: [
      { videoId: 'sm9', title: 'Test Video 1' },
    ],
  });
});
```

## 環境変数

E2E テスト実行時、以下の環境変数が自動的に設定されます（`playwright.config.ts` で設定）:

- `USE_IN_MEMORY_DB=true`: インメモリ DB を使用
- `SKIP_AUTH_CHECK=true`: 認証チェックをスキップ、固定ユーザーID（test-user-001）を使用

## テスト作成のベストプラクティス

1. **テスト間のデータ独立性**: 必ず `beforeEach` で `clearTestData()` を呼び出す
2. **API経由でのデータ投入**: 共通のシードデータではなく、各テストで必要なデータをAPI経由で投入する
3. **固定ユーザーID**: テストユーザーIDは `test-user-001` として統一される

## 注意事項

- これらのヘルパー関数はE2Eテスト専用です
- 本番環境では使用しないでください
- `@nagiyu/aws` パッケージの `InMemorySingleTableStore` に依存しています
