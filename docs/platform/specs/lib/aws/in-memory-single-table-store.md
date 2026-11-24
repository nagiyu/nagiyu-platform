---
sources:
  - libs/aws/src/dynamodb/in-memory/single-table-store.ts
sources_hash: 190e0631b14dab7bf4a2e4ebcebaa2f6fd788bd4dbd77127e1c074cba158111b
---

# InMemorySingleTableStore

DynamoDB の Single Table Design をメモリ上で再現するストア。テストとローカル開発で、DynamoDB の代わりに使う。複数のリポジトリが 1 つのストアを共有する。`@nagiyu/aws` から import する。

## 使い方

`new InMemorySingleTableStore()` で作る。操作は、キーの形と用途で分かれる。

| 系統 | 操作 | 内容 |
|---|---|---|
| PK / SK | `get(pk, sk)`、`put(item, condition?)`、`delete(pk, sk, condition?)` | 項目の `PK` と `SK` をキーにする |
| PK / SK のクエリ | `query(condition, options?)`、`queryAll(condition)` | パーティションキー (`pk`) と、ソートキーの条件 (`sk`) で絞る |
| 属性のクエリ (GSI の近似) | `queryByAttribute(condition, options?)`、`queryAllByAttribute(condition)` | 任意の属性が一致する項目を絞る |
| 全件 | `scan(options?)`、`scanAll()` | 全項目 |
| キーオブジェクト | `getByKey(key)`、`putByKey(key, item)`、`deleteByKey(key)` | `{ PK, SK }` 以外の単一キー (例: `{ userId }`) のテーブルでも使う |
| テスト用 | `clear()`、`size()` | 全消去、項目数 |

- `put` の `condition.attributeNotExists` が真で、すでにあれば `EntityAlreadyExistsError`。`delete` の `condition.attributeExists` が真で、なければ `EntityNotFoundError`
- `putByKey` と `deleteByKey` は、`EntityStore` ([EntityStore](./entity-store.md)) が使う。`deleteByKey` は、なくても成功する
- `query`、`queryByAttribute`、`scan` はページ単位で返す。`queryAll`、`queryAllByAttribute`、`scanAll` は、ページで切らずに全件を返す

### クエリ条件

`QueryCondition` は `{ pk, sk? }`、`AttributeQueryCondition` は次のとおり。

| 項目 | 内容 |
|---|---|
| `attributeName`、`attributeValue` | この属性がこの値と一致する項目に絞る |
| `sk` (省略可) | ソートキーの条件。`attributeName`、`operator`、`value` を持つ |
| `gsiSortKeyAttributeName` (省略可) | `sk` を指定しないときの、並べ替えに使う GSI のソートキーの属性名 |
| `projection` (省略可) | GSI の射影の近似 |

ソートキーの条件の `operator` は、次のとおり。

| `operator` | `value` | 条件 |
|---|---|---|
| `eq` | 文字列 | 等しい |
| `begins_with` | 文字列 | 前方一致 |
| `between` | 2 要素の配列 | 両端を含む範囲。配列でなければ、どの項目も一致しない |
| `gt`、`gte`、`lt`、`lte` | 文字列 | 比較 |

`projection` は次の項目を持つ。

| 項目 | 内容 |
|---|---|
| `type` | `ALL` (全属性)、`KEYS_ONLY` (キーのみ)、`INCLUDE` (キーと指定した属性) |
| `keyAttributeNames` | その GSI 自身のキー属性名 (パーティションキーとソートキー)。射影に常に含める |
| `nonKeyAttributes` | `INCLUDE` のとき、キーのほかに含める属性名 |

## 振る舞い

### 並び順

- `query` と `queryAll` は、`SK` の昇順で返す
- `queryByAttribute` と `queryAllByAttribute` は、次の順に決めた属性の昇順で返す
    1. `sk.attributeName`
    2. `gsiSortKeyAttributeName`
    3. `SK`
- 同じ値は挿入順を保つ (安定ソート)。両方が数値なら数値の順、それ以外は文字列の辞書順 (UTF-16 コードユニット順) で比べる
- `scan` と `scanAll` は、挿入順で返す

### ページ

| 項目 | 内容 |
|---|---|
| 既定の件数 | `limit` を省略する (または 0) と 100 件で切る。全件が必要なときは、`queryAll`、`queryAllByAttribute`、`scanAll` を使う |
| `nextCursor` | 次のページの位置を表す不透明なトークン。形式は Base64 の JSON で、DynamoDB 版のカーソル ([ページネーション](./pagination.md)) とは互換がない |
| 付く条件 | そのページの件数が `limit` ちょうどのとき付く。残りが 0 件でも付き、その次のページは 0 件で `nextCursor` が付かない。意味と理由は [ページネーション](./pagination.md) と同じ |
| 不正なトークン | 先頭から返す |
| `count` | そのページの件数 ([ページネーション](./pagination.md) と同じ) |

### GSI の近似

属性のクエリは、全件を走査して属性が一致する項目に絞る。実 DynamoDB の GSI の次の点を近似する。

| 項目 | 近似の内容 |
|---|---|
| ソート順 | GSI のソートキーの昇順。ソートキーの属性は、`sk.attributeName` か `gsiSortKeyAttributeName` で指定する。どちらも省略すると `SK` で並べるので、GSI のソートキーと一致するとは限らない |
| 射影 | `projection` を指定したときだけ絞る。`PK`、`SK`、`projection.keyAttributeNames` は、射影の種類にかかわらず常に含める。指定しなければ、全属性を返す (`ALL` 相当) |
| 射影を適用する順序 | 絞り込み、並べ替え、ページ切りを全属性の項目に対して行い、返すページの項目にだけ射影を適用する |

- 射影やソートキーの指定が矛盾していても、検知しない。呼び出し側が正しい値を渡す前提になっている
- 実 DynamoDB と等価ではない。`projection` を指定しなければ、実 DynamoDB では射影されない属性でも返す。存在しない GSI でも、`projection` の指定に関わらず結果を返す

### キー

- 内部のキーは、キー属性の値を `#` でつないだ文字列。値がすべて文字列で、キー属性の並びが `PK`、`SK` の順なら、`get(pk, sk)` と `getByKey({ PK, SK })` は同じ項目を指す
- 数値を含むキーは、型を保つ JSON 形式にする。`{ id: 1 }` と `{ id: '1' }` は別の項目になる
- `putByKey` は、値が `undefined` の属性を落として、新しいオブジェクトとして保存する。呼び出し側が渡したオブジェクトを後から書き換えても、保存済みの内容は変わらない (実 DynamoDB のクライアントが `undefined` を落とすのと同じ)
- `put` は、渡したオブジェクトをそのまま (コピーせず、`undefined` の属性も落とさずに) 保存する。後から書き換えると、保存済みの内容も変わる

## 理由

- GSI は全件の走査とフィルタで近似する。テストデータは少量で性能が問題にならず、実装が簡潔になるため。実 DynamoDB との差のうち、射影の不足は `projection` を指定すれば検知できる。存在しない GSI は、`projection` を指定してもしなくても検知できない
- `gsiSortKeyAttributeName` と `projection.keyAttributeNames` を別々にする。射影は任意の指定で、ソート順が射影を宣言したかどうかに左右されてはならない。`keyAttributeNames` は配列で、どちらがパーティションキーでどちらがソートキーかを、並びの順でしか判断できないため

