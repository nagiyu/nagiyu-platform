/**
 * Stock Tracker Core - 判断軸の定義（design.md §1.2・§1.3）
 *
 * 軸は DB に持たずコードで定義する。軸を追加しても既存の構造が壊れないこと（NFR-7）。
 */
import { PATTERN_REGISTRY } from '../patterns/pattern-registry.js';
import type { AxisDefinition, AxisId } from './types.js';

/** 複合パターン軸 ID（design.md §1.2） */
export const AXIS_ID_BUY_COUNT_GE2 = 'buy-count-ge2';
export const AXIS_ID_SELL_COUNT_GE2 = 'sell-count-ge2';

/** 値動きの大きさ軸 ID（銘柄単位） */
export const AXIS_ID_PARKINSON_5D = 'parkinson-5d';
export const AXIS_ID_RANGE_TODAY = 'range-today';
export const AXIS_ID_VOLUME_RATIO = 'volume-ratio';

/** 市場レベル軸 ID */
export const AXIS_ID_MARKET_PARKINSON_5D = 'market-parkinson-5d';
export const AXIS_ID_MARKET_RANGE_TODAY = 'market-range-today';
export const AXIS_ID_MARKET_VOLUME_RATIO = 'market-volume-ratio';
export const AXIS_ID_MARKET_RANGE_AVG = 'market-range-avg';

/** 単一パターン 27 軸（patternId をそのまま軸 ID にする） */
const PATTERN_AXES: readonly AxisDefinition[] = PATTERN_REGISTRY.map((pattern) => ({
  axisId: pattern.definition.patternId,
  name: pattern.definition.name,
  kind: 'FLAG',
  questions: ['DIR'],
}));

/** 複合パターン 2 軸 */
const COMPOSITE_AXES: readonly AxisDefinition[] = [
  { axisId: AXIS_ID_BUY_COUNT_GE2, name: '買い合致数2以上', kind: 'FLAG', questions: ['DIR'] },
  { axisId: AXIS_ID_SELL_COUNT_GE2, name: '売り合致数2以上', kind: 'FLAG', questions: ['DIR'] },
];

/** 値動きの大きさ 3 軸（銘柄単位。Q-VOL でのみ使う） */
const SIZE_AXES: readonly AxisDefinition[] = [
  {
    axisId: AXIS_ID_PARKINSON_5D,
    name: '直近5日の値幅(Parkinson)の平常比',
    kind: 'NUMERIC',
    questions: ['VOL'],
  },
  { axisId: AXIS_ID_RANGE_TODAY, name: '当日の値幅の平常比', kind: 'NUMERIC', questions: ['VOL'] },
  { axisId: AXIS_ID_VOLUME_RATIO, name: '出来高の平常比', kind: 'NUMERIC', questions: ['VOL'] },
];

/** 市場レベル 3 軸（銘柄単位の大きさ軸の市場平均。Q-VOL・Q-MKT で使う） */
const MARKET_SIZE_AXES: readonly AxisDefinition[] = [
  {
    axisId: AXIS_ID_MARKET_PARKINSON_5D,
    name: '市場平均 直近5日の値幅(Parkinson)の平常比',
    kind: 'NUMERIC',
    questions: ['VOL', 'MKT'],
  },
  {
    axisId: AXIS_ID_MARKET_RANGE_TODAY,
    name: '市場平均 当日の値幅の平常比',
    kind: 'NUMERIC',
    questions: ['VOL', 'MKT'],
  },
  {
    axisId: AXIS_ID_MARKET_VOLUME_RATIO,
    name: '市場平均 出来高の平常比',
    kind: 'NUMERIC',
    questions: ['VOL', 'MKT'],
  },
];

/** 市場平均値幅の平常比（Q-MKT のみ） */
const MARKET_RANGE_AVG_AXIS: readonly AxisDefinition[] = [
  {
    axisId: AXIS_ID_MARKET_RANGE_AVG,
    name: '市場平均値幅の平常比',
    kind: 'NUMERIC',
    questions: ['MKT'],
  },
];

/**
 * 判断軸のレジストリ（design.md §1.2）。
 * 軸を追加するときはこの配列に足すだけでよい（NFR-7）。
 */
export const AXIS_REGISTRY: readonly AxisDefinition[] = [
  ...PATTERN_AXES,
  ...COMPOSITE_AXES,
  ...SIZE_AXES,
  ...MARKET_SIZE_AXES,
  ...MARKET_RANGE_AVG_AXIS,
];

const AXIS_BY_ID = new Map<AxisId, AxisDefinition>(
  AXIS_REGISTRY.map((axis) => [axis.axisId, axis])
);

/** 軸 ID から軸定義を引く */
export function getAxisDefinition(axisId: AxisId): AxisDefinition | undefined {
  return AXIS_BY_ID.get(axisId);
}

/** 問いが使う軸 ID の一覧（design.md §1.3 の対応。順序は AXIS_REGISTRY の登録順） */
export function getAxisIdsForQuestion(question: 'DIR' | 'VOL' | 'MKT'): AxisId[] {
  return AXIS_REGISTRY.filter((axis) => axis.questions.includes(question)).map(
    (axis) => axis.axisId
  );
}

/** 単一パターン軸の ID 一覧（PATTERN_REGISTRY と同じ順） */
export const PATTERN_AXIS_IDS: readonly AxisId[] = PATTERN_AXES.map((axis) => axis.axisId);
