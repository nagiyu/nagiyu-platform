# バリデーション設計

## 目的

本ドキュメントは、プラットフォーム全体で統一されたバリデーション戦略を定義する。

### バリデーション標準化の目的

- **一貫性の確保**: 全サービスで統一されたバリデーションパターンを使用
- **型安全性の向上**: TypeScript の型システムを活用した安全なバリデーション
- **保守性の向上**: エラーメッセージの一元管理と再利用性
- **テスト容易性**: 純粋関数として実装することでユニットテストが容易

### 一貫性の重要性

- ユーザーへの一貫したエラーメッセージ提供
- コードレビューの効率化
- 新規メンバーのオンボーディング容易化
- バグの早期発見と修正

---

## 基本方針

### ValidationResult型の使用

全てのバリデーション関数は `ValidationResult` 型を返す。

```typescript
export type ValidationResult = {
    /** バリデーション成功フラグ */
    valid: boolean;
    /** エラーメッセージ配列（valid が false の場合のみ） */
    errors?: string[];
};
```

### エラーメッセージの日本語化

**MUST**: ユーザー向けエラーメッセージは日本語で記述する ([rules.md](./rules.md) 参照)。

```typescript
// ❌ NG
const ERROR_MESSAGES = {
    REQUIRED: 'Field is required',
};

// ✅ OK
const ERROR_MESSAGES = {
    REQUIRED: 'フィールドは必須です',
};
```

### コア層での管理

**MUST**: バリデーションロジックはサービスの `core` パッケージで管理する ([shared-libraries.md](./shared-libraries.md) 参照)。

```
services/{service}/
├── core/
│   └── src/
│       └── validation/
│           ├── index.ts      # バリデーション関数
│           └── helpers.ts    # 汎用ヘルパー関数
├── web/
│   └── app/
│       └── api/
│           └── **/route.ts   # API Route でバリデーションを使用
```

**理由**: ビジネスロジックはフレームワーク非依存にするため。

### 純粋関数としての実装

**SHOULD**: バリデーション関数は純粋関数として実装する ([rules.md](./rules.md) 参照)。

```typescript
// ✅ OK: 純粋関数
export function validateUser(user: unknown): ValidationResult {
    // 同じ入力に対して常に同じ出力を返す
    // 外部状態を変更しない
}
```

**理由**: テストの容易性、予測可能性、デバッグのしやすさ。

---

## ValidationResult型

### 型定義

```typescript
/**
 * バリデーション結果
 */
export type ValidationResult = {
    /** バリデーション成功フラグ */
    valid: boolean;
    /** エラーメッセージ配列（valid が false の場合のみ） */
    errors?: string[];
};
```

### 使用例

```typescript
// バリデーション成功
const result1: ValidationResult = { valid: true };

// バリデーション失敗
const result2: ValidationResult = {
    valid: false,
    errors: ['ユーザー名は必須です', 'メールアドレスの形式が不正です'],
};
```

### 設計上の考慮点

#### シンプルな構造

- `valid` フラグで成功/失敗を明確に判定
- `errors` 配列で複数のエラーメッセージを返却可能
- 追加の情報が必要な場合は拡張可能

#### TypeScript型ガードとの互換性

```typescript
function processUser(user: unknown): void {
    const result = validateUser(user);
    
    if (!result.valid) {
        // エラーハンドリング
        console.error(result.errors);
        return;
    }
    
    // この時点で user は型安全に扱える
    // （型アサーションまたは型ガードと組み合わせて使用）
}
```

---

## エラーメッセージ管理

### 定数オブジェクトでの管理

**MUST**: エラーメッセージは定数オブジェクトで管理する ([rules.md](./rules.md) 参照)。

```typescript
/**
 * バリデーションエラーメッセージ定数
 */
const ERROR_MESSAGES = {
    // ユーザー関連
    USER_NAME_REQUIRED: 'ユーザー名は必須です',
    USER_NAME_TOO_LONG: 'ユーザー名は50文字以内で入力してください',
    USER_EMAIL_REQUIRED: 'メールアドレスは必須です',
    USER_EMAIL_INVALID_FORMAT: 'メールアドレスの形式が不正です',
    
    // 共通
    INVALID_DATA: 'データが不正です',
    DATA_NOT_PROVIDED: 'データが指定されていません',
} as const;
```

### 命名規則

**フォーマット**: `{エンティティ名}_{フィールド名}_{エラー種別}`

**例**:
- `USER_NAME_REQUIRED` - ユーザーの名前が必須
- `TICKER_SYMBOL_INVALID_FORMAT` - ティッカーのシンボルのフォーマットが不正
- `HOLDING_QUANTITY_INVALID` - 保有株式の数量が不正

### `as const` アサーションの使用

**MUST**: `as const` アサーションを使用して、エラーメッセージ定数を readonly にする。

```typescript
const ERROR_MESSAGES = {
    REQUIRED: '必須項目です',
} as const;

// ✅ OK: 型安全に使用
const message = ERROR_MESSAGES.REQUIRED;

// ❌ NG: コンパイルエラー
ERROR_MESSAGES.REQUIRED = '変更不可';
```

**理由**: 意図しない変更を防ぎ、型安全性を向上。

---

## 汎用ヘルパー関数

**MAY**: サービス固有の要件に応じて、以下のようなヘルパー関数を追加可能。

- **文字列チェック**: `isNonEmptyString()` - 文字列が空でないかチェック
- **正規表現チェック**: `isValidEmail()`, `isValidUrl()`, `isValidUUID()` など
- **フォーマットチェック**: `isValidDateFormat()`, `isValidTimeFormat()` など
- **範囲チェック**: `isInRange(value, min, max)`, `isValidPrice()`, `isValidQuantity()` など
- **タイムスタンプチェック**: `isValidTimestamp()` - Unix タイムスタンプの妥当性検証
- **配列チェック**: `isNonEmptyArray()`, `hasUniqueElements()` など

**配置**: `validation/helpers.ts` に集約する。

---

## バリデーション関数の実装パターン

### 基本構造

```typescript
/**
 * [エンティティ名]のバリデーション
 *
 * @param data - [エンティティ名]オブジェクト
 * @returns バリデーション結果
 */
export function validate[EntityName](data: unknown): ValidationResult {
    const errors: string[] = [];
    
    // 1. null/undefined チェック
    if (data === null || data === undefined) {
        return { valid: false, errors: [ERROR_MESSAGES.DATA_NOT_PROVIDED] };
    }
    
    // 2. 型チェック
    if (typeof data !== 'object') {
        return { valid: false, errors: [ERROR_MESSAGES.INVALID_DATA] };
    }
    
    // 3. Partial型にキャスト
    const d = data as Partial<EntityType>;
    
    // 4. フィールドごとのバリデーション
    // （詳細は後述）
    
    // 5. 結果の返却
    return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
```

### null/undefined チェック

**MUST**: 最初に null/undefined チェックを行い、早期リターンする。

```typescript
// null/undefined チェック
if (data === null || data === undefined) {
    return { valid: false, errors: ['データが指定されていません'] };
}
```

### 型チェック

**MUST**: オブジェクト型であることを確認する。

```typescript
// 型チェック
if (typeof data !== 'object') {
    return { valid: false, errors: ['データが不正です'] };
}

// 配列を除外する場合
if (typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['データが不正です'] };
}
```

### フィールドごとのバリデーション

#### 必須フィールドのチェック

```typescript
// 文字列フィールド
if (!d.name || !isNonEmptyString(d.name)) {
    errors.push(ERROR_MESSAGES.NAME_REQUIRED);
}

// 数値フィールド
if (d.price === undefined || d.price === null) {
    errors.push(ERROR_MESSAGES.PRICE_REQUIRED);
}

// 真偽値フィールド
if (d.enabled === undefined || d.enabled === null) {
    errors.push(ERROR_MESSAGES.ENABLED_REQUIRED);
}
```

#### フォーマット・範囲のチェック

```typescript
// 文字列の長さチェック
if (d.name && d.name.length > 200) {
    errors.push(ERROR_MESSAGES.NAME_TOO_LONG);
}

// 正規表現チェック
if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
    errors.push(ERROR_MESSAGES.EMAIL_INVALID_FORMAT);
}

// 数値の範囲チェック
if (d.price !== undefined && d.price !== null && !isValidPrice(d.price)) {
    errors.push(ERROR_MESSAGES.PRICE_INVALID);
}
```

#### ネストしたオブジェクトのチェック

```typescript
// 配列フィールド
if (!d.items || !Array.isArray(d.items)) {
    errors.push(ERROR_MESSAGES.ITEMS_REQUIRED);
} else if (d.items.length === 0) {
    errors.push(ERROR_MESSAGES.ITEMS_EMPTY);
} else {
    // 配列要素のバリデーション
    d.items.forEach((item, index) => {
        if (!item.id) {
            errors.push(`${index + 1}番目のアイテムのIDが必須です`);
        }
    });
}

// ネストしたオブジェクト
if (!d.address) {
    errors.push(ERROR_MESSAGES.ADDRESS_REQUIRED);
} else {
    if (!d.address.city || !isNonEmptyString(d.address.city)) {
        errors.push(ERROR_MESSAGES.CITY_REQUIRED);
    }
}
```

### エラーメッセージの収集

**MUST**: `errors` 配列にエラーメッセージを追加する。

```typescript
const errors: string[] = [];

// バリデーションチェック
if (!d.name) {
    errors.push(ERROR_MESSAGES.NAME_REQUIRED);
}

if (!d.email) {
    errors.push(ERROR_MESSAGES.EMAIL_REQUIRED);
}
```

### 結果の返却

**MUST**: `errors` 配列が空の場合は `{ valid: true }`、そうでない場合は `{ valid: false, errors }` を返す。

```typescript
return errors.length === 0 ? { valid: true } : { valid: false, errors };
```

---

## API Routeでの使用方法

### バリデーションの実行

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validateUser } from '@/lib/validation';

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
        const validationResult = validateUser(body);
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

### エラーレスポンスの返却

#### 単一のエラーメッセージを返す

**SHOULD**: 最初のエラーメッセージのみを返す（ユーザーフレンドリー）。

```typescript
if (!validationResult.valid) {
    return NextResponse.json(
        {
            error: 'INVALID_REQUEST',
            message: validationResult.errors?.[0] || 'バリデーションエラー',
        },
        { status: 400 }
    );
}
```

#### 複数のエラーメッセージを返す

**MAY**: 全てのエラーメッセージを返す（API 仕様による）。

```typescript
if (!validationResult.valid) {
    return NextResponse.json(
        {
            error: 'INVALID_REQUEST',
            message: 'バリデーションエラーが発生しました',
            details: validationResult.errors,
        },
        { status: 400 }
    );
}
```

### HTTP ステータスコードの選択

| ステータスコード | 使用場面                                 |
| ---------------- | ---------------------------------------- |
| 400              | バリデーションエラー、不正なリクエスト   |
| 401              | 認証エラー                               |
| 403              | 権限エラー                               |
| 404              | リソースが見つからない                   |
| 409              | リソースの重複（既に存在する）           |
| 500              | サーバー内部エラー                       |

**例**:

```typescript
// バリデーションエラー
return NextResponse.json(
    { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.INVALID_DATA },
    { status: 400 }
);

// リソース重複エラー
return NextResponse.json(
    { error: 'CONFLICT', message: ERROR_MESSAGES.ALREADY_EXISTS },
    { status: 409 }
);
```

---

## 型安全性

### TypeScript型ガードとしての実装

バリデーション関数を型ガードとして実装することで、型安全性を向上できる（オプション）。

```typescript
/**
 * ユーザー型ガード
 */
export function isUser(data: unknown): data is User {
    const result = validateUser(data);
    return result.valid;
}
```

**使用例**:

```typescript
function processUser(data: unknown): void {
    if (!isUser(data)) {
        console.error('Invalid user data');
        return;
    }
    
    // この時点で data は User 型として扱える
    console.log(data.name); // 型安全
}
```

### unknown型からの変換

**MUST**: API Route で受け取ったデータは `unknown` 型として扱い、バリデーション後に適切な型にキャストする。

```typescript
// ❌ NG: any 型を使用
const body: any = await request.json();

// ✅ OK: unknown 型を使用
let body: unknown;
try {
    body = await request.json();
} catch (error) {
    // エラーハンドリング
}

// バリデーション後に型キャスト
const validationResult = validateUser(body);
if (validationResult.valid) {
    const user = body as User; // 安全にキャスト
}
```

### Partial<T> の活用

**MUST**: バリデーション関数内で `Partial<T>` を使用して、部分的なフィールドアクセスを可能にする。

```typescript
export function validateUser(data: unknown): ValidationResult {
    // ...
    const d = data as Partial<User>;
    
    // フィールドアクセス時に undefined チェック不要
    if (!d.name || !isNonEmptyString(d.name)) {
        errors.push(ERROR_MESSAGES.NAME_REQUIRED);
    }
    // ...
}
```

**理由**: 型安全性を保ちつつ、柔軟なバリデーションが可能。

---

## テスト戦略

### ユニットテストの作成

**MUST**: 全てのバリデーション関数に対してユニットテストを作成する ([rules.md](./rules.md) 参照)。

```typescript
// tests/unit/validation/helpers.test.ts
import { isNonEmptyString, isValidPrice } from '../../../src/validation/helpers';

describe('Validation Helpers', () => {
    describe('isNonEmptyString', () => {
        it('should accept non-empty strings', () => {
            expect(isNonEmptyString('test')).toBe(true);
            expect(isNonEmptyString('a')).toBe(true);
            expect(isNonEmptyString('  test  ')).toBe(true);
        });
        
        it('should reject empty strings', () => {
            expect(isNonEmptyString('')).toBe(false);
            expect(isNonEmptyString('   ')).toBe(false);
            expect(isNonEmptyString('\t')).toBe(false);
        });
    });
    
    describe('isValidPrice', () => {
        it('should accept valid prices', () => {
            expect(isValidPrice(0.01)).toBe(true);
            expect(isValidPrice(100)).toBe(true);
            expect(isValidPrice(1_000_000)).toBe(true);
        });
        
        it('should reject invalid prices', () => {
            expect(isValidPrice(0)).toBe(false);
            expect(isValidPrice(-1)).toBe(false);
            expect(isValidPrice(1_000_001)).toBe(false);
        });
    });
});
```

### テストケースの網羅

**MUST**: 以下のテストケースを網羅する。

#### 正常系

- **有効なデータ**: 全てのフィールドが正しい値
- **最小値/最大値**: 範囲の境界値
- **オプショナルフィールド**: 省略可能なフィールドが省略された場合

```typescript
describe('validateUser', () => {
    it('should accept valid user data', () => {
        const validUser = {
            name: 'John Doe',
            email: 'john@example.com',
            age: 30,
        };
        
        const result = validateUser(validUser);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });
    
    it('should handle edge cases', () => {
        const edgeCase = {
            name: 'A', // 最小長
            email: 'a@b.c', // 最小形式
            age: 0, // 最小値
        };
        
        const result = validateUser(edgeCase);
        expect(result.valid).toBe(true);
    });
});
```

#### 異常系

- **null/undefined**: データが null または undefined
- **型エラー**: データがオブジェクト型でない
- **必須フィールド欠如**: 必須フィールドが存在しない
- **フォーマットエラー**: 正規表現パターンに一致しない
- **範囲外**: 数値が範囲外

```typescript
describe('validateUser', () => {
    it('should reject null/undefined', () => {
        expect(validateUser(null).valid).toBe(false);
        expect(validateUser(undefined).valid).toBe(false);
    });
    
    it('should reject non-object data', () => {
        expect(validateUser('string').valid).toBe(false);
        expect(validateUser(123).valid).toBe(false);
        expect(validateUser([]).valid).toBe(false);
    });
    
    it('should reject missing required fields', () => {
        const result = validateUser({});
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.NAME_REQUIRED);
        expect(result.errors).toContain(ERROR_MESSAGES.EMAIL_REQUIRED);
    });
    
    it('should reject invalid format', () => {
        const invalidUser = {
            name: 'John',
            email: 'invalid-email',
            age: 30,
        };
        
        const result = validateUser(invalidUser);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.EMAIL_INVALID_FORMAT);
    });
    
    it('should reject out-of-range values', () => {
        const invalidUser = {
            name: 'John',
            email: 'john@example.com',
            age: -1,
        };
        
        const result = validateUser(invalidUser);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.AGE_INVALID);
    });
});
```

### カバレッジ要件

**MUST**: テストカバレッジ 80%以上を確保する ([rules.md](./rules.md) 参照)。

```typescript
// jest.config.ts
export default {
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
};
```

**理由**: バリデーションロジックは重要なビジネスロジックであり、高い品質を維持する必要がある。

---

## 実装チェックリスト

バリデーション実装時は以下を確認する。

### 必須項目

- [ ] `ValidationResult` 型を使用している
- [ ] エラーメッセージを日本語で記述している
- [ ] エラーメッセージを定数オブジェクト (`ERROR_MESSAGES`) で管理している
- [ ] `as const` アサーションを使用している
- [ ] バリデーション関数を `core` パッケージに配置している
- [ ] null/undefined チェックを最初に行っている
- [ ] 型チェック（`typeof data !== 'object'`）を行っている
- [ ] `Partial<T>` を使用してフィールドアクセスしている
- [ ] 結果を `{ valid: true }` または `{ valid: false, errors }` で返している
- [ ] ユニットテストを作成している
- [ ] テストカバレッジ 80%以上を達成している

### 推奨項目

- [ ] バリデーション関数を純粋関数として実装している
- [ ] 汎用ヘルパー関数を `validation/helpers.ts` に抽出している
- [ ] API Route でバリデーションを実行している
- [ ] 適切な HTTP ステータスコード（400, 409など）を使用している
- [ ] エラーレスポンスの形式を統一している

### オプション

- [ ] 型ガード関数を実装している
- [ ] 複数のエラーメッセージを返すオプションを提供している
- [ ] ドメイン固有のヘルパー関数を追加している

---



## 参考

- [コーディング規約・べからず集](./rules.md): TypeScript、エラーハンドリング、テストルール
- [共通ライブラリ設計](./shared-libraries.md): core パッケージの責務と依存関係
- [アーキテクチャ方針](./architecture.md): レイヤー分離、ビジネスロジックの実装
- [テスト戦略](./testing.md): テストカバレッジ、モック戦略
