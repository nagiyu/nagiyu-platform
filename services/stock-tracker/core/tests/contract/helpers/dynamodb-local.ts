/**
 * DynamoDB Local ヘルパー
 *
 * 契約テスト（tests/contract/）専用のヘルパー。
 * DynamoDB Local（http://localhost:8000 等）への接続クライアント生成、
 * テーブルの作成・削除、および本番CDKスタックと一致させるべきテーブルスキーマ定義を提供する。
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  type CreateTableCommandInput,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  TABLE_ACTIVE_TIMEOUT: 'DynamoDB Local でのテーブル ACTIVE 化確認がタイムアウトしました',
} as const;

const DEFAULT_ENDPOINT = 'http://localhost:8000';
const DEFAULT_REGION = 'us-east-1';
const TABLE_ACTIVE_POLL_INTERVAL_MS = 250;
const TABLE_ACTIVE_MAX_ATTEMPTS = 20;

/**
 * infra/stock-tracker/lib/dynamodb-stack.ts の本番テーブル定義と一致させたスキーマ。
 *
 * table-schema-drift.test.ts で CDK synth 結果と突き合わせ、
 * 本番定義とローカル契約テストのスキーマが乖離した場合に検知する。
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
    { AttributeName: 'GSI2SK', AttributeType: 'S' },
    { AttributeName: 'GSI3PK', AttributeType: 'S' },
    { AttributeName: 'GSI3SK', AttributeType: 'S' },
    { AttributeName: 'GSI4PK', AttributeType: 'S' },
    { AttributeName: 'GSI4SK', AttributeType: 'S' },
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
      IndexName: 'AlertIndex',
      KeySchema: [
        { AttributeName: 'GSI2PK', KeyType: 'HASH' },
        { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'ExchangeTickerIndex',
      KeySchema: [
        { AttributeName: 'GSI3PK', KeyType: 'HASH' },
        { AttributeName: 'GSI3SK', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'ExchangeSummaryIndex',
      KeySchema: [
        { AttributeName: 'GSI4PK', KeyType: 'HASH' },
        { AttributeName: 'GSI4SK', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
};

/**
 * DynamoDB Local 用の DocumentClient を生成する。
 * エンドポイントは環境変数 `DYNAMODB_ENDPOINT`（未設定時は http://localhost:8000）を使用する。
 */
export function createLocalDocClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(createLocalRawClient(), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

/**
 * DynamoDB Local 用の低レベルクライアント（テーブル作成・削除用）を生成する。
 */
export function createLocalRawClient(): DynamoDBClient {
  return new DynamoDBClient({
    endpoint: process.env.DYNAMODB_ENDPOINT ?? DEFAULT_ENDPOINT,
    region: DEFAULT_REGION,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  });
}

/**
 * DynamoDB Local にテーブルを作成する（LOCAL_TABLE_SCHEMA を使用）。
 * 作成後、テーブルが ACTIVE になるまで軽くポーリングする。
 *
 * @param client - 低レベル DynamoDB クライアント
 * @param tableName - 作成するテーブル名
 */
export async function createTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await client.send(new CreateTableCommand({ ...LOCAL_TABLE_SCHEMA, TableName: tableName }));
  await waitForTableActive(client, tableName);
}

/**
 * DynamoDB Local のテーブルを削除する。既に存在しない場合は何もしない。
 *
 * @param client - 低レベル DynamoDB クライアント
 * @param tableName - 削除するテーブル名
 */
export async function deleteTable(client: DynamoDBClient, tableName: string): Promise<void> {
  try {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  } catch (error) {
    if (isResourceNotFoundException(error)) {
      return;
    }
    throw error;
  }
}

async function waitForTableActive(client: DynamoDBClient, tableName: string): Promise<void> {
  for (let attempt = 0; attempt < TABLE_ACTIVE_MAX_ATTEMPTS; attempt += 1) {
    const result = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (result.Table?.TableStatus === 'ACTIVE') {
      return;
    }
    await sleep(TABLE_ACTIVE_POLL_INTERVAL_MS);
  }
  throw new Error(ERROR_MESSAGES.TABLE_ACTIVE_TIMEOUT);
}

function isResourceNotFoundException(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'ResourceNotFoundException'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
