import type { TickerForecastSummary } from '../../types/forecast';

/** 並べ替え可能な列 */
export type ForecastSortColumn = 'dir' | 'vol';

export interface ForecastSortState {
  column: ForecastSortColumn;
  direction: 'desc' | 'asc';
}

/**
 * 列見出しのクリックで並べ替え状態を進める。降順 → 昇順 → 既定順(null)。
 * 別の列をクリックしたときは、その列の降順から始める。
 */
export function nextSortState(
  current: ForecastSortState | null,
  column: ForecastSortColumn
): ForecastSortState | null {
  if (!current || current.column !== column) {
    return { column, direction: 'desc' };
  }
  return current.direction === 'desc' ? { column, direction: 'asc' } : null;
}

function pickProbability(
  forecast: TickerForecastSummary | null | undefined,
  column: ForecastSortColumn
): number | null {
  const view = column === 'dir' ? forecast?.dir : forecast?.vol;
  return view ? view.probability : null;
}

/**
 * 確率で並べ替える。確度なしの行は昇降どちらでも末尾に置く。
 * 元の配列は変更しない。同値・確度なし同士は元の順序を保つ。
 */
export function sortByForecast<T extends { forecast: TickerForecastSummary | null }>(
  rows: readonly T[],
  sort: ForecastSortState | null
): T[] {
  if (!sort) {
    return [...rows];
  }
  const sign = sort.direction === 'desc' ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index, value: pickProbability(row.forecast, sort.column) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) {
        return a.index - b.index;
      }
      if (a.value === null) {
        return 1;
      }
      if (b.value === null) {
        return -1;
      }
      const diff = (a.value - b.value) * sign;
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map((entry) => entry.row);
}
