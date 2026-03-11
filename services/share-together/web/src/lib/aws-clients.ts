import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let cachedDocClient: DynamoDBDocumentClient | null = null;

export function clearAwsClientsCache(): void {
  cachedDocClient = null;
}

export function getAwsClients() {
  const awsRegion = process.env.AWS_REGION || 'us-east-1';

  if (!cachedDocClient) {
    const dynamoClient = new DynamoDBClient({ region: awsRegion });
    cachedDocClient = DynamoDBDocumentClient.from(dynamoClient);
  }

  return {
    docClient: cachedDocClient,
  };
}

export function getDocClient(): DynamoDBDocumentClient | undefined {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return undefined;
  }
  return getAwsClients().docClient;
}
