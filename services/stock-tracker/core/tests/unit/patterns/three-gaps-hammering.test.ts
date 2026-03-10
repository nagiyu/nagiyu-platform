import type { ChartDataPoint } from '../../../src/types.js';
import { ThreeGapsHammering } from '../../../src/patterns/three-gaps-hammering.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('ThreeGapsHammering', () => {
    const pattern = new ThreeGapsHammering();

    it('正常系: 三空叩き込みが成立する場合 MATCHED を返す', () => {
      const candles = [
        createCandle(94, 100, 93, 99),
        createCandle(96, 97, 93, 94),
        createCandle(101, 102, 98, 99),
        createCandle(106, 107, 103, 104),
      ];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: ギャップダウンが連続しない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(94, 100, 93, 99),
        createCandle(96, 97, 93, 94),
        createCandle(101, 104, 98, 99),
        createCandle(106, 107, 103, 104),
      ];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが3本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(
        pattern.analyze([
          createCandle(94, 100, 93, 99),
          createCandle(96, 97, 93, 94),
          createCandle(101, 102, 98, 99),
        ])
      ).toBe('INSUFFICIENT_DATA');
    });
  });
});
