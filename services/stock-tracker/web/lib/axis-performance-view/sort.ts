import type { AxisPerformanceAxis } from '../../types/forecast';

export type AxisSortKey =
  | 'name'
  | 'kind'
  | 'count'
  | 'hitRate'
  | 'diffFromBaseline'
  | 'meanExcessReturn'
  | 'currentWeight';

export type SortDirection = 'asc' | 'desc';

export interface AxisSort {
  key: AxisSortKey;
  direction: SortDirection;
}

function compareValues(a: AxisPerformanceAxis, b: AxisPerformanceAxis, key: AxisSortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name, 'ja');
    case 'kind':
      return a.kind.localeCompare(b.kind);
    case 'meanExcessReturn':
      // 方向以外の問いでは値が無い。列自体を出さないので比較に来ても 0 として扱う
      return (a.meanExcessReturn ?? 0) - (b.meanExcessReturn ?? 0);
    default:
      return a[key] - b[key];
  }
}

/** 元の配列を変えずに並べ替える。sort が null のときは API の順序のまま */
export function sortAxes(
  axes: readonly AxisPerformanceAxis[],
  sort: AxisSort | null
): AxisPerformanceAxis[] {
  if (!sort) return [...axes];
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...axes].sort((a, b) => sign * compareValues(a, b, sort.key));
}

/**
 * 列見出しのクリックで次の並べ替え状態を返す。
 * 同じ列なら向きを反転し、別の列なら数値は降順・文字列は昇順から始める。
 */
export function toggleSort(current: AxisSort | null, key: AxisSortKey): AxisSort {
  if (current?.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: key === 'name' || key === 'kind' ? 'asc' : 'desc' };
}

/** 現在の重みの棒の長さ (0〜1)。最大の絶対値を 1 とする */
export function weightBarRatio(weight: number, maxAbsWeight: number): number {
  return maxAbsWeight > 0 ? Math.min(Math.abs(weight) / maxAbsWeight, 1) : 0;
}
