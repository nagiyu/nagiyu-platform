import { getDynamoDBDocumentClient, getTableName } from '@nagiyu/aws';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function getDynamoDb(): DynamoDBDocumentClient {
  return getDynamoDBDocumentClient();
}

export function getUsersTableName(): string {
  return getTableName('nagiyu-auth-users-dev');
}
