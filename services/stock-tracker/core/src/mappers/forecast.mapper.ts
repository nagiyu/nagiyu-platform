/**
 * Stock Tracker Core - Forecast Mapper
 *
 * ForecastEntity ↔ DynamoDBItem の変換に加えて、保存済みアイテムを core の学習入力
 * （`TickerSample`）へ直接変換する `toSample` を持つ。`toSample` は ProjectionExpression で
 * 一部属性（寄与など）を落とした軽量読み出しの結果でも動くよう、無い属性は省く。
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
  CreateForecastInput,
  ForecastEntity,
  ForecastKey,
  ForecastNormal,
  ForecastOutcome,
} from '../entities/forecast.entity.js';
import type { ProbabilityRecord, TickerOutcome, TickerSample } from '../forecast/index.js';

/**
 * GSI4PK に付ける接頭辞。
 *
 * DailySummary の GSI4PK（`ExchangeID` そのもの）と値が衝突しないよう、Forecast だけこの
 * 接頭辞を付ける。同じ GSI を共有しても取引所単位の検索に Forecast が混ざらないようにする。
 */
const GSI4PK_PREFIX = 'FORECAST#';

export class ForecastMapper implements EntityMapper<ForecastEntity, ForecastKey> {
  private readonly entityType = 'Forecast';

  /**
   * Entity を DynamoDB Item に変換
   */
  public toItem(entity: ForecastEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({ tickerId: entity.TickerID, date: entity.Date });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      GSI4PK: `${GSI4PK_PREFIX}${entity.ExchangeID}`,
      GSI4SK: `DATE#${entity.Date}#${entity.TickerID}`,
      TickerID: entity.TickerID,
      ExchangeID: entity.ExchangeID,
      Market: entity.Market,
      Date: entity.Date,
      AxisValues: entity.AxisValues,
      Normal: entity.Normal,
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
  public toCreateItem(input: CreateForecastInput, createdAt: number): DynamoDBItem {
    return this.toItem({ ...input, CreatedAt: createdAt, UpdatedAt: createdAt });
  }

  /**
   * DynamoDB Item を Entity に変換
   */
  public toEntity(item: DynamoDBItem): ForecastEntity {
    const entity: ForecastEntity = {
      TickerID: validateStringField(item.TickerID, 'TickerID'),
      ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
      Market: validateStringField(item.Market, 'Market'),
      Date: validateStringField(item.Date, 'Date'),
      AxisValues: toPlainObject<ForecastEntity['AxisValues']>(item.AxisValues, 'AxisValues'),
      Normal: toPlainObject<ForecastNormal>(item.Normal, 'Normal'),
      Probabilities: toPlainObject<ForecastEntity['Probabilities']>(
        item.Probabilities,
        'Probabilities'
      ),
      ModelVersion: validateStringField(item.ModelVersion, 'ModelVersion'),
      Source: validateEnumField(item.Source, 'Source', ['REPLAY', 'LIVE'] as const),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
    if (item.BackfilledAxes !== undefined) {
      entity.BackfilledAxes = toPlainObject<NonNullable<ForecastEntity['BackfilledAxes']>>(
        item.BackfilledAxes,
        'BackfilledAxes'
      );
    }
    if (item.Outcome !== undefined) {
      entity.Outcome = toPlainObject<ForecastOutcome>(item.Outcome, 'Outcome');
    }
    return entity;
  }

  /**
   * 保存済みアイテムを、学習・基準値・中立帯の入力（{@link TickerSample}）へ直接変換する。
   *
   * GSI4 の軽量プロジェクション読み出し（寄与・確率帯実績等を除いたもの）を想定し、
   * `toEntity` と異なり必須フィールドを絞る: `Normal`・`Outcome`・`Probabilities` は
   * 無ければ省略する（`toEntity` のように例外を投げない）。
   */
  public toSample(item: Record<string, unknown>): TickerSample {
    const sample: TickerSample = {
      tickerId: validateStringField(item.TickerID, 'TickerID'),
      exchangeId: validateStringField(item.ExchangeID, 'ExchangeID'),
      market: validateStringField(item.Market, 'Market'),
      date: validateStringField(item.Date, 'Date'),
      axisValues: toPlainObject<TickerSample['axisValues']>(item.AxisValues, 'AxisValues'),
    };

    if (item.Normal !== undefined) {
      sample.normal = toPlainObject<NonNullable<TickerSample['normal']>>(item.Normal, 'Normal');
    }

    if (item.Outcome !== undefined) {
      const outcome = toPlainObject<ForecastOutcome>(item.Outcome, 'Outcome');
      const sampleOutcome: NonNullable<TickerSample['outcome']> = {
        nextDate: validateStringField(outcome.nextDate, 'Outcome.nextDate'),
        hit: outcome.hit ?? {},
      };
      if (outcome.excessReturn !== undefined) sampleOutcome.excessReturn = outcome.excessReturn;
      if (outcome.excludedReason !== undefined) {
        sampleOutcome.excludedReason = outcome.excludedReason;
      }
      sample.outcome = sampleOutcome;
    }

    if (item.Probabilities !== undefined) {
      const probabilities = toPlainObject<Partial<Record<'DIR' | 'VOL', ProbabilityRecord>>>(
        item.Probabilities,
        'Probabilities'
      );
      const picked: NonNullable<TickerSample['probabilities']> = {};
      for (const question of ['DIR', 'VOL'] as const) {
        const record = probabilities[question];
        if (record !== undefined) {
          picked[question] = { probability: record.probability, baseline: record.baseline };
        }
      }
      if (Object.keys(picked).length > 0) {
        sample.probabilities = picked;
      }
    }

    return sample;
  }

  /**
   * ビジネスキーから PK/SK を構築
   */
  public buildKeys(key: ForecastKey): { pk: string; sk: string } {
    return {
      pk: `FORECAST#${key.tickerId}`,
      sk: `DATE#${key.date}`,
    };
  }

  /**
   * 取引所IDから GSI4PK を構築（GSI4 Query 用）
   */
  public buildGsi4Pk(exchangeId: string): string {
    return `${GSI4PK_PREFIX}${exchangeId}`;
  }

  /**
   * `TickerOutcome`（core の型。採点結果の識別子フィールドを含む）から、
   * `Forecast.Outcome` 属性（識別子フィールドを除いた形）を作る。
   * DynamoDB 実装・InMemory 実装の双方が `appendOutcome` で使う。
   */
  public toOutcomeAttribute(outcome: TickerOutcome): ForecastOutcome {
    const attribute: ForecastOutcome = {
      nextDate: outcome.nextDate,
      nextReturn: outcome.nextReturn,
      nextRange: outcome.nextRange,
      hit: outcome.hit,
      evaluatedAt: outcome.evaluatedAt,
    };
    if (outcome.excessReturn !== undefined) attribute.excessReturn = outcome.excessReturn;
    if (outcome.rangeRatio !== undefined) attribute.rangeRatio = outcome.rangeRatio;
    if (outcome.excludedReason !== undefined) attribute.excludedReason = outcome.excludedReason;
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
