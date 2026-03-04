/**
 * Stock Tracker Core - Daily Summary Mapper
 *
 * DailySummaryEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem } from '@nagiyu/aws';
import {
  validateNumberField,
  validateStringField,
  validateTimestampField,
  type EntityMapper,
} from '@nagiyu/aws';
import type { DailySummaryEntity, DailySummaryKey } from '../entities/daily-summary.entity.js';
import { PATTERN_REGISTRY } from '../patterns/pattern-registry.js';
import type { PatternStatus } from '../types.js';

export interface PatternDetailResponse {
  patternId: string;
  name: string;
  description: string;
  signalType: 'BUY' | 'SELL';
  status: PatternStatus;
}

export interface DailySummaryPatternResponse {
  buyPatternCount: number;
  sellPatternCount: number;
  patternDetails: PatternDetailResponse[];
  aiAnalysis?: string;
  aiAnalysisError?: string;
}

/**
 * Daily Summary Mapper
 *
 * DailySummaryEntity と DynamoDB Item 間の変換を行う
 */
export class DailySummaryMapper implements EntityMapper<DailySummaryEntity, DailySummaryKey> {
  private readonly entityType = 'DailySummary';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - DailySummary Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: DailySummaryEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      tickerId: entity.TickerID,
      date: entity.Date,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      GSI4PK: entity.ExchangeID,
      GSI4SK: `DATE#${entity.Date}#${entity.TickerID}`,
      TickerID: entity.TickerID,
      ExchangeID: entity.ExchangeID,
      Date: entity.Date,
      Open: entity.Open,
      High: entity.High,
      Low: entity.Low,
      Close: entity.Close,
      ...(entity.PatternResults ? { PatternResults: entity.PatternResults } : {}),
      ...(entity.BuyPatternCount !== undefined ? { BuyPatternCount: entity.BuyPatternCount } : {}),
      ...(entity.SellPatternCount !== undefined
        ? { SellPatternCount: entity.SellPatternCount }
        : {}),
      ...(entity.AiAnalysis !== undefined ? { AiAnalysis: entity.AiAnalysis } : {}),
      ...(entity.AiAnalysisError !== undefined ? { AiAnalysisError: entity.AiAnalysisError } : {}),
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns DailySummary Entity
   */
  public toEntity(item: DynamoDBItem): DailySummaryEntity {
    return {
      TickerID: validateStringField(item.TickerID, 'TickerID'),
      ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
      Date: validateStringField(item.Date, 'Date'),
      Open: validateNumberField(item.Open, 'Open'),
      High: validateNumberField(item.High, 'High'),
      Low: validateNumberField(item.Low, 'Low'),
      Close: validateNumberField(item.Close, 'Close'),
      PatternResults:
        item.PatternResults &&
        typeof item.PatternResults === 'object' &&
        !Array.isArray(item.PatternResults)
          ? (item.PatternResults as DailySummaryEntity['PatternResults'])
          : undefined,
      BuyPatternCount:
        item.BuyPatternCount === undefined
          ? undefined
          : validateNumberField(item.BuyPatternCount, 'BuyPatternCount'),
      SellPatternCount:
        item.SellPatternCount === undefined
          ? undefined
          : validateNumberField(item.SellPatternCount, 'SellPatternCount'),
      AiAnalysis:
        item.AiAnalysis === undefined
          ? undefined
          : validateStringField(item.AiAnalysis, 'AiAnalysis'),
      AiAnalysisError:
        item.AiAnalysisError === undefined
          ? undefined
          : validateStringField(item.AiAnalysisError, 'AiAnalysisError'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  /**
   * DailySummaryEntity を TickerSummary のパターン関連レスポンスに変換
   *
   * @param entity - DailySummary Entity
   * @returns パターン関連のレスポンス
   */
  public toTickerSummaryResponse(entity: DailySummaryEntity): DailySummaryPatternResponse {
    if (!entity.PatternResults) {
      return {
        buyPatternCount: 0,
        sellPatternCount: 0,
        patternDetails: [],
        aiAnalysis: entity.AiAnalysis,
        aiAnalysisError: entity.AiAnalysisError,
      };
    }

    const patternDetails = PATTERN_REGISTRY.flatMap((pattern) => {
      const status = entity.PatternResults?.[pattern.definition.patternId];

      if (!status) {
        return [];
      }

      return [
        {
          ...pattern.definition,
          status,
        },
      ];
    });

    return {
      buyPatternCount: entity.BuyPatternCount ?? 0,
      sellPatternCount: entity.SellPatternCount ?? 0,
      patternDetails,
      aiAnalysis: entity.AiAnalysis,
      aiAnalysisError: entity.AiAnalysisError,
    };
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - DailySummary Key
   * @returns PK と SK
   */
  public buildKeys(key: DailySummaryKey): { pk: string; sk: string } {
    return {
      pk: `SUMMARY#${key.tickerId}`,
      sk: `DATE#${key.date}`,
    };
  }
}
