/**
 * Stock Tracker Core - Daily Summary Mapper
 *
 * DailySummaryEntity ↔ DynamoDB Item の変換を担当
 */

import {
  immutablePatchValue,
  optionalPatchValue,
  readTimestamp,
  requiredPatchValue,
  validateNumberField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type {
  DailySummaryEntity,
  DailySummaryForecastFields,
  DailySummaryKey,
} from '../entities/daily-summary.entity.js';
import { buildExchangeSummaryGsi4Sk } from './exchange-summary-index.js';

/**
 * 取引所IDから日次サマリーアイテムの GSI4PK を構築する
 *
 * 取引所ごとに最新日や期間で一覧するため、取引所IDがそのままパーティションキーになる。
 * Forecast は接頭辞を付けて同じ GSI4 に相乗りするので、値は衝突しない。
 *
 * @param exchangeId - 取引所ID
 * @returns GSI4PK
 */
export function buildDailySummaryGsi4Pk(exchangeId: string): string {
  return exchangeId;
}

/**
 * `toForecastFields` が読む保存属性。
 *
 * 確度算出バッチの読み出し量を抑える射影はこの一覧から作る。updatedAt の元になる
 * UpdatedAt など、確度算出に使わない属性は含めない。
 */
export const DAILY_SUMMARY_FORECAST_FIELD_ATTRIBUTES = [
  'TickerID',
  'ExchangeID',
  'Date',
  'Open',
  'High',
  'Low',
  'Close',
  'Volume',
  'PatternResults',
  'BuyPatternCount',
  'SellPatternCount',
  'CreatedAt',
] as const;

/** Item の任意の数値属性を読む。属性がなければ undefined、あって不正なら例外にする */
function readOptionalNumber(item: DynamoDBAttributes, name: string): number | undefined {
  return item[name] === undefined ? undefined : validateNumberField(item[name], name);
}

/** パターン判定結果マップを読む。マップでない値は未設定として扱う */
function readPatternResults(value: unknown): DailySummaryEntity['patternResults'] {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as DailySummaryEntity['patternResults'])
    : undefined;
}

/**
 * Daily Summary Mapper
 *
 * DailySummaryEntity と DynamoDB Item 間の変換を行う
 */
export class DailySummaryMapper implements EntityMapper<DailySummaryEntity, DailySummaryKey> {
  public readonly entityType = 'DailySummary';

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - DailySummary Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: DailySummaryKey): DynamoDBKey {
    return {
      PK: `SUMMARY#${key.tickerId}`,
      SK: `DATE#${key.date}`,
    };
  }

  public getKey(entity: DailySummaryEntity): DailySummaryKey {
    return { tickerId: entity.tickerId, date: entity.date };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - DailySummary Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: DailySummaryEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      GSI4PK: buildDailySummaryGsi4Pk(entity.exchangeId),
      GSI4SK: buildExchangeSummaryGsi4Sk(entity.date, entity.tickerId),
      TickerID: entity.tickerId,
      ExchangeID: entity.exchangeId,
      Date: entity.date,
      Open: entity.open,
      High: entity.high,
      Low: entity.low,
      Close: entity.close,
      ...(entity.volume !== undefined ? { Volume: entity.volume } : {}),
      ...(entity.patternResults ? { PatternResults: entity.patternResults } : {}),
      ...(entity.buyPatternCount !== undefined ? { BuyPatternCount: entity.buyPatternCount } : {}),
      ...(entity.sellPatternCount !== undefined
        ? { SellPatternCount: entity.sellPatternCount }
        : {}),
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * GSI4SK は更新のたびに `key` から付け直す。GSI4PK は exchangeId から作られるため、
   * exchangeId を変えるときだけ付け直す。
   * tickerId・date・createdAt は作成後に変えられないため、含めると拒否する。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @param key - 更新対象のビジネスキー
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(
    changes: EntityPatch<DailySummaryEntity>,
    key: DailySummaryKey
  ): DynamoDBAttributes {
    const exchangeId = requiredPatchValue(changes.exchangeId, 'ExchangeID');
    return {
      TickerID: immutablePatchValue(changes.tickerId, 'TickerID'),
      Date: immutablePatchValue(changes.date, 'Date'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      GSI4PK: exchangeId === undefined ? undefined : buildDailySummaryGsi4Pk(exchangeId),
      GSI4SK: buildExchangeSummaryGsi4Sk(key.date, key.tickerId),
      ExchangeID: exchangeId,
      Open: requiredPatchValue(changes.open, 'Open'),
      High: requiredPatchValue(changes.high, 'High'),
      Low: requiredPatchValue(changes.low, 'Low'),
      Close: requiredPatchValue(changes.close, 'Close'),
      Volume: optionalPatchValue(changes.volume),
      PatternResults: optionalPatchValue(changes.patternResults),
      BuyPatternCount: optionalPatchValue(changes.buyPatternCount),
      SellPatternCount: optionalPatchValue(changes.sellPatternCount),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns DailySummary Entity
   */
  public toEntity(item: DynamoDBAttributes): DailySummaryEntity {
    return {
      ...this.toForecastFields(item),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
  }

  /**
   * 確度算出バッチが読む属性だけの射影 ({@link DailySummaryForecastFields}) に変換する。
   *
   * ProjectionExpression で絞った読み出しの結果でも動くよう、`toEntity` と異なり
   * UpdatedAt は読まない。
   */
  public toForecastFields(item: DynamoDBAttributes): DailySummaryForecastFields {
    return {
      tickerId: validateStringField(item.TickerID, 'TickerID'),
      exchangeId: validateStringField(item.ExchangeID, 'ExchangeID'),
      date: validateStringField(item.Date, 'Date'),
      open: validateNumberField(item.Open, 'Open'),
      high: validateNumberField(item.High, 'High'),
      low: validateNumberField(item.Low, 'Low'),
      close: validateNumberField(item.Close, 'Close'),
      volume: readOptionalNumber(item, 'Volume'),
      patternResults: readPatternResults(item.PatternResults),
      buyPatternCount: readOptionalNumber(item, 'BuyPatternCount'),
      sellPatternCount: readOptionalNumber(item, 'SellPatternCount'),
      createdAt: readTimestamp(item, 'CreatedAt'),
    };
  }
}
