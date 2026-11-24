---
sources:
  - libs/aws/src/dynamodb/batch.ts
sources_hash: 1c12d71ccd664a6c260ce3668adc963fdfa97c2708a36d0c63eb95000cd4d29c
---

# バッチの書き込みと取得

DynamoDB の `BatchWriteItem` と `BatchGetItem` を、件数の上限ごとに分割して送り、未処理分を指数バックオフで再送する。`@nagiyu/aws` から import する。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `batchWriteAll` | `docClient`、`tableName`、`requests` (書き込みリクエストの配列)、`options` (省略可) | 処理できた件数 |
| `batchGetAll` | `docClient`、`tableName`、`keys` (キーの配列)、`options` (省略可) | 取得した項目の配列 |

`options` (`BatchRetryOptions`) は次のとおり。

| 項目 | 既定値 | 内容 |
|---|---|---|
| `maxRetries` | 4 | 再送の上限回数 |
| `baseDelayMs` | 50 | 最初の待機時間 (ミリ秒)。以降は 2 倍ずつ増える |
| `sleep` | `@nagiyu/common` の `sleep` | 待機の関数 (差し替え用) |

```ts
const count = await batchWriteAll(docClient, tableName, [
  { PutRequest: { Item: item } },
  { DeleteRequest: { Key: key } },
]);
```

## 振る舞い

| 項目 | `batchWriteAll` | `batchGetAll` |
|---|---|---|
| 1 回の件数 | 25 件ずつに分割 | 100 件ずつに分割 |
| 未処理分 | `UnprocessedItems` を再送 | `UnprocessedKeys` を再送 |
| 戻り値 | 再送後の最終的な成功件数 | 全分割の結果を連結した項目 |
| キーの重複 | 取り除かない | 取り除かない |

- 分割ごとに、未処理分がなくなるまで送る
- 再送の前に、`baseDelayMs * 2^(再送の回数)` ミリ秒待つ。既定では 50、100、200、400 ミリ秒で、最初の送信と合わせて最大 5 回送る。この回数は分割ごとに数える
- 上限まで再送しても未処理分が残ったら、`BatchRetryExhaustedError` を投げる。メッセージは `UnprocessedItems` (または `UnprocessedKeys`) が最大リトライ回数後も残ったことと、残りの件数を示す。`remaining` に残りの件数を持つ
- SDK の例外は包まずに投げる

### BatchRetryExhaustedError

`Error` を継承し、`RepositoryError` と `DatabaseError` は継承しない。呼び出し側が自分のメッセージの接頭辞を付けて包むので、ここで `DatabaseError` にすると、文言が二重になるため。

## 理由

- 未処理分が残ったら、成功扱いにせず例外にする。不可逆な削除などで、未処理を残したまま終わると、呼び出し側が気づけないため
- 読み込みの未処理キーを黙って捨てない。捨てると、存在するデータが「無い」と表示されてしまうため
- 再送に回数の上限と待機を置く。上限も待機もない即時の再送は、スロットリング中のテーブルに負荷をかけ続けるため
