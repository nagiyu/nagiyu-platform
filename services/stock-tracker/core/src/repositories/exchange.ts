/**
 * Stock Tracker Core - Exchange Repository
 *
 * 取引所データの CRUD 操作を提供
 */

import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  AbstractDynamoDBRepository,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { Exchange } from '../types.js';

/**
 * Exchange リポジトリ
 *
 * DynamoDB Single Table Design に基づく取引所データの CRUD 操作
 */
export class ExchangeRepository extends AbstractDynamoDBRepository<
  Exchange,
  { exchangeId: string }
> {
  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(docClient, {
      tableName,
      entityType: 'Exchange',
    });
  }

  /**
   * PK/SK を構築
   */
  protected buildKeys(key: { exchangeId: string }): { PK: string; SK: string } {
    return {
      PK: `EXCHANGE#${key.exchangeId}`,
      SK: 'METADATA',
    };
  }

  /**
   * DynamoDB Item を Exchange にマッピング
   */
  protected mapToEntity(item: Record<string, unknown>): Exchange {
    return {
      ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
      Name: validateStringField(item.Name, 'Name'),
      Key: validateStringField(item.Key, 'Key'),
      Timezone: validateStringField(item.Timezone, 'Timezone'),
      Start: validateStringField(item.Start, 'Start'),
      End: validateStringField(item.End, 'End'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  /**
   * Exchange を DynamoDB Item にマッピング
   */
  protected mapToItem(
    exchange: Omit<Exchange, 'CreatedAt' | 'UpdatedAt'>
  ): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
    const keys = this.buildKeys({ exchangeId: exchange.ExchangeID });
    return {
      ...keys,
      Type: this.config.entityType,
      ExchangeID: exchange.ExchangeID,
      Name: exchange.Name,
      Key: exchange.Key,
      Timezone: exchange.Timezone,
      Start: exchange.Start,
      End: exchange.End,
    };
  }

  /**
   * 全取引所を取得
   *
   * @returns 取引所の配列
   */
  public async getAll(): Promise<Exchange[]> {
    const result = await this.docClient.send(
      new ScanCommand({
        TableName: this.config.tableName,
        FilterExpression: '#type = :type',
        ExpressionAttributeNames: {
          '#type': 'Type',
        },
        ExpressionAttributeValues: {
          ':type': 'Exchange',
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => this.mapToEntity(item));
  }

  /**
   * 取引所IDで単一の取引所を取得
   *
   * @param exchangeIdOrKey - 取引所ID または { exchangeId: string }
   * @returns 取引所（存在しない場合はnull）
   */
  public async getById(exchangeIdOrKey: string | { exchangeId: string }): Promise<Exchange | null> {
    const key =
      typeof exchangeIdOrKey === 'string' ? { exchangeId: exchangeIdOrKey } : exchangeIdOrKey;
    return super.getById(key);
  }

  /**
   * 取引所を更新
   *
   * @param exchangeIdOrKey - 取引所ID または { exchangeId: string }
   * @param updates - 更新するフィールド
   * @returns 更新された取引所
   */
  public async update(
    exchangeIdOrKey: string | { exchangeId: string },
    updates: Partial<Pick<Exchange, 'Name' | 'Timezone' | 'Start' | 'End'>>
  ): Promise<Exchange> {
    const key =
      typeof exchangeIdOrKey === 'string' ? { exchangeId: exchangeIdOrKey } : exchangeIdOrKey;
    return super.update(key, updates);
  }

  /**
   * 取引所を削除
   *
   * @param exchangeIdOrKey - 取引所ID または { exchangeId: string }
   */
  public async delete(exchangeIdOrKey: string | { exchangeId: string }): Promise<void> {
    const key =
      typeof exchangeIdOrKey === 'string' ? { exchangeId: exchangeIdOrKey } : exchangeIdOrKey;
    return super.delete(key);
  }
}
