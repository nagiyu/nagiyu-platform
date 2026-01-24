# Validation Module

プラットフォーム全体で使用できる共通バリデーション機能を提供します。

## 概要

このモジュールは、`@nagiyu/common` パッケージの一部として、フレームワーク非依存の汎用バリデーション機能を提供します。

## 型定義

### ValidationResult

バリデーション結果を表す型です。

```typescript
type ValidationResult = {
  valid: boolean;
  errors?: string[];
};
```

**使用例:**

```typescript
// バリデーション成功
const result1: ValidationResult = { valid: true };

// バリデーション失敗
const result2: ValidationResult = {
  valid: false,
  errors: ['ユーザー名は必須です', 'メールアドレスの形式が不正です'],
};
```

## ヘルパー関数

### isNonEmptyString

文字列が空でないかチェックします（trim後の長さをチェック）。

```typescript
function isNonEmptyString(value: string): boolean;
```

**使用例:**

```typescript
import { isNonEmptyString } from '@nagiyu/common/validation';

isNonEmptyString('test'); // true
isNonEmptyString('  test  '); // true
isNonEmptyString(''); // false
isNonEmptyString('   '); // false
isNonEmptyString('\t\n'); // false
```

### isValidNumber

数値が指定された範囲内かチェックします。NaN と Infinity は拒否されます。

```typescript
function isValidNumber(value: number, min: number, max: number): boolean;
```

**パラメータ:**

- `value` - チェックする数値
- `min` - 最小値（含む）
- `max` - 最大値（含む）

**使用例:**

```typescript
import { isValidNumber } from '@nagiyu/common/validation';

// 価格のバリデーション
isValidNumber(100, 0.01, 1_000_000); // true
isValidNumber(0, 0.01, 1_000_000); // false
isValidNumber(1_000_001, 0.01, 1_000_000); // false

// 数量のバリデーション
isValidNumber(10, 0.0001, 1_000_000_000); // true

// NaN, Infinity を拒否
isValidNumber(NaN, 0, 100); // false
isValidNumber(Infinity, 0, 100); // false
```

### isValidTimestamp

Unix タイムスタンプが有効かチェックします。

- 負の値と 0 を拒否
- 現在時刻 + 1 日以降を拒否

```typescript
function isValidTimestamp(timestamp: number): boolean;
```

**パラメータ:**

- `timestamp` - Unix タイムスタンプ (ミリ秒)

**使用例:**

```typescript
import { isValidTimestamp } from '@nagiyu/common/validation';

const now = Date.now();

isValidTimestamp(now); // true
isValidTimestamp(now - 86400000); // true (1日前)
isValidTimestamp(now + 43200000); // true (12時間後)
isValidTimestamp(0); // false
isValidTimestamp(-1); // false
isValidTimestamp(now + 86400001); // false (1日 + 1ミリ秒後)
```

## サービスでの統合方法

### 基本的な使い方

```typescript
import { ValidationResult, isNonEmptyString, isValidNumber } from '@nagiyu/common/validation';

/**
 * ユーザー名のバリデーション
 */
function validateUsername(username: string): ValidationResult {
  if (!isNonEmptyString(username)) {
    return { valid: false, errors: ['ユーザー名は必須です'] };
  }

  if (username.length > 50) {
    return { valid: false, errors: ['ユーザー名は50文字以内で入力してください'] };
  }

  return { valid: true };
}

/**
 * 価格のバリデーション
 */
function validatePrice(price: number): ValidationResult {
  if (!isValidNumber(price, 0.01, 1_000_000)) {
    return { valid: false, errors: ['価格は0.01〜1,000,000の範囲で入力してください'] };
  }

  return { valid: true };
}
```

### 複数フィールドのバリデーション

```typescript
import { ValidationResult, isNonEmptyString, isValidNumber } from '@nagiyu/common/validation';

type Product = {
  name: string;
  price: number;
  quantity: number;
};

function validateProduct(data: unknown): ValidationResult {
  const errors: string[] = [];

  // null/undefined チェック
  if (data === null || data === undefined) {
    return { valid: false, errors: ['データが指定されていません'] };
  }

  // 型チェック
  if (typeof data !== 'object') {
    return { valid: false, errors: ['データが不正です'] };
  }

  const d = data as Partial<Product>;

  // name
  if (!d.name || !isNonEmptyString(d.name)) {
    errors.push('商品名は必須です');
  }

  // price
  if (d.price === undefined || d.price === null) {
    errors.push('価格は必須です');
  } else if (!isValidNumber(d.price, 0.01, 1_000_000)) {
    errors.push('価格は0.01〜1,000,000の範囲で入力してください');
  }

  // quantity
  if (d.quantity === undefined || d.quantity === null) {
    errors.push('数量は必須です');
  } else if (!isValidNumber(d.quantity, 1, 1_000_000)) {
    errors.push('数量は1〜1,000,000の範囲で入力してください');
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
```

### API Route での使用

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validateProduct } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    // リクエストボディの取得
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'リクエストボディが不正です',
        },
        { status: 400 }
      );
    }

    // バリデーション
    const validationResult = validateProduct(body);
    if (!validationResult.valid) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: validationResult.errors?.[0] || 'バリデーションエラー',
        },
        { status: 400 }
      );
    }

    // バリデーション成功後の処理
    // ...
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: '処理に失敗しました',
      },
      { status: 500 }
    );
  }
}
```

## Stock Tracker との互換性

このライブラリは Stock Tracker のバリデーション実装を汎化したものです。

### 対応関係

| Stock Tracker                 | @nagiyu/common                   | 変更点                                 |
| ----------------------------- | -------------------------------- | -------------------------------------- |
| `isValidPrice(price)`         | `isValidNumber(price, 0.01, 1M)` | 範囲を引数で指定可能に汎化             |
| `isValidQuantity(quantity)`   | `isValidNumber(qty, 0.0001, 1B)` | 範囲を引数で指定可能に汎化             |
| `isNonEmptyString(value)`     | `isNonEmptyString(value)`        | 互換性あり（そのまま使用可能）         |
| `isValidTimestamp(timestamp)` | `isValidTimestamp(timestamp)`    | 互換性あり（そのまま使用可能）         |
| `ValidationResult`            | `ValidationResult`               | 型定義も互換性あり（そのまま使用可能） |

### Stock Tracker からの移行例

**移行前（Stock Tracker）:**

```typescript
import { isValidPrice, isValidQuantity } from '@stock-tracker/core/validation/helpers';

if (!isValidPrice(price)) {
  errors.push('価格が無効です');
}

if (!isValidQuantity(quantity)) {
  errors.push('数量が無効です');
}
```

**移行後（@nagiyu/common）:**

```typescript
import { isValidNumber } from '@nagiyu/common/validation';

if (!isValidNumber(price, 0.01, 1_000_000)) {
  errors.push('価格が無効です');
}

if (!isValidNumber(quantity, 0.0001, 1_000_000_000)) {
  errors.push('数量が無効です');
}
```

## 設計原則

- **外部依存なし**: 純粋な TypeScript のみで実装
- **純粋関数**: 副作用なし、同じ入力には同じ出力を返す
- **型安全**: strict mode に準拠
- **テスト可能**: 高いテストカバレッジ（80%以上）

## 参考

- [バリデーション設計](../../../../docs/development/validation.md) - 設計方針とパターン
- [コーディング規約](../../../../docs/development/rules.md) - コーディング規約
- Stock Tracker 実装: `services/stock-tracker/core/src/validation/`
