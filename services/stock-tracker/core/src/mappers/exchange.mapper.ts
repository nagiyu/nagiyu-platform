/**
 * Stock Tracker Core - Exchange Mapper
 *
 * ExchangeEntity ↔ DynamoDB Item の変換を担当
 */

import {
  immutablePatchValue,
  optionalPatchValue,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { ExchangeEntity, ExchangeKey } from '../entities/exchange.entity.js';
import {
  PRICE_SOURCES,
  DEFAULT_PRICE_SOURCE,
  EXCHANGE_MARKETS,
} from '../entities/exchange.entity.js';
import type { PriceSource, ExchangeMarket } from '../entities/exchange.entity.js';

/**
 * 全取引所を ExchangeTickerIndex(GSI3) から一括取得するための固定パーティションキー。
 * 銘柄側の GSI3PK は ExchangeID(`TSE` 等)なので、この値と衝突しない前提で相乗りする。
 */
export const EXCHANGE_GSI3_PK = 'EXCHANGES';

/** 取引所アイテムの GSI3SK の接頭辞 */
export const EXCHANGE_GSI3_SK_PREFIX = 'EXCHANGE#';

/**
 * 取引所 ID から GSI3SK を構築する
 *
 * @param exchangeId - 取引所ID
 * @returns GSI3SK
 */
export function buildExchangeGsi3Sk(exchangeId: string): string {
  return `${EXCHANGE_GSI3_SK_PREFIX}${exchangeId}`;
}

/**
 * Exchange Mapper
 *
 * ExchangeEntity と DynamoDB Item 間の変換を行う
 */
export class ExchangeMapper implements EntityMapper<ExchangeEntity, ExchangeKey> {
  public readonly entityType = 'Exchange';

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Exchange Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: ExchangeKey): DynamoDBKey {
    return {
      PK: `EXCHANGE#${key.exchangeId}`,
      SK: 'METADATA',
    };
  }

  public getKey(entity: ExchangeEntity): ExchangeKey {
    return { exchangeId: entity.exchangeId };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Exchange Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: ExchangeEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      GSI3PK: EXCHANGE_GSI3_PK,
      GSI3SK: buildExchangeGsi3Sk(entity.exchangeId),
      ExchangeID: entity.exchangeId,
      Name: entity.name,
      Key: entity.key,
      Timezone: entity.timezone,
      Start: entity.start,
      End: entity.end,
      PriceSource: entity.priceSource,
      ...(entity.market !== undefined ? { Market: entity.market } : {}),
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * GSI3 のキーは更新のたびに `key` から付け直す。キー導入前に作られたアイテムも、
   * 更新されることで getAllIndexed の Query 対象になる。
   * exchangeId・key・createdAt は作成後に変えられないため、含めると拒否する。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @param key - 更新対象のビジネスキー
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(
    changes: EntityPatch<ExchangeEntity>,
    key: ExchangeKey
  ): DynamoDBAttributes {
    return {
      ExchangeID: immutablePatchValue(changes.exchangeId, 'ExchangeID'),
      Key: immutablePatchValue(changes.key, 'Key'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      GSI3PK: EXCHANGE_GSI3_PK,
      GSI3SK: buildExchangeGsi3Sk(key.exchangeId),
      Name: requiredPatchValue(changes.name, 'Name'),
      Timezone: requiredPatchValue(changes.timezone, 'Timezone'),
      Start: requiredPatchValue(changes.start, 'Start'),
      End: requiredPatchValue(changes.end, 'End'),
      PriceSource: requiredPatchValue(changes.priceSource, 'PriceSource'),
      Market: optionalPatchValue(changes.market),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Exchange Entity
   */
  public toEntity(item: DynamoDBAttributes): ExchangeEntity {
    return {
      exchangeId: validateStringField(item.ExchangeID, 'ExchangeID'),
      name: validateStringField(item.Name, 'Name'),
      key: validateStringField(item.Key, 'Key'),
      timezone: validateStringField(item.Timezone, 'Timezone'),
      start: validateStringField(item.Start, 'Start'),
      end: validateStringField(item.End, 'End'),
      priceSource: this.resolvePriceSource(item.PriceSource),
      market: this.resolveMarket(item.Market),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
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
   * DynamoDB Item から Market を解決する
   *
   * Market はデフォルト値を持たない。属性が存在しない場合や無効な値の
   * 場合は undefined（未設定）を返す。
   *
   * @param value - DynamoDB から取得した生の値
   * @returns 有効な Market、または未設定を表す undefined
   */
  private resolveMarket(value: unknown): ExchangeMarket | undefined {
    if (typeof value === 'string' && (EXCHANGE_MARKETS as readonly string[]).includes(value)) {
      return value as ExchangeMarket;
    }
    return undefined;
  }
}
