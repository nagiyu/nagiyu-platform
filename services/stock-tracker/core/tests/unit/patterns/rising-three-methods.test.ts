import type { ChartDataPoint } from '../../../src/types.js';
import { RisingThreeMethods } from '../../../src/patterns/rising-three-methods.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('RisingThreeMethods', () => {
    const pattern = new RisingThreeMethods();

    it('正常系: 上げ三法が成立する場合 MATCHED を返す', () => {
      const candles = [
        createCandle(111, 126, 110, 125),
        createCandle(111, 111.4, 110.4, 110.9),
        createCandle(112, 112.4, 111.4, 111.9),
        createCandle(113, 113.4, 112.4, 112.9),
        createCandle(100, 121, 98, 120),
      ];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 最終足が上抜けない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(111, 121, 109, 118),
        createCandle(111, 111.4, 110.4, 110.9),
        createCandle(112, 112.4, 111.4, 111.9),
        createCandle(113, 113.4, 112.4, 112.9),
        createCandle(100, 121, 98, 120),
      ];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが4本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(
        pattern.analyze([
          createCandle(111, 126, 110, 125),
          createCandle(111, 111.4, 110.4, 110.9),
          createCandle(112, 112.4, 111.4, 111.9),
          createCandle(113, 113.4, 112.4, 112.9),
        ])
      ).toBe('INSUFFICIENT_DATA');
    });
  });
});
