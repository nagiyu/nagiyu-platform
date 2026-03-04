import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class ThreeWhiteSoldiers extends CandlestickPattern {
  private static readonly LARGE_BODY_THRESHOLD = 0.3;

  public readonly definition: PatternDefinition = {
    patternId: 'three-white-soldiers',
    name: '赤三兵',
    description: '強い買いシグナル。3本の連続する陽線で構成され、上昇トレンドへの転換または継続を示す。',
    signalType: 'BUY',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 3) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];
    const c2 = candles[2];

    const c2Body = c2.close - c2.open;
    const c2Range = Math.abs(c2.high - c2.low);
    const condition1 =
      c2.close > c2.open && c2Body > c2Range * ThreeWhiteSoldiers.LARGE_BODY_THRESHOLD;

    const c1Body = c1.close - c1.open;
    const c1Range = Math.abs(c1.high - c1.low);
    const condition2 =
      c1.close > c1.open &&
      c1Body > c1Range * ThreeWhiteSoldiers.LARGE_BODY_THRESHOLD &&
      c1.open > c2.open &&
      c1.open < c2.close &&
      c1.close > c2.close;

    const c0Body = c0.close - c0.open;
    const c0Range = Math.abs(c0.high - c0.low);
    const condition3 =
      c0.close > c0.open &&
      c0Body > c0Range * ThreeWhiteSoldiers.LARGE_BODY_THRESHOLD &&
      c0.open > c1.open &&
      c0.open < c1.close &&
      c0.close > c1.close;

    return condition1 && condition2 && condition3 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
