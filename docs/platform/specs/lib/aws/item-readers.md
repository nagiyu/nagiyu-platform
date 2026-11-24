---
sources:
  - libs/aws/src/dynamodb/validators.ts
sources_hash: d0c6eaca3cd577ea890c9a8fb5ca214680c07b6fabcf6f3b7fe9e4ba19063c6f
---

# Item の読み取りと検証

DynamoDB の Item から値を読み、型を検証する関数。[EntityMapper](./entity-mapper.md) の `toEntity` で使う。不正な値は `InvalidEntityDataError` ([リポジトリのエラー](./repository-errors.md)) にする。`@nagiyu/aws` から import する。

## 使い方

### 検証 (`validate*`)

値を検証して、その型で返す。`fieldName` はエラーメッセージ用の項目名。

| 関数 | 引数 (`value`、`fieldName` のほか) | 検査 |
|---|---|---|
| `validateStringField` | `allowEmpty` (既定 false)、`minLength`、`maxLength` | 文字列であること。空文字列は `allowEmpty` が真のときだけ許す。文字数 |
| `validateNumberField` | `min`、`max`、`integer` (既定 false) | 数値であること。`NaN` と無限大は不可。範囲、整数 |
| `validateEnumField` | `allowedValues` | 許可された値のどれかであること |
| `validateBooleanField` | なし | 真偽値であること |
| `validateObjectField` | なし | オブジェクトであること。`null` と配列は不可。中身は検査しない |
| `validateArrayField` | `isElement` (型ガード)、`minLength` | 配列であること。件数。`isElement` があれば、すべての要素がそれを満たすこと。なければ要素は検査しない |
| `validateTimestampField` | `allowFuture` (既定 true) | タイムスタンプ。戻り値はミリ秒 |

`validateTimestampField` の `value` は、次のどちらか。

- 数値: そのままミリ秒として扱う
- 文字列: `Date.parse` で読んでミリ秒にする

結果は、整数で 0 以上でなければならない。`allowFuture` が偽なら、現在時刻より先も不可。数値のエポック秒は、ここでは換算しない (`readTimestamp` が換算する)。

エラーメッセージは `フィールド "{fieldName}" が文字列ではありません` のように、項目名を含む日本語。

### 読み取り

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `readAttribute` | `item`、`name`、`legacyNames` (省略可) | 新名の値。なければ旧名を順に探した値。どれもなければ `undefined` |
| `readTimestamp` | `item`、`name`、`legacyNames`、`options.allowFuture` | ミリ秒。必須 |
| `readOptionalTimestamp` | 同上 | ミリ秒。属性がなければ `undefined` |
| `readOptionalField` | `item`、`name`、`validate`、`legacyNames` | `validate` を通した値。属性がなければ `undefined` |

```ts
const nickname = readOptionalField(item, 'Nickname', validateStringField, ['nickname']);
const createdAt = readTimestamp(item, 'CreatedAt', ['createdAt']);
```

### TTL

| 名前 | 内容 |
|---|---|
| `TTL_ATTRIBUTE_NAME` | TTL 属性の名前。`TTL` |
| `toTtlSeconds(ms)` | ミリ秒の時刻を、エポック秒に切り捨てて変換する |

## 振る舞い

### 旧名と値の有無

- `readAttribute` は、値が `undefined` のものを「ない」とみなし、新名、旧名の順で最初に見つかった値を返す。`null` (DynamoDB の NULL 型) は、値として扱う
- `readOptionalField` は、属性がなければ `undefined` を返す。あっても `validate` が失敗すれば例外にする。欠落と破損を区別するため。`null` は欠落ではなく値として `validate` に渡す。`validate` の `fieldName` には新名を渡す

### タイムスタンプの読み取り

`readTimestamp` と `readOptionalTimestamp` は、`validateTimestampField` の前に、数値が 1e11 (`100000000000`) 未満ならエポック秒とみなして 1000 倍する。ISO 文字列はそのまま `validateTimestampField` で読む。

| 属性の値 | 結果 |
|---|---|
| 1e11 以上の数値 | ミリ秒としてそのまま |
| 1e11 未満の数値 | エポック秒として 1000 倍 |
| ISO 文字列 | ミリ秒にする |
| 不正な文字列、数値と文字列以外 | `InvalidEntityDataError` |

`readTimestamp` は、属性がなければ `InvalidEntityDataError` にする。

## 理由

- 読み取りの関数は、旧名と旧形式の時刻も受け付ける。保存形式を変えても既存のデータを一括で移行せず、読むときに互換させて、書き込みのたびに新形式に置き換えるため
- 1e11 を、エポック秒とミリ秒の境にする。ミリ秒の値で 1e11 を下回るのは 1973 年より前だけなので、それ未満はエポック秒とみなしてよい
- 任意の属性は、欠落なら未設定、あって不正なら例外にする。不正な値を欠落として黙って扱うと、壊れたデータに気づけないため
- TTL の属性だけが、ミリ秒ではなくエポック秒。DynamoDB の TTL がエポック秒しか解釈しないため。名前を `TTL` にそろえるのは、テーブルごとに TTL の属性名を覚える必要をなくすため
