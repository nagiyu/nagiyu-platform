# @nagiyu/common

## 概要

`@nagiyu/common` は、Nagiyuプラットフォーム全体で利用できる完全フレームワーク非依存の共通ライブラリパッケージです。
外部依存を持たず、純粋なTypeScriptユーティリティと型定義を提供します。

---

## 基本情報

- **パッケージ名**: `@nagiyu/common`
- **バージョン**: 1.0.0
- **配置場所**: `libs/common/`
- **外部依存**: なし（Node.js標準ライブラリのみ）

---

## 設計原則

- **ゼロ依存**: 外部依存なし（Node.js標準ライブラリのみ）
- **フレームワーク非依存**: どのフレームワーク（Next.js、React、Vueなど）でも利用可能
- **純粋関数**: すべてのユーティリティは純粋関数として実装
- **型安全**: TypeScriptの厳格な型チェック
- **高いテストカバレッジ**: 80%以上を維持

---

## 利用方法

### インストール

monorepo内のワークスペースとして利用します。

```json
{
  "dependencies": {
    "@nagiyu/common": "workspace:*"
  }
}
```

### インポート

```typescript
// 将来的にユーティリティが追加された際の使用例
import {} from /* utilities */ "@nagiyu/common";
```

---

## ディレクトリ構成

```
libs/common/
├── src/                    # ソースコード
│   └── index.ts           # メインエクスポートファイル
├── tests/                  # テストファイル
│   └── unit/              # ユニットテスト
├── dist/                   # ビルド出力（自動生成）
├── package.json           # パッケージ設定
├── tsconfig.json          # TypeScript設定
├── jest.config.ts         # Jest設定
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
# 全テスト実行
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
import { something } from "@/utils/helper";

// ✅ 相対パスを使用
import { something } from "../utils/helper";
```

---

## 依存関係ルール

このライブラリは依存関係階層の最下位に位置します：

```
libs/ui → libs/browser → libs/common
```

- `libs/common` は他のlibsに依存しない
- 他のライブラリは `libs/common` に依存可能
- 循環依存は厳格に禁止

---

## 機能

現在、以下の機能を提供（または提供予定）：

- **ロギング機能** (実装予定): 構造化ログ出力、ログレベル管理

## 今後の拡張

現在このパッケージは、将来の共通ユーティリティのための基盤として機能します：

- 共通型定義
- データ変換ユーティリティ
- バリデーションヘルパー
- 純粋関数のユーティリティ

新しいユーティリティは、サービスから抽出されるか、共通パターンとして識別された際に追加されます。

---

## 関連ドキュメント

- [共通ライブラリ設計](../../development/shared-libraries.md) - ライブラリ全体の設計方針
- [プラットフォームドキュメント](../../README.md) - プラットフォーム全体のドキュメント
