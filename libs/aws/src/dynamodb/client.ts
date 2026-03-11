import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const DEFAULT_REGION = 'us-east-1';
const ERROR_MESSAGES = {
  MISSING_TABLE_NAME: '環境変数 DYNAMODB_TABLE_NAME が設定されていません',
} as const;

const cachedClients = new Map<string, DynamoDBDocumentClient>();

export function clearDynamoDBClientCache(): void {
  cachedClients.clear();
}

/**
 * DynamoDB Document Client を取得する。
 * 同一リージョンのクライアントはキャッシュを再利用し、未指定時は `AWS_REGION`、
 * さらに未設定の場合は CloudFront 運用方針に合わせて `us-east-1` を使用する。
 */
export function getDynamoDBDocumentClient(region?: string): DynamoDBDocumentClient {
  const targetRegion = region || process.env.AWS_REGION || DEFAULT_REGION;
  const cachedClient = cachedClients.get(targetRegion);

  if (cachedClient) {
    return cachedClient;
  }

  const client = new DynamoDBClient({
    region: targetRegion,
  });

  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  cachedClients.set(targetRegion, docClient);
  return docClient;
}

/**
 * DynamoDB テーブル名を取得する。
 * `DYNAMODB_TABLE_NAME` が未設定のときは `defaultValue` を使用し、
 * 両方未設定の場合はエラーをスローする。
 *
 * @param defaultValue - 開発環境などで `DYNAMODB_TABLE_NAME` 未設定時に使用するフォールバック値
 * @returns 解決された DynamoDB テーブル名
 * @throws {Error} `DYNAMODB_TABLE_NAME` と `defaultValue` の両方が未設定の場合
 */
export function getTableName(defaultValue?: string): string {
  const tableName = process.env.DYNAMODB_TABLE_NAME || defaultValue;

  if (!tableName) {
    throw new Error(ERROR_MESSAGES.MISSING_TABLE_NAME);
  }

  return tableName;
}
