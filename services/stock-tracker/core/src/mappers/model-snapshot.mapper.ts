/**
 * Stock Tracker Core - ModelSnapshot Mapper
 *
 * `ModelSnapshotItem`（core の型。camelCase）↔ DynamoDBItem（PascalCase 属性）の変換を担当する。
 * ModelSnapshot は同じ形の型を core と entities で重複して持たないため、Mapper が
 * `ModelSnapshotItem` をそのままビジネスオブジェクトとして扱う。
 */
import type { DynamoDBItem } from '@nagiyu/aws';
import {
  InvalidEntityDataError,
  validateEnumField,
  validateNumberField,
  validateStringField,
  type EntityMapper,
} from '@nagiyu/aws';
import type { ModelSnapshotKey } from '../entities/model-snapshot.entity.js';
import {
  QUESTIONS,
  type BandHistoryEntry,
  type ModelSnapshotItem,
  type NeutralBandState,
} from '../forecast/index.js';

export class ModelSnapshotMapper implements EntityMapper<ModelSnapshotItem, ModelSnapshotKey> {
  private readonly entityType = 'ModelSnapshot';

  /**
   * Entity を DynamoDB Item に変換
   */
  public toItem(entity: ModelSnapshotItem): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      question: entity.question,
      market: entity.market,
      date: entity.date,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      Question: entity.question,
      Market: entity.market,
      Date: entity.date,
      ModelVersion: entity.modelVersion,
      Alpha: entity.alpha,
      Weights: entity.weights,
      Standardization: entity.standardization,
      Baseline: entity.baseline,
      NeutralBand: entity.neutralBand,
      BandHistory: entity.bandHistory,
      AxisStats: entity.axisStats,
      TrainingSize: entity.trainingSize,
      DistinctTrainingDates: entity.distinctTrainingDates,
      // AbstractDynamoDBRepository 由来ではない独自実装のため UpdatedAt は不要だが、
      // DynamoDBItem 型（@nagiyu/aws）の必須フィールドのため CreatedAt と同じ値を入れておく。
      // ModelSnapshot は一度書いたら書き換えないため、以後更新されることはない。
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.createdAt,
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   */
  public toEntity(item: DynamoDBItem): ModelSnapshotItem {
    return {
      question: validateEnumField(item.Question, 'Question', QUESTIONS),
      market: validateStringField(item.Market, 'Market'),
      date: validateStringField(item.Date, 'Date'),
      modelVersion: validateStringField(item.ModelVersion, 'ModelVersion'),
      alpha: validateNumberField(item.Alpha, 'Alpha'),
      weights: toPlainObject<ModelSnapshotItem['weights']>(item.Weights, 'Weights'),
      standardization: toPlainObject<ModelSnapshotItem['standardization']>(
        item.Standardization,
        'Standardization'
      ),
      baseline: validateNumberField(item.Baseline, 'Baseline'),
      neutralBand: toPlainObject<NeutralBandState>(item.NeutralBand, 'NeutralBand'),
      bandHistory: toArray<BandHistoryEntry>(item.BandHistory, 'BandHistory'),
      axisStats: toPlainObject<ModelSnapshotItem['axisStats']>(item.AxisStats, 'AxisStats'),
      trainingSize: validateNumberField(item.TrainingSize, 'TrainingSize'),
      distinctTrainingDates: validateNumberField(
        item.DistinctTrainingDates,
        'DistinctTrainingDates'
      ),
      createdAt: validateNumberField(item.CreatedAt, 'CreatedAt'),
    };
  }

  /**
   * ビジネスキーから PK/SK を構築
   */
  public buildKeys(key: ModelSnapshotKey): { pk: string; sk: string } {
    return {
      pk: `MODEL#${key.question}#${key.market}`,
      sk: `DATE#${key.date}`,
    };
  }
}

/** ネストしたマップ属性をプレーンオブジェクトとして受け取る（配列・null・非オブジェクトは拒否） */
function toPlainObject<T>(value: unknown, fieldName: string): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" がオブジェクトではありません`);
  }
  return value as T;
}

/** 配列属性を受け取る（非配列は拒否） */
function toArray<T>(value: unknown, fieldName: string): T[] {
  if (!Array.isArray(value)) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" が配列ではありません`);
  }
  return value as T[];
}
