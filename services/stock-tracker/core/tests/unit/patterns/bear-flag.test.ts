import type { ChartDataPoint } from '../../../src/types.js';
import { BearFlag } from '../../../src/patterns/bear-flag.js';

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
  describe('BearFlag', () => {
    const pattern = new BearFlag();

    it('正常系: ベアフラッグ成立時に MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [120, 122, 118, 119],
        [119, 120, 111, 112],
        [112, 113, 105, 106],
        [106, 109, 105, 108],
        [108, 110, 107, 109],
        [109, 110, 102, 103],
      ]);

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件不成立時に NOT_MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [120, 122, 118, 119],
        [119, 120, 111, 112],
        [112, 113, 105, 106],
        [106, 109, 105, 108],
        [108, 110, 107, 109],
        [109, 110, 106, 108],
      ]);

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データ不足時に INSUFFICIENT_DATA を返す', () => {
      const candles = createCandlesFromChronological([
        [120, 122, 118, 119],
        [119, 120, 111, 112],
      ]);

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });
  });
});
