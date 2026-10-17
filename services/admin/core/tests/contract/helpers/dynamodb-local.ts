/**
 * 契約テスト専用の DynamoDB Local ヘルパー。
 * テーブルスキーマに依存しない処理は `@nagiyu/aws/testing` を直接使う。
 */

import type { DynamoDBClient, CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import { createTable as createTableBase } from '@nagiyu/aws/testing';

/**
 * infra/admin/lib/dynamodb-stack.ts の本番テーブル定義と合わせたスキーマ。
 * EndpointIndex のソートキーが GSI1SK である点も本番に合わせる。
 * TableName はプレースホルダで、作成時に実際の名前で上書きする。
 */
export const ADMIN_TABLE_SCHEMA: CreateTableCommandInput = {
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
      IndexName: 'UserIndex',
      KeySchema: [
        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'EndpointIndex',
      KeySchema: [
        { AttributeName: 'GSI2PK', KeyType: 'HASH' },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
};

/**
 * infra/shared/lib/error-events-table-stack.ts の本番テーブル定義のうち、
 * 読み書きの振る舞いに関わるキー設計 (PK/SK と GSI `AllByOccurredAt`) を写したスキーマ。
 * TableName はプレースホルダで、作成時に実際の名前で上書きする。
 */
export const ERROR_EVENTS_TABLE_SCHEMA: CreateTableCommandInput = {
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

/** DynamoDB Local に admin のテーブルを作る */
export async function createAdminTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await createTableBase(client, ADMIN_TABLE_SCHEMA, tableName);
}

/** DynamoDB Local に error-events のテーブルを作る */
export async function createErrorEventsTable(
  client: DynamoDBClient,
  tableName: string
): Promise<void> {
  await createTableBase(client, ERROR_EVENTS_TABLE_SCHEMA, tableName);
}
