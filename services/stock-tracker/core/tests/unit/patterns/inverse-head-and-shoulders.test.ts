import type { ChartDataPoint } from '../../../src/types.js';
import { InverseHeadAndShoulders } from '../../../src/patterns/inverse-head-and-shoulders.js';

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
  describe('InverseHeadAndShoulders', () => {
    const pattern = new InverseHeadAndShoulders();

    it('正常系: 逆三尊成立時に MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [120, 122, 115, 118],
        [118, 119, 105, 108],
        [108, 116, 107, 114],
        [114, 115, 95, 100],
        [100, 117, 99, 115],
        [115, 116, 106, 109],
        [109, 121, 108, 119],
      ]);

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件不成立時に NOT_MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [120, 122, 115, 118],
        [118, 119, 105, 108],
        [108, 116, 107, 114],
        [114, 115, 95, 100],
        [100, 117, 99, 115],
        [115, 116, 106, 109],
        [109, 116, 108, 115],
      ]);

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データ不足時に INSUFFICIENT_DATA を返す', () => {
      const candles = createCandlesFromChronological([
        [120, 122, 115, 118],
        [118, 119, 105, 108],
      ]);

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });
  });
});
