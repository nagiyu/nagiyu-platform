/**
 * Stock Tracker Core - PerformanceDaily Mapper
 *
 * `PerformanceDailyItem`（core の型。camelCase）↔ DynamoDBItem（PascalCase 属性）の変換を担当する。
 * PerformanceDaily は同じ形の型を core と entities で重複して持たないため、Mapper が
 * `PerformanceDailyItem` をそのままビジネスオブジェクトとして扱う。
 */
import type { DynamoDBItem } from '@nagiyu/aws';
import {
  InvalidEntityDataError,
  validateEnumField,
  validateNumberField,
  validateStringField,
  type EntityMapper,
} from '@nagiyu/aws';
import type { PerformanceDailyKey } from '../entities/performance-daily.entity.js';
import {
  QUESTIONS,
  type PerformanceDailyItem,
  type ProbabilityBandDailyEntry,
} from '../forecast/index.js';

export class PerformanceDailyMapper implements EntityMapper<
  PerformanceDailyItem,
  PerformanceDailyKey
> {
  private readonly entityType = 'PerformanceDaily';

  /**
   * Entity を DynamoDB Item に変換
   */
  public toItem(entity: PerformanceDailyItem): DynamoDBItem {
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
      EvaluatedCount: entity.evaluatedCount,
      HitCount: entity.hitCount,
      AxisStats: entity.axisStats,
      ProbabilityBands: entity.probabilityBands,
      // PerformanceDaily は日ごとに再計算して置き換える（冪等な upsert）ため
      // UpdatedAt は業務上意味を持たないが、DynamoDBItem 型の必須フィールドのため CreatedAt を入れる。
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.createdAt,
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   */
  public toEntity(item: DynamoDBItem): PerformanceDailyItem {
    return {
      question: validateEnumField(item.Question, 'Question', QUESTIONS),
      market: validateStringField(item.Market, 'Market'),
      date: validateStringField(item.Date, 'Date'),
      evaluatedCount: validateNumberField(item.EvaluatedCount, 'EvaluatedCount'),
      hitCount: validateNumberField(item.HitCount, 'HitCount'),
      axisStats: toPlainObject<PerformanceDailyItem['axisStats']>(item.AxisStats, 'AxisStats'),
      probabilityBands: toArray<ProbabilityBandDailyEntry>(
        item.ProbabilityBands,
        'ProbabilityBands'
      ),
      createdAt: validateNumberField(item.CreatedAt, 'CreatedAt'),
    };
  }

  /**
   * ビジネスキーから PK/SK を構築
   */
  public buildKeys(key: PerformanceDailyKey): { pk: string; sk: string } {
    return {
      pk: `PERF#${key.question}#${key.market}`,
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
