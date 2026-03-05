import type { ChartDataPoint } from '../../../src/types.js';
import { DoubleTop } from '../../../src/patterns/double-top.js';

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
  describe('DoubleTop', () => {
    const pattern = new DoubleTop();

    it('正常系: ダブルトップ成立時に MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 105, 98, 103],
        [103, 120, 102, 118],
        [118, 119, 108, 110],
        [110, 112, 107, 111],
        [111, 121, 110, 119],
        [119, 120, 109, 110],
        [110, 111, 100, 102],
      ]);

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件不成立時に NOT_MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 105, 98, 103],
        [103, 120, 102, 118],
        [118, 119, 108, 110],
        [110, 112, 107, 111],
        [111, 114, 110, 113],
        [113, 114, 109, 110],
        [110, 111, 108, 109],
      ]);

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データ不足時に INSUFFICIENT_DATA を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 105, 98, 103],
        [103, 120, 102, 118],
      ]);

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });
  });
});
