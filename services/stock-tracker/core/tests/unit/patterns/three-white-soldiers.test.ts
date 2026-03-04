import type { ChartDataPoint } from '../../../src/types.js';
import { ThreeWhiteSoldiers } from '../../../src/patterns/three-white-soldiers.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('ThreeWhiteSoldiers', () => {
    const pattern = new ThreeWhiteSoldiers();

    it('正常系: 3本以上のデータで赤三兵が成立する場合 MATCHED を返す', () => {
      const candles = [
        createCandle(115, 130, 112, 128),
        createCandle(105, 118, 102, 116),
        createCandle(95, 108, 92, 106),
        createCandle(80, 90, 78, 88),
      ];

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件が成立しない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(115, 130, 112, 110),
        createCandle(105, 118, 102, 116),
        createCandle(95, 108, 92, 106),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データがちょうど3本の場合 MATCHED/NOT_MATCHED を正しく返す', () => {
      const matchedCandles = [
        createCandle(115, 130, 112, 128),
        createCandle(105, 118, 102, 116),
        createCandle(95, 108, 92, 106),
      ];
      const notMatchedCandles = [
        createCandle(115, 130, 112, 110),
        createCandle(105, 118, 102, 116),
        createCandle(95, 108, 92, 106),
      ];

      expect(pattern.analyze(matchedCandles)).toBe('MATCHED');
      expect(pattern.analyze(notMatchedCandles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが2本の場合 INSUFFICIENT_DATA を返す', () => {
      const candles = [createCandle(105, 118, 102, 116), createCandle(95, 108, 92, 106)];

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      const candles = [createCandle(95, 108, 92, 106)];

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });

    it('エッジケース: データが0本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([])).toBe('INSUFFICIENT_DATA');
    });

    it('正常系: 2本目が1本目のボディ内で始値を持たない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(115, 130, 112, 128),
        createCandle(90, 118, 88, 116),
        createCandle(95, 108, 92, 106),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('正常系: 3本目が2本目のボディ内で始値を持たない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(105, 130, 102, 128),
        createCandle(105, 118, 102, 116),
        createCandle(95, 108, 92, 106),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('境界値: 1本目の実体サイズが閾値（0.3）丁度の場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(115, 130, 112, 128),
        createCandle(105, 118, 102, 116),
        createCandle(95, 120, 80, 107),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });
  });
});
