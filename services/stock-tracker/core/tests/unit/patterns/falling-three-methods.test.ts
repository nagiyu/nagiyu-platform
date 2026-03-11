import type { ChartDataPoint } from '../../../src/types.js';
import { FallingThreeMethods } from '../../../src/patterns/falling-three-methods.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('FallingThreeMethods', () => {
    const pattern = new FallingThreeMethods();

    it('正常系: 下げ三法が成立する場合 MATCHED を返す', () => {
      const candles = [
        createCandle(89, 90, 74, 75),
        createCandle(88, 88.6, 87.6, 88.1),
        createCandle(87, 87.6, 86.6, 87.1),
        createCandle(86, 86.6, 85.6, 86.1),
        createCandle(100, 101, 79, 80),
      ];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 最終足が下抜けない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(89, 90, 79, 81),
        createCandle(88, 88.6, 87.6, 88.1),
        createCandle(87, 87.6, 86.6, 87.1),
        createCandle(86, 86.6, 85.6, 86.1),
        createCandle(100, 101, 79, 80),
      ];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが4本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(
        pattern.analyze([
          createCandle(89, 90, 74, 75),
          createCandle(88, 88.6, 87.6, 88.1),
          createCandle(87, 87.6, 86.6, 87.1),
          createCandle(86, 86.6, 85.6, 86.1),
        ])
      ).toBe('INSUFFICIENT_DATA');
    });
  });
});
