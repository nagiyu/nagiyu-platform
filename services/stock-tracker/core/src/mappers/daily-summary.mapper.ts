/**
 * Stock Tracker Core - Daily Summary Mapper
 *
 * DailySummaryEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem } from '@nagiyu/aws';
import {
  validateNumberField,
  validateStringField,
  validateTimestampField,
  type EntityMapper,
} from '@nagiyu/aws';
import type { DailySummaryEntity, DailySummaryKey } from '../entities/daily-summary.entity.js';

/**
 * Daily Summary Mapper
 *
 * DailySummaryEntity と DynamoDB Item 間の変換を行う
 */
export class DailySummaryMapper implements EntityMapper<DailySummaryEntity, DailySummaryKey> {
  private readonly entityType = 'DailySummary';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - DailySummary Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: DailySummaryEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      tickerId: entity.TickerID,
      date: entity.Date,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      GSI4PK: entity.ExchangeID,
      GSI4SK: `DATE#${entity.Date}#${entity.TickerID}`,
      TickerID: entity.TickerID,
      ExchangeID: entity.ExchangeID,
      Date: entity.Date,
      Open: entity.Open,
      High: entity.High,
      Low: entity.Low,
      Close: entity.Close,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns DailySummary Entity
   */
  public toEntity(item: DynamoDBItem): DailySummaryEntity {
    return {
      TickerID: validateStringField(item.TickerID, 'TickerID'),
      ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
      Date: validateStringField(item.Date, 'Date'),
      Open: validateNumberField(item.Open, 'Open'),
      High: validateNumberField(item.High, 'High'),
      Low: validateNumberField(item.Low, 'Low'),
      Close: validateNumberField(item.Close, 'Close'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - DailySummary Key
   * @returns PK と SK
   */
  public buildKeys(key: DailySummaryKey): { pk: string; sk: string } {
    return {
      pk: `SUMMARY#${key.tickerId}`,
      sk: `DATE#${key.date}`,
    };
  }
}
