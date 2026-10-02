/**
 * Stock Tracker Core - MarketForecast Mapper
 *
 * MarketForecastEntity ↔ DynamoDBItem の変換に加えて、保存済みアイテムを core の学習入力
 * （`MarketSample`）へ直接変換する `toSample` を持つ（forecast.mapper.ts の市場版）。
 */
import type { DynamoDBItem } from '@nagiyu/aws';
import {
  InvalidEntityDataError,
  validateEnumField,
  validateStringField,
  validateTimestampField,
  type EntityMapper,
} from '@nagiyu/aws';
import type {
  CreateMarketForecastInput,
  MarketForecastEntity,
  MarketForecastKey,
  MarketForecastOutcome,
} from '../entities/market-forecast.entity.js';
import type { Market, MarketOutcome, MarketSample } from '../forecast/index.js';

export class MarketForecastMapper implements EntityMapper<MarketForecastEntity, MarketForecastKey> {
  private readonly entityType = 'MarketForecast';

  /**
   * Entity を DynamoDB Item に変換
   */
  public toItem(entity: MarketForecastEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({ market: entity.Market, date: entity.Date });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      Market: entity.Market,
      Date: entity.Date,
      AxisValues: entity.AxisValues,
      Probabilities: entity.Probabilities,
      ModelVersion: entity.ModelVersion,
      Source: entity.Source,
      ...(entity.BackfilledAxes !== undefined ? { BackfilledAxes: entity.BackfilledAxes } : {}),
      ...(entity.Outcome !== undefined ? { Outcome: entity.Outcome } : {}),
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  /**
   * 作成入力（Outcome を持たない）から、条件付き PutItem に渡す Item を組み立てる
   */
  public toCreateItem(input: CreateMarketForecastInput, createdAt: number): DynamoDBItem {
    return this.toItem({ ...input, CreatedAt: createdAt, UpdatedAt: createdAt });
  }

  /**
   * DynamoDB Item を Entity に変換
   */
  public toEntity(item: DynamoDBItem): MarketForecastEntity {
    const entity: MarketForecastEntity = {
      Market: validateStringField(item.Market, 'Market'),
      Date: validateStringField(item.Date, 'Date'),
      AxisValues: toPlainObject<MarketForecastEntity['AxisValues']>(item.AxisValues, 'AxisValues'),
      Probabilities: toPlainObject<MarketForecastEntity['Probabilities']>(
        item.Probabilities,
        'Probabilities'
      ),
      ModelVersion: validateStringField(item.ModelVersion, 'ModelVersion'),
      Source: validateEnumField(item.Source, 'Source', ['REPLAY', 'LIVE'] as const),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
    if (item.BackfilledAxes !== undefined) {
      entity.BackfilledAxes = toPlainObject<NonNullable<MarketForecastEntity['BackfilledAxes']>>(
        item.BackfilledAxes,
        'BackfilledAxes'
      );
    }
    if (item.Outcome !== undefined) {
      entity.Outcome = toPlainObject<MarketForecastOutcome>(item.Outcome, 'Outcome');
    }
    return entity;
  }

  /**
   * 保存済みアイテムを、学習・基準値・中立帯の入力（{@link MarketSample}）へ直接変換する。
   * `Outcome`・`Probabilities` は無ければ省略する（`toEntity` のように例外を投げない）。
   */
  public toSample(item: Record<string, unknown>): MarketSample {
    const sample: MarketSample = {
      market: validateStringField(item.Market, 'Market'),
      date: validateStringField(item.Date, 'Date'),
      axisValues: toPlainObject<MarketSample['axisValues']>(item.AxisValues, 'AxisValues'),
    };

    if (item.Outcome !== undefined) {
      const outcome = toPlainObject<MarketForecastOutcome>(item.Outcome, 'Outcome');
      sample.outcome = {
        nextDate: validateStringField(outcome.nextDate, 'Outcome.nextDate'),
        hit: outcome.hit ?? {},
      };
    }

    if (item.Probabilities !== undefined) {
      const probabilities = toPlainObject<MarketForecastEntity['Probabilities']>(
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
   * ビジネスキーから PK/SK を構築
   */
  public buildKeys(key: MarketForecastKey): { pk: string; sk: string } {
    return {
      pk: this.buildPk(key.market),
      sk: `DATE#${key.date}`,
    };
  }

  /** 市場から PK を構築（期間 Query の KeyConditionExpression 用） */
  public buildPk(market: Market): string {
    return `MARKETFORECAST#${market}`;
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
