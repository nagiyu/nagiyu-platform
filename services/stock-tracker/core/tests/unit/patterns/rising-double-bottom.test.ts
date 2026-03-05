import type { ChartDataPoint } from '../../../src/types.js';
import { RisingDoubleBottom } from '../../../src/patterns/rising-double-bottom.js';

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
  describe('RisingDoubleBottom', () => {
    const pattern = new RisingDoubleBottom();

    it('正常系: 切り上げダブルボトム成立時に MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [120, 122, 115, 118],
        [118, 119, 100, 105],
        [105, 114, 104, 112],
        [112, 113, 103, 106],
        [106, 116, 105, 114],
        [114, 121, 113, 119],
      ]);

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件不成立時に NOT_MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [120, 122, 115, 118],
        [118, 119, 100, 105],
        [105, 114, 104, 112],
        [112, 113, 98, 101],
        [101, 111, 100, 109],
        [109, 110, 104, 108],
      ]);

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データ不足時に INSUFFICIENT_DATA を返す', () => {
      const candles = createCandlesFromChronological([
        [120, 122, 115, 118],
        [118, 119, 100, 105],
      ]);

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });
  });
});
