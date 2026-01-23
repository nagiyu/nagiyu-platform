# アーキテクチャ方針

## 目的

本ドキュメントは、サービス設計における基本的なアーキテクチャ方針と推奨パターンを定義する。

## レイヤー分離の原則

### サービス固有パッケージの分離

サービスは以下のパッケージに分離することで、責務を明確化する：

- **core**: ビジネスロジック層
    - フレームワーク非依存のビジネスロジック
    - 純粋関数として実装
    - Unit Test 必須
    - 相対パスで import（path alias 使用不可）
- **web**: プレゼンテーション層
    - Next.js + React による UI 実装
    - E2E Test 主体
    - path alias（`@/`）使用可能
- **batch**: バッチ処理層
    - 定期実行やイベント駆動の処理
    - Lambda などでの実行を想定
    - Unit Test 必須

### 基本方針

- **UI層とビジネスロジックの分離**: プレゼンテーション（`web/`）とビジネスロジック（`core/`）を明確に分離
- **core/ 配下の構成は自由**: サービスの特性に応じて最適な構成を選択

### 依存関係の原則

```
web   → core → libs/common
      → libs/ui → libs/browser → libs/common

batch → core → libs/common
```

- **web** と **batch** は **core** に依存可能
- **core** は UI に依存しない（web, libs/ui への依存禁止）
- **core** は相対パスで import（path alias 不使用）

### 分離の利点

- ユニットテストの容易性（ビジネスロジックを独立してテスト可能）
- コンポーネントの再利用性向上
- 責務の明確化
- バッチ処理の追加が容易

## 推奨アーキテクチャパターン

### Parser/Formatter パターン

入力データの変換処理を行うサービスに適用。

#### 構成

- **Parser**: 入力データのバリデーション＋構造化
- **Formatter**: 構造化データ＋設定 → 出力データ

#### 適用ケース

- テキスト変換ツール
- データフォーマット変換
- 入力の正規化が必要な処理

#### 設計のポイント

- エラーメッセージは定数化して管理
- Parser と Formatter は純粋関数として実装
- 中間データ構造を型定義

### Repository パターン

データアクセス層の抽象化を行うパターン。データソース（DynamoDB、RDS等）への依存を分離する。

#### 適用ケース

- DynamoDB を使用するサービス
- データアクセスロジックが複雑化しているケース
- 複数のサービスで同じデータモデルを共有するケース

#### 基本構成

```
core/
├── repositories/        # データアクセス層
│   ├── user.ts         # UserRepository
│   └── watchlist.ts    # WatchlistRepository
├── services/           # ビジネスロジック層（オプション）
│   └── user-service.ts
└── types/              # 型定義
    └── entities.ts
```

#### 実装方法

`@nagiyu/aws` パッケージの `AbstractDynamoDBRepository` を継承して実装する。

```typescript
import {
    AbstractDynamoDBRepository,
    type DynamoDBItem,
    validateStringField,
    validateTimestampField,
} from '@nagiyu/aws';

class UserRepository extends AbstractDynamoDBRepository<User, { userId: string }> {
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
            createdAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
            updatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
        };
    }

    protected mapToItem(entity: Omit<User, 'createdAt' | 'updatedAt'>): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
        const keys = this.buildKeys({ userId: entity.userId });
        return {
            ...keys,
            Type: this.config.entityType,
            UserId: entity.userId,
            Name: entity.name,
        };
    }
}
```

#### メリット

- **テスト容易性**: リポジトリをモック化してビジネスロジックを単体テスト可能
- **データソースの抽象化**: データベースの変更がビジネスロジックに影響しない
- **一貫性**: データアクセスのパターンを統一
- **保守性**: データアクセスロジックが一箇所に集約

#### 参考

詳細は以下のドキュメントを参照：
- [Repository Pattern 設計ガイド](./repository-pattern.md)
- [Repository Pattern 移行ガイド](./repository-migration.md)
- 実装例: `services/stock-tracker/core/src/repositories/`

### Service パターン

複雑なビジネスロジックのカプセル化を行うパターン。

#### 適用ケース

- 複数のリポジトリを組み合わせる処理
- トランザクション制御が必要な処理
- 外部APIとの連携を含む処理

### Hook パターン

React固有のロジックの再利用を行うパターン。

#### 適用ケース

- 複数のコンポーネントで共通するState管理
- 副作用を伴う処理の共通化

## State Management

### 基本方針

- **React Hooks**: useStateやuseReducerで管理
- **localStorage**: 永続化が必要な設定値
- **外部ライブラリは慎重に**: 必要性を十分検討してから導入

### localStorage の扱い

- SSR対応: useEffect内でアクセス
- エラーハンドリング: プライベートモードやクォータ超過に対応
- 共通ライブラリのラッパーを利用

## コーディング規約

### TypeScript

- **strict mode 必須**: 厳格な型チェックを有効化
- **型定義の配置**: `types/` ディレクトリに集約
- **デフォルト値とセット**: 型定義と一緒にデフォルト値を定義

### エラーハンドリング

- **日本語メッセージ**: ユーザー向けエラーは日本語で
- **定数化**: エラーメッセージは定数オブジェクトで管理
- **ユーザーフレンドリー**: 技術的な詳細より対処方法を優先

### コードフォーマット

- **Prettier**: モノレポ全体で統一設定を使用
- **ESLint**: Next.js公式設定をベースに拡張

## ブラウザ API の扱い

### ラッパー化の推奨

以下のAPIは共通ライブラリのラッパーを使用：

- Clipboard API
- localStorage / sessionStorage
- その他ブラウザ固有API

### 理由

- エラーハンドリングの統一
- テストの容易性
- ブラウザ互換性の吸収

## 共通ライブラリの活用

### 依存関係の原則

- `libs/ui/`: Next.js + Material-UI 依存
- `libs/browser/`: ブラウザAPI依存
- `libs/common/`: 完全フレームワーク非依存

詳細は [shared-libraries.md](./shared-libraries.md) を参照。

## パフォーマンス

### 基本方針

- **過度な最適化は避ける**: 必要になってから対応
- **測定してから最適化**: 推測ではなく計測に基づく
- **スマホファースト**: モバイル環境での動作を優先

### 推奨事項

- 画像の最適化（Next.js Image コンポーネント）
- 不要な再レンダリングの削減（React.memo、useMemo）
- バンドルサイズの監視

## セキュリティ

### 基本原則

- **入力のバリデーション**: すべての外部入力を検証
- **XSS対策**: Reactのデフォルト挙動を信頼、dangerouslySetInnerHTMLは避ける
- **環境変数の管理**: 秘密情報はビルド時変数に含めない

## 参考

- [rules.md](./rules.md): コーディング規約・べからず集
- [service-template.md](./service-template.md): サービステンプレート
- [testing.md](./testing.md): テスト戦略
- [shared-libraries.md](./shared-libraries.md): 共通ライブラリ設計
