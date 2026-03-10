import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class ThreeBlackCrowsGaps extends CandlestickPattern {
  public readonly definition: PatternDefinition = {
    patternId: 'three-black-crows-gaps',
    name: '陰の三つ星',
    description: '売りシグナル。ギャップダウンを伴う3本連続陰線で、強い下落継続を示す。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 3) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];
    const c2 = candles[2];

    const condition1 = c2.close < c2.open && c1.close < c1.open && c0.close < c0.open;
    const condition2 = c1.open < c2.close && c0.open < c1.close;

    return condition1 && condition2 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
