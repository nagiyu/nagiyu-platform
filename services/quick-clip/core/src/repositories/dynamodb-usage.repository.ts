import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { isConditionalCheckFailed, toDatabaseError } from '@nagiyu/aws';
import type { UsageKind } from '../types.js';
import type { UsageCounts, UsageRepository } from './usage.repository.interface.js';
import {
  COUNTER_ATTRIBUTES,
  COUNTER_ITEM_TYPE,
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

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async tryConsume(input: {
    subject: string;
    month: string;
    kind: UsageKind;
    limit: number;
    ttlSec: number;
  }): Promise<boolean> {
    // 上限 0 では「属性が無ければ通す」条件が成り立ち、1 回目が通ってしまう
    if (input.limit <= 0) {
      return false;
    }
    return this.increment(
      buildCounterKey(input.subject, input.month),
      COUNTER_ATTRIBUTES[input.kind],
      COUNTER_ITEM_TYPE,
      input.limit,
      input.ttlSec
    );
  }

  public async release(input: { subject: string; month: string; kind: UsageKind }): Promise<void> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: buildCounterKey(input.subject, input.month),
          UpdateExpression: 'ADD #cnt :minusOne',
          // 0 以下や記録なしでは何もしない (0 未満にしない、アイテムを新しく作らない)
          ConditionExpression: '#cnt > :zero',
          ExpressionAttributeNames: { '#cnt': COUNTER_ATTRIBUTES[input.kind] },
          ExpressionAttributeValues: { ':minusOne': -1, ':zero': 0 },
        })
      );
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        return;
      }
      throw toDatabaseError(error);
    }
  }

  public async getCounts(subject: string, month: string): Promise<UsageCounts> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: buildCounterKey(subject, month),
          ConsistentRead: true,
        })
      );
      const item = result.Item;
      return {
        ai: Number(item?.[COUNTER_ATTRIBUTES.ai] ?? 0),
        noAi: Number(item?.[COUNTER_ATTRIBUTES.noAi] ?? 0),
      };
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  public async tryConsumeIp(input: {
    day: string;
    ipHash: string;
    limit: number;
    ttlSec: number;
  }): Promise<boolean> {
    if (input.limit <= 0) {
      return false;
    }
    return this.increment(
      buildIpKey(input.day, input.ipHash),
      'Count',
      IP_ITEM_TYPE,
      input.limit,
      input.ttlSec
    );
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

  /** 属性を上限未満のときだけ 1 増やす。TTL は初回のみ設定し、期間内の自然な満了を保つ */
  private async increment(
    key: { PK: string; SK: string },
    attributeName: string,
    itemType: string,
    limit: number,
    ttlSec: number
  ): Promise<boolean> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: key,
          UpdateExpression: 'ADD #cnt :one SET #ttl = if_not_exists(#ttl, :ttl), #type = :type',
          ConditionExpression: 'attribute_not_exists(#cnt) OR #cnt < :limit',
          ExpressionAttributeNames: { '#cnt': attributeName, '#ttl': 'TTL', '#type': 'Type' },
          ExpressionAttributeValues: {
            ':one': 1,
            ':ttl': ttlSec,
            ':type': itemType,
            ':limit': limit,
          },
        })
      );
      return true;
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        return false;
      }
      throw toDatabaseError(error);
    }
  }
}
