# @nagiyu/common

完全フレームワーク非依存の共通ユーティリティライブラリ

## 概要

`@nagiyu/common` は、Nagiyu Platform 上の全サービスで共有される、フレームワークに依存しない汎用ユーティリティと型定義を提供する予定のライブラリです。外部依存を持たず、純粋な TypeScript/JavaScript として実装されます。

**注**: 現在は Phase 1 完了段階で、パッケージ構造とビルド環境のみが整備されており、具体的なユーティリティや型定義はまだ実装されていません。

## バージョン

**現在のバージョン**: 1.0.0

## インストール

このライブラリはモノレポ内での使用を想定しており、サービスの `package.json` で参照します。

```json
{
  "dependencies": {
    "@nagiyu/common": "workspace:*"
  }
}
```

## 依存関係

### External Dependencies

なし（Node.js 標準ライブラリのみ使用可能）

### Internal Dependencies

なし（完全独立）

## 現在の実装状況

**Phase 1 完了**: パッケージ構造とビルド環境が整備されました。

現在、このライブラリには具体的な実装はありませんが、将来的に以下のような汎用ユーティリティが追加される予定です。

## 将来の実装予定

### 型定義

共通で使用される型定義を提供予定:

- レスポンス型（API レスポンスの標準型）
- エラー型（エラーハンドリングの標準型）
- ページネーション型
- その他の共通型定義

### ユーティリティ関数

以下のような汎用ユーティリティ関数を提供予定:

- **データ変換**: オブジェクトの変換、配列操作
- **バリデーション**: 入力値の検証、型ガード関数
- **文字列操作**: フォーマット、パース、サニタイズ
- **日付操作**: フォーマット、パース、計算
- **数値操作**: フォーマット、計算、丸め処理

### 設計原則

すべての実装は以下の原則に従います:

1. **純粋関数**: 副作用を持たない
2. **型安全**: 厳密な TypeScript 型定義
3. **テスト容易**: 高いテストカバレッジ（80%以上）
4. **外部依存なし**: Node.js 標準ライブラリのみ使用
5. **ドキュメント**: すべての関数に JSDoc コメント

## 使用例（将来）

```typescript
// 型定義の使用
import type { ApiResponse, PaginationParams } from '@nagiyu/common';

interface UserData {
  id: string;
  name: string;
}

const response: ApiResponse<UserData> = {
  success: true,
  data: { id: '1', name: 'John' },
};

// ユーティリティ関数の使用（予定）
import { formatDate, validateEmail } from '@nagiyu/common';

const formattedDate = formatDate(new Date(), 'YYYY-MM-DD');
const isValid = validateEmail('user@example.com');
```

## 開発

### ビルド

```bash
npm run build
```

### テスト

```bash
# 全テストを実行
npm test

# ウォッチモードで実行
npm run test:watch

# カバレッジを取得
npm run test:coverage
```

### リント・フォーマット

```bash
# リント実行
npm run lint

# フォーマット実行
npm run format

# フォーマットチェック
npm run format:check
```

## 設計方針

### 依存関係ルール

- 外部パッケージへの依存は原則禁止
- Node.js 標準ライブラリのみ使用可能
- 他のライブラリ（`@nagiyu/ui`, `@nagiyu/browser`）からは参照可能
- 逆方向の依存は禁止（このライブラリは他のライブラリを参照しない）

### 実装ガイドライン

#### 純粋関数として実装

```typescript
// ✅ 推奨: 純粋関数
export function add(a: number, b: number): number {
  return a + b;
}

// ❌ 非推奨: 副作用を持つ
let total = 0;
export function addToTotal(value: number): void {
  total += value; // グローバル状態を変更
}
```

#### 型安全性の確保

```typescript
// ✅ 推奨: 厳密な型定義
export function formatCurrency(amount: number, currency: 'JPY' | 'USD'): string {
  // 実装...
}

// ❌ 非推奨: 型定義が緩い
export function formatCurrency(amount: any, currency: string): any {
  // 実装...
}
```

#### テストの記述

すべての関数に対して単体テストを記述し、80%以上のカバレッジを維持します。

```typescript
// tests/unit/utils.test.ts
import { add } from '../../src/utils';

describe('add', () => {
  it('should add two numbers correctly', () => {
    expect(add(1, 2)).toBe(3);
  });

  it('should handle negative numbers', () => {
    expect(add(-1, -2)).toBe(-3);
  });
});
```

## 貢献ガイドライン

新しいユーティリティを追加する場合:

1. **必要性の確認**: 複数のサービスで使用される汎用的な機能か確認
2. **既存機能との重複確認**: 既に同様の機能がないか確認
3. **設計レビュー**: ドキュメントに設計を記載し、レビューを受ける
4. **実装**: 設計に従って実装
5. **テスト**: 80%以上のカバレッジを達成
6. **ドキュメント**: JSDoc コメントと README の更新

## ライセンス

このライブラリは Nagiyu Platform プロジェクトの一部であり、プロジェクトのライセンスに従います。

## 関連ドキュメント

- [共通ライブラリ設計](../../development/shared-libraries.md)
- [サービステンプレート](../../development/service-template.md)
- [アーキテクチャ方針](../../development/architecture.md)
