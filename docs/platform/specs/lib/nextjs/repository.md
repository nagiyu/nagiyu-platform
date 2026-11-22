---
sources:
  - libs/nextjs/src/repository.ts
sources_hash: 8dfd905afbc0284a3442c1d179cbef556a4d7e681a58bb5fe177687fa6e1991d
---

# リポジトリの初期化

API ルートのハンドラに、DynamoDB のリポジトリを組み立てて渡す。`@nagiyu/nextjs` から import する。サービスからは使われていない。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `withRepository(getDynamoDBClient, getTableName, Repository, handler)` | クライアントを返す関数、テーブル名を返す関数、リポジトリのクラス、ハンドラ | ハンドラの第 1 引数にリポジトリを渡すハンドラ |
| `withRepositories(getDynamoDBClient, getTableName, repositories, handler)` | 同上、ただしリポジトリのクラスの配列 | ハンドラの第 1 引数にリポジトリの配列を渡すハンドラ |

リポジトリのクラスは、`(client: DynamoDBDocumentClient, tableName: string)` を引数に取るコンストラクタを持つこと。`handler` の残りの引数は、返したハンドラの引数がそのまま渡る。

```typescript
export const GET = withRepository(getDynamoDBClient, getTableName, HoldingRepository, async (repo) => {
    return NextResponse.json(await repo.list());
});
```

## 振る舞い

- 返したハンドラが呼ばれるたびに、クライアントとテーブル名を取得し、リポジトリを新しく作る
- `withRepositories` は、配列のすべてのクラスに同じクライアントとテーブル名を渡し、同じ順の配列にして渡す
- 例外は握らず、そのまま投げる

## 理由

- `@aws-sdk/lib-dynamodb` を optional な peer dependency にしているのは、このファイルがコンストラクタの型に `DynamoDBDocumentClient` を使うため。型の import だけなので、使わない側にインストールを強いない
