# @nagiyu/aws

AWS SDK 補助・拡張ライブラリ

## 概要

`@nagiyu/aws` は、AWS SDK を使用する際の共通機能を提供するライブラリです。
現在は DynamoDB Repository 用の共通エラークラスを提供しています。

## インストール

このパッケージは `nagiyu-platform` モノレポ内で管理されています。

```json
{
  "dependencies": {
    "@nagiyu/aws": "workspace:*"
  }
}
```

### 必要な依存関係

このパッケージは AWS SDK をピア依存関係として必要とします：

```json
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0"
  }
}
```

## 使用方法

### DynamoDB 共通エラークラス

DynamoDB リポジトリで使用する共通のエラークラスを提供します。

```typescript
import {
  RepositoryError,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  DatabaseError,
} from '@nagiyu/aws/dynamodb';

// エンティティが見つからない場合
throw new EntityNotFoundError('Alert', 'alert-123');
// => Error: エンティティが見つかりません: Alert=alert-123

// エンティティが既に存在する場合
throw new EntityAlreadyExistsError('User', 'user-456');
// => Error: エンティティは既に存在します: User=user-456

// エンティティデータが無効な場合
throw new InvalidEntityDataError('priceは正の数である必要があります');
// => Error: エンティティデータが無効です: priceは正の数である必要があります

// データベースエラーが発生した場合
try {
  // DynamoDB操作
} catch (error) {
  throw new DatabaseError('アイテムの取得に失敗しました', error);
}
```

### エラークラスの継承関係

```
Error
  └── RepositoryError (基底クラス)
        ├── EntityNotFoundError
        ├── EntityAlreadyExistsError
        ├── InvalidEntityDataError
        └── DatabaseError
```

## パッケージ構成

```
libs/aws/
├── package.json          # パッケージ設定
├── tsconfig.json         # TypeScript設定
├── src/
│   ├── index.ts          # メインエントリーポイント
│   ├── types.ts          # 共通型定義
│   └── dynamodb/
│       ├── index.ts      # DynamoDBサブパスエクスポート
│       └── errors.ts     # DynamoDB共通エラークラス
└── README.md
```

## サブパスエクスポート

このパッケージは以下のサブパスをエクスポートします：

- `@nagiyu/aws` - メインエントリーポイント（現在は型定義のみ）
- `@nagiyu/aws/dynamodb` - DynamoDB関連の機能

## 開発

### ビルド

```bash
npm run build
```

### リント

```bash
npm run lint
```

### フォーマット

```bash
npm run format
```

## 参考

- [共通ライブラリ設計](../../docs/development/shared-libraries.md)
- [共通設定ファイル](../../docs/development/configs.md)
- Stock Tracker 実装: `services/stock-tracker/core/src/repositories/alert.ts`
