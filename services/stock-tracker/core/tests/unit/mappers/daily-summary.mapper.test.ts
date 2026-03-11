/**
 * Stock Tracker Core - Daily Summary Mapper Unit Tests
 *
 * DailySummaryMapperのユニットテスト
 */

import { DailySummaryMapper } from '../../../src/mappers/daily-summary.mapper.js';
import type { DailySummaryEntity } from '../../../src/entities/daily-summary.entity.js';
import type { DynamoDBItem } from '@nagiyu/aws';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';

describe('DailySummaryMapper', () => {
  let mapper: DailySummaryMapper;
  const mockAiAnalysisResult = {
    priceMovementAnalysis: '当日の値動き分析',
    patternAnalysis: 'パターン分析',
    supportLevels: [100, 99, 98] as [number, number, number],
    resistanceLevels: [110, 111, 112] as [number, number, number],
    relatedMarketTrend: '関連市場動向',
    investmentJudgment: {
      signal: 'NEUTRAL' as const,
      reason: '様子見',
    },
  };

  beforeEach(() => {
    mapper = new DailySummaryMapper();
  });

  describe('toItem', () => {
    it('DailySummaryEntity を DynamoDBItem に正しく変換する', () => {
      const entity: DailySummaryEntity = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        Volume: 1234567,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      };

      const item = mapper.toItem(entity);

      expect(item).toEqual({
        PK: 'SUMMARY#NSDQ:AAPL',
        SK: 'DATE#2026-02-27',
        Type: 'DailySummary',
        GSI4PK: 'NASDAQ',
        GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        Volume: 1234567,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      });
    });

    it('パターン関連フィールドを含む DailySummaryEntity を DynamoDBItem に変換する', () => {
      const entity: DailySummaryEntity = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        PatternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        BuyPatternCount: 1,
        SellPatternCount: 0,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      };

      const item = mapper.toItem(entity);

      expect(item).toMatchObject({
        PatternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        BuyPatternCount: 1,
        SellPatternCount: 0,
      });
    });
  });

  describe('toEntity', () => {
    it('DynamoDBItem を DailySummaryEntity に正しく変換する', () => {
      const item: DynamoDBItem = {
        PK: 'SUMMARY#NSDQ:AAPL',
        SK: 'DATE#2026-02-27',
        Type: 'DailySummary',
        GSI4PK: 'NASDAQ',
        GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        Volume: 1234567,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      };

      const entity = mapper.toEntity(item);

      expect(entity).toEqual({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        Volume: 1234567,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      });
    });

    it('PatternResults をそのまま保持して DailySummaryEntity に変換する', () => {
      const item: DynamoDBItem = {
        PK: 'SUMMARY#NSDQ:AAPL',
        SK: 'DATE#2026-02-27',
        Type: 'DailySummary',
        GSI4PK: 'NASDAQ',
        GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        PatternResults: {
          'morning-star': 'MATCHED',
          unknown: 'NOT_MATCHED',
        },
        BuyPatternCount: 1,
        SellPatternCount: 0,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      } as DynamoDBItem;

      const entity = mapper.toEntity(item);

      expect(entity.PatternResults).toEqual({
        'morning-star': 'MATCHED',
        unknown: 'NOT_MATCHED',
      });
      expect(entity.BuyPatternCount).toBe(1);
      expect(entity.SellPatternCount).toBe(0);
    });

    it('必須フィールドが欠けている場合はエラーをスローする', () => {
      const item: DynamoDBItem = {
        PK: 'SUMMARY#NSDQ:AAPL',
        SK: 'DATE#2026-02-27',
        Type: 'DailySummary',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        Volume: 1234567,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      };

      expect(() => mapper.toEntity(item)).toThrow();
    });

    it('数値フィールドの型が不正な場合はエラーをスローする', () => {
      const item = {
        PK: 'SUMMARY#NSDQ:AAPL',
        SK: 'DATE#2026-02-27',
        Type: 'DailySummary',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: '182.15',
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      } as DynamoDBItem;

      expect(() => mapper.toEntity(item)).toThrow();
    });

    it('境界値（負のタイムスタンプ）の場合はエラーをスローする', () => {
      const item: DynamoDBItem = {
        PK: 'SUMMARY#NSDQ:AAPL',
        SK: 'DATE#2026-02-27',
        Type: 'DailySummary',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: -1,
        UpdatedAt: 1708992000000,
      };

      expect(() => mapper.toEntity(item)).toThrow();
    });
  });

  describe('変換の往復', () => {
    it('toItem と toEntity で往復変換できる', () => {
      const entity: DailySummaryEntity = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      };

      const item = mapper.toItem(entity);
      const convertedEntity = mapper.toEntity(item);

      expect(convertedEntity).toEqual(entity);
    });
  });

  describe('toTickerSummaryResponse', () => {
    it('PatternResults がある場合は PATTERN_REGISTRY に存在するパターンのみ patternDetails に含める', () => {
      const patternResults = Object.fromEntries(
        PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, 'NOT_MATCHED'])
      );
      const response = mapper.toTickerSummaryResponse({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        PatternResults: {
          ...patternResults,
          'morning-star': 'MATCHED',
          unknown: 'MATCHED',
        },
        BuyPatternCount: 1,
        SellPatternCount: 0,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      });

      expect(response.buyPatternCount).toBe(1);
      expect(response.sellPatternCount).toBe(0);
      expect(response.patternDetails).toHaveLength(PATTERN_REGISTRY.length);
      expect(response.patternDetails).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            patternId: 'morning-star',
            status: 'MATCHED',
          }),
          expect.objectContaining({
            patternId: 'evening-star',
            status: 'NOT_MATCHED',
          }),
          expect.objectContaining({
            patternId: 'red-three-soldiers-hesitation',
            status: 'NOT_MATCHED',
          }),
          expect.objectContaining({
            patternId: 'three-white-soldiers',
            status: 'NOT_MATCHED',
          }),
        ])
      );
      expect(response.patternDetails.some((detail) => detail.patternId === 'unknown')).toBe(false);
    });

    it('PatternResults が未設定の場合はデフォルト値を返す', () => {
      const response = mapper.toTickerSummaryResponse({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      });

      expect(response).toEqual({
        buyPatternCount: 0,
        sellPatternCount: 0,
        patternDetails: [],
        aiAnalysisResult: undefined,
        aiAnalysisError: undefined,
      });
    });
  });

  describe('AI解析フィールドのマッピング', () => {
    it('成功パターン: AiAnalysisResult あり / AiAnalysisError なし', () => {
      const entity: DailySummaryEntity = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        AiAnalysisResult: mockAiAnalysisResult,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      };

      const item = mapper.toItem(entity);
      const convertedEntity = mapper.toEntity(item);
      const response = mapper.toTickerSummaryResponse(entity);

      expect(item.AiAnalysisResult).toBe(JSON.stringify(mockAiAnalysisResult));
      expect(item.AiAnalysisError).toBeUndefined();
      expect(convertedEntity.AiAnalysisResult).toEqual(mockAiAnalysisResult);
      expect(convertedEntity.AiAnalysisError).toBeUndefined();
      expect(response.aiAnalysisResult).toEqual(mockAiAnalysisResult);
      expect(response.aiAnalysisError).toBeUndefined();
    });

    it('失敗パターン: AiAnalysisResult なし / AiAnalysisError あり', () => {
      const entity: DailySummaryEntity = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        AiAnalysisError: 'OpenAI API timeout',
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      };

      const item = mapper.toItem(entity);
      const convertedEntity = mapper.toEntity(item);
      const response = mapper.toTickerSummaryResponse(entity);

      expect(item.AiAnalysisResult).toBeUndefined();
      expect(item.AiAnalysisError).toBe('OpenAI API timeout');
      expect(convertedEntity.AiAnalysisResult).toBeUndefined();
      expect(convertedEntity.AiAnalysisError).toBe('OpenAI API timeout');
      expect(response.aiAnalysisResult).toBeUndefined();
      expect(response.aiAnalysisError).toBe('OpenAI API timeout');
    });

    it('未生成パターン: AiAnalysisResult / AiAnalysisError ともになし', () => {
      const entity: DailySummaryEntity = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      };

      const item = mapper.toItem(entity);
      const convertedEntity = mapper.toEntity(item);
      const response = mapper.toTickerSummaryResponse(entity);

      expect(item.AiAnalysisResult).toBeUndefined();
      expect(item.AiAnalysisError).toBeUndefined();
      expect(convertedEntity.AiAnalysisResult).toBeUndefined();
      expect(convertedEntity.AiAnalysisError).toBeUndefined();
      expect(response.aiAnalysisResult).toBeUndefined();
      expect(response.aiAnalysisError).toBeUndefined();
    });
  });

  describe('buildKeys', () => {
    it('tickerId と date から PK/SK を正しく構築する', () => {
      const keys = mapper.buildKeys({ tickerId: 'NSDQ:AAPL', date: '2026-02-27' });

      expect(keys).toEqual({
        pk: 'SUMMARY#NSDQ:AAPL',
        sk: 'DATE#2026-02-27',
      });
    });
  });
});
