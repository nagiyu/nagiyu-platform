import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { isConditionalCheckFailed, toDatabaseError } from '../errors.js';
import { TTL_ATTRIBUTE_NAME } from '../validators.js';
import type {
  UsageCounter,
  UsageCounterIncrementInput,
  UsageCounterKey,
} from './usage-counter.interface.js';

/** DynamoDB の条件付き更新で実装した回数カウンター */
export class DynamoDBUsageCounter implements UsageCounter {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async tryIncrement(input: UsageCounterIncrementInput): Promise<boolean> {
    // 上限 0 では「属性が無ければ通す」条件が成り立ち、1 回目が通ってしまう
    if (input.limit <= 0) {
      return false;
    }
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: input.key,
          UpdateExpression: 'ADD #cnt :one SET #ttl = if_not_exists(#ttl, :ttl), #type = :type',
          ConditionExpression: 'attribute_not_exists(#cnt) OR #cnt < :limit',
          ExpressionAttributeNames: {
            '#cnt': input.attribute,
            '#ttl': TTL_ATTRIBUTE_NAME,
            '#type': 'Type',
          },
          ExpressionAttributeValues: {
            ':one': 1,
            ':ttl': input.ttlSec,
            ':type': input.itemType,
            ':limit': input.limit,
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

  public async decrement(input: { key: UsageCounterKey; attribute: string }): Promise<void> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: input.key,
          UpdateExpression: 'ADD #cnt :minusOne',
          // 0 以下や記録なしでは何もしない (0 未満にしない、アイテムを新しく作らない)
          ConditionExpression: '#cnt > :zero',
          ExpressionAttributeNames: { '#cnt': input.attribute },
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

  public async read(
    key: UsageCounterKey,
    attributes: readonly string[]
  ): Promise<Record<string, number>> {
    try {
      const result = await this.docClient.send(
        new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true })
      );
      return Object.fromEntries(
        attributes.map((attribute) => [attribute, Number(result.Item?.[attribute] ?? 0)])
      );
    } catch (error) {
      throw toDatabaseError(error);
    }
  }
}
