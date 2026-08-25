/**
 * DynamoDB Local テストヘルパー（汎用部分）
 *
 * 契約テスト（各サービスの tests/contract/）が共通して必要とする、
 * テーブルスキーマ定義に依存しない部分のみをここに切り出す。
 * サービス固有のテーブルスキーマ（`LOCAL_TABLE_SCHEMA` 等）は各サービスの
 * `tests/contract/helpers/` に残し、ここには置かない。
 *
 * メインエントリー（`@nagiyu/aws`）からは export しない。
 * テスト専用コードを本番バンドルに混ぜないよう、サブパス `@nagiyu/aws/testing` からのみ import する。
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  type CreateTableCommandInput,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  TABLE_ACTIVE_TIMEOUT: 'DynamoDB Local でのテーブル ACTIVE 化確認がタイムアウトしました',
} as const;

const DEFAULT_ENDPOINT = 'http://localhost:8000';
const DEFAULT_REGION = 'us-east-1';
const TABLE_ACTIVE_POLL_INTERVAL_MS = 250;
const TABLE_ACTIVE_MAX_ATTEMPTS = 20;

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
 * DynamoDB Local にテーブルを作成する。
 * 作成後、テーブルが ACTIVE になるまで軽くポーリングする。
 *
 * テーブルスキーマ（KeySchema / AttributeDefinitions / GlobalSecondaryIndexes 等）は
 * 呼び出し側（各サービスの `tests/contract/helpers/`）が `CreateTableCommandInput` として渡す。
 *
 * @param client - 低レベル DynamoDB クライアント
 * @param schema - テーブル定義（`TableName` はここで渡す `tableName` で上書きされる）
 * @param tableName - 作成するテーブル名
 */
export async function createTable(
  client: DynamoDBClient,
  schema: CreateTableCommandInput,
  tableName: string
): Promise<void> {
  await client.send(new CreateTableCommand({ ...schema, TableName: tableName }));
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

/**
 * テーブルの全アイテムを削除する（PK/SK の Single Table 前提）。
 * Scan → PK/SK 指定 Delete を LastEvaluatedKey が無くなるまで繰り返す。
 * 各テストの前処理でテーブルをクリーンな状態に戻すために使う。
 *
 * @param docClient - DynamoDB Document クライアント
 * @param tableName - 対象テーブル名
 */
export async function clearTable(
  docClient: DynamoDBDocumentClient,
  tableName: string
): Promise<void> {
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    for (const item of scanResult.Items ?? []) {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { PK: item.PK, SK: item.SK },
        })
      );
    }

    exclusiveStartKey = scanResult.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey !== undefined);
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

// --- テーブルスキーマ ドリフトガード用の正規化 ---

interface ComparableKeySchemaElement {
  AttributeName: string;
  KeyType: string;
}

interface ComparableAttributeDefinition {
  AttributeName: string;
  AttributeType: string;
}

interface ComparableProjection {
  ProjectionType: string;
  NonKeyAttributes?: string[];
}

interface ComparableGlobalSecondaryIndex {
  IndexName: string;
  KeySchema: ComparableKeySchemaElement[];
  Projection: ComparableProjection;
}

/**
 * 正規化前のテーブルスキーマとして受け付ける形。
 * CDK synth 結果（CloudFormation Properties）と、契約テストのローカルスキーマ定義
 * （`CreateTableCommandInput` 等）の両方を構造的に受け付けられるよう、フィールドは
 * すべて optional にしている。
 */
export interface TableSchemaLike {
  KeySchema?: Array<{ AttributeName?: string; KeyType?: string }>;
  AttributeDefinitions?: Array<{ AttributeName?: string; AttributeType?: string }>;
  GlobalSecondaryIndexes?: Array<{
    IndexName?: string;
    KeySchema?: Array<{ AttributeName?: string; KeyType?: string }>;
    Projection?: { ProjectionType?: string; NonKeyAttributes?: string[] };
  }>;
  BillingMode?: string;
}

/**
 * 正規化後のテーブルスキーマ（比較可能な形）。
 */
export interface ComparableTableSchema {
  KeySchema: ComparableKeySchemaElement[];
  AttributeDefinitions: ComparableAttributeDefinition[];
  GlobalSecondaryIndexes: ComparableGlobalSecondaryIndex[];
  BillingMode: string;
}

/**
 * `KeySchema` / `AttributeDefinitions` / `GlobalSecondaryIndexes` / `BillingMode` を持つ
 * オブジェクトを、比較可能な正規形へ正規化する純関数。
 *
 * - `AttributeDefinitions` は属性名（`AttributeName`）順にソートする
 * - `GlobalSecondaryIndexes` は `IndexName` 順にソートする
 * - 各 GSI の `Projection.NonKeyAttributes` も名前順にソートする
 *
 * CDK synth 結果とローカルのテーブルスキーマ定義を 1 回の `toEqual` で突き合わせるために使う。
 * jest の assertion はここに持ち込まず、純粋な変換のみを行う（アサーションは呼び出し側で行う）。
 */
export function toComparableTableSchema(properties: TableSchemaLike): ComparableTableSchema {
  const keySchema = (properties.KeySchema ?? []).map((element) => ({
    AttributeName: element.AttributeName ?? '',
    KeyType: element.KeyType ?? '',
  }));

  const attributeDefinitions = [...(properties.AttributeDefinitions ?? [])]
    .map((attr) => ({
      AttributeName: attr.AttributeName ?? '',
      AttributeType: attr.AttributeType ?? '',
    }))
    .sort((a, b) => a.AttributeName.localeCompare(b.AttributeName));

  const globalSecondaryIndexes = [...(properties.GlobalSecondaryIndexes ?? [])]
    .map((gsi) => {
      const projection: ComparableProjection = {
        ProjectionType: gsi.Projection?.ProjectionType ?? '',
        ...(gsi.Projection?.NonKeyAttributes
          ? { NonKeyAttributes: [...gsi.Projection.NonKeyAttributes].sort() }
          : {}),
      };
      return {
        IndexName: gsi.IndexName ?? '',
        KeySchema: (gsi.KeySchema ?? []).map((element) => ({
          AttributeName: element.AttributeName ?? '',
          KeyType: element.KeyType ?? '',
        })),
        Projection: projection,
      };
    })
    .sort((a, b) => a.IndexName.localeCompare(b.IndexName));

  return {
    KeySchema: keySchema,
    AttributeDefinitions: attributeDefinitions,
    GlobalSecondaryIndexes: globalSecondaryIndexes,
    BillingMode: properties.BillingMode ?? '',
  };
}
