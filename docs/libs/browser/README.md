# @nagiyu/browser

ブラウザ API 依存の共通ユーティリティライブラリ

## 概要

`@nagiyu/browser` は、Nagiyu Platform 上の全サービスで共有されるブラウザ API ラッパーを提供します。エラーハンドリングの統一、SSR 対応、テスト容易性を考慮して設計されています。

## バージョン

**現在のバージョン**: 1.0.0

## インストール

このライブラリはモノレポ内での使用を想定しており、サービスの `package.json` で参照します。

```json
{
  "dependencies": {
    "@nagiyu/browser": "workspace:*"
  }
}
```

## 依存関係

### Internal Dependencies

- `@nagiyu/common` - フレームワーク非依存の共通ライブラリ

### External Dependencies

なし（ブラウザ標準 API のみ使用）

## 提供される機能

### Clipboard API

クリップボードの読み書きを行うユーティリティ。

#### `readFromClipboard()`

クリップボードからテキストを読み取ります。

**戻り値**: `Promise<string>` - クリップボードのテキスト内容

**エラー**: 
- Clipboard API がサポートされていない場合
- ユーザーが権限を拒否した場合
- その他のエラーが発生した場合

エラー時には日本語のエラーメッセージをスローします。

#### 使用例

```typescript
import { readFromClipboard } from '@nagiyu/browser';

async function handlePaste() {
  try {
    const text = await readFromClipboard();
    console.log('Clipboard content:', text);
  } catch (error) {
    // エラーメッセージ: "クリップボードの読み取りに失敗しました。手動で貼り付けてください。"
    alert(error.message);
  }
}
```

#### `writeToClipboard(text: string)`

テキストをクリップボードに書き込みます。

**パラメータ**:
- `text` (string): クリップボードに書き込むテキスト

**戻り値**: `Promise<void>`

**エラー**: 
- Clipboard API がサポートされていない場合
- ユーザーが権限を拒否した場合
- その他のエラーが発生した場合

エラー時には日本語のエラーメッセージをスローします。

#### 使用例

```typescript
import { writeToClipboard } from '@nagiyu/browser';

async function handleCopy(text: string) {
  try {
    await writeToClipboard(text);
    console.log('Text copied to clipboard');
  } catch (error) {
    // エラーメッセージ: "クリップボードへの書き込みに失敗しました。"
    alert(error.message);
  }
}
```

### localStorage API

localStorage の読み書きを行うユーティリティ。SSR 対応とエラーハンドリングを提供。

#### `getItem<T>(key: string)`

localStorage からアイテムを取得します。

**パラメータ**:
- `key` (string): 取得するキー

**戻り値**: `T | null` - 保存された値、または存在しない場合は `null`

**特徴**:
- 自動で JSON パースを試行（失敗した場合は文字列として返す）
- SSR 環境では `null` を返す（エラーをスローしない）
- localStorage が利用できない環境でも安全に動作

#### 使用例

```typescript
import { getItem } from '@nagiyu/browser';

// 文字列の取得
const userName = getItem<string>('userName');

// オブジェクトの取得
interface Settings {
  theme: string;
  language: string;
}
const settings = getItem<Settings>('settings');

if (settings) {
  console.log('Theme:', settings.theme);
}
```

#### `setItem<T>(key: string, value: T)`

localStorage にアイテムを保存します。

**パラメータ**:
- `key` (string): 保存するキー
- `value` (T): 保存する値（オブジェクトの場合は自動で JSON 文字列化）

**戻り値**: `void`

**エラー**:
- ストレージ容量超過時: "ストレージの容量が不足しています。不要なデータを削除してください。"
- その他のエラー: "データの保存に失敗しました。"

**特徴**:
- オブジェクトを自動で JSON 文字列化
- SSR 環境では警告を出力するが、エラーをスローしない
- ストレージ容量超過を適切にハンドリング

#### 使用例

```typescript
import { setItem } from '@nagiyu/browser';

// 文字列の保存
setItem('userName', 'John');

// オブジェクトの保存
setItem('settings', {
  theme: 'dark',
  language: 'ja'
});

// エラーハンドリング
try {
  setItem('largeData', veryLargeObject);
} catch (error) {
  console.error('Storage failed:', error.message);
}
```

#### `removeItem(key: string)`

localStorage からアイテムを削除します。

**パラメータ**:
- `key` (string): 削除するキー

**戻り値**: `void`

**エラー**:
- 削除失敗時: "データの削除に失敗しました。"

**特徴**:
- SSR 環境では警告を出力するが、エラーをスローしない

#### 使用例

```typescript
import { removeItem } from '@nagiyu/browser';

// アイテムを削除
removeItem('userName');

// エラーハンドリング
try {
  removeItem('settings');
} catch (error) {
  console.error('Remove failed:', error.message);
}
```

## 設計方針

### SSR 対応

すべてのユーティリティは SSR (Server-Side Rendering) 環境で安全に動作します。

- `localStorage` API: SSR 環境では警告を出力し、操作は無視
- `clipboard` API: ブラウザ環境でのみ動作

### エラーハンドリング

- すべての API で一貫したエラーハンドリング
- エラーメッセージは日本語で提供
- ユーザーフレンドリーなエラーメッセージ

### テスト容易性

- すべての関数はモック化が容易
- ブラウザ API への依存を明確に分離

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

## トラブルシューティング

### "Clipboard API is not supported" エラー

- HTTPS 環境で実行していることを確認してください
- localhost では HTTP でも動作します
- ユーザーが Clipboard API の権限を許可しているか確認してください

### localStorage が動作しない

- ブラウザのプライベートモードでは localStorage が無効な場合があります
- SSR 環境では localStorage は利用できません（`useEffect` 内で使用してください）

## ライセンス

このライブラリは Nagiyu Platform プロジェクトの一部であり、プロジェクトのライセンスに従います。

## 関連ドキュメント

- [共通ライブラリ設計](../../docs/development/shared-libraries.md)
- [サービステンプレート](../../docs/development/service-template.md)
- [アーキテクチャ方針](../../docs/development/architecture.md)
