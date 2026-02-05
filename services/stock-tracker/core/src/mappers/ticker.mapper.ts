/**
 * Stock Tracker Core - Ticker Mapper
 *
 * TickerEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem } from '@nagiyu/aws';
import { validateStringField, validateTimestampField } from '@nagiyu/aws';
import type { EntityMapper } from '@nagiyu/aws';
import type { TickerEntity, TickerKey } from '../entities/ticker.entity.js';

/**
 * Ticker Mapper
 *
 * TickerEntity と DynamoDB Item 間の変換を行う
 */
export class TickerMapper implements EntityMapper<TickerEntity, TickerKey> {
  private readonly entityType = 'Ticker';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Ticker Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: TickerEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      tickerId: entity.TickerID,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      GSI3PK: entity.ExchangeID,
      GSI3SK: `TICKER#${entity.TickerID}`,
      TickerID: entity.TickerID,
      Symbol: entity.Symbol,
      Name: entity.Name,
      ExchangeID: entity.ExchangeID,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Ticker Entity
   */
  public toEntity(item: DynamoDBItem): TickerEntity {
    return {
      TickerID: validateStringField(item.TickerID, 'TickerID'),
      Symbol: validateStringField(item.Symbol, 'Symbol'),
      Name: validateStringField(item.Name, 'Name'),
      ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Ticker Key
   * @returns PK と SK
   */
  public buildKeys(key: TickerKey): { pk: string; sk: string } {
    return {
      pk: `TICKER#${key.tickerId}`,
      sk: 'METADATA',
    };
  }
}
