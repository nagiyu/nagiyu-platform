import type { ChartDataPoint } from '../../../src/types.js';
import { AscendingTriangle } from '../../../src/patterns/ascending-triangle.js';

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
  describe('AscendingTriangle', () => {
    const pattern = new AscendingTriangle();

    it('正常系: アセンディング・トライアングル成立時に MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 110, 95, 102],
        [102, 120, 100, 118],
        [118, 119, 104, 110],
        [110, 121, 108, 119],
        [119, 120, 112, 118],
        [118, 122, 116, 123],
      ]);

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件不成立時に NOT_MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 110, 100, 102],
        [102, 120, 99, 118],
        [118, 119, 98, 110],
        [110, 121, 97, 119],
        [119, 120, 96, 118],
        [118, 121, 97, 120],
      ]);

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データ不足時に INSUFFICIENT_DATA を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 110, 95, 102],
        [102, 120, 100, 118],
      ]);

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });
  });
});
