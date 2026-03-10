import type { ChartDataPoint } from '../../../src/types.js';
import { HaramiCrossBuy } from '../../../src/patterns/harami-cross-buy.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('HaramiCrossBuy', () => {
    const pattern = new HaramiCrossBuy();

    it('正常系: 抱きの一本立ちが成立する場合 MATCHED を返す', () => {
      const candles = [createCandle(95, 100, 90, 95.5), createCandle(120, 125, 88, 90)];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 十字線でない場合 NOT_MATCHED を返す', () => {
      const candles = [createCandle(95, 100, 90, 98), createCandle(120, 125, 88, 90)];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([createCandle(95, 100, 90, 95.5)])).toBe('INSUFFICIENT_DATA');
    });
  });
});
