import type { ChartDataPoint } from '../../../src/types.js';
import { ThreeBlackCrowsGaps } from '../../../src/patterns/three-black-crows-gaps.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('ThreeBlackCrowsGaps', () => {
    const pattern = new ThreeBlackCrowsGaps();

    it('正常系: 陰の三つ星が成立する場合 MATCHED を返す', () => {
      const candles = [
        createCandle(94, 95, 88, 89),
        createCandle(101, 102, 94, 95),
        createCandle(110, 111, 101, 102),
      ];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: ギャップダウンがない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(96, 97, 88, 89),
        createCandle(101, 102, 94, 95),
        createCandle(110, 111, 101, 102),
      ];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが2本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(
        pattern.analyze([createCandle(94, 95, 88, 89), createCandle(101, 102, 94, 95)])
      ).toBe('INSUFFICIENT_DATA');
    });
  });
});
