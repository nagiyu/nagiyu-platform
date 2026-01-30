/**
 * Stock Tracker Core - Holding Mapper
 *
 * HoldingEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem } from '@nagiyu/aws';
import { validateStringField, validateNumberField, validateTimestampField } from '@nagiyu/aws';
import type { EntityMapper } from '@nagiyu/aws';
import type { HoldingEntity, HoldingKey } from '../entities/holding.entity.js';

/**
 * Holding Mapper
 *
 * HoldingEntity と DynamoDB Item 間の変換を行う
 */
export class HoldingMapper implements EntityMapper<HoldingEntity, HoldingKey> {
  private readonly entityType = 'Holding';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Holding Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: HoldingEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      tickerId: entity.TickerID,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      GSI1PK: entity.UserID,
      GSI1SK: `Holding#${entity.TickerID}`,
      UserID: entity.UserID,
      TickerID: entity.TickerID,
      ExchangeID: entity.ExchangeID,
      Quantity: entity.Quantity,
      AveragePrice: entity.AveragePrice,
      Currency: entity.Currency,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Holding Entity
   */
  public toEntity(item: DynamoDBItem): HoldingEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      TickerID: validateStringField(item.TickerID, 'TickerID'),
      ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
      Quantity: validateNumberField(item.Quantity, 'Quantity'),
      AveragePrice: validateNumberField(item.AveragePrice, 'AveragePrice'),
      Currency: validateStringField(item.Currency, 'Currency'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Holding Key
   * @returns PK と SK
   */
  public buildKeys(key: HoldingKey): { pk: string; sk: string } {
    return {
      pk: `USER#${key.userId}`,
      sk: `HOLDING#${key.tickerId}`,
    };
  }
}
