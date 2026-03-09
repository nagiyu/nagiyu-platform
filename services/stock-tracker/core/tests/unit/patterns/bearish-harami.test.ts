import type { ChartDataPoint } from '../../../src/types.js';
import { BearishHarami } from '../../../src/patterns/bearish-harami.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('BearishHarami', () => {
    const pattern = new BearishHarami();

    it('正常系: はらみが成立する場合 MATCHED を返す', () => {
      const candles = [createCandle(116, 117, 110, 112), createCandle(100, 121, 99, 120)];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 後続足が陰線でない場合 NOT_MATCHED を返す', () => {
      const candles = [createCandle(112, 117, 110, 116), createCandle(100, 121, 99, 120)];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([createCandle(116, 117, 110, 112)])).toBe('INSUFFICIENT_DATA');
    });
  });
});
