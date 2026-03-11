import type { ChartDataPoint } from '../../../src/types.js';
import { BullFlag } from '../../../src/patterns/bull-flag.js';

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
  describe('BullFlag', () => {
    const pattern = new BullFlag();

    it('正常系: ブルフラッグ成立時に MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 103, 99, 102],
        [102, 111, 101, 110],
        [110, 118, 109, 117],
        [117, 118, 113, 114],
        [114, 116, 112, 113],
        [112, 121, 111, 119],
      ]);

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件不成立時に NOT_MATCHED を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 103, 99, 102],
        [102, 111, 101, 110],
        [110, 118, 109, 117],
        [117, 118, 113, 114],
        [114, 115, 111, 112],
        [112, 118, 111, 116],
      ]);

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データ不足時に INSUFFICIENT_DATA を返す', () => {
      const candles = createCandlesFromChronological([
        [100, 103, 99, 102],
        [102, 111, 101, 110],
      ]);

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });
  });
});
