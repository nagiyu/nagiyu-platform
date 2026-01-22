# @nagiyu/aws

## 概要

`@nagiyu/aws` は、AWS SDK を使用する際の共通機能を提供するライブラリです。
AWS SDK依存の処理を抽象化し、サービス間で再利用可能なパターンを提供します。

---

## 基本情報

- **パッケージ名**: `@nagiyu/aws`
- **バージョン**: 1.0.0
- **配置場所**: `libs/aws/`
- **外部依存**: `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`

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

#### エラークラス階層

```
Error
  └── RepositoryError (基底クラス)
        ├── EntityNotFoundError
        ├── EntityAlreadyExistsError
        ├── InvalidEntityDataError
        └── DatabaseError
```

#### エラークラス一覧

| クラス名 | 用途 |
|---------|------|
| `RepositoryError` | リポジトリエラーの基底クラス |
| `EntityNotFoundError` | エンティティが見つからない場合 |
| `EntityAlreadyExistsError` | エンティティが既に存在する場合 |
| `InvalidEntityDataError` | エンティティデータが無効な場合 |
| `DatabaseError` | データベース操作でエラーが発生した場合 |

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

### インポートと使用例

```typescript
import {
  RepositoryError,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  DatabaseError,
} from '@nagiyu/aws';

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

---

## ディレクトリ構成

```
libs/aws/
├── src/                    # ソースコード
│   ├── index.ts           # メインエクスポートファイル
│   ├── types.ts           # 共通型定義
│   └── dynamodb/          # DynamoDB関連機能
│       ├── index.ts       # DynamoDBエクスポート
│       └── errors.ts      # エラークラス定義
├── tests/                  # テストファイル（今後追加予定）
├── dist/                   # ビルド出力（自動生成）
├── package.json           # パッケージ設定
├── tsconfig.json          # TypeScript設定
├── jest.config.ts         # Jest設定（今後追加予定）
└── eslint.config.mjs      # ESLint設定
```

---

## 開発

### ビルド

```bash
npm run build
```

### テスト

```bash
# 全テスト実行（今後追加予定）
npm test

# watchモード
npm run test:watch

# カバレッジ付き実行
npm run test:coverage
```

### リント・フォーマット

```bash
# リント実行
npm run lint

# コード整形
npm run format

# 整形チェック
npm run format:check
```

---

## 実装ルール

### パスエイリアス禁止

ライブラリ内部では相対パスのみを使用してください。パスエイリアス（`@/...`など）は、ライブラリの配布時の一貫性を保つため使用禁止です。

```typescript
// ❌ パスエイリアスは使用しない
import { something } from "@/dynamodb/errors";

// ✅ 相対パスを使用
import { something } from "./dynamodb/errors";
```

---

## 依存関係ルール

このライブラリは依存関係階層では独立した位置にあります：

```
libs/ui → libs/browser → libs/common
libs/aws （独立）
```

- `libs/aws` は他のlibsに依存しない
- 他のライブラリは必要に応じて `libs/aws` に依存可能
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
