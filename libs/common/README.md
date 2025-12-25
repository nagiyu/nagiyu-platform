# @nagiyu/common

完全フレームワーク非依存の汎用ユーティリティライブラリ。

## 概要

`@nagiyu/common` は、プラットフォーム全体で利用可能な共通の型定義とユーティリティ関数を提供します。このライブラリは、外部依存を持たず、純粋なTypeScript/JavaScriptで実装されています。

## 特徴

- **完全フレームワーク非依存**: Node.js標準ライブラリのみを使用
- **純粋関数**: 副作用のないテストしやすい実装
- **高いテストカバレッジ**: 品質を保証するための十分なテスト

## インストール

このライブラリはモノレポ内部で使用されます。`package.json` に以下を追加してください:

```json
{
  "dependencies": {
    "@nagiyu/common": "workspace:*"
  }
}
```

## 使用方法

```typescript
import { /* 関数名 */ } from '@nagiyu/common';

// 利用例
// （将来的に汎用ユーティリティが追加される予定）
```

## 依存関係

- **依存なし**: このライブラリは外部依存を持ちません

## 開発

### ビルド

```bash
npm run build --workspace=@nagiyu/common
```

### テスト

```bash
# テスト実行
npm run test --workspace=@nagiyu/common

# ウォッチモード
npm run test:watch --workspace=@nagiyu/common

# カバレッジレポート
npm run test:coverage --workspace=@nagiyu/common
```

### Lint & Format

```bash
# Lint
npm run lint --workspace=@nagiyu/common

# Format
npm run format --workspace=@nagiyu/common

# Format Check
npm run format:check --workspace=@nagiyu/common
```

## バージョン

現在のバージョン: **1.0.0**

## ライセンス

本プロジェクトは、MIT LicenseまたはApache License 2.0のデュアルライセンスです。
