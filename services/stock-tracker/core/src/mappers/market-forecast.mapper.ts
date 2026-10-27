/**
 * Stock Tracker Core - MarketForecast Mapper
 *
 * MarketForecastEntity ↔ DynamoDB Item の変換に加えて、保存済みアイテムを core の学習入力
 * (`MarketSample`) へ直接変換する `toSample` を持つ (銘柄×日の Forecast の市場版)。
 */
import {
  InvalidEntityDataError,
  immutablePatchValue,
  optionalPatchValue,
  readTimestamp,
  requiredPatchValue,
  validateEnumField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type {
  MarketForecastEntity,
  MarketForecastKey,
  MarketForecastOutcome,
} from '../entities/market-forecast.entity.js';
import type { Market, MarketOutcome, MarketSample } from '../forecast/index.js';

/** 採点結果を保存する属性の名前。条件付きの追記が存在判定に使う */
export const MARKET_FORECAST_OUTCOME_ATTRIBUTE = 'Outcome';

/**
 * 市場から MarketForecast アイテムの PK を構築する
 *
 * 市場の期間 Query がパーティションキーに指定する。
 *
 * @param market - 市場
 * @returns PK
 */
export function buildMarketForecastPk(market: Market): string {
  return `MARKETFORECAST#${market}`;
}

/**
 * 日付から MarketForecast アイテムの SK を構築する
 *
 * @param date - 基準日 (YYYY-MM-DD)
 * @returns SK
 */
export function buildMarketForecastSk(date: string): string {
  return `DATE#${date}`;
}

/**
 * ある日付までを含む範囲検索の上限となる SK を構築する。
 *
 * `DATE#{date}` の末尾に ASCII 印字可能文字でほぼ最大の `~` (0x7E) を付け、
 * 同じ日付の SK が必ず範囲に入るようにする。
 *
 * @param date - 基準日 (YYYY-MM-DD)
 * @returns 範囲の上限となる SK
 */
export function buildMarketForecastSkUpperBound(date: string): string {
  return `${buildMarketForecastSk(date)}#~`;
}

/**
 * MarketForecast Mapper
 *
 * MarketForecastEntity と DynamoDB Item 間の変換を行う
 */
export class MarketForecastMapper implements EntityMapper<MarketForecastEntity, MarketForecastKey> {
  public readonly entityType = 'MarketForecast';

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - MarketForecast Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: MarketForecastKey): DynamoDBKey {
    return {
      PK: buildMarketForecastPk(key.market),
      SK: buildMarketForecastSk(key.date),
    };
  }

  public getKey(entity: MarketForecastEntity): MarketForecastKey {
    return { market: entity.market, date: entity.date };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - MarketForecast Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: MarketForecastEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      Market: entity.market,
      Date: entity.date,
      AxisValues: entity.axisValues,
      Probabilities: entity.probabilities,
      ModelVersion: entity.modelVersion,
      Source: entity.source,
      ...(entity.backfilledAxes !== undefined ? { BackfilledAxes: entity.backfilledAxes } : {}),
      ...(entity.outcome !== undefined
        ? { [MARKET_FORECAST_OUTCOME_ATTRIBUTE]: entity.outcome }
        : {}),
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * GSI を持たないため、キーから作る属性はない。
   * market・date・createdAt は作成後に変えられないため、含めると拒否する。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<MarketForecastEntity>): DynamoDBAttributes {
    return {
      Market: immutablePatchValue(changes.market, 'Market'),
      Date: immutablePatchValue(changes.date, 'Date'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      AxisValues: requiredPatchValue(changes.axisValues, 'AxisValues'),
      Probabilities: requiredPatchValue(changes.probabilities, 'Probabilities'),
      ModelVersion: requiredPatchValue(changes.modelVersion, 'ModelVersion'),
      Source: requiredPatchValue(changes.source, 'Source'),
      BackfilledAxes: optionalPatchValue(changes.backfilledAxes),
      [MARKET_FORECAST_OUTCOME_ATTRIBUTE]: optionalPatchValue(changes.outcome),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns MarketForecast Entity
   */
  public toEntity(item: DynamoDBAttributes): MarketForecastEntity {
    const entity: MarketForecastEntity = {
      market: validateStringField(item.Market, 'Market'),
      date: validateStringField(item.Date, 'Date'),
      axisValues: toPlainObject<MarketForecastEntity['axisValues']>(item.AxisValues, 'AxisValues'),
      probabilities: toPlainObject<MarketForecastEntity['probabilities']>(
        item.Probabilities,
        'Probabilities'
      ),
      modelVersion: validateStringField(item.ModelVersion, 'ModelVersion'),
      source: validateEnumField(item.Source, 'Source', ['REPLAY', 'LIVE'] as const),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
    if (item.BackfilledAxes !== undefined) {
      entity.backfilledAxes = toPlainObject<NonNullable<MarketForecastEntity['backfilledAxes']>>(
        item.BackfilledAxes,
        'BackfilledAxes'
      );
    }
    if (item[MARKET_FORECAST_OUTCOME_ATTRIBUTE] !== undefined) {
      entity.outcome = toPlainObject<MarketForecastOutcome>(
        item[MARKET_FORECAST_OUTCOME_ATTRIBUTE],
        MARKET_FORECAST_OUTCOME_ATTRIBUTE
      );
    }
    return entity;
  }

  /**
   * 保存済みアイテムを、学習・基準値・中立帯の入力（{@link MarketSample}）へ直接変換する。
   * `Outcome`・`Probabilities` は無ければ省略する（`toEntity` のように例外を投げない）。
   */
  public toSample(item: DynamoDBAttributes): MarketSample {
    const sample: MarketSample = {
      market: validateStringField(item.Market, 'Market'),
      date: validateStringField(item.Date, 'Date'),
      axisValues: toPlainObject<MarketSample['axisValues']>(item.AxisValues, 'AxisValues'),
    };

    if (item[MARKET_FORECAST_OUTCOME_ATTRIBUTE] !== undefined) {
      const outcome = toPlainObject<MarketForecastOutcome>(
        item[MARKET_FORECAST_OUTCOME_ATTRIBUTE],
        MARKET_FORECAST_OUTCOME_ATTRIBUTE
      );
      sample.outcome = {
        nextDate: validateStringField(outcome.nextDate, 'Outcome.nextDate'),
        hit: outcome.hit ?? {},
      };
    }

    if (item.Probabilities !== undefined) {
      const probabilities = toPlainObject<MarketForecastEntity['probabilities']>(
        item.Probabilities,
        'Probabilities'
      );
      const record = probabilities.MKT;
      if (record !== undefined) {
        sample.probabilities = {
          MKT: { probability: record.probability, baseline: record.baseline },
        };
      }
    }

    return sample;
  }

  /**
   * `MarketOutcome`（core の型。採点結果の識別子フィールドを含む）から、
   * `MarketForecast.Outcome` 属性（識別子フィールドを除いた形）を作る。
   */
  public toOutcomeAttribute(outcome: MarketOutcome): MarketForecastOutcome {
    const attribute: MarketForecastOutcome = {
      nextDate: outcome.nextDate,
      nextRange: outcome.nextRange,
      hit: outcome.hit,
      evaluatedAt: outcome.evaluatedAt,
    };
    if (outcome.rangeRatio !== undefined) attribute.rangeRatio = outcome.rangeRatio;
    return attribute;
  }
}

/** ネストしたマップ属性をプレーンオブジェクトとして受け取る（配列・null・非オブジェクトは拒否） */
function toPlainObject<T>(value: unknown, fieldName: string): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" がオブジェクトではありません`);
  }
  return value as T;
}
