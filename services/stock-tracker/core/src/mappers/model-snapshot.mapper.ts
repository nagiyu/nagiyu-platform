/**
 * Stock Tracker Core - ModelSnapshot Mapper
 *
 * `ModelSnapshotItem` (core の型。camelCase) ↔ DynamoDB Item (PascalCase 属性) の変換を担当する。
 * ModelSnapshot は同じ形の型を core と entities で重複して持たないため、Mapper が
 * `ModelSnapshotItem` をそのままビジネスオブジェクトとして扱う。
 */
import {
  immutablePatchValue,
  readTimestamp,
  requiredPatchValue,
  validateArrayField,
  validateEnumField,
  validateNumberField,
  validateObjectField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { ModelSnapshotKey } from '../entities/model-snapshot.entity.js';
import {
  QUESTIONS,
  type BandHistoryEntry,
  type Market,
  type ModelSnapshotItem,
  type NeutralBandState,
  type Question,
} from '../forecast/index.js';

/**
 * 問いと市場から ModelSnapshot アイテムの PK を構築する
 *
 * 直前のスナップショットを探す Query がパーティションキーに指定する。
 *
 * @param question - 問い
 * @param market - 算出した市場
 * @returns PK
 */
export function buildModelSnapshotPk(question: Question, market: Market): string {
  return `MODEL#${question}#${market}`;
}

/**
 * 日付から ModelSnapshot アイテムの SK を構築する
 *
 * @param date - 基準日 (YYYY-MM-DD)
 * @returns SK
 */
export function buildModelSnapshotSk(date: string): string {
  return `DATE#${date}`;
}

/**
 * ModelSnapshot Mapper
 *
 * ModelSnapshotItem と DynamoDB Item 間の変換を行う
 */
export class ModelSnapshotMapper implements EntityMapper<ModelSnapshotItem, ModelSnapshotKey> {
  public readonly entityType = 'ModelSnapshot';

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - ModelSnapshot Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: ModelSnapshotKey): DynamoDBKey {
    return {
      PK: buildModelSnapshotPk(key.question, key.market),
      SK: buildModelSnapshotSk(key.date),
    };
  }

  public getKey(entity: ModelSnapshotItem): ModelSnapshotKey {
    return { question: entity.question, market: entity.market, date: entity.date };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * Entity が更新日時を持たないため `UpdatedAt` は含めない。書き込み時に EntityStore が設定する。
   *
   * @param entity - ModelSnapshot
   * @returns DynamoDB Item
   */
  public toItem(entity: ModelSnapshotItem): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
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
      CreatedAt: entity.createdAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * GSI を持たないため、キーから作る属性はない。
   * question・market・date・createdAt は作成後に変えられないため、含めると拒否する。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<ModelSnapshotItem>): DynamoDBAttributes {
    return {
      Question: immutablePatchValue(changes.question, 'Question'),
      Market: immutablePatchValue(changes.market, 'Market'),
      Date: immutablePatchValue(changes.date, 'Date'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      ModelVersion: requiredPatchValue(changes.modelVersion, 'ModelVersion'),
      Alpha: requiredPatchValue(changes.alpha, 'Alpha'),
      Weights: requiredPatchValue(changes.weights, 'Weights'),
      Standardization: requiredPatchValue(changes.standardization, 'Standardization'),
      Baseline: requiredPatchValue(changes.baseline, 'Baseline'),
      NeutralBand: requiredPatchValue(changes.neutralBand, 'NeutralBand'),
      BandHistory: requiredPatchValue(changes.bandHistory, 'BandHistory'),
      AxisStats: requiredPatchValue(changes.axisStats, 'AxisStats'),
      TrainingSize: requiredPatchValue(changes.trainingSize, 'TrainingSize'),
      DistinctTrainingDates: requiredPatchValue(
        changes.distinctTrainingDates,
        'DistinctTrainingDates'
      ),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * 旧形式 (ISO 文字列・エポック秒) の `CreatedAt` もミリ秒で読む。
   * Entity が更新日時を持たないため `UpdatedAt` は読まない。
   *
   * @param item - DynamoDB Item
   * @returns ModelSnapshot
   */
  public toEntity(item: DynamoDBAttributes): ModelSnapshotItem {
    return {
      question: validateEnumField(item.Question, 'Question', QUESTIONS),
      market: validateStringField(item.Market, 'Market'),
      date: validateStringField(item.Date, 'Date'),
      modelVersion: validateStringField(item.ModelVersion, 'ModelVersion'),
      alpha: validateNumberField(item.Alpha, 'Alpha'),
      weights: validateObjectField(item.Weights, 'Weights') as ModelSnapshotItem['weights'],
      standardization: validateObjectField(
        item.Standardization,
        'Standardization'
      ) as ModelSnapshotItem['standardization'],
      baseline: validateNumberField(item.Baseline, 'Baseline'),
      neutralBand: validateObjectField(
        item.NeutralBand,
        'NeutralBand'
      ) as unknown as NeutralBandState,
      bandHistory: validateArrayField<BandHistoryEntry>(item.BandHistory, 'BandHistory'),
      axisStats: validateObjectField(item.AxisStats, 'AxisStats') as ModelSnapshotItem['axisStats'],
      trainingSize: validateNumberField(item.TrainingSize, 'TrainingSize'),
      distinctTrainingDates: validateNumberField(
        item.DistinctTrainingDates,
        'DistinctTrainingDates'
      ),
      createdAt: readTimestamp(item, 'CreatedAt'),
    };
  }
}
