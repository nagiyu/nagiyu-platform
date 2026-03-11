import type { ChartDataPoint } from '../../../src/types.js';
import { RisingWedge } from '../../../src/patterns/rising-wedge.js';

const createCandlesFromChronological = (candles: number[][]): ChartDataPoint[] =>
  candles
    .slice()
    .reverse()
    .map(([open, high, low, close], index) => ({
      time: Date.now() - index,
      open,
      high,
      low,
      close,
      volume: 1000,
    }));

describe('パターン分析', () => {
  describe('RisingWedge', () => {
    const pattern = new RisingWedge();

    it('正常系: 上昇ウェッジ成立時に MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [102, 110, 100, 108],
        [108, 112, 106, 110],
        [110, 118, 108, 116],
        [116, 120, 113, 118],
        [118, 122, 114, 119],
        [119, 120, 108, 109],
      ]);

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件不成立時に NOT_MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [102, 110, 100, 108],
        [108, 112, 106, 110],
        [110, 118, 108, 116],
        [116, 120, 113, 118],
        [118, 122, 114, 119],
        [119, 121, 115, 116],
      ]);

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データ不足時に INSUFFICIENT_DATA を返す', () => {
      const candles = createCandlesFromChronological([
        [102, 110, 100, 108],
        [108, 112, 106, 110],
      ]);

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });
  });
});
