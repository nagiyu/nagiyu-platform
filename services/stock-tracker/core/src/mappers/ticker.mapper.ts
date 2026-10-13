/**
 * Stock Tracker Core - Ticker Mapper
 *
 * TickerEntity ↔ DynamoDB Item の変換を担当
 */

import {
  immutablePatchValue,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { TickerEntity, TickerKey } from '../entities/ticker.entity.js';

/** 銘柄アイテムの GSI3SK の接頭辞 */
export const TICKER_GSI3_SK_PREFIX = 'TICKER#';

/**
 * 取引所 ID から銘柄アイテムの GSI3PK を構築する
 *
 * 銘柄は取引所ごとに一覧するため、取引所 ID がそのままパーティションキーになる。
 * 取引所アイテム側の固定値 (`EXCHANGE_GSI3_PK`) と衝突しないことが前提。
 *
 * @param exchangeId - 取引所ID
 * @returns GSI3PK
 */
export function buildTickerGsi3Pk(exchangeId: string): string {
  return exchangeId;
}

/**
 * ティッカー ID から銘柄アイテムの GSI3SK を構築する
 *
 * @param tickerId - ティッカーID
 * @returns GSI3SK
 */
export function buildTickerGsi3Sk(tickerId: string): string {
  return `${TICKER_GSI3_SK_PREFIX}${tickerId}`;
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
      GSI3PK: buildTickerGsi3Pk(entity.exchangeId),
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
   * tickerId・exchangeId・createdAt は作成後に変えられないため、含めると拒否する。
   * GSI3 の値は tickerId と exchangeId だけから作られるので、更新では付け直さない。
   *
   * @param changes - 変更する項目 (undefined は変更なし)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<TickerEntity>): DynamoDBAttributes {
    return {
      TickerID: immutablePatchValue(changes.tickerId, 'TickerID'),
      ExchangeID: immutablePatchValue(changes.exchangeId, 'ExchangeID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Symbol: requiredPatchValue(changes.symbol, 'Symbol'),
      Name: requiredPatchValue(changes.name, 'Name'),
    };
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
