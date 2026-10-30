/**
 * Stock Tracker Core - PerformanceDaily Mapper
 *
 * `PerformanceDailyItem` (core の型。camelCase) ↔ DynamoDB Item (PascalCase 属性) の変換を担当する。
 * PerformanceDaily は同じ形の型を core と entities で重複して持たないため、Mapper が
 * `PerformanceDailyItem` をそのままビジネスオブジェクトとして扱う。
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
import type { PerformanceDailyKey } from '../entities/performance-daily.entity.js';
import {
  QUESTIONS,
  type Market,
  type PerformanceDailyItem,
  type ProbabilityBandDailyEntry,
  type Question,
} from '../forecast/index.js';

/**
 * 問いと市場から PerformanceDaily アイテムの PK を構築する
 *
 * 期間の Query がパーティションキーに指定する。
 *
 * @param question - 問い
 * @param market - 算出した市場
 * @returns PK
 */
export function buildPerformanceDailyPk(question: Question, market: Market): string {
  return `PERF#${question}#${market}`;
}

/**
 * 日付から PerformanceDaily アイテムの SK を構築する
 *
 * @param date - 予測日 (YYYY-MM-DD)
 * @returns SK
 */
export function buildPerformanceDailySk(date: string): string {
  return `DATE#${date}`;
}

/**
 * ある日付までを含む範囲検索の上限となる SK を構築する。
 *
 * `DATE#{date}` の末尾に ASCII 印字可能文字でほぼ最大の `~` (0x7E) を付け、
 * 同じ日付の SK が必ず範囲に入るようにする。
 *
 * @param date - 予測日 (YYYY-MM-DD)
 * @returns 範囲の上限となる SK
 */
export function buildPerformanceDailySkUpperBound(date: string): string {
  return `${buildPerformanceDailySk(date)}#~`;
}

/**
 * PerformanceDaily Mapper
 *
 * PerformanceDailyItem と DynamoDB Item 間の変換を行う
 */
export class PerformanceDailyMapper implements EntityMapper<
  PerformanceDailyItem,
  PerformanceDailyKey
> {
  public readonly entityType = 'PerformanceDaily';

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - PerformanceDaily Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: PerformanceDailyKey): DynamoDBKey {
    return {
      PK: buildPerformanceDailyPk(key.question, key.market),
      SK: buildPerformanceDailySk(key.date),
    };
  }

  public getKey(entity: PerformanceDailyItem): PerformanceDailyKey {
    return { question: entity.question, market: entity.market, date: entity.date };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * Entity が更新日時を持たないため `UpdatedAt` は含めない。書き込み時に EntityStore が設定する。
   *
   * @param entity - PerformanceDaily
   * @returns DynamoDB Item
   */
  public toItem(entity: PerformanceDailyItem): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      Question: entity.question,
      Market: entity.market,
      Date: entity.date,
      EvaluatedCount: entity.evaluatedCount,
      HitCount: entity.hitCount,
      AxisStats: entity.axisStats,
      ProbabilityBands: entity.probabilityBands,
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
  public toUpdateAttributes(changes: EntityPatch<PerformanceDailyItem>): DynamoDBAttributes {
    return {
      Question: immutablePatchValue(changes.question, 'Question'),
      Market: immutablePatchValue(changes.market, 'Market'),
      Date: immutablePatchValue(changes.date, 'Date'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      EvaluatedCount: requiredPatchValue(changes.evaluatedCount, 'EvaluatedCount'),
      HitCount: requiredPatchValue(changes.hitCount, 'HitCount'),
      AxisStats: requiredPatchValue(changes.axisStats, 'AxisStats'),
      ProbabilityBands: requiredPatchValue(changes.probabilityBands, 'ProbabilityBands'),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * 旧形式 (ISO 文字列・エポック秒) の `CreatedAt` もミリ秒で読む。
   * Entity が更新日時を持たないため `UpdatedAt` は読まない。
   *
   * @param item - DynamoDB Item
   * @returns PerformanceDaily
   */
  public toEntity(item: DynamoDBAttributes): PerformanceDailyItem {
    return {
      question: validateEnumField(item.Question, 'Question', QUESTIONS),
      market: validateStringField(item.Market, 'Market'),
      date: validateStringField(item.Date, 'Date'),
      evaluatedCount: validateNumberField(item.EvaluatedCount, 'EvaluatedCount'),
      hitCount: validateNumberField(item.HitCount, 'HitCount'),
      axisStats: validateObjectField(
        item.AxisStats,
        'AxisStats'
      ) as PerformanceDailyItem['axisStats'],
      probabilityBands: validateArrayField<ProbabilityBandDailyEntry>(
        item.ProbabilityBands,
        'ProbabilityBands'
      ),
      createdAt: readTimestamp(item, 'CreatedAt'),
    };
  }
}
