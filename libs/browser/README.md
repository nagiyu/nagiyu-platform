# @nagiyu/browser

ブラウザAPI依存のユーティリティライブラリ

## 概要

`@nagiyu/browser` は、ブラウザAPIに依存するユーティリティ関数を提供する共通ライブラリです。
クリップボード操作、localStorage操作など、ブラウザ固有のAPIをラップし、エラーハンドリングとSSR対応を提供します。

## 特徴

- **エラーハンドリング**: ブラウザAPIのエラーを適切に処理
- **SSR対応**: サーバーサイドレンダリング環境での安全な動作
- **TypeScript**: 完全な型サポート
- **テスト済み**: 80%以上のコードカバレッジ

## インストール

このライブラリはモノレポ内のワークスペースとして管理されています。

```json
{
  "dependencies": {
    "@nagiyu/browser": "workspace:*"
  }
}
```

## 使用方法

### 基本的なインポート

将来的に追加されるユーティリティは以下のようにインポート可能になります：

```typescript
// 例: Clipboard APIラッパー（Phase 2で実装予定）
import { clipboard } from '@nagiyu/browser';

// 例: localStorage ラッパー（Phase 2で実装予定）
import { storage } from '@nagiyu/browser';
```

## 依存関係

- `@nagiyu/common`: 共通ユーティリティライブラリ

## 開発

### ビルド

```bash
npm run build
```

### テスト

```bash
# 全テスト実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジレポート
npm run test:coverage
```

### リント & フォーマット

```bash
# リント実行
npm run lint

# フォーマット実行
npm run format

# フォーマットチェック
npm run format:check
```

## 技術スタック

- TypeScript 5.x
- Jest (テストフレームワーク)
- jsdom (ブラウザ環境のモック)

## ライセンス

このプロジェクトは MIT と Apache 2.0 のデュアルライセンスです。
