import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class ThreeGapsHammering extends CandlestickPattern {
  public readonly definition: PatternDefinition = {
    patternId: 'three-gaps-hammering',
    name: '三空叩き込み',
    description:
      '買いシグナル。連続陰線と3回のギャップダウン後に反転足が出現し、売られ過ぎからの反発を示す。',
    signalType: 'BUY',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 4) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];
    const c2 = candles[2];
    const c3 = candles[3];

    const condition1 = c3.close < c3.open && c2.close < c2.open && c1.close < c1.open;
    const condition2 = c3.low > c2.high && c2.low > c1.high;
    const condition3 = c0.close > c0.open;

    return condition1 && condition2 && condition3 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
