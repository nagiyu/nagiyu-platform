import type { ChartDataPoint } from '../../../src/types.js';
import { BearishFullEngulfing } from '../../../src/patterns/bearish-full-engulfing.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('BearishFullEngulfing', () => {
    const pattern = new BearishFullEngulfing();

    it('正常系: 陰の両つつみが成立する場合 MATCHED を返す', () => {
      const candles = [createCandle(122, 130, 90, 95), createCandle(100, 120, 96, 119)];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 高値安値を包まない場合 NOT_MATCHED を返す', () => {
      const candles = [createCandle(122, 125, 98, 95), createCandle(100, 120, 96, 119)];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([createCandle(122, 130, 90, 95)])).toBe('INSUFFICIENT_DATA');
    });
  });
});
