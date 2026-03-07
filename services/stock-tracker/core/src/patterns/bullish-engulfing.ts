import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class BullishEngulfing extends CandlestickPattern {
  public readonly definition: PatternDefinition = {
    patternId: 'bullish-engulfing',
    name: '陽のつつみ線',
    description: '買いシグナル。陰線の次に陽線が実体を包み込み、下降から上昇への転換を示す。',
    signalType: 'BUY',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 2) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];

    const condition1 = c1.close < c1.open;
    const condition2 = c0.close > c0.open && c0.open < c1.close && c0.close > c1.open;

    return condition1 && condition2 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
