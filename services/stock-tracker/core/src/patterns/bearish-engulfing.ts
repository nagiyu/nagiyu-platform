import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class BearishEngulfing extends CandlestickPattern {
  public readonly definition: PatternDefinition = {
    patternId: 'bearish-engulfing',
    name: 'つつみ',
    description: '売りシグナル。陽線の次に陰線が実体を包み込み、上昇から下落への転換を示す。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 2) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];

    const condition1 = c1.close > c1.open;
    const condition2 = c0.close < c0.open && c0.open > c1.close && c0.close < c1.open;

    return condition1 && condition2 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
