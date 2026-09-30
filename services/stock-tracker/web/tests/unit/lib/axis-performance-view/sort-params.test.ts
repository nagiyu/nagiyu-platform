import type { AxisPerformanceAxis } from '../../../../types/forecast';
import { normalizeMarket } from '../../../../lib/axis-performance-view/params';
import { sortAxes, toggleSort, weightBarRatio } from '../../../../lib/axis-performance-view/sort';

const axis = (overrides: Partial<AxisPerformanceAxis>): AxisPerformanceAxis => ({
  axisId: 'a',
  name: 'a',
  kind: 'FLAG',
  count: 10,
  hitRate: 0.5,
  diffFromBaseline: 0,
  currentWeight: 0,
  lowSample: false,
  ...overrides,
});

const AXES = [
  axis({
    axisId: 'x',
    name: 'い',
    kind: 'NUMERIC',
    count: 5,
    hitRate: 0.6,
    diffFromBaseline: 0.1,
    currentWeight: -0.5,
    meanExcessReturn: 0.01,
  }),
  axis({
    axisId: 'y',
    name: 'あ',
    kind: 'FLAG',
    count: 50,
    hitRate: 0.4,
    diffFromBaseline: -0.1,
    currentWeight: 0.2,
  }),
  axis({
    axisId: 'z',
    name: 'う',
    kind: 'FLAG',
    count: 20,
    hitRate: 0.5,
    diffFromBaseline: 0,
    currentWeight: 0.9,
    meanExcessReturn: -0.02,
  }),
];

const ids = (axes: AxisPerformanceAxis[]) => axes.map((a) => a.axisId);

describe('sortAxes', () => {
  it('sort なしは API の順序のまま、元の配列は変えない', () => {
    const result = sortAxes(AXES, null);
    expect(ids(result)).toEqual(['x', 'y', 'z']);
    expect(result).not.toBe(AXES);
  });

  it.each([
    ['name', 'asc', ['y', 'x', 'z']],
    ['kind', 'asc', ['y', 'z', 'x']],
    ['count', 'desc', ['y', 'z', 'x']],
    ['hitRate', 'desc', ['x', 'z', 'y']],
    ['diffFromBaseline', 'asc', ['y', 'z', 'x']],
    ['currentWeight', 'desc', ['z', 'y', 'x']],
    ['meanExcessReturn', 'desc', ['x', 'y', 'z']],
  ] as const)('%s を %s で並べ替える', (key, direction, expected) => {
    expect(ids(sortAxes(AXES, { key, direction }))).toEqual(expected);
  });
});

describe('toggleSort', () => {
  it('別の列は数値なら降順、文字列なら昇順から始める', () => {
    expect(toggleSort(null, 'count')).toEqual({ key: 'count', direction: 'desc' });
    expect(toggleSort(null, 'name')).toEqual({ key: 'name', direction: 'asc' });
    expect(toggleSort(null, 'kind')).toEqual({ key: 'kind', direction: 'asc' });
  });
  it('同じ列は向きを反転する', () => {
    expect(toggleSort({ key: 'count', direction: 'desc' }, 'count').direction).toBe('asc');
    expect(toggleSort({ key: 'count', direction: 'asc' }, 'count').direction).toBe('desc');
  });
});

describe('weightBarRatio', () => {
  it('最大の絶対値を 1 とする', () => {
    expect(weightBarRatio(-0.5, 1)).toBe(0.5);
    expect(weightBarRatio(2, 1)).toBe(1);
  });
  it('最大が 0 のときは 0', () => {
    expect(weightBarRatio(0, 0)).toBe(0);
  });
});

describe('params', () => {
  it('市場の荒れでは ALL を JP に寄せる', () => {
    expect(normalizeMarket('MKT', 'ALL')).toBe('JP');
    expect(normalizeMarket('MKT', 'US')).toBe('US');
    expect(normalizeMarket('DIR', 'ALL')).toBe('ALL');
  });
});
