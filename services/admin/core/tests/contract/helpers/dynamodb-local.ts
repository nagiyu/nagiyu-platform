/**
 * DynamoDB Local ヘルパー
 *
 * 契約テスト（tests/contract/）専用のヘルパー。
 * テーブルスキーマに依存しない汎用部分は `@nagiyu/aws/testing` から直接 import し、
 * ここには error-events テーブル固有のスキーマ定義と、それを束縛した `createTable` だけを置く。
 */

import type { DynamoDBClient, CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import { createTable as createTableBase } from '@nagiyu/aws/testing';

/**
 * infra/shared/lib/error-events-table-stack.ts の本番テーブル定義のうち、
 * 読み書きの振る舞いに関わるキー設計 (PK/SK と GSI `AllByOccurredAt`) を写したスキーマ。
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
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'AllByOccurredAt',
      KeySchema: [
        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
};

/**
 * DynamoDB Local に error-events テーブルを作成する。
 *
 * @param client - 低レベル DynamoDB クライアント
 * @param tableName - 作成するテーブル名
 */
export async function createTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await createTableBase(client, LOCAL_TABLE_SCHEMA, tableName);
}
