/**
 * Stock Tracker Core - Exchange Mapper
 *
 * ExchangeEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem } from '@nagiyu/aws';
import { validateStringField, validateTimestampField } from '@nagiyu/aws';
import type { EntityMapper } from '@nagiyu/aws';
import type { ExchangeEntity, ExchangeKey } from '../entities/exchange.entity.js';
import { PRICE_SOURCES, DEFAULT_PRICE_SOURCE } from '../entities/exchange.entity.js';
import type { PriceSource } from '../entities/exchange.entity.js';

/**
 * Exchange Mapper
 *
 * ExchangeEntity と DynamoDB Item 間の変換を行う
 */
export class ExchangeMapper implements EntityMapper<ExchangeEntity, ExchangeKey> {
  private readonly entityType = 'Exchange';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Exchange Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: ExchangeEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      exchangeId: entity.ExchangeID,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      ExchangeID: entity.ExchangeID,
      Name: entity.Name,
      Key: entity.Key,
      Timezone: entity.Timezone,
      Start: entity.Start,
      End: entity.End,
      PriceSource: entity.PriceSource,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Exchange Entity
   */
  public toEntity(item: DynamoDBItem): ExchangeEntity {
    return {
      ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
      Name: validateStringField(item.Name, 'Name'),
      Key: validateStringField(item.Key, 'Key'),
      Timezone: validateStringField(item.Timezone, 'Timezone'),
      Start: validateStringField(item.Start, 'Start'),
      End: validateStringField(item.End, 'End'),
      PriceSource: this.resolvePriceSource(item.PriceSource),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  /**
   * DynamoDB Item から PriceSource を解決する
   *
   * 後方互換性のため、属性が存在しない場合や無効な値の場合は DEFAULT_PRICE_SOURCE を返す。
   *
   * @param value - DynamoDB から取得した生の値
   * @returns 有効な PriceSource（フォールバック: 'tradingview'）
   */
  private resolvePriceSource(value: unknown): PriceSource {
    if (typeof value === 'string' && (PRICE_SOURCES as readonly string[]).includes(value)) {
      return value as PriceSource;
    }
    return DEFAULT_PRICE_SOURCE;
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Exchange Key
   * @returns PK と SK
   */
  public buildKeys(key: ExchangeKey): { pk: string; sk: string } {
    return {
      pk: `EXCHANGE#${key.exchangeId}`,
      sk: 'METADATA',
    };
  }
}
