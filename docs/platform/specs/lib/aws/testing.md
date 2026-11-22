---
sources:
  - libs/aws/src/testing/dynamodb-local.ts
  - libs/aws/src/testing/index.ts
  - libs/aws/package.json
sources_hash: 818084c06420f7e47008bec830153cf2c0436734d1bc205c3b2fdfad3e617ee8
---

# DynamoDB Local のテスト補助

契約テストが DynamoDB Local を使うときの、サービスに依存しない補助関数。テーブルスキーマを、CDK の合成結果と比べるための正規化も含む。`@nagiyu/aws/testing` から import する。

## 使い方

| 関数 | 引数 | 内容 |
|---|---|---|
| `createLocalDocClient` | なし | DynamoDB Local 用の Document クライアント |
| `createLocalRawClient` | なし | DynamoDB Local 用の低レベルクライアント (テーブルの作成と削除用) |
| `createTable` | `client`、`schema` (`CreateTableCommandInput`)、`tableName` | テーブルを作り、有効 (`ACTIVE`) になるまで待つ |
| `deleteTable` | `client`、`tableName` | テーブルを削除する。なければ何もしない |
| `clearTable` | `docClient`、`tableName` | 全項目を削除する |
| `toComparableTableSchema` | `properties` (`TableSchemaLike`) | 比較できる形に正規化したスキーマ |

### 解決のしかた

`@nagiyu/aws/testing` は、`libs/aws/package.json` の `exports` に載せていない。メインのエントリー (`@nagiyu/aws`) からも export しない。素の Node では解決できず、各サービスの `jest.contract.config.ts` の `moduleNameMapper` だけが解決する。

```ts
moduleNameMapper: {
  '^@nagiyu/aws/testing$': '<rootDir>/../../../libs/aws/src/testing/index.ts',
  '^@nagiyu/aws$': '<rootDir>/../../../libs/aws/src/index.ts',
}
```

使うサービスの契約テストの設定に、この対応を足す。

## 振る舞い

### クライアント

| 項目 | 値 |
|---|---|
| エンドポイント | 環境変数 `DYNAMODB_ENDPOINT`。未設定なら `http://localhost:8000` |
| リージョン | `us-east-1` |
| 認証情報 | アクセスキーとシークレットのどちらも `test` |
| Document クライアント | `undefined` の値を落とす |

### テーブルの操作

- `createTable` は、`schema` の `TableName` を `tableName` で上書きする。作成後、`DescribeTable` で 250 ミリ秒ごとに最大 20 回確かめ、`ACTIVE` にならなければ`DynamoDB Local でのテーブル ACTIVE 化確認がタイムアウトしました` の `Error` を投げる
- `deleteTable` は、`ResourceNotFoundException` だけを握る。ほかの失敗は投げる
- `clearTable` は、`PK` と `SK` を持つテーブルを前提にする。`Scan` で `PK` と `SK` を取り、1 件ずつ `Delete` する。`LastEvaluatedKey` がなくなるまで繰り返す
- テーブルのスキーマ (キー、属性、GSI など) は、呼び出し側が渡す。ここには持たない

### toComparableTableSchema

`KeySchema`、`AttributeDefinitions`、`GlobalSecondaryIndexes`、`BillingMode` を持つオブジェクトを、`toEqual` で突き合わせられる形にする。CDK の合成結果 (CloudFormation の `Properties`) と、契約テストのローカルなスキーマ定義のどちらも受け付ける。

| 項目 | 正規化 |
|---|---|
| `AttributeDefinitions` | `AttributeName` の順に並べる |
| `GlobalSecondaryIndexes` | `IndexName` の順に並べる。各 GSI の `Projection.NonKeyAttributes` も名前の順に並べる |
| 欠けた項目 | 空文字列、空の配列にする。ただし `Projection.NonKeyAttributes` が無いときは、キーごと持たない |

アサーションは含めない。純粋な変換だけを行い、比較は呼び出し側が行う。

## 理由

- `exports` に載せない。テスト専用のコードを、本番のバンドルが誤って import する経路を作らないため
- テーブルスキーマを引数にする。サービスごとにテーブル設計が違うため
