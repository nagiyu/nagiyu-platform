/**
 * Stock Tracker Core - Forecast Mapper
 *
 * ForecastEntity ↔ DynamoDB Item の変換に加えて、保存済みアイテムを core の学習入力
 * （`TickerSample`）へ直接変換する `toSample` を持つ。`toSample` は ProjectionExpression で
 * 一部属性（寄与など）を落とした軽量読み出しの結果でも動くよう、無い属性は省く。
 */
import {
  immutablePatchValue,
  optionalPatchValue,
  readTimestamp,
  requiredPatchValue,
  validateEnumField,
  validateObjectField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type {
  ForecastEntity,
  ForecastKey,
  ForecastNormal,
  ForecastOutcome,
} from '../entities/forecast.entity.js';
import type { ProbabilityRecord, TickerOutcome, TickerSample } from '../forecast/index.js';
import { buildExchangeSummaryGsi4Sk } from './exchange-summary-index.js';

/**
 * GSI4PK に付ける接頭辞。
 *
 * DailySummary の GSI4PK（`ExchangeID` そのもの）と値が衝突しないよう、Forecast だけこの
 * 接頭辞を付ける。同じ GSI を共有しても取引所単位の検索に Forecast が混ざらないようにする。
 */
const GSI4PK_PREFIX = 'FORECAST#';

/**
 * 取引所IDから Forecast アイテムの GSI4PK を構築する
 *
 * @param exchangeId - 取引所ID
 * @returns GSI4PK
 */
export function buildForecastGsi4Pk(exchangeId: string): string {
  return `${GSI4PK_PREFIX}${exchangeId}`;
}

/** 採点結果を保存する属性の名前。条件付きの追記が存在判定に使う */
export const FORECAST_OUTCOME_ATTRIBUTE = 'Outcome';

/** サンプルが確率を取り出す問い */
const FORECAST_SAMPLE_QUESTIONS = ['DIR', 'VOL'] as const;

/**
 * `toSample` が読む保存属性のパス。
 *
 * 寄与 (contributions)・確率帯実績 (bandHistory)・中立帯 (neutralBand) 等、学習・基準値・
 * 中立帯の算出に使わない属性を含めない。全期間読み出し時の転送量を抑える射影は、この一覧から作る。
 */
export const FORECAST_SAMPLE_ATTRIBUTE_PATHS: readonly (readonly string[])[] = [
  ['TickerID'],
  ['ExchangeID'],
  ['Market'],
  ['Date'],
  ['AxisValues'],
  ['Normal'],
  [FORECAST_OUTCOME_ATTRIBUTE],
  ...FORECAST_SAMPLE_QUESTIONS.flatMap((question) => [
    ['Probabilities', question, 'probability'],
    ['Probabilities', question, 'baseline'],
  ]),
];

/**
 * Forecast Mapper
 *
 * ForecastEntity と DynamoDB Item 間の変換を行う
 */
export class ForecastMapper implements EntityMapper<ForecastEntity, ForecastKey> {
  public readonly entityType = 'Forecast';

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Forecast Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: ForecastKey): DynamoDBKey {
    return {
      PK: `FORECAST#${key.tickerId}`,
      SK: `DATE#${key.date}`,
    };
  }

  public getKey(entity: ForecastEntity): ForecastKey {
    return { tickerId: entity.tickerId, date: entity.date };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Forecast Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: ForecastEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      GSI4PK: buildForecastGsi4Pk(entity.exchangeId),
      GSI4SK: buildExchangeSummaryGsi4Sk(entity.date, entity.tickerId),
      TickerID: entity.tickerId,
      ExchangeID: entity.exchangeId,
      Market: entity.market,
      Date: entity.date,
      AxisValues: entity.axisValues,
      Normal: entity.normal,
      Probabilities: entity.probabilities,
      ModelVersion: entity.modelVersion,
      Source: entity.source,
      ...(entity.backfilledAxes !== undefined ? { BackfilledAxes: entity.backfilledAxes } : {}),
      ...(entity.outcome !== undefined ? { [FORECAST_OUTCOME_ATTRIBUTE]: entity.outcome } : {}),
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
    changes: EntityPatch<ForecastEntity>,
    key: ForecastKey
  ): DynamoDBAttributes {
    const exchangeId = requiredPatchValue(changes.exchangeId, 'ExchangeID');
    return {
      TickerID: immutablePatchValue(changes.tickerId, 'TickerID'),
      Date: immutablePatchValue(changes.date, 'Date'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      GSI4PK: exchangeId === undefined ? undefined : buildForecastGsi4Pk(exchangeId),
      GSI4SK: buildExchangeSummaryGsi4Sk(key.date, key.tickerId),
      ExchangeID: exchangeId,
      Market: requiredPatchValue(changes.market, 'Market'),
      AxisValues: requiredPatchValue(changes.axisValues, 'AxisValues'),
      Normal: requiredPatchValue(changes.normal, 'Normal'),
      Probabilities: requiredPatchValue(changes.probabilities, 'Probabilities'),
      ModelVersion: requiredPatchValue(changes.modelVersion, 'ModelVersion'),
      Source: requiredPatchValue(changes.source, 'Source'),
      BackfilledAxes: optionalPatchValue(changes.backfilledAxes),
      [FORECAST_OUTCOME_ATTRIBUTE]: optionalPatchValue(changes.outcome),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Forecast Entity
   */
  public toEntity(item: DynamoDBAttributes): ForecastEntity {
    const entity: ForecastEntity = {
      tickerId: validateStringField(item.TickerID, 'TickerID'),
      exchangeId: validateStringField(item.ExchangeID, 'ExchangeID'),
      market: validateStringField(item.Market, 'Market'),
      date: validateStringField(item.Date, 'Date'),
      axisValues: validateObjectField<ForecastEntity['axisValues']>(item.AxisValues, 'AxisValues'),
      normal: validateObjectField<ForecastNormal>(item.Normal, 'Normal'),
      probabilities: validateObjectField<ForecastEntity['probabilities']>(
        item.Probabilities,
        'Probabilities'
      ),
      modelVersion: validateStringField(item.ModelVersion, 'ModelVersion'),
      source: validateEnumField(item.Source, 'Source', ['REPLAY', 'LIVE'] as const),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
    if (item.BackfilledAxes !== undefined) {
      entity.backfilledAxes = validateObjectField<NonNullable<ForecastEntity['backfilledAxes']>>(
        item.BackfilledAxes,
        'BackfilledAxes'
      );
    }
    if (item[FORECAST_OUTCOME_ATTRIBUTE] !== undefined) {
      entity.outcome = validateObjectField<ForecastOutcome>(
        item[FORECAST_OUTCOME_ATTRIBUTE],
        FORECAST_OUTCOME_ATTRIBUTE
      );
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
  public toSample(item: DynamoDBAttributes): TickerSample {
    const sample: TickerSample = {
      tickerId: validateStringField(item.TickerID, 'TickerID'),
      exchangeId: validateStringField(item.ExchangeID, 'ExchangeID'),
      market: validateStringField(item.Market, 'Market'),
      date: validateStringField(item.Date, 'Date'),
      axisValues: validateObjectField<TickerSample['axisValues']>(item.AxisValues, 'AxisValues'),
    };

    if (item.Normal !== undefined) {
      sample.normal = validateObjectField<NonNullable<TickerSample['normal']>>(
        item.Normal,
        'Normal'
      );
    }

    if (item[FORECAST_OUTCOME_ATTRIBUTE] !== undefined) {
      const outcome = validateObjectField<ForecastOutcome>(
        item[FORECAST_OUTCOME_ATTRIBUTE],
        FORECAST_OUTCOME_ATTRIBUTE
      );
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
      const probabilities = validateObjectField<Partial<Record<'DIR' | 'VOL', ProbabilityRecord>>>(
        item.Probabilities,
        'Probabilities'
      );
      const picked: NonNullable<TickerSample['probabilities']> = {};
      for (const question of FORECAST_SAMPLE_QUESTIONS) {
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
