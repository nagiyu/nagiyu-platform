import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class TweezerBottom extends CandlestickPattern {
  private static readonly LOW_TOLERANCE = 0.03;
  private static readonly SMALL_BODY_THRESHOLD = 0.1;

  public readonly definition: PatternDefinition = {
    patternId: 'tweezer-bottom',
    name: '二本たくり線',
    description: '買いシグナル。2本の足で安値がほぼ同水準に揃い、底打ち反転の可能性を示す。',
    signalType: 'BUY',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 2) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];

    const c0Body = Math.abs(c0.close - c0.open);
    const c1Body = Math.abs(c1.close - c1.open);
    const c0Range = Math.abs(c0.high - c0.low);
    const c1Range = Math.abs(c1.high - c1.low);
    const combinedRange = Math.max(c0.high, c1.high) - Math.min(c0.low, c1.low);

    const lowsAreClose =
      Math.abs(c0.low - c1.low) <= Math.max(combinedRange, 1) * TweezerBottom.LOW_TOLERANCE;
    const hasBodies =
      c0Body > c0Range * TweezerBottom.SMALL_BODY_THRESHOLD &&
      c1Body > c1Range * TweezerBottom.SMALL_BODY_THRESHOLD;
    const hasReversal = c1.close < c1.open && c0.close > c0.open;

    return lowsAreClose && hasBodies && hasReversal ? 'MATCHED' : 'NOT_MATCHED';
  }
}
