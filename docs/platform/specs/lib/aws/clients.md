---
sources:
  - libs/aws/src/clients.ts
  - libs/aws/src/dynamodb/client.ts
  - libs/aws/src/batch/index.ts
  - libs/aws/src/lambda/client.ts
  - libs/aws/src/s3/client.ts
sources_hash: 01766d285eb7a87ae0b141d2d6712e50d7c7fa0eb9b25732de6147ea3386f122
---

# AWS クライアント

DynamoDB、S3、Batch、Lambda の SDK クライアントを、リージョンごとに 1 つ作って使い回す。`@nagiyu/aws` から import する。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `getAwsClients` | `region` (省略可) | `{ docClient, s3Client, batchClient, lambdaClient }` |
| `getDynamoDBDocumentClient` | `region` (省略可) | DynamoDB の Document クライアント |
| `getS3Client` | `region` (省略可) | S3 クライアント |
| `getBatchClient` | `region` (省略可) | Batch クライアント |
| `getLambdaClient` | `region` (省略可) | Lambda クライアント |
| `getTableName` | `defaultValue` (省略可) | DynamoDB のテーブル名 |
| `clearAwsClientsCache` | なし | 4 種類すべてのキャッシュを消す |
| `clearDynamoDBClientCache`、`clearS3ClientCache`、`clearBatchClientCache`、`clearLambdaClientCache` | なし | その種類のキャッシュだけを消す |

```ts
const { docClient, s3Client } = getAwsClients();
const tableName = getTableName();
```

## 振る舞い

### リージョンとキャッシュ

- リージョンは、引数、環境変数 `AWS_REGION`、`us-east-1` の順で決める
- クライアントは種類ごとに、リージョンをキーにして保持する。同じリージョンなら同じインスタンスを返す
- `getAwsClients` は 4 種類それぞれの `get*` を呼ぶだけで、独自のキャッシュを持たない
- キャッシュを消す関数 (`clear*`) は、サービスからは使われていない

### DynamoDB

| 項目 | 内容 |
|---|---|
| 返すクライアント | `DynamoDBClient` を Document クライアントで包んだもの |
| 値が `undefined` の属性 | 送らずに落とす (`removeUndefinedValues`) |

`getTableName` は、環境変数 `DYNAMODB_TABLE_NAME`、引数 `defaultValue` の順で決める。両方なければ「環境変数 DYNAMODB_TABLE_NAME が設定されていません」の `Error` を投げる。

### S3

`getS3Client` は、キャッシュしない `createS3Client` ([S3](./s3.md)) を呼んで結果を保持する。

## 理由

- クライアントはリージョンごとに使い回す。呼び出しのたびに作り直さないため
- リージョンの既定を `us-east-1` にする。CloudFront の運用方針に合わせるため
- Document クライアントで `undefined` を落とす。`undefined` を含む値は、そのままでは DynamoDB に送れず、マーシャリングでエラーになるため
