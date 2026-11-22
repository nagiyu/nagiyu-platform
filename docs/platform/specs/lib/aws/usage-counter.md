---
sources:
  - libs/aws/src/dynamodb/counter/usage-counter.interface.ts
  - libs/aws/src/dynamodb/counter/dynamodb-usage-counter.ts
  - libs/aws/src/dynamodb/counter/in-memory-usage-counter.ts
  - libs/aws/src/dynamodb/counter/try-increment-in-order.ts
sources_hash: e811db41ff524e9fdb1ae9864a24b90f53b37fe3dfb959d207242640de1b83af
---

# 回数カウンター

上限付きで回数を数える `UsageCounter`。判定と加算を 1 回の操作で行い、同時に呼ばれても上限を超えない。DynamoDB 版の `DynamoDBUsageCounter` と、[InMemorySingleTableStore](./in-memory-single-table-store.md) 上の `InMemoryUsageCounter` がある。複数の上限を順に数える `tryIncrementInOrder` も含む。`@nagiyu/aws` から import する。

## 使い方

| クラス | コンストラクタの引数 |
|---|---|
| `DynamoDBUsageCounter` | `docClient`、`tableName` |
| `InMemoryUsageCounter` | `store` (`InMemorySingleTableStore`) |

| 操作 | 引数 | 戻り値 |
|---|---|---|
| `tryIncrement` | `input` | 加算できたとき `true`、上限に達していたとき `false` |
| `decrement` | `{ key, attribute }` | なし |
| `read` | `key`、`attributes` | 属性名から現在値への対応。記録がない属性は 0 |

`tryIncrement` の `input` は次のとおり。

| 項目 | 内容 |
|---|---|
| `key` | カウンターを置く Item のキー (`{ PK, SK }`) |
| `attribute` | 数える属性名。1 つの Item に複数の属性を置ける |
| `limit` | 上限。この値に達していたら加算しない。0 以下では常に加算しない |
| `ttlSec` | TTL (エポック秒) |
| `itemType` | Item の `Type` |

### tryIncrementInOrder

`tryIncrementInOrder(counter, steps, options?)` は、複数の加算を順に試す。

| 引数 | 内容 |
|---|---|
| `steps` | 順に数える段の配列。各段は、`tryIncrement` の `input`、または `input` を返す非同期関数 (前の段が通ったあとに入力を作りたいとき) |
| `options.onRollbackError` | 戻しの失敗を受け取る関数。`(error, input)` |

戻り値は、全段を通ったとき `{ ok: true }`、断られたとき `{ ok: false, deniedIndex }` (断った段の位置。0 始まり)。

## 振る舞い

### tryIncrement

| 実装 | 内容 |
|---|---|
| DynamoDB 版 | 属性がないか、`limit` 未満のときだけ 1 加算する条件付き更新を 1 回送る。条件に失敗したら `false`。ほかの失敗は `DatabaseError` ([リポジトリのエラー](./repository-errors.md)) にする |
| InMemory 版 | 現在値が `limit` 未満のときだけ 1 加算する。取得と保存の間に `await` を挟まない |

- `limit` が 0 以下のときは、DynamoDB へ送らずに `false` を返す
- `ttlSec` と `itemType` の書き方は、実装で違う
    - DynamoDB 版は、`TTL` 属性が未設定のときだけ `ttlSec` を書き、`Type` は毎回書く
    - InMemory 版は、Item を初めて作るときだけ `TTL` と `Type` を書く。そのとき、判定には使わない `CreatedAt` と `UpdatedAt` も書く

### decrement

- 現在値が 1 以上のときだけ、1 減らす。0 以下や、記録がないときは何もしない (0 未満にしない。Item を新しく作らない)
- DynamoDB 版は、条件に失敗しても例外にしない。ほかの失敗は `DatabaseError`

### read

- DynamoDB 版は、強い整合性で読む

### tryIncrementInOrder

1. 段を先頭から順に、入力を作り (関数なら呼び)、`tryIncrement` を呼ぶ
2. 断られたら、それまでに通った段を逆順に `decrement` で戻し、断った段の位置を返す。後ろの段は試さない
3. 加算や入力を作る関数が例外になったら、通った段を戻して、元の例外を投げ直す
4. 全段を通ったら、数えたままにする

- 戻しが失敗したら、元の結果 (断りや例外) を優先して握り、`onRollbackError` に渡す。`onRollbackError` が失敗しても、元の結果と残りの戻しを妨げない
- 戻せなかった段は、1 回分多く数えたままになる

## 理由

- 判定と加算を 1 回の操作にする。読んでから書く 2 段階にすると、同時に呼ばれたとき上限を超えるため
- `limit` が 0 以下では常に断る。「属性がなければ通す」条件が、上限 0 でも 1 回目を通してしまうため
- `ttlSec` は、Item を初めて作るときだけ設定する。期間内に値が増えても、TTL が先に延びず、期間どおりに満了するため
- 断られたら、通った段を逆順に戻す。断った申し込みが、ほかの上限を消費しないようにするため
- 戻しで Item を新しく作らない。期間が変わって消えた記録を、戻しが作り直さないようにするため
- 戻せなかったときは、多く数えたままにする。上限を止める側にずれるだけで、上限を超えるずれ方はしないため
