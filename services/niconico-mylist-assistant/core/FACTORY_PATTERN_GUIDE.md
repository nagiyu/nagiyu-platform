# Factory Pattern 使用ガイド

## 概要

Issue 4.5-3 で実装された Factory Pattern により、環境変数 `USE_IN_MEMORY_DB` を使用して Repository の実装を切り替えることができます。

## 使用方法

### 1. DynamoDB 実装の使用（本番環境）

```typescript
import { createVideoRepository, createUserSettingRepository } from '@nagiyu/niconico-mylist-assistant-core';
import { docClient, TABLE_NAME } from './client';

// DynamoDB 実装を取得
const videoRepo = createVideoRepository(docClient, TABLE_NAME);
const userSettingRepo = createUserSettingRepository(docClient, TABLE_NAME);
```

### 2. InMemory 実装の使用（テスト環境）

```typescript
import { createVideoRepository, createUserSettingRepository } from '@nagiyu/niconico-mylist-assistant-core';

// 環境変数を設定
process.env.USE_IN_MEMORY_DB = 'true';

// InMemory 実装を取得（docClient と tableName は不要）
const videoRepo = createVideoRepository();
const userSettingRepo = createUserSettingRepository();
```

### 3. 共通ストアの管理

InMemory 実装では、Video と UserSetting で同じ `InMemorySingleTableStore` を共有します。

```typescript
import { getInMemoryStore, clearInMemoryStore } from '@nagiyu/niconico-mylist-assistant-core';

// 共通ストアを取得
const store = getInMemoryStore();

// テスト後にストアをクリア
clearInMemoryStore();
```

## E2E テストでの使用例

### playwright.config.ts

```typescript
export default defineConfig({
  use: {
    // InMemory DB を使用
    env: {
      USE_IN_MEMORY_DB: 'true',
    },
  },
});
```

### テストファイル

```typescript
import { test, expect } from '@playwright/test';
import { clearInMemoryStore } from '@nagiyu/niconico-mylist-assistant-core';

test.beforeEach(async () => {
  // 各テスト前にストアをクリア
  clearInMemoryStore();
});

test('動画一覧が表示される', async ({ page }) => {
  // テストデータの準備
  // ...
  
  // テスト実行
  await page.goto('/videos');
  await expect(page.locator('.video-card')).toBeVisible();
});
```

## アーキテクチャ

```
[ビジネスロジック層]
         ↓
  createVideoRepository()  ← Factory (環境変数で切り替え)
         ↓
    ┌────┴────┐
    ↓         ↓
[DynamoDB   [InMemory
 Repository] Repository]
    ↓         ↓
[Mapper]    [Mapper]      ← 同じMapperを使用
    ↓         ↓
[DocumentClient] [SingleTableStore]  ← Video/UserSettingで共有
```

## 利点

1. **テスト独立性**: 実 DynamoDB に依存せずテストが可能
2. **テスト高速化**: インメモリ実行により高速
3. **Single Table Design の再現**: 共通ストアにより本番と同じ構造
4. **後方互換性**: 既存の API は変更なし

## 制約事項

- InMemory 実装では全件をメモリに保持するため、大量データには不向き
- テストデータは少量を想定（数百件程度まで）
- 本番環境では必ず DynamoDB 実装を使用すること

## 関連ドキュメント

- [データアクセス層アーキテクチャ](../../../../docs/development/data-access-layer.md)
- [テスト戦略](../../../../docs/development/testing.md)
