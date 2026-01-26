# @nagiyu/data-access

データアクセス層の共通ライブラリ。DynamoDB 抽象化レイヤーとインメモリ実装を提供します。

## 概要

このライブラリは、DynamoDB を使用する各サービスにおいて、テスト環境ではインメモリ実装を使用できるようにするための抽象化レイヤーを提供します。

## 主要コンポーネント

### インターフェース

- **RepositoryConfig**: DynamoDB テーブル設定
- **PaginationOptions / PaginatedResult**: ページネーション
- **EntityMapper**: Entity ↔ DynamoDB Item 変換インターフェース
- **DynamoDBItem**: Single Table Design の基本構造

### エラークラス

- **RepositoryError**: 基底エラークラス
- **EntityNotFoundError**: エンティティが見つからない場合
- **EntityAlreadyExistsError**: エンティティが既に存在する場合
- **InvalidEntityDataError**: エンティティデータが無効な場合
- **DatabaseError**: データベース操作でエラーが発生した場合

### InMemorySingleTableStore

Single Table Design を再現するインメモリストア。テスト環境で使用します。

**主な機能**:
- 基本操作: `get`, `put`, `delete` (条件付き操作対応)
- クエリ操作: `query`, `queryByAttribute`, `scan`
- ページネーション: 不透明トークン (Base64エンコード)
- GSI シミュレーション: 全件スキャン + フィルタ

## インストール

このライブラリはモノレポの一部として使用されます。

```json
{
  "dependencies": {
    "@nagiyu/data-access": "workspace:*"
  }
}
```

## 使用例

```typescript
import {
  InMemorySingleTableStore,
  EntityNotFoundError,
  type DynamoDBItem,
  type PaginatedResult,
} from '@nagiyu/data-access';

// ストアの初期化
const store = new InMemorySingleTableStore();

// アイテムの保存
const item: DynamoDBItem = {
  PK: 'USER#123',
  SK: 'PROFILE',
  Type: 'User',
  CreatedAt: Date.now(),
  UpdatedAt: Date.now(),
  Name: 'Test User',
};
store.put(item);

// アイテムの取得
const result = store.get('USER#123', 'PROFILE');

// クエリ操作
const results = store.query({ pk: 'USER#123' });

// ページネーション
const firstPage = store.query({ pk: 'USER#123' }, { limit: 10 });
const secondPage = store.query(
  { pk: 'USER#123' },
  { limit: 10, cursor: firstPage.nextCursor }
);

// 条件付き保存（既存アイテムがある場合はエラー）
try {
  store.put(item, { attributeNotExists: true });
} catch (error) {
  if (error instanceof EntityAlreadyExistsError) {
    console.error('アイテムは既に存在します');
  }
}
```

## テスト

```bash
# テスト実行
npm test

# カバレッジ確認
npm run test:coverage

# ウォッチモード
npm run test:watch
```

## ビルド

```bash
npm run build
```

## リント

```bash
npm run lint
```

## ライセンス

Apache License 2.0 / MIT License
