import type { ChartDataPoint } from '../../../src/types.js';
import { RedThreeSoldiersHesitation } from '../../../src/patterns/red-three-soldiers-hesitation.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('RedThreeSoldiersHesitation', () => {
    const pattern = new RedThreeSoldiersHesitation();

    it('正常系: 3本以上のデータで赤三兵思案星が成立する場合 MATCHED を返す', () => {
      const candles = [
        createCandle(140, 160, 130, 141),
        createCandle(110, 155, 105, 150),
        createCandle(80, 130, 70, 120),
        createCandle(85, 88, 82, 86),
      ];

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 条件が成立しない場合 NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(140, 165, 135, 155),
        createCandle(110, 155, 105, 150),
        createCandle(80, 130, 70, 120),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データがちょうど3本の場合 MATCHED/NOT_MATCHED を正しく返す', () => {
      const matchedCandles = [
        createCandle(140, 160, 130, 141),
        createCandle(110, 155, 105, 150),
        createCandle(80, 130, 70, 120),
      ];
      const notMatchedCandles = [
        createCandle(140, 165, 135, 155),
        createCandle(110, 155, 105, 150),
        createCandle(80, 130, 70, 120),
      ];

      expect(pattern.analyze(matchedCandles)).toBe('MATCHED');
      expect(pattern.analyze(notMatchedCandles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが2本の場合 INSUFFICIENT_DATA を返す', () => {
      const candles = [createCandle(140, 160, 130, 141), createCandle(110, 155, 105, 150)];

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      const candles = [createCandle(140, 160, 130, 141)];

      expect(pattern.analyze(candles)).toBe('INSUFFICIENT_DATA');
    });

    it('エッジケース: データが0本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([])).toBe('INSUFFICIENT_DATA');
    });

    it('境界値: 条件1の実体サイズが閾値（0.3）と等しい場合、他条件成立時に NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(140, 160, 130, 141),
        createCandle(95, 145, 90, 140),
        createCandle(70, 110, 10, 100),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('境界値: 条件3の実体サイズが閾値（0.1）と等しい場合、全条件成立で MATCHED を返す', () => {
      const candles = [
        createCandle(140, 160, 130, 143),
        createCandle(110, 155, 105, 150),
        createCandle(80, 130, 70, 120),
      ];

      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('境界値: 条件3の実体サイズが閾値（0.1）を超える場合、他条件成立時に NOT_MATCHED を返す', () => {
      const candles = [
        createCandle(140, 160, 130, 144),
        createCandle(110, 155, 105, 150),
        createCandle(80, 130, 70, 120),
      ];

      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });
  });
});
