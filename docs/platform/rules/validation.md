---
sources:
  - configs/eslint.config.core.mjs
sources_hash: 86d2b72623d0f5775456deaad0b6bdd9401f742efabb1bb16b0f4ad3cf3e3f42
---

# バリデーションの規約

入力を検証する関数の置き場所、戻り値、書き方と、API ルートでの使い方の規則と、その理由。`core` が UI と Next.js に依存できないことは `configs/eslint.config.core.mjs` が強制する。そのほかの規則はレビューで守らせる。検証の部品 (`ValidationResult` と判定の関数) は [バリデーションの部品](../specs/lib/common/validation.md) にある。エラーメッセージの書き方は [エラー処理の規約](./error-handling.md) に従う。

## 置き場所と戻り値

### バリデーションの関数はサービスの `core` に置く

バリデーションはビジネスロジックなので、フレームワークに依存させない。`core` は ESLint で UI と Next.js の import を止めているため、置けば自然に守られる。

`services/{service}/core/src/validation/` に関数を置き、汎用の判定の補助は `helpers.ts` に集める。

例外として、share-together、niconico-mylist-assistant、quick-clip の web は、検証の関数を自分の `lib/` に置いている。

### 戻り値は `ValidationResult` にする

サービスごとに戻り値の形が違うと、呼び出し側が検証の結果の扱い方を覚え直すことになる。型は共通ライブラリのものを使う。`errors` は、`valid` が `false` のときだけ持たせる。

例外として、codec-converter の core と niconico-mylist-assistant の web は、独自の結果の型を定義している (codec-converter は `isValid` と `errorMessage`)。

### 検証は純粋関数にする

同じ入力に同じ結果を返し、外部の状態を変えない関数にすると、テストが容易で、結果が予測できる。

### サービス固有の値域は preset にして、判定は `isValidNumber` に委ねる

価格や数量の値域の数字は、サービスの `validation/presets.ts` に `as const` で置き、判定は `@nagiyu/common` の `isValidNumber(value, min, max)` に任せる。値域の重複した定義を防ぎ、`NaN` と `Infinity` の扱いを、サービスをまたいで揃えられる。

## 実装の流れ

### 検証関数は `unknown` を受け、確かめてから型を付ける

呼び出し側は、検証の前の値を知らない。`any` で受けると、検証を飛ばしても型は通る。検証関数は `unknown` を受け取り、検証に通ってから呼び出し側が型を付ける。

関数の中では、次の順に書く。

- `null` と `undefined` を最初に確かめ、`valid: false` で早く返す
- オブジェクトであることを `typeof` で確かめ、違えば `valid: false` で早く返す。配列を除くときは `Array.isArray` も使う
- `Partial<T>` にキャストして、フィールドを読む。フィールドごとの `undefined` の確認を、型の側に任せられる
- 違反ごとに、エラーメッセージを `errors` に積む。最初の 1 件で打ち切らない。まとめて見せるほうが、利用者が一度で直せる
- `errors` が空なら `{ valid: true }`、そうでなければ `{ valid: false, errors }` を返す

```typescript
export function validateUser(data: unknown): ValidationResult {
    const errors: string[] = [];
    if (data === null || data === undefined) {
        return { valid: false, errors: [ERROR_MESSAGES.DATA_NOT_PROVIDED] };
    }
    if (typeof data !== 'object') {
        return { valid: false, errors: [ERROR_MESSAGES.INVALID_DATA] };
    }
    const d = data as Partial<User>;
    if (!d.name || !isNonEmptyString(d.name)) {
        errors.push(ERROR_MESSAGES.USER_NAME_REQUIRED);
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
```

## API ルートでの使い方

### リクエストボディは `request.json()` を直接呼ばず、`readJsonObjectBody` で読む

壊れた JSON、本文が `null`、配列、プリミティブは、利用者の入力の誤りである。`request.json()` を直接呼ぶと、これらが例外やプロパティ参照の失敗になり、ルートの汎用の catch に落ちて 500 になる。500 はエラーを通報する経路なので、利用者の入力ミスが障害の通知に混ざり、本物の障害が埋もれる。

読めなければ 400 を返す。読めた値の各項目は `unknown` のままなので、検証で型を確かめる。振る舞いは [リクエストボディの読み取り](../specs/lib/nextjs/request-body.md) にある。

### 検証に失敗したら 400 を返し、メッセージは `errors` から作る

レスポンスの形 (`error` と `message`) とコードは [エラーレスポンス](../specs/lib/nextjs/error-response.md) と [エラーコード](../specs/lib/common/error-codes.md) に従う。最初のエラーだけを `message` に入れるか、全件を `details` に入れるかは、API ごとに決める。

## テスト

### 検証関数は、次のケースをユニットテストで網羅する

検証はビジネスロジックの中心で、ここが緩むと不正な値が下流に流れる。

- 正常: 有効なデータ、値域の最小と最大の境界、省略できるフィールドを省いた場合
- `null` と `undefined`
- オブジェクトではない値 (文字列、数値、配列)
- 必須のフィールドがない場合
- 形式の誤り (正規表現に合わない値)
- 値域の外
