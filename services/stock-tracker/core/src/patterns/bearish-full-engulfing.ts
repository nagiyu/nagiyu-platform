import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class BearishFullEngulfing extends CandlestickPattern {
  public readonly definition: PatternDefinition = {
    patternId: 'bearish-full-engulfing',
    name: '陰の両つつみ',
    description: '売りシグナル。陽線の次に陰線が高値・安値を含む足全体を包み込み、強い反転を示す。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 2) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];

    const condition1 = c1.close > c1.open;
    const condition2 = c0.close < c0.open && c0.high >= c1.high && c0.low <= c1.low;

    return condition1 && condition2 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
