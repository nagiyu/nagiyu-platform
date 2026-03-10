import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class BullishHaramiTop extends CandlestickPattern {
  private static readonly LARGE_BODY_THRESHOLD = 0.3;

  public readonly definition: PatternDefinition = {
    patternId: 'bullish-harami-top',
    name: '陽の両はらみ',
    description: '売りシグナル。大陰線の後に陽線が実体内に収まり、高値圏での反転を示す。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 2) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];

    const c1Body = Math.abs(c1.close - c1.open);
    const c1Range = Math.abs(c1.high - c1.low);
    const condition1 =
      c1.open > c1.close && c1Body > c1Range * BullishHaramiTop.LARGE_BODY_THRESHOLD;

    const condition2 = c0.open < c0.close && c1.close < c0.open && c0.close < c1.open;

    return condition1 && condition2 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
