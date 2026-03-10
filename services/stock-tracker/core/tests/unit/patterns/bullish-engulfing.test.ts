import type { ChartDataPoint } from '../../../src/types.js';
import { BullishEngulfing } from '../../../src/patterns/bullish-engulfing.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('BullishEngulfing', () => {
    const pattern = new BullishEngulfing();

    it('正常系: 陽のつつみ線が成立する場合 MATCHED を返す', () => {
      const candles = [createCandle(94, 112, 93, 111), createCandle(110, 111, 95, 96)];
      expect(pattern.analyze(candles)).toBe('MATCHED');
    });

    it('正常系: 最新足が前足を包まない場合 NOT_MATCHED を返す', () => {
      const candles = [createCandle(97, 112, 96, 109), createCandle(110, 111, 95, 96)];
      expect(pattern.analyze(candles)).toBe('NOT_MATCHED');
    });

    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す', () => {
      expect(pattern.analyze([createCandle(94, 112, 93, 111)])).toBe('INSUFFICIENT_DATA');
    });
  });
});
