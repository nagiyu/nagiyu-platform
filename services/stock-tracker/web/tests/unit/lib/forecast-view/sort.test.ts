import { nextSortState, sortByForecast } from '../../../../lib/forecast-view/sort';
import type { TickerForecastSummary } from '../../../../types/forecast';

const forecast = (dir: number | null, vol: number | null): TickerForecastSummary => ({
  dir: dir === null ? null : { probability: dir, baseline: 0.5, lean: 'NEUTRAL' },
  vol: vol === null ? null : { probability: vol, baseline: 0.5, lean: 'NEUTRAL' },
  lit: { total: 0, buy: 0, sell: 0 },
});

const rows = [
  { id: 'a', forecast: forecast(0.5, 0.4) },
  { id: 'b', forecast: forecast(0.6, null) },
  { id: 'c', forecast: null },
  { id: 'd', forecast: forecast(0.3, 0.4) },
  { id: 'e', forecast: forecast(null, 0.9) },
];

const ids = (sorted: typeof rows): string[] => sorted.map((row) => row.id);

describe('nextSortState', () => {
  it('降順 → 昇順 → 既定順の順に進める', () => {
    const desc = nextSortState(null, 'dir');
    expect(desc).toEqual({ column: 'dir', direction: 'desc' });
    const asc = nextSortState(desc, 'dir');
    expect(asc).toEqual({ column: 'dir', direction: 'asc' });
    expect(nextSortState(asc, 'dir')).toBeNull();
  });

  it('別の列に切り替えたときはその列の降順から始める', () => {
    expect(nextSortState({ column: 'dir', direction: 'asc' }, 'vol')).toEqual({
      column: 'vol',
      direction: 'desc',
    });
  });
});

describe('sortByForecast', () => {
  it('並べ替えなしなら元の順序のコピーを返す', () => {
    const result = sortByForecast(rows, null);
    expect(ids(result)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result).not.toBe(rows);
  });

  it('方向を確率の降順にし、確度なしを末尾に置く', () => {
    expect(ids(sortByForecast(rows, { column: 'dir', direction: 'desc' }))).toEqual([
      'b',
      'a',
      'd',
      'c',
      'e',
    ]);
  });

  it('方向を確率の昇順にしても、確度なしは末尾に置く', () => {
    expect(ids(sortByForecast(rows, { column: 'dir', direction: 'asc' }))).toEqual([
      'd',
      'a',
      'b',
      'c',
      'e',
    ]);
  });

  it('荒れは vol の確率で並べ、同値は元の順序を保つ', () => {
    expect(ids(sortByForecast(rows, { column: 'vol', direction: 'desc' }))).toEqual([
      'e',
      'a',
      'd',
      'b',
      'c',
    ]);
  });

  it('元の配列を変更しない', () => {
    const before = ids(rows);
    sortByForecast(rows, { column: 'dir', direction: 'desc' });
    expect(ids(rows)).toEqual(before);
  });
});
