---
sources:
  - libs/aws/src/dynamodb/store/entity-store.interface.ts
  - libs/aws/src/dynamodb/store/entity-store-support.ts
  - libs/aws/src/dynamodb/store/dynamodb-entity-store.ts
  - libs/aws/src/dynamodb/store/in-memory-entity-store.ts
sources_hash: e7e0add858db1f10a9b29ee33634f88c4f402533685a580b4e61ab514e667a23
---

# EntityStore

Entity 1 件の取得・作成・置き換え・更新・削除の骨格。変換は [EntityMapper](./entity-mapper.md) に任せ、条件付き書き込み、エラーの変換、`UpdatedAt` の管理、旧属性名の削除を受け持つ。DynamoDB 版の `DynamoDBEntityStore` と、[InMemorySingleTableStore](./in-memory-single-table-store.md) 上の `InMemoryEntityStore` があり、同じ操作で同じエラーを投げる。`@nagiyu/aws` から import する。

## 使い方

| クラス | コンストラクタの引数 |
|---|---|
| `DynamoDBEntityStore` | `docClient`、`tableName`、`mapper`、`options.now` (省略可) |
| `InMemoryEntityStore` | `store` (`InMemorySingleTableStore`)、`mapper`、`options.now` (省略可) |

`options.now` は現在時刻 (ミリ秒) の供給元で、既定は `Date.now`。`UpdatedAt` と、省略された `createdAt` の値に使う。

```ts
const store = new DynamoDBEntityStore(docClient, tableName, new UserMapper());
const user = await store.update({ userId }, { name: '新しい名前', nickname: null }, { expectedUpdatedAt });
```

### 操作

| 操作 | 引数 | 戻り値 |
|---|---|---|
| `get` | `key`、`options.consistentRead` | Entity。なければ `null` |
| `create` | `input`、`options.conflictAsOptimisticLock` | 書いた Entity |
| `createIfAbsent` | `input` | `{ entity, created }` |
| `put` | `input`、`options.expectedUpdatedAt` | 書いた Entity |
| `update` | `key`、`changes`、`options.expectedUpdatedAt` | 更新後の Entity |
| `updateIfAttributeAbsent` | `key`、`attributeName`、`changes` | `{ entity, updated }` |
| `delete` | `key` | なし |
| `deleteIfExists` | `key` | なし |

- `key` は、Entity を一意に決めるビジネスキー (mapper の `TKey`)
- `changes` は Entity の部分で、値の意味は [EntityMapper](./entity-mapper.md) の patch に従う (`undefined` は変更なし、`null` は属性の削除)
- `attributeName` は、DynamoDB の属性名 (例: `Outcome`)。Entity のフィールド名ではない

## 振る舞い

### 操作ごとの結果

| 操作 | 振る舞い | 失敗 |
|---|---|---|
| `get` | なければ `null` | 読めないデータは `InvalidEntityDataError` |
| `create` | なければ作る | すでにあれば `EntityAlreadyExistsError`。`conflictAsOptimisticLock` が真なら `OptimisticLockError` |
| `createIfAbsent` | なければ作って `created: true`。あれば書かずに既存の値と `created: false` を返す | 作成に失敗したあと読み直して見つからなければ `DatabaseError` |
| `put` | なければ作り、あれば全体を置き換える | `expectedUpdatedAt` ありで、Item がなければ `EntityNotFoundError`、`UpdatedAt` が一致しなければ `OptimisticLockError` |
| `update` | 指定した項目だけを更新する | なければ `EntityNotFoundError`。`expectedUpdatedAt` ありで一致しなければ `OptimisticLockError`。キー属性を含めると `InvalidEntityDataError` |
| `updateIfAttributeAbsent` | Item があり、指定した属性が未設定のときだけ `update` と同じ内容で更新する。設定済みなら書かずに既存の値と `updated: false` を返す | なければ `EntityNotFoundError`。キー属性を含めると `InvalidEntityDataError` |
| `delete` | 存在を条件に削除する | なければ `EntityNotFoundError` |
| `deleteIfExists` | 無条件に削除する | なくても成功する |

- DynamoDB への呼び出しの失敗など、上の表にない例外は `DatabaseError` にする ([リポジトリのエラー](./repository-errors.md))
- 存在判定は、mapper の `buildKeys` が返すキーの先頭の属性 (パーティションキー) で行う

### 時刻

- `UpdatedAt` は `create`、`createIfAbsent`、`put`、`update`、`updateIfAttributeAbsent` のすべてで、store が `now()` で設定する。mapper の `toItem` が返す `UpdatedAt` と、`changes` の `updatedAt` は上書きまたは無視する
- `create`、`createIfAbsent`、`put` は `now()` を 1 回だけ読む。`createdAt` が省略されたら、`UpdatedAt` と同じ値で埋める
- `create` の入力は `createdAt` を省略できる。`put` の入力は `createdAt` のキーを必須にし、値は `undefined` でもよい。既存の `createdAt` を引き継ぐときは、呼び出し側が読んで渡す
- 入力に `updatedAt` は持てない (型にない)

### 書き込みの内容

| 操作 | 内容 |
|---|---|
| `create`、`createIfAbsent` | 存在しないことを条件に `PutItem` する。戻り値は、書いた Item を Entity に変換したもの (読み直さない) |
| `put` | 条件なしで `PutItem` する。`expectedUpdatedAt` があれば、Item があり `UpdatedAt` が一致することを条件にする |
| `update` | `SET` と `REMOVE` の更新式を組み立てる。更新後の Item を受け取り、Entity に変換して返す |
| `delete` | 存在を条件に削除する |

- `update` の変更が 1 件もないとき (すべて `undefined`) は、`UpdatedAt` だけを更新する
- `update` と `updateIfAttributeAbsent` の更新対象は、mapper の `toUpdateAttributes` の結果から、値が `undefined` の項目と `UpdatedAt` を除いたもの。値が `REMOVE_ATTRIBUTE` の項目は削除する
- 新名を書く (`SET` でも `REMOVE` でも) とき、mapper の `legacyAttributeNames` にある旧名を同時に削除し、二重に残さない。旧名が `UpdatedAt` やキー属性の名前と同じときは、削除の対象から外す
- 更新対象にキー属性が含まれていたら、書く前に `InvalidEntityDataError` にする
- 更新後の Item を Entity に変換するので、読めない Item への `update` は、書き込みが済んだあとに `InvalidEntityDataError` になる

### 楽観ロック

- `expectedUpdatedAt` は、保存されている `UpdatedAt` (ミリ秒の数値) との一致で判定する。旧形式 (ISO 文字列、エポック秒) のままの Item は一致せず、`OptimisticLockError` になる
- 不在と不一致を見分ける。DynamoDB 版は、条件失敗の例外に旧 Item が付くかどうかで決め (付けば不一致、付かなければ不在)、このために `expectedUpdatedAt` があるときだけ旧 Item を要求する
- `expectedUpdatedAt` がない `put` は条件なし、`update` は存在だけを条件にする

### 旧名を含む未設定の判定

`updateIfAttributeAbsent` は、`attributeName` と、mapper の `legacyAttributeNames[attributeName]` にある旧名のすべてが未設定のときだけ更新する。どれか 1 つでも設定済みなら、書かずに `updated: false` を返す。

- `null` (DynamoDB の NULL 型) で保存された属性も、設定済みとして扱う
- DynamoDB 版は、条件式で `attribute_not_exists` を新名と旧名のそれぞれに付ける。条件に失敗したときは、旧 Item が付かなければ `EntityNotFoundError`。付いたときは、強い整合性で読み直した Entity を返す。読み直しで見つからなければ、`EntityNotFoundError`
- InMemory 版は、Entity に変換する前の保存済みの Item で判定する

### `createIfAbsent` の読み直し

作成が `EntityAlreadyExistsError` で失敗したときだけ、既存の Item を読み直して返す。DynamoDB 版は、衝突相手の書き込み直後でも見えるよう、強い整合性で読む。読み直しで見つからなければ (衝突のあとに削除された)、結果を返せないので `DatabaseError` にする。

### mapper の失敗

mapper の `buildKeys`、`getKey`、`toItem`、`toUpdateAttributes`、`toEntity` が `RepositoryError` 以外の例外を投げたら、`InvalidEntityDataError` に包む (メッセージは `{処理の説明}: {元のメッセージ}`)。`RepositoryError` はそのまま通す。

### キーの検査

`create`、`createIfAbsent`、`put` は、`toItem` の結果のキー属性が `buildKeys` の結果と一致するか確かめる。欠けている、または値が違う場合は、DynamoDB へ送る前に `DatabaseError` にする。

### InMemory 版の違い

- `get` の `consistentRead` は受け取らない (常に最新を読む)
- ほかの操作は、DynamoDB 版と同じ条件で同じエラーを投げる。キー属性の不一致も同じ

## 理由

- CRUD の骨格は、継承ではなく合成で持つ。リポジトリの多くは、単一アイテムの CRUD のほかに、GSI のクエリ・トランザクション・バッチなどの独自の操作を持つ。基底クラスを継承すると、基底の都合と独自の操作がぶつかり、上書きが増える。mapper を渡す形なら、DynamoDB 版と InMemory 版が同じ mapper を共有でき、変換がずれない
- `UpdatedAt` は store が書く。呼び出し側が進め忘れると、楽観ロックの比較値が変わらず、並行する書き込みが両方通って更新が失われるため。書き込みのたびに変わる値は、書き込む側が管理する
- `put` だけ `createdAt` のキーを必須にする。`put` は全体の置き換えで、書き忘れると既存の `CreatedAt` が黙って消えるため。引き継ぐか作り直すかを、呼び出し側に書かせる
- 「なければ作る」と「未設定なら書く」を操作として持つ。条件は DynamoDB 版が条件式、InMemory 版が保存済みの Item の判定で、版ごとに書き方が違う。リポジトリが両方に書き写すと、片方だけ直してずれるため。条件が成り立たない場合 (すでにある、設定済み) は、冪等な再実行の正常系なので、例外ではなく戻り値で返す
- `updateIfAttributeAbsent` が旧名も見る。旧形式の Item は一括で移行せず、mapper が読むときに旧名も受け付ける。新名だけを見ると、旧名に値が残った Item を未設定と誤判定し、新名を書いたうえで旧名を削除して、既存の値を消してしまう
- `conflictAsOptimisticLock` は、作成の衝突を更新の衝突と同じエラーにそろえる。「読んだ時点では無かった」を前提に作る呼び出しで、再読み込みと再試行を同じ扱いにするため
- 削除を `delete` と `deleteIfExists` に分ける。存在を確かめたい削除と、冪等にしたい削除は用途が違い、どちらかに寄せると呼び出し側のステータスコードの書き方が揃わないため
- InMemory 版も、DynamoDB が拒否する書き込み (キー属性の欠落や不一致、キー属性の更新) を拒否する。InMemory 版だけが通すと、mapper の誤りがテストをすり抜けるため
- mapper の素の例外を `InvalidEntityDataError` にする。DynamoDB 版と InMemory 版で、mapper の例外の見え方をそろえるため
