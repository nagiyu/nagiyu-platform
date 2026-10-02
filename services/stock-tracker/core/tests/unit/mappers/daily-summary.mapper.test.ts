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

  describe('toForecastFields', () => {
    it('OHLCV・パターン結果・CreatedAt だけを持つ射影に変換し、UpdatedAt を含まない', () => {
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
        BuyPatternCount: 3,
        SellPatternCount: 1,
        CreatedAt: 1708992000000,
        // ProjectionExpression で絞った読み出しを模し、UpdatedAt を含めない
      };

      const fields = mapper.toForecastFields(item);

      expect(fields).toEqual({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        Volume: 1234567,
        PatternResults: undefined,
        BuyPatternCount: 3,
        SellPatternCount: 1,
        CreatedAt: 1708992000000,
      });
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
      });
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

  describe('AI 由来の属性が残った既存アイテム', () => {
    it('toEntity は AiAnalysisResult・Evaluation* が残っていても読み飛ばして変換する', () => {
      const item = {
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
        AiAnalysisResult: '{"unexpected":true}',
        AiAnalysisError: 'timeout',
        EvaluatedAt: 1709078400000,
        Hit: 'true',
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      } as DynamoDBItem;

      const entity = mapper.toEntity(item);

      expect(entity).not.toHaveProperty('AiAnalysisResult');
      expect(entity).not.toHaveProperty('EvaluatedAt');
      expect(entity.Close).toBe(183.31);
    });
  });
});
