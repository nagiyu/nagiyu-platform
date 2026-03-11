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

export function getTableName(defaultValue?: string): string {
  const tableName = process.env.DYNAMODB_TABLE_NAME || defaultValue;

  if (!tableName) {
    throw new Error(ERROR_MESSAGES.MISSING_TABLE_NAME);
  }

  return tableName;
}
