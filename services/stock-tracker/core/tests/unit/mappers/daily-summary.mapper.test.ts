/**
 * Stock Tracker Core - DailySummary Mapper Unit Tests
 *
 * DailySummaryMapperのユニットテスト
 */

import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import {
  DailySummaryMapper,
  DAILY_SUMMARY_FORECAST_FIELD_ATTRIBUTES,
  buildDailySummaryGsi4Pk,
} from '../../../src/mappers/daily-summary.mapper.js';
import type { DailySummaryEntity } from '../../../src/entities/daily-summary.entity.js';

const TIMESTAMP = 1708992000000;
const KEY = { tickerId: 'NSDQ:AAPL', date: '2026-02-27' };

function buildEntity(overrides: Partial<DailySummaryEntity> = {}): DailySummaryEntity {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    date: '2026-02-27',
    open: 182.15,
    high: 183.92,
    low: 181.44,
    close: 183.31,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('DailySummaryMapper', () => {
  let mapper: DailySummaryMapper;

  beforeEach(() => {
    mapper = new DailySummaryMapper();
  });

  it('entityType は DailySummary になる', () => {
    expect(mapper.entityType).toBe('DailySummary');
  });

  describe('buildKeys / getKey', () => {
    it('tickerId と date から PK/SK を構築する', () => {
      expect(mapper.buildKeys(KEY)).toEqual({ PK: 'SUMMARY#NSDQ:AAPL', SK: 'DATE#2026-02-27' });
    });

    it('PK が先頭のキー属性になる (条件付き書き込みの存在判定に使われる)', () => {
      expect(Object.keys(mapper.buildKeys(KEY))).toEqual(['PK', 'SK']);
    });

    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity())).toEqual(KEY);
    });
  });

  describe('buildDailySummaryGsi4Pk', () => {
    it('GSI4PK は取引所IDそのものになる', () => {
      expect(buildDailySummaryGsi4Pk('NASDAQ')).toBe('NASDAQ');
    });
  });

  describe('toItem', () => {
    it('Entity を保存形式 (PascalCase・キー・Type・GSI4) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('任意項目があれば属性として保存する', () => {
      const item = mapper.toItem(
        buildEntity({
          volume: 1234567,
          patternResults: { 'morning-star': 'MATCHED' },
          buyPatternCount: 1,
          sellPatternCount: 0,
        })
      );

      expect(item).toMatchObject({
        Volume: 1234567,
        PatternResults: { 'morning-star': 'MATCHED' },
        BuyPatternCount: 1,
        SellPatternCount: 0,
      });
    });

    it('件数が 0 でも属性として保存する', () => {
      const item = mapper.toItem(buildEntity({ buyPatternCount: 0, sellPatternCount: 0 }));

      expect(item.BuyPatternCount).toBe(0);
      expect(item.SellPatternCount).toBe(0);
    });

    it('任意項目が未設定なら属性を含めない', () => {
      const item = mapper.toItem(buildEntity());

      for (const name of ['Volume', 'PatternResults', 'BuyPatternCount', 'SellPatternCount']) {
        expect(item).not.toHaveProperty(name);
      }
    });

    it('時刻は数値ミリ秒のまま保存する', () => {
      const item = mapper.toItem(buildEntity());

      expect(item.CreatedAt).toBe(TIMESTAMP);
      expect(item.UpdatedAt).toBe(TIMESTAMP);
    });

    it('toItem のキー属性は buildKeys の結果と一致する', () => {
      const entity = buildEntity({ tickerId: 'TSE:7203', date: '2026-03-02' });
      const item = mapper.toItem(entity);

      for (const [name, value] of Object.entries(mapper.buildKeys(mapper.getKey(entity)))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目に加えて、キーから作った GSI4SK を返す', () => {
      expect(mapper.toUpdateAttributes({ close: 190, volume: 500 }, KEY)).toEqual({
        GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
        Close: 190,
        Volume: 500,
      });
    });

    it('GSI4SK は changes ではなく key から作る', () => {
      expect(
        mapper.toUpdateAttributes({}, { tickerId: 'TSE:7203', date: '2026-03-02' }).GSI4SK
      ).toBe('DATE#2026-03-02#TSE:7203');
    });

    it('exchangeId を変えるときだけ GSI4PK を付け直す', () => {
      const withExchange = mapper.toUpdateAttributes({ exchangeId: 'NYSE' }, KEY);
      const withoutExchange = mapper.toUpdateAttributes({ close: 190 }, KEY);

      expect(withExchange.ExchangeID).toBe('NYSE');
      expect(withExchange.GSI4PK).toBe('NYSE');
      expect(withoutExchange.GSI4PK).toBeUndefined();
    });

    it('キー属性 (PK/SK) は返さない', () => {
      const attributes = mapper.toUpdateAttributes({ close: 190 }, KEY);

      for (const name of Object.keys(mapper.buildKeys(KEY))) {
        expect(attributes).not.toHaveProperty(name);
      }
    });

    it('undefined の項目は変更しない (属性に含めても値は undefined)', () => {
      const attributes = mapper.toUpdateAttributes({ open: undefined, high: 200 }, KEY);

      expect(attributes.Open).toBeUndefined();
      expect(attributes.High).toBe(200);
    });

    it.each([
      ['volume', 'Volume'],
      ['patternResults', 'PatternResults'],
      ['buyPatternCount', 'BuyPatternCount'],
      ['sellPatternCount', 'SellPatternCount'],
    ] as const)('任意項目 %s を null にすると属性を削除する', (field, attribute) => {
      expect(mapper.toUpdateAttributes({ [field]: null }, KEY)[attribute]).toBe(REMOVE_ATTRIBUTE);
    });

    it.each(['exchangeId', 'open', 'high', 'low', 'close'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null }, KEY)).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it.each([
      ['tickerId', { tickerId: 'NSDQ:AAPL' }],
      ['date', { date: '2026-02-27' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes, KEY)).toThrow(InvalidEntityDataError);
      }
    );
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('PK/SK/Type/GSI4 などの保存用の属性を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());

      for (const name of ['PK', 'SK', 'Type', 'GSI4PK', 'GSI4SK']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('任意項目を含む Item を変換する', () => {
      const entity = mapper.toEntity(
        buildItem({
          Volume: 1234567,
          PatternResults: { 'morning-star': 'MATCHED' },
          BuyPatternCount: 1,
          SellPatternCount: 0,
        })
      );

      expect(entity).toMatchObject({
        volume: 1234567,
        patternResults: { 'morning-star': 'MATCHED' },
        buyPatternCount: 1,
        sellPatternCount: 0,
      });
    });

    it('任意項目が無ければ undefined になる', () => {
      const entity = mapper.toEntity(buildItem());

      expect(entity.volume).toBeUndefined();
      expect(entity.patternResults).toBeUndefined();
      expect(entity.buyPatternCount).toBeUndefined();
      expect(entity.sellPatternCount).toBeUndefined();
    });

    it.each([
      ['配列', ['a']],
      ['文字列', 'MATCHED'],
      ['null', null],
    ])('PatternResults が%sのときは未設定として扱う', (_label, value) => {
      expect(mapper.toEntity(buildItem({ PatternResults: value })).patternResults).toBeUndefined();
    });

    it.each(['TickerID', 'ExchangeID', 'Date', 'Open', 'High', 'Low', 'Close', 'CreatedAt'])(
      '必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする',
      (attribute) => {
        const item = buildItem();
        delete item[attribute];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );

    it('UpdatedAt が欠けている場合は InvalidEntityDataError をスローする', () => {
      const item = buildItem();
      delete item.UpdatedAt;

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('数値項目が数値でない場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Open: '100' }))).toThrow(InvalidEntityDataError);
      expect(() => mapper.toEntity(buildItem({ Volume: 'many' }))).toThrow(InvalidEntityDataError);
      expect(() => mapper.toEntity(buildItem({ BuyPatternCount: 'one' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('時刻が ISO 文字列で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(
        buildItem({
          CreatedAt: new Date(TIMESTAMP).toISOString(),
          UpdatedAt: new Date(TIMESTAMP).toISOString(),
        })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it('時刻がエポック秒で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(
        buildItem({ CreatedAt: TIMESTAMP / 1000, UpdatedAt: TIMESTAMP / 1000 })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it('AI 由来の属性が残った既存アイテムも、その属性を読み飛ばして変換する', () => {
      const entity = mapper.toEntity(
        buildItem({
          AiAnalysisResult: '{"unexpected":true}',
          AiAnalysisError: 'timeout',
          EvaluatedAt: 1709078400000,
          Hit: 'true',
        })
      );

      expect(entity).not.toHaveProperty('AiAnalysisResult');
      expect(entity).not.toHaveProperty('EvaluatedAt');
      expect(entity.close).toBe(183.31);
    });
  });

  describe('変換の往復', () => {
    it.each([
      ['必須項目のみ', buildEntity()],
      [
        '任意項目あり',
        buildEntity({
          volume: 1234567,
          patternResults: { 'morning-star': 'MATCHED', 'evening-star': 'NOT_MATCHED' },
          buyPatternCount: 1,
          sellPatternCount: 0,
        }),
      ],
    ])('Entity -> Item -> Entity の変換で元に戻る (%s)', (_label, original) => {
      expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
    });
  });

  describe('toForecastFields', () => {
    it('確度算出に使う属性だけを camelCase で返し、updatedAt を含めない', () => {
      const fields = mapper.toForecastFields(
        buildItem({
          Volume: 1000,
          PatternResults: { 'morning-star': 'MATCHED' },
          BuyPatternCount: 1,
          SellPatternCount: 0,
        })
      );

      expect(fields).toEqual({
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        date: '2026-02-27',
        open: 182.15,
        high: 183.92,
        low: 181.44,
        close: 183.31,
        volume: 1000,
        patternResults: { 'morning-star': 'MATCHED' },
        buyPatternCount: 1,
        sellPatternCount: 0,
        createdAt: TIMESTAMP,
      });
      expect(fields).not.toHaveProperty('updatedAt');
    });

    it('射影した属性だけの Item (UpdatedAt なし) でも変換できる', () => {
      const projected: Record<string, unknown> = {};
      const item = buildItem();
      for (const name of DAILY_SUMMARY_FORECAST_FIELD_ATTRIBUTES) {
        if (item[name] !== undefined) {
          projected[name] = item[name];
        }
      }

      expect(projected).not.toHaveProperty('UpdatedAt');
      expect(mapper.toForecastFields(projected).close).toBe(183.31);
    });

    it('射影の属性一覧に UpdatedAt とキー属性を含めない', () => {
      expect(DAILY_SUMMARY_FORECAST_FIELD_ATTRIBUTES).not.toContain('UpdatedAt');
      expect(DAILY_SUMMARY_FORECAST_FIELD_ATTRIBUTES).not.toContain('PK');
    });
  });
});
