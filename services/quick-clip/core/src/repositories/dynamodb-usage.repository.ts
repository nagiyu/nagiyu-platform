import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, DynamoDBUsageCounter } from '@nagiyu/aws';
import { DailySaltMapper } from '../mappers/daily-salt.mapper.js';
import { CountingUsageRepository } from './counting-usage.repository.js';

/**
 * DynamoDB Usage Repository
 *
 * ジョブと同じテーブルに同居する。
 */
export class DynamoDBUsageRepository extends CountingUsageRepository {
  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(
      new DynamoDBUsageCounter(docClient, tableName),
      new DynamoDBEntityStore(docClient, tableName, new DailySaltMapper())
    );
  }
}
