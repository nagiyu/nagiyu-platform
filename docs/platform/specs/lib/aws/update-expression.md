---
sources:
  - libs/aws/src/dynamodb/helpers.ts
sources_hash: 02ef8c7d60c8a1a079d5582b7dd616315615f4e165e78f23edbaf117ef189cf5
---

# 更新式の組み立て

DynamoDB の `UpdateCommand` に渡す更新式を、属性名と値のマップから組み立てる `buildUpdateExpression` と、属性の削除を表す `REMOVE_ATTRIBUTE`。`@nagiyu/aws` から import する。[EntityStore](./entity-store.md) の `update` と、`optionalPatchValue` ([EntityMapper](./entity-mapper.md)) が内部で使う。

## 使い方

`buildUpdateExpression(fields, options?)` の引数は次のとおり。

| 引数 | 内容 |
|---|---|
| `fields` | 属性名から値へのマップ。挿入順に処理する |
| `options.timestamp` | `{ attributeName, value }`。更新日時の属性を `SET` に足す。値の形式は呼び出し側が決める |
| `options.updateTimestampWhenEmpty` | 真で `timestamp` があれば、`fields` に更新項目がなくても、更新日時だけの式を返す。既定は偽 |

戻り値は、更新項目がなければ `null`。あれば次の形で、`UpdateCommand` の入力にそのまま展開できる。

| 項目 | 内容 |
|---|---|
| `UpdateExpression` | `SET ...` と `REMOVE ...` をつないだ式 |
| `ExpressionAttributeNames` | プレースホルダと属性名の対応 |
| `ExpressionAttributeValues` | プレースホルダと値の対応。値が 1 つもなければ、キーごと省く |

```ts
const parts = buildUpdateExpression(
  { Name: '新しい名前', Memo: REMOVE_ATTRIBUTE, Skip: undefined },
  { timestamp: { attributeName: 'UpdatedAt', value: Date.now() } }
);
// parts.UpdateExpression: 'SET #n0 = :v0, #n2 = :v2 REMOVE #n1'
```

## 振る舞い

| `fields` の値 | 扱い |
|---|---|
| `undefined` | 飛ばす |
| `REMOVE_ATTRIBUTE` | `REMOVE` 句に入れる |
| それ以外 (`null`、空文字列、0、`false` を含む) | `SET` 句に入れる |

- プレースホルダは、使った項目ごとに連番で `#n0`、`:v0` のように振る。`:v` の番号は `#n` と同じで、`REMOVE` の項目も番号を使うので、`:v` の番号は飛ぶことがある。更新日時には、最後の番号を使う。呼び出し側が足す固定の名前 (`#pk` など) と衝突しない
- 更新項目は、`undefined` を飛ばしたあとの項目で、`timestamp` は数えない。更新項目が 0 件のときは、`updateTimestampWhenEmpty` が真で `timestamp` もあれば更新日時だけの式を返し、そうでなければ `null` を返す
- `REMOVE_ATTRIBUTE` は `unique symbol`

## 理由

- `undefined` の項目を飛ばす。共有のクライアントは `undefined` の値をマップから落とすので、式にプレースホルダだけが残り、DynamoDB がエラーにするため
- `ExpressionAttributeValues` を、値がないときは省く。`REMOVE` だけの式に空のマップを付けると、DynamoDB が拒否するため
- 削除の合図を `REMOVE_ATTRIBUTE` に限る。何を削除の合図にするか (`null`、キーがあって値が `undefined` など) は呼び出し側ごとに違うので、特定の値を合図と決めず、呼び出し側が自分の合図をこの目印に変換する
- 更新日時を更新項目に数えない。更新項目が空のときに、エラーにするか更新日時だけ更新するかは呼び出し側ごとに違うので、`null` を返して判断を委ね、更新日時だけ更新したい呼び出し側は `updateTimestampWhenEmpty` を指定する
