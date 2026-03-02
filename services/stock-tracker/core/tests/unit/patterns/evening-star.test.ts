import type { ChartDataPoint } from '../../../src/types.js';
import { EveningStar } from '../../../src/patterns/evening-star.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('EveningStar', () => {
    const pattern = new EveningStar();

    it('正常系: 3本以上のデータで三川宵の明星が成立する場合 MATCHED を返す', () => {
      const candles = [
        createCandle(120, 125, 80, 85),
        createCandle(126, 130, 120, 125),
        createCandle(80, 130, 70, 120),
        createCandle(85, 88, 82, 86),
      ];

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件が成立しない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(120, 125, 80, 105),
        createCandle(126, 130, 120, 125),
        createCandle(80, 130, 70, 120),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データがちょうど3本の場合 MATCHED/NOT_MATCHED を正しく返す', () => {
      const matchedCandles = [
        createCandle(120, 125, 80, 85),
        createCandle(126, 130, 120, 125),
        createCandle(80, 130, 70, 120),
      ];
      const notMatchedCandles = [
        createCandle(120, 125, 80, 85),
        createCandle(111, 120, 100, 114),
        createCandle(80, 130, 70, 120),
      ];

      expect(pattern.analyze(matchedCandles)).toBe('MATCHED');
      expect(pattern.analyze(notMatchedCandles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが2本の場合 INSUFFICIENT_DATA を返す', () => {
      const candles = [createCandle(120, 125, 80, 85), createCandle(111, 115, 110, 114)];

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      const candles = [createCandle(120, 125, 80, 85)];

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });

    it('エッジケース: データが0本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([])).toBe('INSUFFICIENT_DATA');
    });

    it('境界値: 条件1の実体サイズが閾値（0.3）と等しい場合、他条件成立時に NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(120, 125, 80, 85),
        createCandle(126, 130, 120, 125),
        createCandle(80, 140, 40, 110),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('境界値: 条件2の実体サイズが閾値（0.1）と等しい場合、全条件成立で MATCHED を返す', () => {
      const candles = [
        createCandle(120, 125, 80, 85),
        createCandle(126, 130, 120, 125),
        createCandle(80, 130, 70, 120),
      ];

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('境界値: 条件2の実体サイズが閾値（0.1）を超える場合、他条件成立時に NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(120, 125, 80, 85),
        createCandle(126, 130, 120, 124),
        createCandle(80, 130, 70, 120),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });
  });
});
