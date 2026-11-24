---
sources:
  - libs/common/src/validation/types.ts
  - libs/common/src/validation/helpers.ts
  - libs/common/src/validation/require-env.ts
  - libs/common/src/validation/invalid-input-error.ts
sources_hash: 1ce61189901829804d0c96766e066f1113a844e98a8f92042924d0bd37c182a3
---

# バリデーションの部品

入力の検証に使う結果の型、判定の関数、必須環境変数の検査、入力の誤りを表す例外。メインの `@nagiyu/common` から import する。

## 使い方

| 名前 | 内容 |
|---|---|
| `ValidationResult<T>` | 検証の結果の型 |
| `isNonEmptyString(value)` | 文字列が空でないか |
| `isValidNumber(value, min, max)` | 数値が範囲内か |
| `isValidTimestamp(timestamp)` | Unix ミリ秒として妥当か |
| `requireEnv(keys)` | 必須の環境変数をまとめて取り出す |
| `InvalidInputError` | 呼び出し側が渡した値が規則に合わないことを表す例外 |

### `ValidationResult<T>`

| 項目 | 内容 |
|---|---|
| `valid` | 検証に通ったか |
| `errors` | エラーメッセージの配列。`valid` が `false` のときだけ持たせる約束で、型では強制していない |
| `data` | 検証済みのデータ。`valid` が `true` のときだけ持たせる約束で、型では強制していない |

型の定義だけで、検証の処理は含まない。

## 振る舞い

### 判定の関数

| 関数 | `true` になる条件 |
|---|---|
| `isNonEmptyString` | 前後の空白を除いた長さが 1 以上。引数は `string` だけ受ける |
| `isValidNumber` | 有限の数 (`NaN` と `Infinity` は `false`) で、`min` 以上 `max` 以下。両端を含む |
| `isValidTimestamp` | 型が `number` で、0 より大きく、現在時刻の 1 日後 (86400000 ミリ秒後) 以下。引数は `unknown` を受ける |

- `isValidTimestamp` は呼ばれた時点の現在時刻と比べる。未来の時刻は 1 日先までを許す
- `isValidTimestamp` は `NaN` を弾かない。`NaN` はどの比較も成り立たないため `true` になる

### `requireEnv`

環境変数のキーの配列を受け取り、キーと値の組を返す。

- 値は前後の空白を取り除いた文字列。空文字 (空白だけを含む) は未設定とみなす
- 足りないキーを集め、1 つでもあれば `必要な環境変数が設定されていません: KEY1, KEY2` の `Error` を投げる。キーは渡した順に並ぶ

### `InvalidInputError`

`Error` を継承し、`name` が `InvalidInputError`。受け手 (API のルートなど) は、文言ではなくクラスで 400 に振り分ける。

## 理由

- `InvalidInputError` を文言ではなくクラスで見分けるのは、文言を変えたときに黙って 500 になるのを避けるため
- 名前に `Invalid` を含めるのは、`@nagiyu/nextjs` の `handleApiError` が例外の名前で 400 に振り分けるのに合わせるため。詳しくは [エラーレスポンス](../nextjs/error-response.md) にある
