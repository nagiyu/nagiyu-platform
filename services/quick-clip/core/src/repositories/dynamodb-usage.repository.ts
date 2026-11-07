import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBUsageCounter, isConditionalCheckFailed, toDatabaseError } from '@nagiyu/aws';
import type { UsageKind } from '../types.js';
import type { UsageCounts, UsageRepository } from './usage.repository.interface.js';
import {
  COUNTER_ATTRIBUTES,
  COUNTER_ITEM_TYPE,
  IP_COUNT_ATTRIBUTE,
  IP_ITEM_TYPE,
  SALT_ITEM_TYPE,
  buildCounterKey,
  buildIpKey,
  buildSaltKey,
} from '../mappers/usage-keys.js';

/**
 * DynamoDB Usage Repository
 *
 * ジョブと同じテーブルに同居する。
 */
export class DynamoDBUsageRepository implements UsageRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly counter: DynamoDBUsageCounter;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.counter = new DynamoDBUsageCounter(docClient, tableName);
  }

  public async tryConsume(input: {
    subject: string;
    month: string;
    kind: UsageKind;
    limit: number;
    ttlSec: number;
  }): Promise<boolean> {
    return this.counter.tryIncrement({
      key: buildCounterKey(input.subject, input.month),
      attribute: COUNTER_ATTRIBUTES[input.kind],
      itemType: COUNTER_ITEM_TYPE,
      limit: input.limit,
      ttlSec: input.ttlSec,
    });
  }

  public async release(input: { subject: string; month: string; kind: UsageKind }): Promise<void> {
    await this.counter.decrement({
      key: buildCounterKey(input.subject, input.month),
      attribute: COUNTER_ATTRIBUTES[input.kind],
    });
  }

  public async getCounts(subject: string, month: string): Promise<UsageCounts> {
    const counts = await this.counter.read(buildCounterKey(subject, month), [
      COUNTER_ATTRIBUTES.ai,
      COUNTER_ATTRIBUTES.noAi,
    ]);
    return { ai: counts[COUNTER_ATTRIBUTES.ai], noAi: counts[COUNTER_ATTRIBUTES.noAi] };
  }

  public async tryConsumeIp(input: {
    day: string;
    ipHash: string;
    limit: number;
    ttlSec: number;
  }): Promise<boolean> {
    return this.counter.tryIncrement({
      key: buildIpKey(input.day, input.ipHash),
      attribute: IP_COUNT_ATTRIBUTE,
      itemType: IP_ITEM_TYPE,
      limit: input.limit,
      ttlSec: input.ttlSec,
    });
  }

  public async getOrCreateDailySalt(
    day: string,
    candidateSalt: string,
    ttlSec: number
  ): Promise<string> {
    const key = buildSaltKey(day);
    try {
      const existing = await this.readSalt(key);
      if (existing !== undefined) {
        return existing;
      }
      try {
        await this.docClient.send(
          new PutCommand({
            TableName: this.tableName,
            Item: { ...key, Type: SALT_ITEM_TYPE, Salt: candidateSalt, TTL: ttlSec },
            ConditionExpression: 'attribute_not_exists(PK)',
          })
        );
        return candidateSalt;
      } catch (error) {
        if (!isConditionalCheckFailed(error)) {
          throw error;
        }
        // 同時に別のリクエストが先に作ったので、その塩を使う
        const created = await this.readSalt(key);
        if (created === undefined) {
          throw error;
        }
        return created;
      }
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  private async readSalt(key: { PK: string; SK: string }): Promise<string | undefined> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true })
    );
    const salt = result.Item?.Salt;
    return typeof salt === 'string' ? salt : undefined;
  }
}
