/**
 * DynamoDB Local ヘルパー
 *
 * 契約テスト（tests/contract/）専用のヘルパー。
 * クライアント生成・テーブル削除・テーブルクリア等、テーブルスキーマに依存しない汎用部分は
 * `@nagiyu/aws/testing` から呼び出し側が直接 import する（意味のない再エクスポートはしない）。
 * ここには share-together 固有のテーブルスキーマ定義（`LOCAL_TABLE_SCHEMA`）と、
 * それを束縛した `createTable`（意味のある抽象）だけを置く。
 */

import type { DynamoDBClient, CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import { createTable as createTableBase } from '@nagiyu/aws/testing';

/**
 * infra/share-together/lib/dynamodb-stack.ts の本番テーブル定義と一致させたスキーマ。
 *
 * table-schema-drift.test.ts で CDK synth 結果と突き合わせ、
 * 本番定義とローカル契約テストのスキーマが乖離した場合に検知する。
 * GSI2 はソートキーを持たない（メールアドレスの完全一致引きだけに使う）。
 * TableName はプレースホルダであり、テーブル作成時に実際の名前で上書きする。
 */
export const LOCAL_TABLE_SCHEMA: CreateTableCommandInput = {
  TableName: '__placeholder__',
  BillingMode: 'PAY_PER_REQUEST',
  KeySchema: [
    { AttributeName: 'PK', KeyType: 'HASH' },
    { AttributeName: 'SK', KeyType: 'RANGE' },
  ],
  AttributeDefinitions: [
    { AttributeName: 'PK', AttributeType: 'S' },
    { AttributeName: 'SK', AttributeType: 'S' },
    { AttributeName: 'GSI1PK', AttributeType: 'S' },
    { AttributeName: 'GSI1SK', AttributeType: 'S' },
    { AttributeName: 'GSI2PK', AttributeType: 'S' },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'GSI1',
      KeySchema: [
        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'GSI2',
      KeySchema: [{ AttributeName: 'GSI2PK', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
};

/**
 * DynamoDB Local にテーブルを作成する（LOCAL_TABLE_SCHEMA を使用）。
 * 作成後、テーブルが ACTIVE になるまで軽くポーリングする。
 * サービス固有のスキーマ（LOCAL_TABLE_SCHEMA）を束縛している点が
 * `@nagiyu/aws/testing` の汎用 `createTable` との違い（このヘルパーを置く理由）。
 *
 * @param client - 低レベル DynamoDB クライアント
 * @param tableName - 作成するテーブル名
 */
export async function createTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await createTableBase(client, LOCAL_TABLE_SCHEMA, tableName);
}
