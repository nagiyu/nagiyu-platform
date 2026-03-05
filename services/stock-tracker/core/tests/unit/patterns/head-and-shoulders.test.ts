import type { ChartDataPoint } from '../../../src/types.js';
import { HeadAndShoulders } from '../../../src/patterns/head-and-shoulders.js';

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
  describe('HeadAndShoulders', () => {
    const pattern = new HeadAndShoulders();

    it('正常系: 三尊成立時に MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 105, 98, 103],
        [103, 115, 102, 112],
        [112, 113, 104, 106],
        [106, 125, 105, 122],
        [122, 123, 103, 107],
        [107, 116, 106, 112],
        [112, 113, 95, 100],
      ]);

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件不成立時に NOT_MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 105, 98, 103],
        [103, 115, 102, 112],
        [112, 113, 104, 106],
        [106, 125, 105, 122],
        [122, 123, 103, 107],
        [107, 116, 106, 112],
        [112, 113, 104, 106],
      ]);

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データ不足時に INSUFFICIENT_DATA を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 105, 98, 103],
        [103, 115, 102, 112],
      ]);

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });
  });
});
