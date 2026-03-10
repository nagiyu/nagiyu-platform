import type { ChartDataPoint } from '../../../src/types.js';
import { BullishHaramiTop } from '../../../src/patterns/bullish-harami-top.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('BullishHaramiTop', () => {
    const pattern = new BullishHaramiTop();

    it('正常系: 陽の両はらみが成立する場合 MATCHED を返す', () => {
      const candles = [createCandle(95, 104, 94, 102), createCandle(120, 121, 89, 90)];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 2本目の陽線が実体内に収まらない場合 NOT_MATCHED を返す', () => {
      const candles = [createCandle(88, 104, 87, 102), createCandle(120, 121, 89, 90)];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([createCandle(95, 104, 94, 102)])).toBe('INSUFFICIENT_DATA');
    });
  });
});
