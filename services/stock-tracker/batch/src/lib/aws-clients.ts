import {
  getDynamoDBDocumentClient as getSharedDynamoDBDocumentClient,
  getTableName as getSharedTableName,
} from '@nagiyu/aws';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function getDynamoDBDocumentClient(): DynamoDBDocumentClient {
  return getSharedDynamoDBDocumentClient();
}

export function getTableName(): string {
  return getSharedTableName();
}
