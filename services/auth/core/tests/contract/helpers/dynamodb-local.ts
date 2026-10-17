/**
 * DynamoDB Local ヘルパー
 *
 * 契約テスト (tests/contract/) 専用のヘルパー。
 * クライアント生成やテーブル削除など、テーブルスキーマに依存しない汎用部分は
 * `@nagiyu/aws/testing` から呼び出し側が直接 import する。
 * ここには auth 固有のテーブルスキーマ定義と、それを束縛した操作だけを置く。
 */

import type { DynamoDBClient, CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createTable as createTableBase } from '@nagiyu/aws/testing';

/**
 * infra/auth/lib/dynamodb-stack.ts の本番テーブル定義 (キー・GSI) と一致させたスキーマ。
 * TableName はプレースホルダであり、テーブル作成時に実際の名前で上書きする。
 */
export const LOCAL_TABLE_SCHEMA: CreateTableCommandInput = {
  TableName: '__placeholder__',
  BillingMode: 'PAY_PER_REQUEST',
  KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
  AttributeDefinitions: [
    { AttributeName: 'userId', AttributeType: 'S' },
    { AttributeName: 'googleId', AttributeType: 'S' },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'googleId-index',
      KeySchema: [{ AttributeName: 'googleId', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
};

/**
 * DynamoDB Local にテーブルを作成する (LOCAL_TABLE_SCHEMA を使用)。
 *
 * @param client - 低レベル DynamoDB クライアント
 * @param tableName - 作成するテーブル名
 */
export async function createTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await createTableBase(client, LOCAL_TABLE_SCHEMA, tableName);
}

/**
 * テーブルの全アイテムを削除する。
 * `@nagiyu/aws/testing` の clearTable は PK/SK 前提のため、`userId` 単一キー用に持つ。
 *
 * @param docClient - DynamoDB Document クライアント
 * @param tableName - 対象テーブル名
 */
export async function clearUsersTable(
  docClient: DynamoDBDocumentClient,
  tableName: string
): Promise<void> {
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'userId',
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    for (const item of scanResult.Items ?? []) {
      await docClient.send(
        new DeleteCommand({ TableName: tableName, Key: { userId: item.userId } })
      );
    }

    exclusiveStartKey = scanResult.LastEvaluatedKey;
  } while (exclusiveStartKey);
}
