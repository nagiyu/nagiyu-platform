import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { clearDynamoDBClientCache, getDynamoDBDocumentClient } from '@nagiyu/aws';

export function clearAwsClientsCache(): void {
  clearDynamoDBClientCache();
}

export function getAwsClients() {
  const awsRegion = process.env.AWS_REGION || 'us-east-1';

  return {
    docClient: getDynamoDBDocumentClient(awsRegion),
  };
}

export function getDocClient(): DynamoDBDocumentClient | undefined {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return undefined;
  }
  return getAwsClients().docClient;
}
