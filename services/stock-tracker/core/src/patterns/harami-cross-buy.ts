import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class HaramiCrossBuy extends CandlestickPattern {
  private static readonly LARGE_BODY_THRESHOLD = 0.3;
  private static readonly DOJI_THRESHOLD = 0.1;

  public readonly definition: PatternDefinition = {
    patternId: 'harami-cross-buy',
    name: '抱きの一本立ち',
    description:
      '買いシグナル。大陰線の後に十字線が実体内に収まり、下落の勢いの減速と反転可能性を示す。',
    signalType: 'BUY',
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
      c1.close < c1.open && c1Body > c1Range * HaramiCrossBuy.LARGE_BODY_THRESHOLD;

    const c0Body = Math.abs(c0.close - c0.open);
    const c0Range = Math.abs(c0.high - c0.low);
    const c1BodyLow = Math.min(c1.open, c1.close);
    const c1BodyHigh = Math.max(c1.open, c1.close);
    const condition2 =
      c0Body <= c0Range * HaramiCrossBuy.DOJI_THRESHOLD &&
      c0.open >= c1BodyLow &&
      c0.open <= c1BodyHigh &&
      c0.close >= c1BodyLow &&
      c0.close <= c1BodyHigh;

    return condition1 && condition2 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
