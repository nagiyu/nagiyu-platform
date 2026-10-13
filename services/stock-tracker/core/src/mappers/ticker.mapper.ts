/**
 * Stock Tracker Core - Ticker Mapper
 *
 * TickerEntity ↔ DynamoDB Item の変換を担当
 */

import {
  readTimestamp,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { TickerEntity, TickerKey } from '../entities/ticker.entity.js';
import { requiredPatchValue } from './patch-support.js';

/**
 * 銘柄アイテムの GSI3SK を構築する
 *
 * @param tickerId - ティッカーID
 * @returns GSI3SK
 */
function buildTickerGsi3Sk(tickerId: string): string {
  return `TICKER#${tickerId}`;
}

/**
 * Ticker Mapper
 *
 * TickerEntity と DynamoDB Item 間の変換を行う
 */
export class TickerMapper implements EntityMapper<TickerEntity, TickerKey> {
  public readonly entityType = 'Ticker';

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Ticker Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: TickerKey): DynamoDBKey {
    return {
      PK: `TICKER#${key.tickerId}`,
      SK: 'METADATA',
    };
  }

  public getKey(entity: TickerEntity): TickerKey {
    return { tickerId: entity.tickerId };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Ticker Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: TickerEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      GSI3PK: entity.exchangeId,
      GSI3SK: buildTickerGsi3Sk(entity.tickerId),
      TickerID: entity.tickerId,
      Symbol: entity.symbol,
      Name: entity.name,
      ExchangeID: entity.exchangeId,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * GSI3 の値は exchangeId / tickerId から作られるため、それらを変えるときは同時に付け直す。
   *
   * @param changes - 変更する項目 (undefined は変更なし)
   * @returns 保存用の属性
   */
  public toUpdateAttributes(changes: EntityPatch<TickerEntity>): DynamoDBAttributes {
    const attributes: DynamoDBAttributes = {
      TickerID: requiredPatchValue(changes.tickerId, 'TickerID'),
      Symbol: requiredPatchValue(changes.symbol, 'Symbol'),
      Name: requiredPatchValue(changes.name, 'Name'),
      ExchangeID: requiredPatchValue(changes.exchangeId, 'ExchangeID'),
      CreatedAt: requiredPatchValue(changes.createdAt, 'CreatedAt'),
    };
    if (typeof changes.exchangeId === 'string') {
      attributes.GSI3PK = changes.exchangeId;
    }
    if (typeof changes.tickerId === 'string') {
      attributes.GSI3SK = buildTickerGsi3Sk(changes.tickerId);
    }
    return attributes;
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Ticker Entity
   */
  public toEntity(item: DynamoDBAttributes): TickerEntity {
    return {
      tickerId: validateStringField(item.TickerID, 'TickerID'),
      symbol: validateStringField(item.Symbol, 'Symbol'),
      name: validateStringField(item.Name, 'Name'),
      exchangeId: validateStringField(item.ExchangeID, 'ExchangeID'),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
  }
}
