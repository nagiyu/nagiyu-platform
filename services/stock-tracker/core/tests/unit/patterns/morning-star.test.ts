import type { ChartDataPoint } from '../../../src/types.js';
import { MorningStar } from '../../../src/patterns/morning-star.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('MorningStar', () => {
    const pattern = new MorningStar();

    it('正常系: 3本以上のデータで三川明けの明星が成立する場合 MATCHED を返す', () => {
      const candles = [
        createCandle(70, 100, 65, 95),
        createCandle(55, 60, 50, 54),
        createCandle(100, 110, 50, 60),
        createCandle(90, 95, 85, 88),
      ];

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件が成立しない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(70, 100, 65, 79),
        createCandle(55, 60, 50, 54),
        createCandle(100, 110, 50, 60),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データがちょうど3本の場合 MATCHED/NOT_MATCHED を正しく返す', () => {
      const matchedCandles = [
        createCandle(70, 100, 65, 95),
        createCandle(55, 60, 50, 54),
        createCandle(100, 110, 50, 60),
      ];
      const notMatchedCandles = [
        createCandle(70, 100, 65, 95),
        createCandle(65, 70, 50, 54),
        createCandle(100, 110, 50, 60),
      ];

      expect(pattern.analyze(matchedCandles)).toBe('MATCHED');
      expect(pattern.analyze(notMatchedCandles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが2本の場合 INSUFFICIENT_DATA を返す', () => {
      const candles = [createCandle(70, 100, 65, 95), createCandle(55, 60, 50, 54)];

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      const candles = [createCandle(70, 100, 65, 95)];

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });

    it('エッジケース: データが0本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([])).toBe('INSUFFICIENT_DATA');
    });

    it('境界値: 実体サイズが大きい実体閾値（0.3）丁度の場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(70, 100, 65, 95),
        createCandle(55, 60, 50, 54),
        createCandle(100, 120, 20, 70),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('境界値: 実体サイズが小さい実体閾値（0.1）丁度の場合 条件2を満たす', () => {
      const candles = [
        createCandle(70, 100, 65, 95),
        createCandle(55, 60, 50, 54),
        createCandle(100, 110, 50, 60),
      ];

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('境界値: 実体サイズが小さい実体閾値（0.1）を超える場合 条件2を満たさない', () => {
      const candles = [
        createCandle(70, 100, 65, 95),
        createCandle(55, 60, 50, 53.9),
        createCandle(100, 110, 50, 60),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });
  });
});
