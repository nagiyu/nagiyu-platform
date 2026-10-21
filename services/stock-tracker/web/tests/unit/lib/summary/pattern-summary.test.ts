import { PATTERN_REGISTRY, type DailySummaryEntity } from '@nagiyu/stock-tracker-core';
import { toPatternSummary } from '../../../../lib/summary/pattern-summary';

function buildSummary(overrides: Partial<DailySummaryEntity> = {}): DailySummaryEntity {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    date: '2026-02-27',
    open: 182.15,
    high: 183.92,
    low: 181.44,
    close: 183.31,
    createdAt: 1708992000000,
    updatedAt: 1708992000000,
    ...overrides,
  };
}

describe('toPatternSummary', () => {
  it('patternResults がある場合は PATTERN_REGISTRY に存在するパターンのみ patternDetails に含める', () => {
    const patternResults = Object.fromEntries(
      PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, 'NOT_MATCHED'])
    );

    const response = toPatternSummary(
      buildSummary({
        patternResults: {
          ...patternResults,
          'morning-star': 'MATCHED',
          unknown: 'MATCHED',
        },
        buyPatternCount: 1,
        sellPatternCount: 0,
      })
    );

    expect(response.buyPatternCount).toBe(1);
    expect(response.sellPatternCount).toBe(0);
    expect(response.patternDetails).toHaveLength(PATTERN_REGISTRY.length);
    expect(response.patternDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ patternId: 'morning-star', status: 'MATCHED' }),
        expect.objectContaining({ patternId: 'evening-star', status: 'NOT_MATCHED' }),
      ])
    );
    expect(response.patternDetails.some((detail) => detail.patternId === 'unknown')).toBe(false);
  });

  it('判定結果のないパターンは patternDetails に含めない', () => {
    const response = toPatternSummary(
      buildSummary({ patternResults: { 'morning-star': 'MATCHED' } })
    );

    expect(response.patternDetails).toHaveLength(1);
    expect(response.patternDetails[0]).toMatchObject({
      patternId: 'morning-star',
      status: 'MATCHED',
    });
  });

  it('件数が未設定の場合は 0 を返す', () => {
    const response = toPatternSummary(buildSummary({ patternResults: {} }));

    expect(response.buyPatternCount).toBe(0);
    expect(response.sellPatternCount).toBe(0);
    expect(response.patternDetails).toEqual([]);
  });

  it('patternResults が未設定の場合はデフォルト値を返す', () => {
    expect(toPatternSummary(buildSummary())).toEqual({
      buyPatternCount: 0,
      sellPatternCount: 0,
      patternDetails: [],
    });
  });
});
