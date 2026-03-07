import type { ChartDataPoint } from '../../../src/types.js';
import { DojiStar } from '../../../src/patterns/doji-star.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('DojiStar', () => {
    const pattern = new DojiStar();

    it('正常系: 星が成立する場合 MATCHED を返す', () => {
      const candles = [createCandle(121, 124, 118, 121.4), createCandle(100, 121, 99, 120)];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 十字線が高値圏にない場合 NOT_MATCHED を返す', () => {
      const candles = [createCandle(118, 121, 116, 118.2), createCandle(100, 121, 99, 120)];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([createCandle(121, 124, 118, 121.4)])).toBe('INSUFFICIENT_DATA');
    });
  });
});
