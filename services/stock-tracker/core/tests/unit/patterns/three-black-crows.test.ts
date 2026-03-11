import type { ChartDataPoint } from '../../../src/types.js';
import { ThreeBlackCrows } from '../../../src/patterns/three-black-crows.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('ThreeBlackCrows', () => {
    const pattern = new ThreeBlackCrows();

    it('正常系: 黒三兵が成立する場合 MATCHED を返す', () => {
      const candles = [
        createCandle(108, 109, 95, 96),
        createCandle(112, 113, 100, 101),
        createCandle(116, 117, 104, 105),
      ];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 始値が前足実体内にない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(100, 109, 95, 96),
        createCandle(112, 113, 100, 101),
        createCandle(116, 117, 104, 105),
      ];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが2本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(
        pattern.analyze([createCandle(108, 109, 95, 96), createCandle(112, 113, 100, 101)])
      ).toBe('INSUFFICIENT_DATA');
    });
  });
});
