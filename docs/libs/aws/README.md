# @nagiyu/aws

## 概要

`@nagiyu/aws` は、AWS SDK を使用する際の共通機能を提供するライブラリです。
AWS SDK依存の処理を抽象化し、サービス間で再利用可能なパターンを提供します。

---

## 設計原則

- **AWS SDK抽象化**: AWS SDKの低レベルAPIを共通パターンで抽象化
- **エラーハンドリング統一**: 日本語エラーメッセージの定数化と階層的エラー設計
- **型安全**: TypeScriptの厳格な型チェック
- **高いテストカバレッジ**: 80%以上を維持

---

## 提供機能

### DynamoDB Repository 共通エラークラス

DynamoDBリポジトリで使用する階層的なエラークラスを提供します。

```
Error
  └── RepositoryError (基底クラス)
        ├── EntityNotFoundError
        ├── EntityAlreadyExistsError
        ├── InvalidEntityDataError
        └── DatabaseError
```

---

## 利用方法

### インストール

monorepo内のワークスペースとして利用します。

```json
{
  "dependencies": {
    "@nagiyu/aws": "workspace:*"
  }
}
```

### 使用例

```typescript
import {
  EntityNotFoundError,
  DatabaseError,
} from '@nagiyu/aws';

// エンティティが見つからない場合
throw new EntityNotFoundError('Alert', 'alert-123');
// => Error: エンティティが見つかりません: Alert=alert-123

// データベースエラーが発生した場合
try {
  // DynamoDB操作
} catch (error) {
  throw new DatabaseError('アイテムの取得に失敗しました', error);
}
```

---

## 開発

### ビルド

```bash
npm run build --workspace @nagiyu/aws
```

### テスト

```bash
npm test --workspace @nagiyu/aws
```

### リント・フォーマット

```bash
npm run lint --workspace @nagiyu/aws
npm run format --workspace @nagiyu/aws
```

---

## 依存関係ルール

このライブラリは依存関係階層で `@nagiyu/common` に依存します：

```
libs/ui → libs/browser → libs/common
libs/aws → libs/common
```

- `@nagiyu/aws` は `@nagiyu/common` に依存する
- 他のライブラリは必要に応じて `@nagiyu/aws` に依存可能
- 循環依存は厳格に禁止

---

## 今後の拡張

現在はDynamoDB用のエラークラスのみを提供していますが、今後以下の機能を追加予定：

- S3操作の共通パターン
- Lambda呼び出しヘルパー
- その他AWS SDK抽象化ユーティリティ

新しい機能は、サービスから共通パターンとして抽出された際に追加されます。

---

## 関連ドキュメント

- [共通ライブラリ設計](../../development/shared-libraries.md) - ライブラリ全体の設計方針
- [プラットフォームドキュメント](../../README.md) - プラットフォーム全体のドキュメント
