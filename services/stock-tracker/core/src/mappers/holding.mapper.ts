/**
 * Stock Tracker Core - Holding Mapper
 *
 * HoldingEntity ↔ DynamoDB Item の変換を担当
 */

import {
  immutablePatchValue,
  readTimestamp,
  requiredPatchValue,
  validateNumberField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { HoldingEntity, HoldingKey } from '../entities/holding.entity.js';

/** 保有株式アイテムの GSI1SK の接頭辞 */
export const HOLDING_GSI1_SK_PREFIX = 'Holding#';

/**
 * ユーザー ID から保有株式アイテムの GSI1PK を構築する
 *
 * 保有株式はユーザーごとに一覧するため、ユーザー ID がそのままパーティションキーになる。
 *
 * @param userId - ユーザーID
 * @returns GSI1PK
 */
export function buildHoldingGsi1Pk(userId: string): string {
  return userId;
}

/**
 * ティッカー ID から保有株式アイテムの GSI1SK を構築する
 *
 * @param tickerId - ティッカーID
 * @returns GSI1SK
 */
export function buildHoldingGsi1Sk(tickerId: string): string {
  return `${HOLDING_GSI1_SK_PREFIX}${tickerId}`;
}

/**
 * Holding Mapper
 *
 * HoldingEntity と DynamoDB Item 間の変換を行う
 */
export class HoldingMapper implements EntityMapper<HoldingEntity, HoldingKey> {
  public readonly entityType = 'Holding';

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Holding Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: HoldingKey): DynamoDBKey {
    return {
      PK: `USER#${key.userId}`,
      SK: `HOLDING#${key.tickerId}`,
    };
  }

  public getKey(entity: HoldingEntity): HoldingKey {
    return { userId: entity.userId, tickerId: entity.tickerId };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Holding Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: HoldingEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      GSI1PK: buildHoldingGsi1Pk(entity.userId),
      GSI1SK: buildHoldingGsi1Sk(entity.tickerId),
      UserID: entity.userId,
      TickerID: entity.tickerId,
      ExchangeID: entity.exchangeId,
      Quantity: entity.quantity,
      AveragePrice: entity.averagePrice,
      Currency: entity.currency,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * userId・tickerId・exchangeId・createdAt は作成後に変えられないため、含めると拒否する。
   * GSI1 の値は userId と tickerId だけから作られ、それらが変わらないので、更新では付け直さない。
   *
   * @param changes - 変更する項目 (undefined は変更なし)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<HoldingEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      TickerID: immutablePatchValue(changes.tickerId, 'TickerID'),
      ExchangeID: immutablePatchValue(changes.exchangeId, 'ExchangeID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Quantity: requiredPatchValue(changes.quantity, 'Quantity'),
      AveragePrice: requiredPatchValue(changes.averagePrice, 'AveragePrice'),
      Currency: requiredPatchValue(changes.currency, 'Currency'),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Holding Entity
   */
  public toEntity(item: DynamoDBAttributes): HoldingEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      tickerId: validateStringField(item.TickerID, 'TickerID'),
      exchangeId: validateStringField(item.ExchangeID, 'ExchangeID'),
      quantity: validateNumberField(item.Quantity, 'Quantity'),
      averagePrice: validateNumberField(item.AveragePrice, 'AveragePrice'),
      currency: validateStringField(item.Currency, 'Currency'),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
  }
}
