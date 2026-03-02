import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class MorningStar extends CandlestickPattern {
  public readonly definition: PatternDefinition = {
    patternId: 'morning-star',
    name: '三川明けの明星',
    description: '強い買いシグナル。3本のローソク足で構成され、下降トレンドの反転を示す。',
    signalType: 'BUY',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 3) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];
    const c2 = candles[2];

    const c2Body = Math.abs(c2.close - c2.open);
    const c2Range = Math.abs(c2.high - c2.low);
    const condition1 = c2.close < c2.open && c2Body > c2Range * 0.3;

    const c1Body = Math.abs(c1.close - c1.open);
    const c1Range = Math.abs(c1.high - c1.low);
    const condition2 =
      c1Body <= c1Range * 0.1 && c1.open < c2.close && c1.close < c2.close;

    const c0Body = Math.abs(c0.close - c0.open);
    const c0Range = Math.abs(c0.high - c0.low);
    const c2Midpoint = (c2.open + c2.close) / 2;
    const condition3 = c0.close > c0.open && c0Body > c0Range * 0.3 && c0.close > c2Midpoint;

    return condition1 && condition2 && condition3 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
