---
sources:
  - libs/aws/src/dynamodb/repository-registry.ts
  - libs/aws/src/dynamodb/repository-factory.ts
sources_hash: 98a9eab1d23f71f5a534aed79565cf839e4208caafe0d3987ee8ea5a248605ad
---

# リポジトリの登録と生成

環境変数 `USE_IN_MEMORY_DB` に応じて、InMemory 版と DynamoDB 版のリポジトリを切り替えて生成し、シングルトンとして保持する。複数のリポジトリを 1 つの定義で登録する `registerDynamoRepositories` と、1 つ分の `createRepositoryFactory` がある。`@nagiyu/aws` から import する。

## 使い方

### registerDynamoRepositories

| 引数 | 内容 |
|---|---|
| `defs` | リポジトリ名をキーにした定義。各定義は `createInMemoryRepository(sharedStore)` と `createDynamoDBRepository({ docClient, tableName })` を持つ |
| `options.keyPrefix` (省略可) | 指定すると、インスタンスを `globalThis` に保持する |
| `options.createSharedStore` (省略可) | InMemory 版のリポジトリが共有するストアの生成関数 |

戻り値は、各リポジトリ名に対する `{ createRepository(docClient?, tableName?), resetRepository() }` と、全体を破棄する `resetAll()`。

```ts
const registry = registerDynamoRepositories(
  {
    user: {
      createInMemoryRepository: (store) => new InMemoryUserRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBUserRepository(docClient, tableName),
    },
  },
  { keyPrefix: 'auth', createSharedStore: () => new InMemorySingleTableStore() }
);

const repository = registry.user.createRepository();
```

### createRepositoryFactory

`createRepositoryFactory(config, instanceKey?)` は、1 つのリポジトリ分の生成と破棄の対を返す。`config` は `createInMemoryRepository()` と `createDynamoDBRepository(...args)` を持つ。戻り値は `{ createRepository(...args), resetRepository() }`。`registerDynamoRepositories` は、リポジトリごとにこれを使う。

### requireDynamoParams

`requireDynamoParams(docClient, tableName)` は、どちらも指定されていれば `{ docClient, tableName }` を返し、片方でも欠けていれば`DynamoDB 実装には docClient と tableName が必要です` の `Error` を投げる。

## 振る舞い

### 実装の選択

| 条件 | 生成するもの |
|---|---|
| 環境変数 `USE_IN_MEMORY_DB` が `'true'` | InMemory 版 |
| それ以外 | DynamoDB 版 |

- 環境変数は、`createRepository` を呼んだときに読む。生成済みなら読まない
- DynamoDB 版の引数は、`docClient` が省略されれば `getDynamoDBDocumentClient()`、`tableName` が省略されれば `getTableName()` ([AWS クライアント](./clients.md)) で決める。`DYNAMODB_TABLE_NAME` がなければ、`getTableName()` が `Error` を投げる
- InMemory 版では、`createRepository` の引数は使わない

### シングルトン

- リポジトリは、名前ごとに最初に生成したものを使い回す。2 回目以降の `createRepository` に別の `docClient` や `tableName` を渡しても、最初のものを返す
- `resetRepository()` は、その名前のインスタンスを破棄する。次の `createRepository` で作り直す
- `resetAll()` は、すべての名前のインスタンスと、共有ストアを破棄する

### keyPrefix

- `keyPrefix` を指定すると、インスタンスを `{keyPrefix}.{リポジトリ名}` のキーで `globalThis` に保持する。同じキーなら、モジュールが複製されていても同じインスタンスを返す
- 指定しなければ、ファクトリーのクロージャ内に保持する

### 共有ストア

- `createSharedStore` は、最初に InMemory 版のリポジトリを作るときに 1 回だけ呼び、結果をすべての InMemory 版の `createInMemoryRepository` に渡す。DynamoDB 版では呼ばない
- 共有ストアは、その registry の中だけで保持する (`globalThis` には置かない)。複数の registry やバンドルをまたいで同じストアを使いたいときは、`createSharedStore` が `globalThis` に保持したストアを返す

## 理由

- 実装の選択と共有ストアの受け渡しを、1 か所に集める。呼び出し側が実装を直接 `new` すると、InMemory に切り替えられなくなるため
- `keyPrefix` で `globalThis` に保持する。Next.js の dev ではモジュールが評価し直されることがあり、モジュール内の変数だけで保持すると、registry が作り直されて InMemory のデータが失われるため
- リポジトリをシングルトンにする。初めに渡した `docClient` と `tableName` を使い続けるので、テストで差し替えるときは `resetRepository()` や `resetAll()` で破棄してから作り直す
