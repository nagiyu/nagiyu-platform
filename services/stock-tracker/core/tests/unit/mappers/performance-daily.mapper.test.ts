/**
 * Stock Tracker Core - PerformanceDaily Mapper Unit Tests
 *
 * PerformanceDailyMapperのユニットテスト
 */
import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import {
  PerformanceDailyMapper,
  buildPerformanceDailyPk,
  buildPerformanceDailySk,
  buildPerformanceDailySkUpperBound,
} from '../../../src/mappers/performance-daily.mapper.js';
import type { PerformanceDailyItem } from '../../../src/forecast/index.js';

const TIMESTAMP = 1_700_000_000_000;
const KEY = { question: 'VOL', market: 'US', date: '2026-02-27' } as const;

function buildEntity(overrides: Partial<PerformanceDailyItem> = {}): PerformanceDailyItem {
  return {
    question: 'VOL',
    market: 'US',
    date: '2026-02-27',
    evaluatedCount: 30,
    hitCount: 12,
    axisStats: { 'range-today': { count: 10, hitCount: 6 } },
    probabilityBands: [{ lower: 0.4, upper: 0.45, count: 5, hitCount: 2, sumProbability: 2.1 }],
    createdAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const entity = buildEntity();
  return {
    PK: 'PERF#VOL#US',
    SK: 'DATE#2026-02-27',
    Type: 'PerformanceDaily',
    Question: 'VOL',
    Market: 'US',
    Date: '2026-02-27',
    EvaluatedCount: 30,
    HitCount: 12,
    AxisStats: entity.axisStats,
    ProbabilityBands: entity.probabilityBands,
    CreatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('PerformanceDailyMapper', () => {
  let mapper: PerformanceDailyMapper;

  beforeEach(() => {
    mapper = new PerformanceDailyMapper();
  });

  it('entityType は PerformanceDaily になる', () => {
    expect(mapper.entityType).toBe('PerformanceDaily');
  });

  describe('キーの組み立て', () => {
    it('ビジネスキーから PK/SK を構築する', () => {
      expect(mapper.buildKeys(KEY)).toEqual({ PK: 'PERF#VOL#US', SK: 'DATE#2026-02-27' });
    });

    it('PK が先頭のキー属性になる (条件付き書き込みの存在判定に使われる)', () => {
      expect(Object.keys(mapper.buildKeys(KEY))).toEqual(['PK', 'SK']);
    });

    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity())).toEqual(KEY);
    });

    it('期間 Query 用に問い・市場から PK、日付から SK と範囲の上限を構築する', () => {
      expect(buildPerformanceDailyPk('DIR', 'JP')).toBe('PERF#DIR#JP');
      expect(buildPerformanceDailySk('2026-02-27')).toBe('DATE#2026-02-27');
      expect(buildPerformanceDailySkUpperBound('2026-02-27')).toBe('DATE#2026-02-27#~');
    });

    it('範囲の上限は同じ日付の SK より大きい', () => {
      expect(
        buildPerformanceDailySkUpperBound('2026-02-27') > buildPerformanceDailySk('2026-02-27')
      ).toBe(true);
    });
  });

  describe('toItem', () => {
    it('Entity を保存形式 (PascalCase・キー・Type) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('更新日時は store が設定するため、Item に含めない', () => {
      expect(mapper.toItem(buildEntity())).not.toHaveProperty('UpdatedAt');
    });

    it('toItem のキー属性は buildKeys の結果と一致する', () => {
      const entity = buildEntity({ question: 'DIR', market: 'JP', date: '2026-03-02' });
      const item = mapper.toItem(entity);

      for (const [name, value] of Object.entries(mapper.buildKeys(mapper.getKey(entity)))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名で返す (キーから作る属性はない)', () => {
      expect(mapper.toUpdateAttributes({ evaluatedCount: 40, hitCount: 20 })).toEqual({
        EvaluatedCount: 40,
        HitCount: 20,
      });
    });

    it('undefined の項目は変更しない (属性に含めても値は undefined)', () => {
      const attributes = mapper.toUpdateAttributes({ evaluatedCount: undefined, hitCount: 20 });

      expect(attributes.EvaluatedCount).toBeUndefined();
      expect(attributes.HitCount).toBe(20);
    });

    it.each(['evaluatedCount', 'hitCount', 'axisStats', 'probabilityBands'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['question', { question: 'VOL' }],
      ['market', { market: 'US' }],
      ['date', { date: '2026-02-27' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );

    it('任意項目を持たないため、削除を表す値は返さない', () => {
      const attributes = mapper.toUpdateAttributes({ hitCount: 20 });

      expect(Object.values(attributes)).not.toContain(REMOVE_ATTRIBUTE);
    });
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('PK/SK/Type などの保存用の属性を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());

      for (const name of ['PK', 'SK', 'Type', 'UpdatedAt']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('UpdatedAt が旧形式でも読み取りに影響しない', () => {
      expect(mapper.toEntity(buildItem({ UpdatedAt: 'broken' }))).toEqual(buildEntity());
    });

    it('AxisStats がオブジェクトでない場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ AxisStats: 'not-an-object' }))).toThrow(
        InvalidEntityDataError
      );
      expect(() => mapper.toEntity(buildItem({ AxisStats: [] }))).toThrow(InvalidEntityDataError);
    });

    it('ProbabilityBands が配列でない場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ ProbabilityBands: {} }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('Question が不正な場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Question: 'UNKNOWN' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('必須フィールドが欠けている場合は InvalidEntityDataError をスローする', () => {
      const item = buildItem();
      delete item.EvaluatedCount;

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('時刻が ISO 文字列で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString() }));

      expect(entity.createdAt).toBe(TIMESTAMP);
    });

    it('時刻がエポック秒で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(buildItem({ CreatedAt: TIMESTAMP / 1000 }));

      expect(entity.createdAt).toBe(TIMESTAMP);
    });
  });

  describe('変換の往復', () => {
    it('Entity -> Item -> Entity の変換で元に戻る', () => {
      const original = buildEntity();

      expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
    });
  });
});
