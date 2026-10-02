import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';
import {
  AXIS_ID_BUY_COUNT_GE2,
  AXIS_ID_MARKET_RANGE_AVG,
  AXIS_ID_SELL_COUNT_GE2,
  AXIS_REGISTRY,
  PATTERN_AXIS_IDS,
  getAxisDefinition,
  getAxisIdsForQuestion,
} from '../../../src/forecast/axes.js';

describe('AXIS_REGISTRY', () => {
  it('単一パターン27 + 複合2 + 大きさ3 + 市場レベル3 + 市場平均値幅1 = 36軸', () => {
    expect(AXIS_REGISTRY.length).toBe(27 + 2 + 3 + 3 + 1);
  });

  it('PATTERN_REGISTRY の patternId をそのまま軸 ID にする', () => {
    expect(PATTERN_AXIS_IDS).toEqual(PATTERN_REGISTRY.map((p) => p.definition.patternId));
  });

  it('軸 ID の重複が無い', () => {
    const ids = AXIS_REGISTRY.map((a) => a.axisId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getAxisIdsForQuestion', () => {
  it('Q-DIR は単一パターン27 + 複合2 = 29軸', () => {
    expect(getAxisIdsForQuestion('DIR')).toHaveLength(29);
    expect(getAxisIdsForQuestion('DIR')).toContain(AXIS_ID_BUY_COUNT_GE2);
    expect(getAxisIdsForQuestion('DIR')).toContain(AXIS_ID_SELL_COUNT_GE2);
  });

  it('Q-VOL は大きさ3 + 市場レベル3 = 6軸', () => {
    expect(getAxisIdsForQuestion('VOL')).toHaveLength(6);
  });

  it('Q-MKT は市場レベル3 + 市場平均値幅1 = 4軸', () => {
    const ids = getAxisIdsForQuestion('MKT');
    expect(ids).toHaveLength(4);
    expect(ids).toContain(AXIS_ID_MARKET_RANGE_AVG);
  });
});

describe('getAxisDefinition', () => {
  it('パターン軸の名前は definition.name と同じ', () => {
    const pattern = PATTERN_REGISTRY[0];
    const def = getAxisDefinition(pattern.definition.patternId);
    expect(def?.name).toBe(pattern.definition.name);
    expect(def?.kind).toBe('FLAG');
  });

  it('存在しない軸は undefined', () => {
    expect(getAxisDefinition('no-such-axis')).toBeUndefined();
  });
});
