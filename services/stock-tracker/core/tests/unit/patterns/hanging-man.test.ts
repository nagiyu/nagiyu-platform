import type { ChartDataPoint } from '../../../src/types.js';
import { HangingMan } from '../../../src/patterns/hanging-man.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('HangingMan', () => {
    const pattern = new HangingMan();

    it('正常系: 首吊り線が成立する場合 MATCHED を返す', () => {
      expect(pattern.analyze([createCandle(110, 110, 90, 109)])).toBe('MATCHED');
    });

    it('正常系: 上影線が長い場合 NOT_MATCHED を返す', () => {
      expect(pattern.analyze([createCandle(110, 118, 90, 109)])).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが0本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([])).toBe('INSUFFICIENT_DATA');
    });
  });
});
