import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class DojiStar extends CandlestickPattern {
  private static readonly LARGE_BODY_THRESHOLD = 0.3;
  private static readonly DOJI_THRESHOLD = 0.1;

  public readonly definition: PatternDefinition = {
    patternId: 'doji-star',
    name: '星',
    description: '売りシグナル。大陽線後に十字線が高値圏に現れ、上昇の失速を示す。',
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
    const condition1 = c1.close > c1.open && c1Body > c1Range * DojiStar.LARGE_BODY_THRESHOLD;

    const c0Body = Math.abs(c0.close - c0.open);
    const c0Range = Math.abs(c0.high - c0.low);
    const condition2 = c0Body <= c0Range * DojiStar.DOJI_THRESHOLD && c0.open > c1.close && c0.close > c1.close;

    return condition1 && condition2 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
