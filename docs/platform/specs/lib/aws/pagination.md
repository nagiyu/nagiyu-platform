---
sources:
  - libs/aws/src/dynamodb/pagination.ts
  - libs/aws/src/dynamodb/cursor.ts
  - libs/aws/src/dynamodb/types.ts
sources_hash: 1e1342ce67226aef485b0f3be84bb3d7459d523b0c03af01d6de168df42ad955
---

# ページネーション

DynamoDB の `Query` と `Scan` を、1 ページ分または全ページ分取得する関数と、ページ位置を表す不透明なカーソルのエンコード。`@nagiyu/aws` から import する。

## 使い方

### 取得

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `queryPage` | `docClient`、`input` (`QueryCommandInput`)、`page` | `PaginatedResult<DynamoDBItem>` |
| `scanPage` | `docClient`、`input` (`ScanCommandInput`)、`page` | 同上 |
| `queryPages` | `docClient`、`input` | 1 ページごとの項目の配列を返す非同期ジェネレーター |
| `queryAllItems` | `docClient`、`input` | 全ページを連結した項目の配列 |
| `scanAllItems` | `docClient`、`input` | 同上 |

`page` は `{ limit, cursor? }`。`limit` は必須で、既定値はない。

```ts
const result = await queryPage(docClient, input, { limit: 20, cursor });
// result.items、result.nextCursor
```

### カーソル

| 関数 | 内容 |
|---|---|
| `encodeCursor(lastEvaluatedKey)` | `LastEvaluatedKey` を JSON にして Base64 にする。`undefined` なら `undefined` |
| `decodeCursor(cursor)` | `encodeCursor` の逆。空、または不正な Base64 や JSON なら `undefined`。正しい JSON であれば、オブジェクトでない値 (`123` など) もそのまま返す |

### 型

| 型 | 内容 |
|---|---|
| `PaginatedResult<T>` | `items`、`nextCursor` (省略可)、`count` (省略可) |
| `PaginationOptions` | `limit`、`cursor`。どちらも省略可 |
| `DynamoDBItem` | `PK`、`SK`、`Type`、`CreatedAt`、`UpdatedAt` と、省略可の `GSI1PK` から `GSI3SK` までを持つ Item。ほかの属性も持てる |

`CreatedAt` と `UpdatedAt` は数値。`PK`、`SK`、`Type`、`GSI1PK` から `GSI3PK` まで、`GSI1SK`、`GSI2SK` は文字列。`GSI3SK` は文字列か数値。上に挙げた以外の属性は `unknown`。

## 振る舞い

### 1 ページの取得

- `Limit` は `input` の値に関わらず、`page.limit` で上書きする
- `cursor` が有効にデコードできたときだけ、`ExclusiveStartKey` を付ける。省略、または不正なカーソルなら、先頭から取得する
- 項目は、生の Item のまま返す。Entity への変換は呼び出し側が行う
- `nextCursor` は、`LastEvaluatedKey` をエンコードしたもの。`LastEvaluatedKey` がなければ付かない
- `count` は、そのページの件数 (`items.length`)。総件数ではない
- `nextCursor` は「`limit` を使い切って走査を打ち切ったか」を表す。次のページに項目が残っていることは保証しない。`limit` ちょうどで終わったときも付き、その次のページは 0 件で `nextCursor` が付かない

### 全ページの取得

- `queryPages` は、`LastEvaluatedKey` を辿って 1 ページずつ取得する。ループを途中で `break` すれば、以降のページは取得しない
- 1 ページ目は `input` をそのまま送る。2 ページ目以降だけ、`ExclusiveStartKey` を足す
- `queryAllItems` と `scanAllItems` は、全ページを連結する

### 失敗

どの関数も、SDK の例外を包まずにそのまま投げる。

## 理由

- カーソルを不透明なトークンにする。`LastEvaluatedKey` の形式を呼び出し側に見せず、DynamoDB 版と [InMemory 版](./in-memory-single-table-store.md) で、別の形式のトークンを使えるようにするため。トークンのサイズが少し大きくなる
- 隠すのはトークンの形式だけで、`nextCursor` の付き方は実 DynamoDB の `LastEvaluatedKey` に合わせる。両方の実装で、呼び出し側が同じ終端判定 (`nextCursor` がなければ終わり) を書けるようにするため
- `count` をページの件数にする。実 DynamoDB は、追加の走査なしに総件数を出せないため
- 1 回の `Query` と `Scan` が返すのは最大 1MB までなので、全件を取るには `LastEvaluatedKey` を辿る必要がある
- 例外を包まない。呼び出し元によって包み方 (`toDatabaseError` か、独自のメッセージか) が違い、ここで包むと独自のメッセージの箇所で文言が二重になるため
- `Limit` に既定値を持たない。既定の件数がリポジトリごとに違うため
- `ExclusiveStartKey` を条件つきで付ける。余計なキーを足すと、`input` を厳密に比べるテストが壊れるため
