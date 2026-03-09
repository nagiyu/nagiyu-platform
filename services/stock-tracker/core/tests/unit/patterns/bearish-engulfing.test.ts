import type { ChartDataPoint } from '../../../src/types.js';
import { BearishEngulfing } from '../../../src/patterns/bearish-engulfing.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('BearishEngulfing', () => {
    const pattern = new BearishEngulfing();

    it('正常系: つつみが成立する場合 MATCHED を返す', () => {
      const candles = [createCandle(122, 123, 98, 99), createCandle(100, 121, 99, 120)];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 最新足が前足実体を包まない場合 NOT_MATCHED を返す', () => {
      const candles = [createCandle(118, 123, 98, 99), createCandle(100, 121, 99, 120)];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([createCandle(122, 123, 98, 99)])).toBe('INSUFFICIENT_DATA');
    });
  });
});
