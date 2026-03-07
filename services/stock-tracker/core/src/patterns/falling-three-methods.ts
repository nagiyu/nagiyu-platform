import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class FallingThreeMethods extends CandlestickPattern {
  private static readonly LARGE_BODY_THRESHOLD = 0.3;
  private static readonly SMALL_BODY_THRESHOLD = 0.1;

  public readonly definition: PatternDefinition = {
    patternId: 'falling-three-methods',
    name: '下げ三法',
    description: '売りシグナル。大陰線の後に小陽線が続き、再び大陰線で下抜ける継続パターン。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 5) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];
    const c2 = candles[2];
    const c3 = candles[3];
    const c4 = candles[4];

    const c4Body = Math.abs(c4.close - c4.open);
    const c4Range = Math.abs(c4.high - c4.low);
    const condition1 =
      c4.close < c4.open && c4Body > c4Range * FallingThreeMethods.LARGE_BODY_THRESHOLD;

    const c4BodyLow = Math.min(c4.open, c4.close);
    const c4BodyHigh = Math.max(c4.open, c4.close);

    const isSmallBullishInBody = (candle: ChartDataPoint): boolean => {
      const body = Math.abs(candle.close - candle.open);
      const range = Math.abs(candle.high - candle.low);
      const bodyLow = Math.min(candle.open, candle.close);
      const bodyHigh = Math.max(candle.open, candle.close);

      return (
        candle.close > candle.open &&
        body <= range * FallingThreeMethods.SMALL_BODY_THRESHOLD &&
        bodyLow >= c4BodyLow &&
        bodyHigh <= c4BodyHigh
      );
    };

    const condition2 = isSmallBullishInBody(c3) && isSmallBullishInBody(c2) && isSmallBullishInBody(c1);

    const c0Body = Math.abs(c0.close - c0.open);
    const c0Range = Math.abs(c0.high - c0.low);
    const condition3 =
      c0.close < c0.open &&
      c0Body > c0Range * FallingThreeMethods.LARGE_BODY_THRESHOLD &&
      c0.close < c4.close;

    return condition1 && condition2 && condition3 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
