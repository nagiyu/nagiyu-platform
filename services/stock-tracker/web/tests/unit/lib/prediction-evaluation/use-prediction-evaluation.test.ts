import { applyMinCountFilter } from '../../../../lib/prediction-evaluation/use-prediction-evaluation';
import type { TickersResponse } from '../../../../lib/prediction-evaluation/types';

const buildResponse = (): TickersResponse => ({
  period: '7d',
  minCount: 0,
  tickers: [
    {
      tickerId: 'A',
      tickerName: 'A',
      exchangeId: 'X',
      accuracy: 60,
      count: 10,
      bullishHit: 4,
      bullishTotal: 5,
      bearishHit: 2,
      bearishTotal: 5,
    },
    {
      tickerId: 'B',
      tickerName: 'B',
      exchangeId: 'X',
      accuracy: 40,
      count: 4,
      bullishHit: 1,
      bullishTotal: 2,
      bearishHit: 1,
      bearishTotal: 2,
    },
    {
      tickerId: 'C',
      tickerName: 'C',
      exchangeId: 'Y',
      accuracy: 50,
      count: 6,
      bullishHit: 2,
      bullishTotal: 3,
      bearishHit: 1,
      bearishTotal: 3,
    },
  ],
});

describe('applyMinCountFilter', () => {
  it('count が minCount 以上のティッカーのみ残す', () => {
    const filtered = applyMinCountFilter(buildResponse(), 6);
    expect(filtered.tickers.map((t) => t.tickerId)).toEqual(['A', 'C']);
  });

  it('返却される minCount は引数の値を反映する', () => {
    const filtered = applyMinCountFilter(buildResponse(), 6);
    expect(filtered.minCount).toBe(6);
  });

  it('minCount=0 のときはすべて残す', () => {
    const filtered = applyMinCountFilter(buildResponse(), 0);
    expect(filtered.tickers.length).toBe(3);
  });

  it('minCount が大きすぎると 0 件になる', () => {
    const filtered = applyMinCountFilter(buildResponse(), 9999);
    expect(filtered.tickers).toEqual([]);
  });

  it('元のレスポンスを変更しない（イミュータブル）', () => {
    const original = buildResponse();
    const snapshot = JSON.stringify(original);
    applyMinCountFilter(original, 6);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
