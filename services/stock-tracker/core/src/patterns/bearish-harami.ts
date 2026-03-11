import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class BearishHarami extends CandlestickPattern {
  private static readonly LARGE_BODY_THRESHOLD = 0.3;

  public readonly definition: PatternDefinition = {
    patternId: 'bearish-harami',
    name: 'はらみ',
    description: '売りシグナル。大陽線の実体内に小陰線が収まり、上昇トレンドの反転を示す。',
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
    const condition1 = c1.close > c1.open && c1Body > c1Range * BearishHarami.LARGE_BODY_THRESHOLD;

    const c0BodyLow = Math.min(c0.open, c0.close);
    const c0BodyHigh = Math.max(c0.open, c0.close);
    const condition2 = c0.close < c0.open && c0BodyLow > c1.open && c0BodyHigh < c1.close;

    return condition1 && condition2 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
