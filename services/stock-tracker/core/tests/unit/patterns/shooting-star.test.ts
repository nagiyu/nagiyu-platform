import type { ChartDataPoint } from '../../../src/types.js';
import { ShootingStar } from '../../../src/patterns/shooting-star.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('ShootingStar', () => {
    const pattern = new ShootingStar();

    it('正常系: 流れ星が成立する場合 MATCHED を返す', () => {
      expect(pattern.analyze([createCandle(101, 120, 101, 102)])).toBe('MATCHED');
    });

    it('正常系: 下影線が長い場合 NOT_MATCHED を返す', () => {
      expect(pattern.analyze([createCandle(101, 120, 95, 102)])).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが0本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([])).toBe('INSUFFICIENT_DATA');
    });
  });
});
