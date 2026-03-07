import type { ChartDataPoint } from '../../../src/types.js';
import { TweezerBottom } from '../../../src/patterns/tweezer-bottom.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('TweezerBottom', () => {
    const pattern = new TweezerBottom();

    it('正常系: 二本たくり線が成立する場合 MATCHED を返す', () => {
      const candles = [createCandle(95, 100, 90, 99), createCandle(105, 108, 90.4, 94)];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 安値が離れている場合 NOT_MATCHED を返す', () => {
      const candles = [createCandle(95, 100, 86, 99), createCandle(105, 108, 90, 94)];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([createCandle(95, 100, 90, 99)])).toBe('INSUFFICIENT_DATA');
    });
  });
});
