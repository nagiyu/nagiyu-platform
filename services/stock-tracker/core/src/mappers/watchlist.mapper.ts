/**
 * Stock Tracker Core - Watchlist Mapper
 *
 * WatchlistEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem } from '@nagiyu/aws';
import { validateStringField, validateTimestampField } from '@nagiyu/aws';
import type { EntityMapper } from '@nagiyu/aws';
import type { WatchlistEntity, WatchlistKey } from '../entities/watchlist.entity.js';

/**
 * Watchlist Mapper
 *
 * WatchlistEntity と DynamoDB Item 間の変換を行う
 */
export class WatchlistMapper implements EntityMapper<WatchlistEntity, WatchlistKey> {
  private readonly entityType = 'Watchlist';

  /**
   * Entity を DynamoDB Item に変換
   *
   * Note: Watchlist は読み取り専用のため UpdatedAt = CreatedAt とする
   *
   * @param entity - Watchlist Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: WatchlistEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      tickerId: entity.TickerID,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      GSI1PK: entity.UserID,
      GSI1SK: `Watchlist#${entity.TickerID}`,
      UserID: entity.UserID,
      TickerID: entity.TickerID,
      ExchangeID: entity.ExchangeID,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.CreatedAt, // Watchlist は読み取り専用のため CreatedAt と同じ
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Watchlist Entity
   */
  public toEntity(item: DynamoDBItem): WatchlistEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      TickerID: validateStringField(item.TickerID, 'TickerID'),
      ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
    };
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Watchlist Key
   * @returns PK と SK
   */
  public buildKeys(key: WatchlistKey): { pk: string; sk: string } {
    return {
      pk: `USER#${key.userId}`,
      sk: `WATCHLIST#${key.tickerId}`,
    };
  }
}
