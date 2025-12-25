# @nagiyu/browser

ブラウザAPI依存のユーティリティライブラリ。

## 概要

`@nagiyu/browser` は、ブラウザAPIを抽象化したユーティリティ関数を提供します。Clipboard API、LocalStorage などのブラウザ固有機能を、エラーハンドリングやSSR対応を含めた安全な形で利用できます。

## 特徴

- **統一されたエラーハンドリング**: ブラウザAPI呼び出しの失敗を適切に処理
- **SSR対応**: サーバーサイドレンダリング環境でも安全に動作
- **テスト容易性**: モック化しやすい設計
- **高いテストカバレッジ**: 97%以上のカバレッジ

## インストール

このライブラリはモノレポ内部で使用されます。`package.json` に以下を追加してください:

```json
{
  "dependencies": {
    "@nagiyu/browser": "workspace:*"
  }
}
```

## 使用方法

### Clipboard API

```typescript
import { clipboard } from '@nagiyu/browser';

// クリップボードに書き込む
try {
  await clipboard.writeText('コピーするテキスト');
  console.log('クリップボードにコピーしました');
} catch (error) {
  console.error('コピーに失敗しました', error);
}

// クリップボードから読み取る
try {
  const text = await clipboard.readText();
  console.log('クリップボードの内容:', text);
} catch (error) {
  console.error('読み取りに失敗しました', error);
}
```

### LocalStorage

```typescript
import { storage } from '@nagiyu/browser';

// 値を保存
storage.setItem('key', 'value');

// 値を取得
const value = storage.getItem('key'); // 'value' または null

// JSON形式で保存・取得
const data = { name: 'test', value: 123 };
storage.setItem('data', JSON.stringify(data));
const loaded = JSON.parse(storage.getItem('data') || '{}');

// 値を削除
storage.removeItem('key');

// 全て削除
storage.clear();
```

## API リファレンス

### clipboard

- `writeText(text: string): Promise<void>` - クリップボードにテキストを書き込む
- `readText(): Promise<string>` - クリップボードからテキストを読み取る

### storage

- `getItem(key: string): string | null` - LocalStorageから値を取得
- `setItem(key: string, value: string): void` - LocalStorageに値を保存
- `removeItem(key: string): void` - LocalStorageから値を削除
- `clear(): void` - LocalStorageの全ての値を削除

## 依存関係

- `@nagiyu/common`: 共通ユーティリティ

## 開発

### ビルド

```bash
npm run build --workspace=@nagiyu/browser
```

### テスト

```bash
# テスト実行
npm run test --workspace=@nagiyu/browser

# ウォッチモード
npm run test:watch --workspace=@nagiyu/browser

# カバレッジレポート（80%以上必須）
npm run test:coverage --workspace=@nagiyu/browser
```

### Lint & Format

```bash
# Lint
npm run lint --workspace=@nagiyu/browser

# Format
npm run format --workspace=@nagiyu/browser

# Format Check
npm run format:check --workspace=@nagiyu/browser
```

## バージョン

現在のバージョン: **1.0.0**

## ライセンス

本プロジェクトは、MIT LicenseまたはApache License 2.0のデュアルライセンスです。
